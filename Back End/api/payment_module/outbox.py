"""Record workflow events and delivery intent in the same database transaction."""

from sqlalchemy.orm import Session

from .models import NotificationOutboxEvent, PaymentRequest, WorkflowEvent
from .notification_policy import finance_event_plan, payment_plan, workflow_plan


def record_workflow_event(db: Session, event: WorkflowEvent) -> None:
    db.add(event)
    db.flush()
    db.add(
        NotificationOutboxEvent(
            source_event_id=event.id,
            source_key=f"workflow:{event.id}",
            aggregate_id=event.request_id,
            event_type=f"workflow.{event.action}",
            payload={
                "request_id": str(event.request_id),
                "workflow_id": str(event.workflow_id),
                "stage_index": event.stage_index,
                "action": event.action,
                "notification": workflow_plan(db, event),
            },
        )
    )


def record_payment_notification(db, instruction, event):
    item = db.get(PaymentRequest, instruction.request_id)
    rejected = bool(getattr(event, "result", {}).get("recovery_rejected"))
    db.add(
        NotificationOutboxEvent(
            source_key=f"payment:{event.id}",
            aggregate_id=item.id,
            event_type="payment.recovery_rejected" if rejected else f"payment.{event.state}",
            payload={
                "request_id": str(item.id),
                "notification": payment_plan(
                    db, item, instruction, event.state, event.actor_user_id, recovery_rejected=rejected
                ),
            },
        )
    )


def record_finance_notification(db, item, family, state, event_id, actor_id):
    db.add(
        NotificationOutboxEvent(
            source_key=f"{family}:{event_id}",
            aggregate_id=item.id,
            event_type=f"{family}.{state}",
            payload={"request_id": str(item.id), "notification": finance_event_plan(db, item, family, state, actor_id)},
        )
    )
