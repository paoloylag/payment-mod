"""Transactional Phase 05 route snapshots and approval events."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Currency, PaymentRequest, WorkflowEvent, WorkflowInstance
from .workflow_policy import PolicyCannotRoute, route_for


def start_workflow(db: Session, item: PaymentRequest, actor_id) -> WorkflowInstance:
    """Replace the active route after a valid submission; keep earlier events intact."""
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id).with_for_update())
    if instance is not None and instance.state not in {"returned", "cancelled", "policy_pending"}:
        raise ValueError("An active approval route already exists")
    currency = db.get(Currency, item.currency_code)
    php_per_unit = currency.php_per_unit if currency else None
    try:
        route = route_for(
            request_type=item.request_type,
            budgeted=(item.type_data or {}).get("budgeted") is not False,
            amount=item.gross_amount,
            currency_code=item.currency_code,
            php_per_unit=php_per_unit,
        )
    except PolicyCannotRoute as error:
        if item.currency_code == "PHP" or php_per_unit is not None:
            raise
        snapshot = {
            "request_version": item.version,
            "amount": str(item.gross_amount),
            "currency_code": item.currency_code,
            "reason": str(error),
            "stages": [],
        }
        state, current, policy = "policy_pending", None, None
    else:
        snapshot = {
            "request_version": item.version,
            "request_type": route.request_type,
            "budgeted": route.budgeted,
            "amount": str(route.amount),
            "currency_code": route.currency_code,
            "php_per_unit": str(route.php_per_unit),
            "php_amount": str(route.php_amount),
            "department_id": str(item.department_id),
            "stages": [{"code": s.code, "role": s.role, "purpose": s.purpose} for s in route.stages],
        }
        state, current, policy = "active", 0, route.policy_version
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
        instance.policy_version = policy
        instance.route_snapshot = snapshot
        instance.state = state
        instance.current_stage = current
        instance.version += 1
    db.flush()
    db.add(
        WorkflowEvent(
            request_id=item.id,
            workflow_id=instance.id,
            actor_user_id=actor_id,
            action="route_started" if state == "active" else "policy_pending",
            stage_index=current,
            note="",
            details={"policy_version": policy, "route": snapshot},
        )
    )
    return instance


def close_workflow(db: Session, item: PaymentRequest, actor_id, reason: str, note: str = "") -> None:
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id).with_for_update())
    if instance and instance.state in {"active", "policy_pending"}:
        previous_stage = instance.current_stage
        instance.state = reason
        instance.current_stage = None
        instance.version += 1
        db.add(
            WorkflowEvent(
                request_id=item.id,
                workflow_id=instance.id,
                actor_user_id=actor_id,
                action=reason,
                stage_index=previous_stage,
                note=note,
                details={},
            )
        )
