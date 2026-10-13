"""Phase 05 provisional approval queue and decisions."""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, object_session

from ..audit import audit
from ..database import get_db
from ..finance_validation import validation_summary
from ..models import (
    Currency,
    PaymentRequest,
    PaymentRequestStatusHistory,
    Role,
    User,
    UserRole,
    WorkflowAssignment,
    WorkflowCommand,
    WorkflowEvent,
    WorkflowInstance,
)
from ..outbox import record_workflow_event
from ..security import current_user
from ..workflow_assignments import assignment_allows, assignment_view, exception_controls
from ..workflow_assignments import current_assignment as named_assignment
from ..workflow_policy import PolicyCannotRoute, route_for
from ..workflow_service import close_workflow, start_workflow
from .requests import serialize_many, visible_query

router = APIRouter(prefix="/api/v1/workflow", tags=["workflow"])


class ApprovalDecision(BaseModel):
    version: int = Field(ge=1)
    note: str = Field(default="", max_length=2000)
    php_per_unit: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=8)


class ApprovalRejection(BaseModel):
    version: int = Field(ge=1)
    decision: Literal["return", "decline"]
    note: str = Field(min_length=1, max_length=2000)
    return_to_role: Literal["requestor", "finance_associate"] | None = None


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
        and assignment_allows(object_session(item), item, actor)
    )


def can_respond_information(request: Request, actor: User, item: PaymentRequest, roles: set[str]) -> bool:
    return (
        "workflow.review" in getattr(request.state, "permissions", set())
        and "finance_associate" in roles
        and actor.id != item.requestor_id
        and assignment_allows(object_session(item), item, actor)
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


def finance_correction_targets(db: Session, item: PaymentRequest) -> dict:
    summary = validation_summary(db, item)
    return {
        "lines": [
            {
                "line_id": line["line_id"],
                "position": line["position"],
                "particulars": line["particulars"],
                "decision": line["decision"],
                "reason": line["reason"],
            }
            for line in summary["lines"]
            if line["decision"] != "accepted"
        ],
        "documents": [
            {
                "document_id": document["document_id"],
                "line_id": document["line_id"],
                "filename": document["filename"],
                "decision": document["decision"],
            }
            for document in summary["documents"]
            if document["decision"] != "accepted"
        ],
        "blockers": summary["blockers"],
    }


@router.get("/queue")
def approval_queue(
    request: Request,
    assignment_role: str | None = None,
    department_id: UUID | None = None,
    request_type: str | None = None,
    state: Literal["active", "information_requested"] | None = None,
    min_php_amount: Decimal | None = Query(default=None, ge=0),
    max_php_amount: Decimal | None = Query(default=None, ge=0),
    min_age_days: int | None = Query(default=None, ge=0),
    sort_by: Literal["submitted_at", "php_amount"] = "submitted_at",
    descending: bool = False,
    offset: int = Query(default=0, ge=0),
    limit: int | None = Query(default=None, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    if min_php_amount is not None and max_php_amount is not None and min_php_amount > max_php_amount:
        raise HTTPException(422, "Minimum PHP amount cannot exceed maximum")
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
        )
        or (instance.state == "information_requested" and can_respond_information(request, actor, item, roles))
    ]
    now = datetime.now(UTC)

    def php_amount(instance: WorkflowInstance, item: PaymentRequest) -> Decimal | None:
        saved = instance.route_snapshot.get("php_amount")
        return Decimal(str(saved)) if saved is not None else item.gross_amount if item.currency_code == "PHP" else None

    def matches_filters(instance: WorkflowInstance, item: PaymentRequest) -> bool:
        role = (
            "finance_associate"
            if instance.state == "information_requested"
            else instance.route_snapshot["stages"][instance.current_stage]["role"]
        )
        amount = php_amount(instance, item)
        return (
            (state is None or instance.state == state)
            and (assignment_role is None or role == assignment_role)
            and (department_id is None or item.department_id == department_id)
            and (request_type is None or item.request_type == request_type)
            and (
                min_age_days is None or item.submitted_at is not None and (now - item.submitted_at).days >= min_age_days
            )
            and (min_php_amount is None or amount is not None and amount >= min_php_amount)
            and (max_php_amount is None or amount is not None and amount <= max_php_amount)
        )

    assigned = [(instance, item) for instance, item in assigned if matches_filters(instance, item)]
    if sort_by == "php_amount":
        assigned.sort(key=lambda row: (php_amount(*row) or Decimal(0), str(row[1].id)), reverse=descending)
        assigned.sort(key=lambda row: php_amount(*row) is None)
    else:
        assigned.sort(
            key=lambda row: (row[1].submitted_at or datetime.min.replace(tzinfo=UTC), str(row[1].id)),
            reverse=descending,
        )
    assigned = assigned[offset : offset + limit if limit is not None else None]
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
                "kind": (question.details or {}).get("kind", "information"),
                "correction_targets": (question.details or {}).get("correction_targets"),
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
    normally_visible = db.scalar(visible_query(db, request, actor).where(PaymentRequest.id == request_id)) is not None
    roles = actor_roles(db, actor)
    assigned = (
        instance.state == "active"
        and can_review(request, actor, item, instance.route_snapshot["stages"][instance.current_stage], roles)
        or instance.state == "information_requested"
        and can_respond_information(request, actor, item, roles)
    )
    if not normally_visible and not assigned:
        raise HTTPException(404, "Workflow not started")
    events = db.scalars(
        select(WorkflowEvent)
        .where(WorkflowEvent.request_id == item.id)
        .order_by(WorkflowEvent.occurred_at, WorkflowEvent.id)
    ).all()
    actor_ids = {event.actor_user_id for event in events if event.actor_user_id}
    actors = (
        {user.id: user.display_name for user in db.scalars(select(User).where(User.id.in_(actor_ids)))}
        if actor_ids
        else {}
    )
    current_assignment = None
    if instance.current_stage is not None and instance.state in {"active", "information_requested"}:
        stage = instance.route_snapshot["stages"][instance.current_stage]
        current_assignment = {
            "role": "finance_associate" if instance.state == "information_requested" else stage["role"],
            "stage_role": stage["role"],
            "stage_code": stage["code"],
            "purpose": stage["purpose"],
            "awaiting_response": instance.state == "information_requested",
            "named": assignment_view(db, named_assignment(db, instance)),
        }
    return {
        **view(instance),
        "current_assignment": current_assignment,
        "exception_controls": exception_controls(db, request, actor, item, instance),
        "events": [
            {
                "action": e.action,
                "stage_index": e.stage_index,
                "actor_user_id": str(e.actor_user_id) if e.actor_user_id else None,
                "actor_name": actors.get(e.actor_user_id) if e.actor_user_id else None,
                "note": e.note,
                "correction_targets": (e.details or {}).get("correction_targets"),
                "details": e.details,
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
    if stage["role"] == "finance_associate":
        summary = validation_summary(db, item)
        if not summary["ready_to_approve"]:
            raise HTTPException(409, "Finance validation is incomplete: " + "; ".join(summary["blockers"]))
    if item.currency_code != "PHP" and instance.current_stage == 2:
        if payload.php_per_unit is None:
            raise HTTPException(422, "Confirm a request-specific PHP conversion rate before Finance Manager approval")
        try:
            route = route_for(
                request_type=item.request_type,
                budgeted=(item.type_data or {}).get("budgeted") is not False,
                amount=item.gross_amount,
                currency_code=item.currency_code,
                php_per_unit=payload.php_per_unit,
            )
        except PolicyCannotRoute as error:
            raise HTTPException(422, str(error)) from error
        previous_route = instance.route_snapshot
        currency = db.get(Currency, item.currency_code)
        system_rate = str(currency.php_per_unit) if currency and currency.php_per_unit is not None else None
        instance.route_snapshot = {
            **previous_route,
            "php_per_unit": str(route.php_per_unit),
            "php_amount": str(route.php_amount),
            "rate_status": "confirmed",
            "rate_source": "request_specific",
            "rate_confirmed_by": str(actor.id),
            "system_rate_at_confirmation": system_rate,
            "stages": [{"code": s.code, "role": s.role, "purpose": s.purpose} for s in route.stages],
        }
        instance.policy_version = route.policy_version
        record_workflow_event(
            db,
            WorkflowEvent(
                request_id=request_id,
                workflow_id=instance.id,
                actor_user_id=actor.id,
                action="request_rate_confirmed",
                stage_index=instance.current_stage,
                note=payload.note.strip(),
                details={
                    "currency_code": item.currency_code,
                    "php_per_unit": str(route.php_per_unit),
                    "php_amount": str(route.php_amount),
                    "system_rate_at_confirmation": system_rate,
                    "policy_version": route.policy_version,
                },
            ),
        )
        stage = instance.route_snapshot["stages"][instance.current_stage]
    completed_assignment = assignment_view(db, named_assignment(db, instance))
    completed = instance.current_stage
    instance.current_stage += 1
    if instance.current_stage == len(instance.route_snapshot["stages"]):
        instance.current_stage = None
        instance.state = "approved"
    instance.version += 1
    record_workflow_event(
        db,
        WorkflowEvent(
            request_id=request_id,
            workflow_id=instance.id,
            actor_user_id=actor.id,
            action="stage_approved",
            stage_index=completed,
            note=payload.note.strip(),
            details={"stage": stage["code"], "assignment": completed_assignment},
        ),
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
        if (
            existing.request_id != request_id
            or existing.result.get("decision") != payload.decision
            or (
                payload.decision == "return"
                and existing.result.get("return_to_role", "requestor") != (payload.return_to_role or "requestor")
            )
        ):
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
    if stage["role"] not in {
        "department_head",
        "finance_associate",
        "finance_manager",
    } or instance.current_stage not in {0, 1, 2}:
        raise HTTPException(409, "This stage does not allow Return or Fully Decline")
    destination = payload.return_to_role or "requestor"
    if payload.decision == "return" and destination == "finance_associate" and stage["role"] != "finance_manager":
        raise HTTPException(422, "Only Finance Manager may return a request to Finance Associate")
    if payload.decision == "decline" and payload.return_to_role is not None:
        raise HTTPException(422, "Fully Decline does not have a return destination")
    stage_index = instance.current_stage
    correction_targets = (
        finance_correction_targets(db, item)
        if payload.decision == "return" and stage["role"] in {"finance_associate", "finance_manager"}
        else None
    )

    if payload.decision == "return" and destination == "finance_associate":
        reviewer_assignment = assignment_view(db, named_assignment(db, instance))
        instance.state = "information_requested"
        instance.version += 1
        record_workflow_event(
            db,
            WorkflowEvent(
                request_id=request_id,
                workflow_id=instance.id,
                actor_user_id=actor.id,
                action="information_requested",
                stage_index=stage_index,
                note=note,
                details={
                    "kind": "finance_return",
                    "assignment": reviewer_assignment,
                    "return_to_role": destination,
                    "correction_targets": correction_targets,
                },
            ),
        )
        db.flush()
        result = {
            **view(instance),
            "decision": "return",
            "return_to_role": destination,
            "request_status": item.status,
            "request_version": item.version,
        }
        audit(
            db,
            actor_id=actor.id,
            action="workflow.returned_to_finance_associate",
            entity_type="workflow_instance",
            entity_id=instance.id,
            request_id=request.state.request_id,
            before={"state": "active", "stage_index": stage_index, "version": payload.version},
            after={"state": instance.state, "stage_index": stage_index, "version": instance.version, "reason": note},
        )
        db.add(
            WorkflowCommand(
                request_id=request_id, actor_user_id=actor.id, idempotency_key=idempotency_key, result=result
            )
        )
        db.commit()
        return result
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
    close_workflow(
        db,
        item,
        actor.id,
        target_status,
        note,
        details={"return_to_role": destination, "correction_targets": correction_targets}
        if payload.decision == "return"
        else {},
    )
    db.flush()
    result = {
        **view(instance),
        "decision": payload.decision,
        "return_to_role": destination if payload.decision == "return" else None,
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
    reviewer_assignment = assignment_view(db, named_assignment(db, instance))
    instance.state = "information_requested"
    instance.version += 1
    record_workflow_event(
        db,
        WorkflowEvent(
            request_id=request_id,
            workflow_id=instance.id,
            actor_user_id=actor.id,
            action="information_requested",
            stage_index=stage_index,
            note=note,
            details={"stage": stage["code"], "response_role": "finance_associate", "assignment": reviewer_assignment},
        ),
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
    question = db.scalar(
        select(WorkflowEvent)
        .where(WorkflowEvent.workflow_id == instance.id, WorkflowEvent.action == "information_requested")
        .order_by(WorkflowEvent.occurred_at.desc(), WorkflowEvent.id.desc())
    )
    finance_return = bool(question and (question.details or {}).get("kind") == "finance_return")
    if stage["role"] not in {"coo", "president", "board_member"} and not (
        finance_return and stage["role"] == "finance_manager"
    ):
        raise HTTPException(409, "Information request has no reviewer stage to resume")
    if finance_return:
        summary = validation_summary(db, item)
        if not summary["ready_to_approve"]:
            raise HTTPException(409, "Finance correction is incomplete: " + "; ".join(summary["blockers"]))
    response_assignment = assignment_view(db, named_assignment(db, instance))
    db.execute(
        delete(WorkflowAssignment).where(
            WorkflowAssignment.workflow_id == instance.id,
            WorkflowAssignment.stage_index == instance.current_stage,
            WorkflowAssignment.kind == "response",
        )
    )
    instance.state = "active"
    instance.version += 1
    record_workflow_event(
        db,
        WorkflowEvent(
            request_id=request_id,
            workflow_id=instance.id,
            actor_user_id=actor.id,
            action="information_provided",
            stage_index=stage_index,
            note=note,
            details={
                "resume_stage": stage["code"],
                "kind": "finance_return" if finance_return else "information",
                "assignment": response_assignment,
            },
        ),
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
    normally_visible = db.scalar(visible_query(db, request, actor).where(PaymentRequest.id == request_id)) is not None
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
            "frozen": saved.get("rate_status") != "awaiting_finance_manager",
            "request_id": str(item.id),
            **saved,
        }
    currency = db.get(Currency, item.currency_code)
    if item.currency_code != "PHP":
        return {
            "policy_version": None,
            "provisional": True,
            "frozen": False,
            "request_id": str(item.id),
            "request_type": item.request_type,
            "budgeted": (item.type_data or {}).get("budgeted") is not False,
            "amount": str(item.gross_amount),
            "currency_code": item.currency_code,
            "php_per_unit": None,
            "php_amount": None,
            "suggested_php_per_unit": str(currency.php_per_unit) if currency and currency.php_per_unit else None,
            "rate_status": "awaiting_finance_manager",
            "stages": [
                {"code": "department_approval", "role": "department_head", "purpose": "Department approval"},
                {"code": "document_validation", "role": "finance_associate", "purpose": "Finance document validation"},
                {"code": "budget_review", "role": "finance_manager", "purpose": "Budget and approval-route review"},
            ],
        }
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
