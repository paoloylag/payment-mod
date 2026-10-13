"""Transactional Phase 05 route snapshots and approval events."""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import Currency, PaymentRequest, WorkflowAssignment, WorkflowEvent, WorkflowInstance
from .outbox import record_workflow_event
from .workflow_assignments import assignment_view, current_assignment
from .workflow_policy import route_for


def start_workflow(db: Session, item: PaymentRequest, actor_id) -> WorkflowInstance:
    """Replace the active route after a valid submission; keep earlier events intact."""
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id).with_for_update())
    if instance is not None and instance.state not in {"returned", "cancelled", "policy_pending"}:
        raise ValueError("An active approval route already exists")
    previous_department = (
        instance.route_snapshot.get("department_id") if instance and instance.state == "returned" else None
    )
    returned_event = (
        db.scalar(
            select(WorkflowEvent)
            .where(WorkflowEvent.workflow_id == instance.id, WorkflowEvent.action == "returned")
            .order_by(WorkflowEvent.occurred_at.desc(), WorkflowEvent.id.desc())
        )
        if instance and instance.state == "returned"
        else None
    )
    resume_finance = bool(
        returned_event
        and returned_event.stage_index == 1
        and previous_department == str(item.department_id)
        and not (returned_event.details or {}).get("material_correction")
    )
    currency = db.get(Currency, item.currency_code)
    php_per_unit = currency.php_per_unit if currency else None
    # Foreign-currency routing is finalized by Finance Manager at processing time.
    # Earlier approval stages do not depend on the exchange rate.
    if item.currency_code != "PHP":
        snapshot = {
            "request_version": item.version,
            "request_type": item.request_type,
            "budgeted": (item.type_data or {}).get("budgeted") is not False,
            "amount": str(item.gross_amount),
            "currency_code": item.currency_code,
            "php_per_unit": None,
            "php_amount": None,
            "suggested_php_per_unit": str(php_per_unit) if php_per_unit is not None else None,
            "rate_status": "awaiting_finance_manager",
            "department_id": str(item.department_id),
            "stages": [
                {"code": "department_approval", "role": "department_head", "purpose": "Department approval"},
                {"code": "document_validation", "role": "finance_associate", "purpose": "Finance document validation"},
                {"code": "budget_review", "role": "finance_manager", "purpose": "Budget and approval-route review"},
            ],
        }
        state, current, policy = "active", 0, None
    else:
        snapshot = None
    if snapshot is None:
        route = route_for(
            request_type=item.request_type,
            budgeted=(item.type_data or {}).get("budgeted") is not False,
            amount=item.gross_amount,
            currency_code=item.currency_code,
            php_per_unit=php_per_unit,
        )
        snapshot = {
            "request_version": item.version,
            "request_type": route.request_type,
            "budgeted": route.budgeted,
            "amount": str(route.amount),
            "currency_code": route.currency_code,
            "php_per_unit": str(route.php_per_unit),
            "php_amount": str(route.php_amount),
            "rate_status": "not_applicable",
            "department_id": str(item.department_id),
            "stages": [{"code": s.code, "role": s.role, "purpose": s.purpose} for s in route.stages],
        }
        state, current, policy = "active", 0, route.policy_version
    if resume_finance:
        current = 1
    if instance is None:
        instance = WorkflowInstance(
            request_id=item.id,
            policy_version=policy,
            route_snapshot=snapshot,
            state=state,
            current_stage=current,
            version=1,
        )
        db.add(instance)
    else:
        db.execute(delete(WorkflowAssignment).where(WorkflowAssignment.workflow_id == instance.id))
        instance.policy_version = policy
        instance.route_snapshot = snapshot
        instance.state = state
        instance.current_stage = current
        instance.version += 1
    db.flush()
    record_workflow_event(
        db,
        WorkflowEvent(
            request_id=item.id,
            workflow_id=instance.id,
            actor_user_id=actor_id,
            action="route_started" if state == "active" else "policy_pending",
            stage_index=current,
            note="Resumed at Finance Associate after requestor correction" if resume_finance else "",
            details={"policy_version": policy, "route": snapshot, "resumed_stage": current if resume_finance else None},
        ),
    )
    return instance


def close_workflow(
    db: Session, item: PaymentRequest, actor_id, reason: str, note: str = "", details: dict | None = None
) -> None:
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id).with_for_update())
    if instance and instance.state in {"active", "information_requested", "policy_pending"}:
        saved_assignment = assignment_view(db, current_assignment(db, instance))
        previous_stage = instance.current_stage
        instance.state = reason
        instance.current_stage = None
        instance.version += 1
        record_workflow_event(
            db,
            WorkflowEvent(
                request_id=item.id,
                workflow_id=instance.id,
                actor_user_id=actor_id,
                action=reason,
                stage_index=previous_stage,
                note=note,
                details={**(details or {}), "assignment": saved_assignment},
            ),
        )
