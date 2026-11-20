"""PO approval and financial visibility events. Never grants PO closure."""

import json
from uuid import UUID, uuid4


def approval_body(item, instance, event, event_id):
    if item.request_type != "poPayment" or instance.state != "approved" or event.action != "stage_approved":
        return None
    data = item.type_data or {}
    po = (data.get("procurement_snapshot") or {}).get("purchase_order") or {}
    return {
        "eventId": str(event_id),
        "type": "aps.po_request.approved",
        "schemaVersion": 2,
        "occurredAt": event.occurred_at.isoformat(),
        "purchaseOrder": {"id": po.get("id"), "number": po.get("poNumber") or data.get("po_reference")},
        "request": {
            "id": str(item.id),
            "number": item.request_number,
            "version": item.version,
            "status": "approved",
            "currency": item.currency_code,
            "grossAmount": str(item.gross_amount),
        },
        "approval": {"workflowId": str(instance.id), "version": instance.version, "actorId": str(event.actor_user_id)},
    }


def queue_approval(db, event):
    from sqlalchemy import select

    from .models import PaymentRequest, ProcurementApprovalEvent, WorkflowInstance

    if event.action != "stage_approved":
        return
    instance = db.get(WorkflowInstance, event.workflow_id)
    item = db.get(PaymentRequest, event.request_id)
    if not item or not instance:
        return
    event_id = uuid4()
    payload = approval_body(item, instance, event, event_id)
    if payload is None:
        return
    key = f"approval:{instance.id}:{instance.version}"
    if db.scalar(select(ProcurementApprovalEvent.id).where(ProcurementApprovalEvent.source_key == key)):
        return
    from .procurement_financials import financial_snapshot

    payload["financial"] = financial_snapshot(db, item)
    store_event(db, item, key, payload, event.id)


def store_event(db, item, key, payload, source_event_id=None):
    from .models import ProcurementApprovalEvent

    row = ProcurementApprovalEvent(
        id=UUID(payload["eventId"]),
        source_key=key,
        source_event_id=source_event_id,
        request_id=item.id,
        body="{}",
        state="pending" if payload["purchaseOrder"]["number"] else "blocked",
        last_error_code=None if payload["purchaseOrder"]["number"] else "missing_po_reference",
    )
    db.add(row)
    db.flush()
    payload["streamSequence"] = str(row.sequence)
    row.body = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    db.flush()


def queue_financial_update(db, item, source_key, occurred_at):
    from sqlalchemy import select

    from .models import ProcurementApprovalEvent, WorkflowInstance
    from .procurement_financials import financial_snapshot

    if item.request_type != "poPayment":
        return
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id))
    if not instance or instance.state != "approved":
        return
    key = f"financial:{source_key}"
    db.flush()
    if db.scalar(select(ProcurementApprovalEvent.id).where(ProcurementApprovalEvent.source_key == key)):
        return
    data = item.type_data or {}
    po = (data.get("procurement_snapshot") or {}).get("purchase_order") or {}
    payload = {
        "eventId": str(uuid4()),
        "type": "aps.po_request.financial_updated",
        "schemaVersion": 2,
        "occurredAt": occurred_at.isoformat(),
        "purchaseOrder": {"id": po.get("id"), "number": po.get("poNumber") or data.get("po_reference")},
        "request": {
            "id": str(item.id),
            "number": item.request_number,
            "version": item.version,
            "status": "approved",
            "currency": item.currency_code,
            "grossAmount": str(item.gross_amount),
        },
        "financial": financial_snapshot(db, item),
    }
    store_event(db, item, key, payload)
