"""Run with the existing isolated PostgreSQL pytest setup; never ordinary demo DB."""

from uuid import uuid4

import pytest
from payment_module.database import SessionLocal
from payment_module.models import PaymentRequest, ProcurementApprovalEvent, WorkflowEvent, WorkflowInstance
from payment_module.outbox import record_workflow_event
from payment_module.procurement_events import queue_approval
from payment_module.seed import seed
from sqlalchemy import select
from test_workflow_approvals import create_submitted, login


def record(db, request_id, state):
    item = db.get(PaymentRequest, request_id)
    item.request_type = "poPayment"
    item.type_data = {"po_reference": "PO-ISOLATED-TEST"}
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
    instance.state = state
    event = WorkflowEvent(
        id=uuid4(),
        request_id=request_id,
        workflow_id=instance.id,
        actor_user_id=item.requestor_id,
        action="stage_approved",
        stage_index=0,
        details={},
    )
    record_workflow_event(db, event)
    return event


def test_final_po_event_is_atomic_and_deduplicated(client):
    seed()
    request_id = create_submitted()
    with SessionLocal.begin() as db:
        event = record(db, request_id, "approved")
        queue_approval(db, event)
    with SessionLocal() as db:
        rows = list(
            db.scalars(select(ProcurementApprovalEvent).where(ProcurementApprovalEvent.request_id == request_id))
        )
        assert len(rows) == 1
        assert rows[0].state == "pending"
        assert rows[0].attempts == 0


def test_intermediate_po_event_is_not_queued(client):
    seed()
    request_id = create_submitted()
    with SessionLocal.begin() as db:
        record(db, request_id, "active")
    with SessionLocal() as db:
        assert (
            db.scalar(select(ProcurementApprovalEvent).where(ProcurementApprovalEvent.request_id == request_id)) is None
        )


def test_approval_transaction_rollback_removes_delivery_intent(client):
    seed()
    request_id = create_submitted()
    with pytest.raises(RuntimeError):
        with SessionLocal.begin() as db:
            record(db, request_id, "approved")
            raise RuntimeError("Abort approval")
    with SessionLocal() as db:
        assert (
            db.scalar(select(ProcurementApprovalEvent).where(ProcurementApprovalEvent.request_id == request_id)) is None
        )


def test_final_approval_endpoint_queues_once_including_command_retry(client):
    seed()
    request_id = create_submitted()
    with SessionLocal.begin() as db:
        item = db.get(PaymentRequest, request_id)
        item.request_type = "poPayment"
        item.type_data = {"po_reference": "PO-ISOLATED-ENDPOINT"}
        instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
        instance.current_stage = len(instance.route_snapshot["stages"]) - 1
        version = instance.version
    headers = {**login(client, "board.member@payment.local"), "Idempotency-Key": str(uuid4())}
    url = f"/api/v1/workflow/{request_id}/approve"
    first = client.post(url, json={"version": version}, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["state"] == "approved"
    retry = client.post(url, json={"version": version}, headers=headers)
    assert retry.status_code == 200, retry.text
    with SessionLocal() as db:
        rows = list(
            db.scalars(select(ProcurementApprovalEvent).where(ProcurementApprovalEvent.request_id == request_id))
        )
        assert len(rows) == 1
        assert rows[0].state == "pending"
