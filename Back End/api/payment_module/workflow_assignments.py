"""Eligibility and temporary coverage for the current saved workflow stage."""

from datetime import UTC, datetime

from sqlalchemy import select

from .models import Role, User, UserRole, WorkflowAssignment, WorkflowInstance
from .security import effective_permissions


def user_roles(db, user):
    return set(
        db.scalars(select(Role.code).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user.id))
    )


def base_eligible(db, user, item, role):
    return bool(
        user
        and user.is_active
        and not user.is_suspended
        and user.id != item.requestor_id
        and role in user_roles(db, user)
        and "workflow.review" in effective_permissions(db, user.id)
        and (role != "department_head" or user.department_id == item.department_id)
    )


def assignment_kind(instance):
    return "response" if instance.state == "information_requested" else "approval"


def assignment_role(instance):
    return (
        "finance_associate"
        if instance.state == "information_requested"
        else instance.route_snapshot["stages"][instance.current_stage]["role"]
    )


def current_assignment(db, instance):
    if not instance or instance.current_stage is None or instance.state not in {"active", "information_requested"}:
        return None
    return db.scalar(
        select(WorkflowAssignment).where(
            WorkflowAssignment.workflow_id == instance.id,
            WorkflowAssignment.stage_index == instance.current_stage,
            WorkflowAssignment.kind == assignment_kind(instance),
        )
    )


def effective_assignee(assignment, now=None):
    now = now or datetime.now(UTC)
    if assignment.delegate_user_id and assignment.delegation_starts_at <= now < assignment.delegation_ends_at:
        return assignment.delegate_user_id
    return assignment.assigned_user_id


def assignment_allows(db, item, actor):
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id))
    assignment = current_assignment(db, instance)
    return assignment is None or effective_assignee(assignment) == actor.id


def eligible_users(db, item, role):
    users = db.scalars(
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.code == role, User.is_active.is_(True), User.is_suspended.is_(False))
        .order_by(User.display_name, User.id)
    ).all()
    return [user for user in users if base_eligible(db, user, item, role)]


def can_manage(db, request, actor, instance):
    if "workflow.exceptions.manage" not in getattr(request.state, "permissions", set()):
        return False
    roles = user_roles(db, actor)
    return "system_administrator" in roles or (
        "finance_manager" in roles and assignment_role(instance) in {"finance_associate", "finance_manager"}
    )


def assignment_view(db, assignment):
    if assignment is None:
        return None
    original = db.get(User, assignment.assigned_user_id)
    delegate = db.get(User, assignment.delegate_user_id) if assignment.delegate_user_id else None
    acting_id = effective_assignee(assignment)
    acting = db.get(User, acting_id)
    return {
        "assigned_user_id": str(assignment.assigned_user_id),
        "assigned_name": original.display_name if original else None,
        "effective_user_id": str(acting_id),
        "effective_name": acting.display_name if acting else None,
        "delegate_user_id": str(assignment.delegate_user_id) if assignment.delegate_user_id else None,
        "delegate_name": delegate.display_name if delegate else None,
        "delegation_starts_at": assignment.delegation_starts_at.isoformat()
        if assignment.delegation_starts_at
        else None,
        "delegation_ends_at": assignment.delegation_ends_at.isoformat() if assignment.delegation_ends_at else None,
        "delegation_active": acting_id != assignment.assigned_user_id,
    }


def exception_controls(db, request, actor, item, instance):
    if (
        item.status != "submitted"
        or instance.current_stage is None
        or instance.state not in {"active", "information_requested"}
    ):
        return None
    role = assignment_role(instance)
    assignment = current_assignment(db, instance)
    manager = actor.id != item.requestor_id and can_manage(db, request, actor, instance)
    owner = base_eligible(db, actor, item, role) and (assignment is None or assignment.assigned_user_id == actor.id)
    if not manager and not owner:
        return None
    users = eligible_users(db, item, role)
    stuck = bool(assignment and not base_eligible(db, db.get(User, effective_assignee(assignment)), item, role))
    return {
        "can_delegate": owner or manager,
        "can_revoke": bool(assignment and assignment.delegate_user_id and (owner or manager)),
        "can_reassign": manager,
        "can_recover": manager and stuck,
        "can_correct_route": manager,
        "role": role,
        "kind": assignment_kind(instance),
        "assignment": assignment_view(db, assignment),
        "eligible_users": [{"id": str(user.id), "display_name": user.display_name} for user in users],
        "delegation_owner_id": str(actor.id) if owner else None,
        "stuck": stuck,
    }
