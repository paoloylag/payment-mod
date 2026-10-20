from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from payment_module.database import SessionLocal
from payment_module.models import (
    NotificationAttempt,
    NotificationDelivery,
    NotificationOutboxEvent,
    User,
    WorkflowEvent,
    WorkflowInstance,
)
from payment_module.notification_worker import run_batch
from payment_module.outbox import record_payment_notification, record_workflow_event
from payment_module.seed import seed
from sqlalchemy import func, select
from test_workflow_approvals import create_submitted, login


def process_pending():
    for _ in range(50):
        result = run_batch(batch_size=100, development_mailbox=True)
        if not any(result.values()):
            break


def test_workflow_notifications_reached_roles_read_unread_and_dedup(client):
    seed()
    request_id = create_submitted()
    process_pending()
    headers = login(client, "department.head@payment.local")
    response = client.get("/api/v1/notifications?page_size=1")
    assert response.status_code == 200, response.text
    with SessionLocal() as db:
        outbox = db.scalar(select(NotificationOutboxEvent).where(NotificationOutboxEvent.aggregate_id == request_id))
        entries = list(db.scalars(select(NotificationDelivery).where(NotificationDelivery.outbox_id == outbox.id)))
        assert {row.channel for row in entries} == {"in_app", "development_email"}
        entry_id = next(str(row.id) for row in entries if row.channel == "in_app")
        outbox_id = outbox.id
    assert client.post(f"/api/v1/notifications/{entry_id}/read", headers=headers).status_code == 200
    assert client.post(f"/api/v1/notifications/{entry_id}/unread", headers=headers).json()["read_at"] is None
    headers = login(client, "coo@payment.local")
    assert not any(row["request_id"] == str(request_id) for row in client.get("/api/v1/notifications").json()["items"])
    assert client.post(f"/api/v1/notifications/{entry_id}/read", headers=headers).status_code == 404
    with SessionLocal.begin() as db:
        event = db.get(NotificationOutboxEvent, outbox_id)
        event.state, event.available_at = "pending", datetime.now(UTC)
    process_pending()
    with SessionLocal() as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(NotificationDelivery)
                .where(NotificationDelivery.outbox_id == outbox_id)
            )
            == 2
        )
    headers = login(client, "department.head@payment.local")
    approved = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        headers={**headers, "Idempotency-Key": str(uuid4())},
        json={"version": 1, "note": "Approve"},
    )
    assert approved.status_code == 200, approved.text
    process_pending()
    login(client, "finance.associate@payment.local")
    assert any(
        row["request_id"] == str(request_id) and row.get("title") == "Approval action needed"
        for row in client.get("/api/v1/notifications").json()["items"]
    )


def test_notification_retry_is_atomic_and_fails_after_five_attempts(client):
    seed()
    request_id = create_submitted()
    with SessionLocal.begin() as db:
        event = db.scalar(select(NotificationOutboxEvent).where(NotificationOutboxEvent.aggregate_id == request_id))
        event.payload = {
            **event.payload,
            "notification": {
                **event.payload["notification"],
                "recipient_ids": [event.payload["notification"]["recipient_ids"][0], "invalid-uuid"],
            },
        }
        event_id = event.id
    for attempt in range(1, 6):
        run_batch(batch_size=100)
        with SessionLocal.begin() as db:
            event = db.get(NotificationOutboxEvent, event_id)
            assert event.attempts == attempt
            assert event.last_error_code == "ValueError"
            assert event.state == ("failed" if attempt == 5 else "pending")
            assert (
                db.scalar(
                    select(func.count())
                    .select_from(NotificationDelivery)
                    .where(NotificationDelivery.outbox_id == event_id)
                )
                == 0
            )
            event.available_at = datetime.now(UTC)


def test_rollback_and_payment_snapshots(client):
    seed()
    request_id = create_submitted()
    with SessionLocal() as db:
        instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
        event = WorkflowEvent(request_id=request_id, workflow_id=instance.id, action="test_rollback", stage_index=0)
        record_workflow_event(db, event)
        event_id = event.id
        db.rollback()
    with SessionLocal.begin() as db:
        assert (
            db.scalar(select(NotificationOutboxEvent).where(NotificationOutboxEvent.source_event_id == event_id))
            is None
        )
        signatory = db.scalar(select(User).where(User.email == "signatory@payment.local"))
        actor = db.scalar(select(User).where(User.email == "finance.associate@payment.local"))
        row_id = uuid4()
        record_payment_notification(
            db,
            SimpleNamespace(request_id=request_id, signatory_user_id=signatory.id),
            SimpleNamespace(id=row_id, state="prepared", actor_user_id=actor.id),
        )
        db.flush()
        outbox = db.scalar(
            select(NotificationOutboxEvent).where(NotificationOutboxEvent.source_key == f"payment:{row_id}")
        )
        assert outbox.payload["notification"]["recipient_ids"] == [str(signatory.id)]


def test_return_final_approval_and_release_recipients(client):
    seed()
    request_id = create_submitted()
    with SessionLocal.begin() as db:
        instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
        owner = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        manager = db.scalar(select(User).where(User.email == "finance.manager@payment.local"))
        associate = db.scalar(select(User).where(User.email == "finance.associate@payment.local"))
        head = db.scalar(select(User).where(User.email == "department.head@payment.local"))
        instance.state, instance.current_stage = "returned", None
        event = WorkflowEvent(
            request_id=request_id, workflow_id=instance.id, actor_user_id=head.id, action="returned", stage_index=0
        )
        record_workflow_event(db, event)
        db.flush()
        outbox = db.scalar(select(NotificationOutboxEvent).where(NotificationOutboxEvent.source_event_id == event.id))
        assert outbox.payload["notification"]["recipient_ids"] == [str(owner.id)]
        instance.state = "approved"
        event = WorkflowEvent(
            request_id=request_id,
            workflow_id=instance.id,
            actor_user_id=manager.id,
            action="stage_approved",
            stage_index=2,
        )
        record_workflow_event(db, event)
        db.flush()
        outbox = db.scalar(select(NotificationOutboxEvent).where(NotificationOutboxEvent.source_event_id == event.id))
        assert set(outbox.payload["notification"]["recipient_ids"]) == {str(owner.id), str(associate.id)}
        row_id = uuid4()
        record_payment_notification(
            db,
            SimpleNamespace(request_id=request_id),
            SimpleNamespace(id=row_id, state="released", actor_user_id=associate.id),
        )
        db.flush()
        outbox = db.scalar(
            select(NotificationOutboxEvent).where(NotificationOutboxEvent.source_key == f"payment:{row_id}")
        )
        assert set(outbox.payload["notification"]["recipient_ids"]) == {str(owner.id), str(manager.id)}


def test_retry_attempt_history_survives_manual_retry(client):
    from payment_module.notification_worker import retry_failed

    seed()
    request_id = create_submitted()
    with SessionLocal.begin() as db:
        event = db.scalar(select(NotificationOutboxEvent).where(NotificationOutboxEvent.aggregate_id == request_id))
        event.state, event.attempts = "failed", 5
        db.add(NotificationAttempt(outbox_id=event.id, attempt_number=5, outcome="failed", error_code="ValueError"))
        event_id = event.id
    retry_failed(str(event_id))
    with SessionLocal() as db:
        event = db.get(NotificationOutboxEvent, event_id)
        assert event.state == "pending" and event.attempts == 0
        assert set(
            db.scalars(select(NotificationAttempt.outcome).where(NotificationAttempt.outbox_id == event_id))
        ) == {"failed", "manual_retry"}
