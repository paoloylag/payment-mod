"""Petty Cash approval vouchers; no tax, journal posting or payment workflow."""
import hashlib
import json
from uuid import UUID
from decimal import Decimal
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import PaymentRequest, PaymentRequestLine, PettyCashVoucher, WorkflowInstance, WorkflowEvent, User, Department
from ..security import current_user
from ..finance_readiness import finance_date
from ..finance_validation import validation_summary
from ..audit import audit
from .conversation import participant
from .workflow import actor_roles

router = APIRouter(prefix="/api/v1/petty-cash-vouchers", tags=["petty cash vouchers"])

class IssueCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=4000)

def context(db, request, actor, request_id, lock=False):
    query = select(PaymentRequest).where(PaymentRequest.id == request_id)
    item = db.scalar(query.with_for_update() if lock else query)
    if not item or item.request_type != "pettyCash" or not participant(db, request, actor, item):
        raise HTTPException(404, "Petty Cash request not found")
    return item

def can_issue(db, request, actor, item):
    workflow = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id))
    return ("finance_associate" in actor_roles(db, actor)
        and "vouchers.read" in getattr(request.state, "permissions", set())
        and actor.id != item.requestor_id and item.status == "submitted"
        and workflow is not None and workflow.state == "approved")

@router.get("/{request_id}")
def get_voucher(request_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)):
    item = context(db, request, actor, request_id)
    voucher = db.scalar(select(PettyCashVoucher).where(PettyCashVoucher.request_id == item.id))
    return {"request_version": item.version, "can_issue": bool(not voucher and can_issue(db, request, actor, item)),
        "voucher": voucher.result if voucher else None}

@router.post("/{request_id}/issue")
def issue(request_id: UUID, payload: IssueCommand, request: Request,
          key: str = Header(alias="Idempotency-Key", min_length=1, max_length=100),
          db: Session = Depends(get_db), actor: User = Depends(current_user)):
    item = context(db, request, actor, request_id, lock=True)
    if "finance_associate" not in actor_roles(db, actor) or actor.id == item.requestor_id or "vouchers.read" not in getattr(request.state, "permissions", set()):
        raise HTTPException(403, "Only Finance Associate may create the Petty Cash voucher")
    digest = hashlib.sha256(json.dumps(payload.model_dump(), sort_keys=True).encode()).hexdigest()
    existing = db.scalar(select(PettyCashVoucher).where(PettyCashVoucher.request_id == item.id))
    if existing:
        if existing.command_key == key and existing.payload_hash == digest and existing.actor_user_id == actor.id:
            return existing.result
        raise HTTPException(409, "A Petty Cash voucher has already been created")
    if not can_issue(db, request, actor, item):
        raise HTTPException(409, "Final Finance Associate approval is required")
    if item.version != payload.request_version:
        raise HTTPException(409, "Request changed; reload before creating the voucher")
    if item.currency_code != "PHP" or not Decimal("0") < item.gross_amount < Decimal("3000"):
        raise HTTPException(409, "Petty Cash must be PHP and below PHP 3,000")
    if not payload.reason.strip():
        raise HTTPException(422, "A reason is required")
    if not validation_summary(db, item)["ready_to_approve"]:
        raise HTTPException(409, "Accept all documents and line items before creating the voucher")
    number = f"PCV-{item.request_number}"
    department = db.get(Department, item.department_id)
    result = {"voucher_number": number, "request_number": item.request_number, "request_version": item.version,
        "request_type": "pettyCash", "payee": item.payee_name, "purpose": item.purpose,
        "currency": "PHP", "amount": str(item.gross_amount), "tax": "0.00", "amount_due": str(item.gross_amount),
        "department": department.name if department else "", "issued_on": finance_date().isoformat(),
        "issued_by": actor.display_name, "reason": payload.reason.strip(),
        "lines": [{"position": line.position, "particulars": line.particulars, "amount": str(line.amount)}
            for line in db.scalars(select(PaymentRequestLine).where(PaymentRequestLine.request_id == item.id).order_by(PaymentRequestLine.position))],
        "approvals": [{"actor": db.get(User, event.actor_user_id).display_name if event.actor_user_id else "System",
            "occurred_at": event.occurred_at.isoformat(), "note": event.note}
            for event in db.scalars(select(WorkflowEvent).where(WorkflowEvent.request_id == item.id, WorkflowEvent.action == "stage_approved").order_by(WorkflowEvent.occurred_at))]}
    db.add(PettyCashVoucher(request_id=item.id, voucher_number=number, command_key=key,
        payload_hash=digest, result=result, actor_user_id=actor.id))
    item.voucher_number = number
    audit(db, actor_id=actor.id, action="finance.petty_cash_voucher_issued", entity_type="payment_request",
        entity_id=item.id, request_id=request.state.request_id, after=result)
    db.commit()
    return result
