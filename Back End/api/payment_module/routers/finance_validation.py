"""Finance Associate line review and validation readiness."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..finance_validation import validation_summary
from ..models import FinanceLineReview, PaymentRequest, PaymentRequestLine, User, WorkflowInstance
from ..security import current_user
from .conversation import participant
from .workflow import actor_roles, can_respond_information, can_review

router = APIRouter(prefix="/api/v1/finance-validation", tags=["finance validation"])


class LineReviewPayload(BaseModel):
    request_version: int = Field(ge=1)
    decision: str
    reason: str = Field(default="", max_length=4000)
    physical_original_received: bool = False


@router.get("/{request_id}")
def get_validation(
    request_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    item = db.get(PaymentRequest, request_id)
    if item is None or not participant(db, request, actor, item):
        raise HTTPException(404, "Payment request not found")
    return validation_summary(db, item)


@router.post("/{request_id}/lines/{line_id}/reviews", status_code=201)
def review_line(
    request_id: UUID,
    line_id: UUID,
    payload: LineReviewPayload,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    if payload.decision not in {"accepted", "flagged"}:
        raise HTTPException(422, "Decision must be accepted or flagged")
    if payload.decision == "flagged" and not payload.reason.strip():
        raise HTTPException(422, "A reason is required when flagging a line")
    item = db.scalar(select(PaymentRequest).where(PaymentRequest.id == request_id).with_for_update())
    if item is None:
        raise HTTPException(404, "Payment request not found")
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id).with_for_update())
    if (
        item.status != "submitted"
        or instance is None
        or instance.current_stage is None
        or instance.state not in {"active", "information_requested"}
    ):
        raise HTTPException(409, "Finance validation is not active")
    stage = instance.route_snapshot["stages"][instance.current_stage]
    assigned = (
        stage["role"] == "finance_associate"
        and instance.state == "active"
        and can_review(request, actor, item, stage, actor_roles(db, actor))
    )
    correcting = instance.state == "information_requested" and can_respond_information(
        request, actor, item, actor_roles(db, actor)
    )
    if not (assigned or correcting):
        raise HTTPException(403, "Finance Associate review is not assigned to this user")
    if item.version != payload.request_version:
        raise HTTPException(409, "Request changed; reload before reviewing this line")
    line = db.scalar(
        select(PaymentRequestLine).where(PaymentRequestLine.id == line_id, PaymentRequestLine.request_id == request_id)
    )
    if line is None:
        raise HTTPException(404, "Request line not found")
    review = FinanceLineReview(
        request_id=request_id,
        line_id=line_id,
        request_version=item.version,
        decision=payload.decision,
        reason=payload.reason.strip(),
        physical_original_received=payload.physical_original_received
        if item.request_type == "reimbursement"
        else False,
        actor_user_id=actor.id,
    )
    db.add(review)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action="finance.line_reviewed",
        entity_type="payment_request_line",
        entity_id=line_id,
        request_id=request.state.request_id,
        after={
            "request_version": item.version,
            "decision": review.decision,
            "reason": review.reason,
            "physical_original_received": review.physical_original_received,
        },
    )
    db.commit()
    return validation_summary(db, item)
