"""Phase 05 provisional approval queue and decisions."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..models import (
    Currency,
    PaymentRequest,
    PaymentRequestStatusHistory,
    Role,
    User,
    UserRole,
    WorkflowCommand,
    WorkflowEvent,
    WorkflowInstance,
)
from ..security import current_user
from ..workflow_policy import PolicyCannotRoute, route_for
from ..workflow_service import close_workflow, start_workflow
from .requests import serialize_many, visible_query

router = APIRouter(prefix="/api/v1/workflow", tags=["workflow"])


class ApprovalDecision(BaseModel):
    version: int = Field(ge=1)
    note: str = Field(default="", max_length=2000)


class ApprovalRejection(BaseModel):
    version: int = Field(ge=1)
    decision: Literal["return", "decline"]
    note: str = Field(min_length=1, max_length=2000)


class InformationNote(BaseModel):
    version: int = Field(ge=1)
    note: str = Field(min_length=1, max_length=2000)


def actor_roles(db: Session, actor: User) -> set[str]:
    return set(
        db.scalars(select(Role.code).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == actor.id))
    )


def can_review(request: Request, actor: User, item: PaymentRequest, stage: dict, roles: set[str]) -> bool:
    return (
        "workflow.review" in getattr(request.state, "permissions", set())
        and stage["role"] in roles
        and actor.id != item.requestor_id
        and (stage["role"] != "department_head" or actor.department_id == item.department_id)
    )


def can_respond_information(request: Request, actor: User, item: PaymentRequest, roles: set[str]) -> bool:
    return (
        "workflow.review" in getattr(request.state, "permissions", set())
        and "finance_associate" in roles
        and actor.id != item.requestor_id
    )


def view(instance: WorkflowInstance) -> dict:
    return {
        "request_id": str(instance.request_id),
        "policy_version": instance.policy_version,
        "state": instance.state,
        "version": instance.version,
        "current_stage": instance.current_stage,
        "route": instance.route_snapshot,
    }


@router.get("/queue")
def approval_queue(request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)):
    roles = actor_roles(db, actor)
    if "workflow.review" not in getattr(request.state, "permissions", set()):
        return []
    rows = db.execute(
        select(WorkflowInstance, PaymentRequest)
        .join(PaymentRequest, PaymentRequest.id == WorkflowInstance.request_id)
        .where(WorkflowInstance.state.in_({"active", "information_requested"}), PaymentRequest.status == "submitted")
        .order_by(PaymentRequest.submitted_at, PaymentRequest.id)
    ).all()
    assigned = [
        (instance, item)
        for instance, item in rows
        if (
            instance.state == "active"
            and can_review(request, actor, item, instance.route_snapshot["stages"][instance.current_stage], roles)
        ) or (instance.state == "information_requested" and can_respond_information(request, actor, item, roles))
    ]
    summaries = serialize_many(db, [item for _, item in assigned])
    result = []
    for (instance, _), summary in zip(assigned, summaries, strict=True):
        entry = {**view(instance), "request": summary}
        if instance.state == "information_requested":
            question = db.scalar(
                select(WorkflowEvent)
                .where(WorkflowEvent.workflow_id == instance.id, WorkflowEvent.action == "information_requested")
                .order_by(WorkflowEvent.occurred_at.desc(), WorkflowEvent.id.desc())
            )
            entry["information_request"] = {
                "note": question.note,
                "requested_at": question.occurred_at.isoformat(),
                "stage_index": question.stage_index,
            }
            entry["assignment_role"] = "finance_associate"
        else:
            entry["assignment_role"] = instance.route_snapshot["stages"][instance.current_stage]["role"]
        result.append(entry)
    return result


@router.get("/{request_id}")
def workflow_detail(
    request_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    item = db.get(PaymentRequest, request_id)
    if item is None:
        raise HTTPException(404, "Workflow not started")
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id))
    if instance is None:
        raise HTTPException(404, "Workflow not started")
    normally_visible = db.scalar(visible_query(request, actor).where(PaymentRequest.id == request_id)) is not None
    roles = actor_roles(db, actor)
    assigned = instance.state == "active" and can_review(
        request, actor, item, instance.route_snapshot["stages"][instance.current_stage], roles
    ) or instance.state == "information_requested" and can_respond_information(request, actor, item, roles)
    if not normally_visible and not assigned:
        raise HTTPException(404, "Workflow not started")
    events = db.scalars(
        select(WorkflowEvent)
        .where(WorkflowEvent.request_id == item.id)
        .order_by(WorkflowEvent.occurred_at, WorkflowEvent.id)
    ).all()
    return {
        **view(instance),
        "events": [
            {
                "action": e.action,
                "stage_index": e.stage_index,
                "actor_user_id": str(e.actor_user_id) if e.actor_user_id else None,
                "note": e.note,
                "occurred_at": e.occurred_at.isoformat(),
            }
            for e in events
        ],
    }


@router.post("/{request_id}/approve")
def approve_stage(
    request_id: UUID,
    payload: ApprovalDecision,
    request: Request,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    if not idempotency_key.strip():
        raise HTTPException(422, "Idempotency-Key is required")
    # Lock the request first, matching the ordering used by submission/cancellation.
    item = db.scalar(select(PaymentRequest).where(PaymentRequest.id == request_id).with_for_update())
    if item is None:
        raise HTTPException(404, "Payment request not found")
    existing = db.scalar(
        select(WorkflowCommand).where(
            WorkflowCommand.actor_user_id == actor.id, WorkflowCommand.idempotency_key == idempotency_key
        )
    )
    if existing:
        if existing.request_id != request_id:
            raise HTTPException(409, "Idempotency key belongs to another request")
        return existing.result
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id).with_for_update())
    if instance is None or item.status != "submitted" or instance.state != "active":
        raise HTTPException(409, "Request has no active approval stage")
    if instance.version != payload.version:
        raise HTTPException(409, "Workflow changed; reload before deciding")
    stage = instance.route_snapshot["stages"][instance.current_stage]
    if not can_review(request, actor, item, stage, actor_roles(db, actor)):
        raise HTTPException(403, "This approval stage is not assigned to this reviewer")
    completed = instance.current_stage
    instance.current_stage += 1
    if instance.current_stage == len(instance.route_snapshot["stages"]):
        instance.current_stage = None
        instance.state = "approved"
    instance.version += 1
    db.add(
        WorkflowEvent(
            request_id=request_id,
            workflow_id=instance.id,
            actor_user_id=actor.id,
            action="stage_approved",
            stage_index=completed,
            note=payload.note.strip(),
            details={"stage": stage["code"]},
        )
    )
    db.flush()
    result = view(instance)
    audit(
        db,
        actor_id=actor.id,
        action="workflow.stage_approved",
        entity_type="workflow_instance",
        entity_id=instance.id,
        request_id=request.state.request_id,
        before={"stage_index": completed, "version": payload.version},
        after={"state": instance.state, "current_stage": instance.current_stage, "version": instance.version},
    )
    db.add(
        WorkflowCommand(request_id=request_id, actor_user_id=actor.id, idempotency_key=idempotency_key, result=result)
    )
    db.commit()
    return result


@router.post("/{request_id}/reject")
def reject_approval_stage(
    request_id: UUID,
    payload: ApprovalRejection,
    request: Request,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    note = payload.note.strip()
    if not note or not idempotency_key.strip():
        raise HTTPException(422, "A reason and Idempotency-Key are required")
    item = db.scalar(select(PaymentRequest).where(PaymentRequest.id == request_id).with_for_update())
    if item is None:
        raise HTTPException(404, "Payment request not found")
    existing = db.scalar(
        select(WorkflowCommand).where(
            WorkflowCommand.actor_user_id == actor.id,
            WorkflowCommand.idempotency_key == idempotency_key,
        )
    )
    if existing:
        if existing.request_id != request_id or existing.result.get("decision") != payload.decision:
            raise HTTPException(409, "Idempotency key belongs to another decision")
        return existing.result
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id).with_for_update())
    if item.status != "submitted" or instance is None or instance.state != "active" or instance.current_stage is None:
        raise HTTPException(409, "Only an active approval stage can return or decline")
    if instance.version != payload.version:
        raise HTTPException(409, "Workflow changed; reload before deciding")
    stage = instance.route_snapshot["stages"][instance.current_stage]
    if not can_review(request, actor, item, stage, actor_roles(db, actor)):
        raise HTTPException(403, "This approval stage is not assigned to this reviewer")
    if stage["role"] not in {"department_head", "finance_manager"} or instance.current_stage not in {0, 2}:
        raise HTTPException(409, "This stage does not allow Return or Fully Decline")
    stage_index = instance.current_stage
    target_status = "returned" if payload.decision == "return" else "declined"
    item.status = target_status
    item.version += 1
    db.add(
        PaymentRequestStatusHistory(
            request_id=request_id,
            from_status="submitted",
            to_status=target_status,
            actor_user_id=actor.id,
            note=note,
        )
    )
    close_workflow(db, item, actor.id, target_status, note)
    db.flush()
    result = {
        **view(instance),
        "decision": payload.decision,
        "request_status": item.status,
        "request_version": item.version,
    }
    audit(
        db,
        actor_id=actor.id,
        action=f"workflow.{target_status}",
        entity_type="workflow_instance",
        entity_id=instance.id,
        request_id=request.state.request_id,
        before={"state": "active", "stage_index": stage_index, "request_status": "submitted"},
        after={"state": instance.state, "request_status": item.status, "request_version": item.version, "reason": note},
    )
    db.add(
        WorkflowCommand(request_id=request_id, actor_user_id=actor.id, idempotency_key=idempotency_key, result=result)
    )
    db.commit()
    return result


@router.post("/{request_id}/request-information")
def request_more_information(
    request_id: UUID,
    payload: InformationNote,
    request: Request,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    note = payload.note.strip()
    if not note or not idempotency_key.strip():
        raise HTTPException(422, "A question and Idempotency-Key are required")
    item = db.scalar(select(PaymentRequest).where(PaymentRequest.id == request_id).with_for_update())
    if item is None:
        raise HTTPException(404, "Payment request not found")
    existing = db.scalar(
        select(WorkflowCommand).where(
            WorkflowCommand.actor_user_id == actor.id,
            WorkflowCommand.idempotency_key == idempotency_key,
        )
    )
    if existing:
        if existing.request_id != request_id or existing.result.get("action") != "information_requested":
            raise HTTPException(409, "Idempotency key belongs to another action")
        return existing.result
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id).with_for_update())
    if item.status != "submitted" or instance is None or instance.state != "active" or instance.current_stage is None:
        raise HTTPException(409, "Request has no active executive approval stage")
    if instance.version != payload.version:
        raise HTTPException(409, "Workflow changed; reload before requesting information")
    stage_index = instance.current_stage
    stage = instance.route_snapshot["stages"][stage_index]
    if not can_review(request, actor, item, stage, actor_roles(db, actor)):
        raise HTTPException(403, "This approval stage is not assigned to this reviewer")
    if stage["role"] not in {"coo", "president", "board_member"}:
        raise HTTPException(409, "Request More Information is available from COO review onward")
    instance.state = "information_requested"
    instance.version += 1
    db.add(
        WorkflowEvent(
            request_id=request_id,
            workflow_id=instance.id,
            actor_user_id=actor.id,
            action="information_requested",
            stage_index=stage_index,
            note=note,
            details={"stage": stage["code"], "response_role": "finance_associate"},
        )
    )
    db.flush()
    result = {**view(instance), "action": "information_requested"}
    audit(
        db,
        actor_id=actor.id,
        action="workflow.information_requested",
        entity_type="workflow_instance",
        entity_id=instance.id,
        request_id=request.state.request_id,
        before={"state": "active", "stage_index": stage_index, "version": payload.version},
        after={"state": instance.state, "stage_index": stage_index, "version": instance.version, "question": note},
    )
    db.add(
        WorkflowCommand(request_id=request_id, actor_user_id=actor.id, idempotency_key=idempotency_key, result=result)
    )
    db.commit()
    return result


@router.post("/{request_id}/respond-information")
def respond_to_information_request(
    request_id: UUID,
    payload: InformationNote,
    request: Request,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    note = payload.note.strip()
    if not note or not idempotency_key.strip():
        raise HTTPException(422, "A response and Idempotency-Key are required")
    item = db.scalar(select(PaymentRequest).where(PaymentRequest.id == request_id).with_for_update())
    if item is None:
        raise HTTPException(404, "Payment request not found")
    existing = db.scalar(
        select(WorkflowCommand).where(
            WorkflowCommand.actor_user_id == actor.id,
            WorkflowCommand.idempotency_key == idempotency_key,
        )
    )
    if existing:
        if existing.request_id != request_id or existing.result.get("action") != "information_provided":
            raise HTTPException(409, "Idempotency key belongs to another action")
        return existing.result
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id).with_for_update())
    if item.status != "submitted" or instance is None or instance.state != "information_requested":
        raise HTTPException(409, "Request is not awaiting Finance Associate information")
    if instance.version != payload.version:
        raise HTTPException(409, "Workflow changed; reload before responding")
    if not can_respond_information(request, actor, item, actor_roles(db, actor)):
        raise HTTPException(403, "Information response is assigned to Finance Associate")
    stage_index = instance.current_stage
    stage = instance.route_snapshot["stages"][stage_index]
    if stage["role"] not in {"coo", "president", "board_member"}:
        raise HTTPException(409, "Information request has no executive stage to resume")
    instance.state = "active"
    instance.version += 1
    db.add(
        WorkflowEvent(
            request_id=request_id,
            workflow_id=instance.id,
            actor_user_id=actor.id,
            action="information_provided",
            stage_index=stage_index,
            note=note,
            details={"resume_stage": stage["code"]},
        )
    )
    db.flush()
    result = {**view(instance), "action": "information_provided"}
    audit(
        db,
        actor_id=actor.id,
        action="workflow.information_provided",
        entity_type="workflow_instance",
        entity_id=instance.id,
        request_id=request.state.request_id,
        before={"state": "information_requested", "stage_index": stage_index, "version": payload.version},
        after={"state": instance.state, "stage_index": stage_index, "version": instance.version, "response": note},
    )
    db.add(
        WorkflowCommand(request_id=request_id, actor_user_id=actor.id, idempotency_key=idempotency_key, result=result)
    )
    db.commit()
    return result


@router.post("/{request_id}/activate")
def activate_pending_route(
    request_id: UUID,
    payload: ApprovalDecision,
    request: Request,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    if "master_data.manage" not in getattr(request.state, "permissions", set()):
        raise HTTPException(403, "Currency configuration permission required")
    if not idempotency_key.strip():
        raise HTTPException(422, "Idempotency-Key is required")
    item = db.scalar(select(PaymentRequest).where(PaymentRequest.id == request_id).with_for_update())
    if item is None:
        raise HTTPException(404, "Payment request not found")
    existing = db.scalar(
        select(WorkflowCommand).where(
            WorkflowCommand.actor_user_id == actor.id,
            WorkflowCommand.idempotency_key == idempotency_key,
        )
    )
    if existing:
        if existing.request_id != request_id:
            raise HTTPException(409, "Idempotency key belongs to another request")
        return existing.result
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id).with_for_update())
    if item.status != "submitted" or instance is None or instance.state != "policy_pending":
        raise HTTPException(409, "Request is not awaiting a currency conversion rate")
    if instance.version != payload.version:
        raise HTTPException(409, "Workflow changed; reload before routing")
    try:
        updated = start_workflow(db, item, actor.id)
    except PolicyCannotRoute as error:
        raise HTTPException(422, str(error)) from error
    if updated.state != "active":
        raise HTTPException(422, updated.route_snapshot["reason"])
    result = view(updated)
    audit(
        db,
        actor_id=actor.id,
        action="workflow.route_activated",
        entity_type="workflow_instance",
        entity_id=updated.id,
        request_id=request.state.request_id,
        before={"state": "policy_pending", "version": payload.version},
        after={"state": updated.state, "version": updated.version, "route": updated.route_snapshot},
    )
    db.add(
        WorkflowCommand(request_id=request_id, actor_user_id=actor.id, idempotency_key=idempotency_key, result=result)
    )
    db.commit()
    return result


@router.get("/preview/{request_id}")
def preview_route(
    request_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item = db.get(PaymentRequest, request_id)
    if item is None:
        raise HTTPException(404, "Payment request not found")
    normally_visible = db.scalar(visible_query(request, actor).where(PaymentRequest.id == request_id)) is not None
    if not normally_visible:
        raise HTTPException(404, "Payment request not found")
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
    if instance and item.status == "submitted":
        saved = instance.route_snapshot
        if instance.state == "policy_pending":
            raise HTTPException(422, saved["reason"])
        return {
            "policy_version": instance.policy_version,
            "provisional": True,
            "frozen": True,
            "request_id": str(item.id),
            **saved,
        }
    currency = db.get(Currency, item.currency_code)
    try:
        route = route_for(
            request_type=item.request_type,
            budgeted=(item.type_data or {}).get("budgeted") is not False,
            amount=item.gross_amount,
            currency_code=item.currency_code,
            php_per_unit=currency.php_per_unit if currency else None,
        )
    except PolicyCannotRoute as error:
        raise HTTPException(422, str(error)) from error
    return {
        "policy_version": route.policy_version,
        "provisional": True,
        "frozen": False,
        "request_id": str(item.id),
        "request_type": route.request_type,
        "budgeted": route.budgeted,
        "amount": str(route.amount),
        "currency_code": route.currency_code,
        "php_per_unit": str(route.php_per_unit),
        "php_amount": str(route.php_amount),
        "stages": [{"code": stage.code, "role": stage.role, "purpose": stage.purpose} for stage in route.stages],
    }
