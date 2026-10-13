"""General-request EWT assignment and immutable calculation history."""

import hashlib
import json
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..finance_accounting import latest_journal
from ..finance_configuration import active_configuration, request_coding
from ..finance_readiness import effective, finance_date
from ..finance_tax import build_calculation, latest_snapshot, tax_details
from ..models import FinanceTaxSnapshot, PaymentRequest, TaxCode, User, WorkflowInstance
from ..security import current_user
from .conversation import participant
from .finance_setup import read_draft
from .workflow import actor_roles, can_respond_information, can_review

router = APIRouter(prefix="/api/v1/finance-tax", tags=["finance tax"])


def calculation_configuration(db, item):
    coding = request_coding(db, item)
    if coding:
        return coding.result["configuration"]
    active = active_configuration(db)
    return active.configuration if active else read_draft(db).model_dump(mode="json")


class TaxAssignment(BaseModel):
    request_version: int = Field(ge=1)
    version: int = Field(ge=0)
    request_ewt_tax_id: UUID | None = None
    line_ewt_overrides: dict[UUID, UUID] = Field(default_factory=dict)
    reason: str = Field(min_length=1, max_length=4000)


def editable(db, request, actor, item, instance):
    if item.status != "submitted" or not instance:
        return False
    journal = latest_journal(db, item.id)
    if journal and journal.state == "posted":
        return False
    roles = actor_roles(db, actor)
    if instance.state == "information_requested":
        return can_respond_information(request, actor, item, roles)
    if instance.state != "active" or instance.current_stage is None:
        return False
    stage = instance.route_snapshot["stages"][instance.current_stage]
    return stage["role"] == "finance_associate" and can_review(request, actor, item, stage, roles)


def serialized(snapshot):
    return {
        "version": snapshot.version,
        "request_version": snapshot.request_version,
        "result": snapshot.result,
        "reason": snapshot.reason,
        "actor_user_id": str(snapshot.actor_user_id),
        "created_at": snapshot.created_at.isoformat(),
    }


@router.get("/{request_id}")
def get_tax(request_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)):
    item = db.get(PaymentRequest, request_id)
    if item is None or not participant(db, request, actor, item):
        raise HTTPException(404, "Payment request not found")
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id))
    latest = latest_snapshot(db, item.id)
    stale = bool(latest and latest.request_version != item.version)
    preview, blocker = None, None
    if latest is None or stale:
        try:
            preview = build_calculation(db, item, calculation_configuration(db, item))
        except HTTPException as error:
            blocker = error.detail
    return {
        "coding": request_coding(db, item).result if request_coding(db, item) else None,
        "request_version": item.version,
        "version": latest.version if latest else 0,
        "can_edit": editable(db, request, actor, item, instance),
        "stale": stale,
        "saved": serialized(latest) if latest else None,
        "preview": preview,
        "blocker": blocker,
        "tax_codes": [
            tax_details(tax)
            for tax in db.scalars(select(TaxCode).order_by(TaxCode.code))
            if effective(tax, finance_date())
        ],
        "history": [
            serialized(row)
            for row in db.scalars(
                select(FinanceTaxSnapshot)
                .where(FinanceTaxSnapshot.request_id == item.id)
                .order_by(FinanceTaxSnapshot.version.desc())
            )
        ],
    }


@router.post("/{request_id}")
def save_tax(
    request_id: UUID,
    payload: TaxAssignment,
    request: Request,
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item = db.scalar(select(PaymentRequest).where(PaymentRequest.id == request_id).with_for_update())
    if item is None or not participant(db, request, actor, item):
        raise HTTPException(404, "Payment request not found")
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id).with_for_update())
    if not editable(db, request, actor, item, instance):
        raise HTTPException(403, "EWT can only be assigned by the current Finance Associate")
    signature = hashlib.sha256(json.dumps(payload.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()
    previous = db.scalar(
        select(FinanceTaxSnapshot).where(
            FinanceTaxSnapshot.request_id == request_id, FinanceTaxSnapshot.command_key == idempotency_key
        )
    )
    if previous:
        if previous.payload_hash != signature or previous.actor_user_id != actor.id:
            raise HTTPException(409, "Idempotency key was already used for a different assignment")
        return serialized(previous)
    latest = latest_snapshot(db, item.id)
    if item.version != payload.request_version or payload.version != (latest.version if latest else 0):
        raise HTTPException(409, "Request or tax assignment changed; reload before saving")
    if not payload.reason.strip():
        raise HTTPException(422, "A reason is required")
    config = (
        latest.result["configuration"]
        if latest and latest.request_version == item.version
        else calculation_configuration(db, item)
    )
    result = build_calculation(
        db,
        item,
        config,
        payload.request_ewt_tax_id,
        {str(key): value for key, value in payload.line_ewt_overrides.items()},
    )
    result["assigned_by"] = actor.display_name
    snapshot = FinanceTaxSnapshot(
        request_id=item.id,
        request_version=item.version,
        version=payload.version + 1,
        command_key=idempotency_key,
        payload_hash=signature,
        result=result,
        reason=payload.reason.strip(),
        actor_user_id=actor.id,
    )
    db.add(snapshot)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action="finance.ewt_assigned",
        entity_type="payment_request",
        entity_id=item.id,
        request_id=request.state.request_id,
        before=serialized(latest) if latest else None,
        after=serialized(snapshot),
    )
    db.commit()
    return serialized(snapshot)
