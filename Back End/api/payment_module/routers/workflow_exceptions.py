"""Reason-required assignment coverage and controlled request correction."""

import hashlib
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..models import (
    PaymentRequest,
    PaymentRequestStatusHistory,
    User,
    WorkflowAssignment,
    WorkflowCommand,
    WorkflowEvent,
    WorkflowInstance,
)
from ..outbox import record_workflow_event
from ..security import current_user
from ..workflow_assignments import (
    assignment_kind,
    assignment_role,
    assignment_view,
    base_eligible,
    can_manage,
    current_assignment,
    effective_assignee,
)
from ..workflow_service import close_workflow
from .workflow import view

router = APIRouter(prefix="/api/v1/workflow", tags=["workflow exceptions"])


class ExceptionCommand(BaseModel):
    version: int = Field(ge=1)
    action: Literal["delegate", "revoke", "reassign", "recover", "material-correction"]
    note: str = Field(min_length=1, max_length=2000)
    target_user_id: UUID | None = None
    original_user_id: UUID | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    changed_fields: list[Literal["amount", "budget_status", "department", "request_type", "currency"]] = Field(
        default_factory=list
    )


@router.post("/{request_id}/exceptions")
def workflow_exception(
    request_id: UUID,
    payload: ExceptionCommand,
    request: Request,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=120),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    note = payload.note.strip()
    if not note or not idempotency_key.strip():
        raise HTTPException(422, "A reason and Idempotency-Key are required")
    signature = hashlib.sha256(payload.model_dump_json().encode()).hexdigest()
    item = db.scalar(select(PaymentRequest).where(PaymentRequest.id == request_id).with_for_update())
    if item is None:
        raise HTTPException(404, "Payment request not found")
    existing = db.scalar(
        select(WorkflowCommand).where(
            WorkflowCommand.actor_user_id == actor.id, WorkflowCommand.idempotency_key == idempotency_key
        )
    )
    if existing:
        if existing.request_id != request_id or existing.result.get("command_signature") != signature:
            raise HTTPException(409, "Idempotency key belongs to another action")
        return existing.result
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id).with_for_update())
    if (
        item.status != "submitted"
        or instance is None
        or instance.state not in {"active", "information_requested"}
        or instance.current_stage is None
    ):
        raise HTTPException(409, "Only a current submitted assignment can be managed")
    if actor.id == item.requestor_id:
        raise HTTPException(403, "Requestors cannot manage their own approval assignments")
    if instance.version != payload.version:
        raise HTTPException(409, "Workflow changed; reload before managing the assignment")
    role = assignment_role(instance)
    assignment = current_assignment(db, instance)
    manager = can_manage(db, request, actor, instance)
    original_owner = base_eligible(db, actor, item, role) and (
        assignment is None or assignment.assigned_user_id == actor.id
    )
    if not manager and not (payload.action in {"delegate", "revoke"} and original_owner):
        raise HTTPException(403, "Workflow exception authority is required for this stage")
    before = {
        "assignment": assignment_view(db, assignment),
        "stage_index": instance.current_stage,
        "state": instance.state,
        "version": instance.version,
    }
    stage_index = instance.current_stage
    if payload.action == "material-correction":
        if not payload.changed_fields:
            raise HTTPException(422, "Identify the approval fields requiring correction")
        item.status = "returned"
        item.version += 1
        db.add(
            PaymentRequestStatusHistory(
                request_id=item.id, from_status="submitted", to_status="returned", actor_user_id=actor.id, note=note
            )
        )
        close_workflow(
            db,
            item,
            actor.id,
            "returned",
            note,
            details={
                "material_correction": True,
                "changed_fields": payload.changed_fields,
                "return_to_role": "requestor",
                "previous_route": instance.route_snapshot,
                "restart_at": "department_head",
            },
        )
        event_action = "route_correction_requested"
        details = {"changed_fields": payload.changed_fields, "restart_at": "department_head"}
    else:
        if payload.action == "revoke":
            if assignment is None or assignment.delegate_user_id is None:
                raise HTTPException(409, "There is no delegation to revoke")
            assignment.delegate_user_id = None
            assignment.delegation_starts_at = None
            assignment.delegation_ends_at = None
            event_action = "delegation_revoked"
        else:
            target = db.get(User, payload.target_user_id) if payload.target_user_id else None
            if not base_eligible(db, target, item, role):
                raise HTTPException(422, "Choose an active eligible reviewer with the same role and department scope")
            if payload.action == "delegate":
                original_id = (
                    assignment.assigned_user_id if assignment else (payload.original_user_id if manager else actor.id)
                )
                if assignment and payload.original_user_id and payload.original_user_id != original_id:
                    raise HTTPException(422, "Delegation must retain the assigned original approver")
                original = db.get(User, original_id) if original_id else None
                if not base_eligible(db, original, item, role) or original.id == target.id:
                    raise HTTPException(422, "Choose a different eligible original approver and substitute")
                if (
                    payload.starts_at is None
                    or payload.ends_at is None
                    or payload.starts_at.tzinfo is None
                    or payload.ends_at.tzinfo is None
                ):
                    raise HTTPException(422, "Delegation requires start and end timestamps with a time zone")
                if payload.ends_at <= payload.starts_at or payload.ends_at <= datetime.now(UTC):
                    raise HTTPException(422, "Delegation must end after its start and in the future")
                if assignment and assignment.delegate_user_id and assignment.delegation_ends_at > datetime.now(UTC):
                    raise HTTPException(409, "Revoke the existing delegation before appointing another substitute")
                if assignment is None:
                    assignment = WorkflowAssignment(
                        workflow_id=instance.id,
                        stage_index=stage_index,
                        kind=assignment_kind(instance),
                        assigned_user_id=original.id,
                    )
                    db.add(assignment)
                assignment.delegate_user_id = target.id
                assignment.delegation_starts_at = payload.starts_at
                assignment.delegation_ends_at = payload.ends_at
                event_action = "assignment_delegated"
            else:
                if payload.action == "recover":
                    if assignment is None or base_eligible(
                        db, db.get(User, effective_assignee(assignment)), item, role
                    ):
                        raise HTTPException(409, "Recovery requires an unavailable current named assignee")
                if assignment and assignment.assigned_user_id == target.id and assignment.delegate_user_id is None:
                    raise HTTPException(409, "This reviewer already owns the assignment")
                if assignment is None:
                    assignment = WorkflowAssignment(
                        workflow_id=instance.id,
                        stage_index=stage_index,
                        kind=assignment_kind(instance),
                        assigned_user_id=target.id,
                    )
                    db.add(assignment)
                else:
                    assignment.assigned_user_id = target.id
                    assignment.delegate_user_id = None
                    assignment.delegation_starts_at = None
                    assignment.delegation_ends_at = None
                event_action = "assignment_recovered" if payload.action == "recover" else "assignment_reassigned"
        db.flush()
        details = {
            "role": role,
            "kind": assignment_kind(instance),
            "before": before["assignment"],
            "after": assignment_view(db, assignment),
        }
        instance.version += 1
    record_workflow_event(
        db,
        WorkflowEvent(
            request_id=item.id,
            workflow_id=instance.id,
            actor_user_id=actor.id,
            action=event_action,
            stage_index=stage_index,
            note=note,
            details=details,
        ),
    )
    db.flush()
    result = {
        **view(instance),
        "action": payload.action,
        "command_signature": signature,
        "request_status": item.status,
        "request_version": item.version,
    }
    audit(
        db,
        actor_id=actor.id,
        action=f"workflow.{event_action}",
        entity_type="workflow_instance",
        entity_id=instance.id,
        request_id=request.state.request_id,
        before=before,
        after={**details, "version": instance.version, "reason": note},
    )
    db.add(WorkflowCommand(request_id=item.id, actor_user_id=actor.id, idempotency_key=idempotency_key, result=result))
    db.commit()
    return result
