"""Cost center routing and saved Department Head access."""
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy import select
from .models import CostCenter, Role, User, UserRole, WorkflowAssignment, WorkflowInstance
from .security import effective_permissions
from .finance_readiness import effective, finance_date


def eligible_approver(db, user):
    return bool(user and user.is_active and not user.is_suspended
        and db.scalar(select(UserRole.id).join(Role).where(UserRole.user_id == user.id, Role.code == "department_head"))
        and "workflow.review" in effective_permissions(db, user.id))


def request_center(db, item):
    fields = item.type_data or {}
    selected = fields.get("department_cost_center_id") or (fields.get("fields") or {}).get("department_cost_center_id")
    if selected:
        try:
            center = db.get(CostCenter, UUID(str(selected)))
        except ValueError:
            raise HTTPException(422, "Select a valid Department / Cost Center")
        if center is None or center.department_id != item.department_id:
            raise HTTPException(422, "Selected cost center must belong to the request department")
        return center
    return db.scalar(select(CostCenter).where(CostCenter.department_id == item.department_id))


def routing_approver(db, item, required=False):
    center = request_center(db, item)
    user = db.get(User, center.approver_user_id) if center and center.approver_user_id else None
    if not effective(center, finance_date()) or not eligible_approver(db, user):
        if required:
            raise HTTPException(422, "Configure an active Department Head approver for the selected Department / Cost Center before submitting")
        return None, None
    return center, user


def department_participant(db, item, user, instance=None):
    instance = instance or db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id))
    mapped = instance.route_snapshot.get("department_approver_id") if instance else None
    if not mapped:
        return user.department_id == item.department_id
    if str(user.id) == mapped:
        return True
    assignments = db.scalars(select(WorkflowAssignment).where(WorkflowAssignment.workflow_id == instance.id, WorkflowAssignment.stage_index == 0, WorkflowAssignment.kind == "approval")).all()
    return any(user.id in {a.assigned_user_id, a.delegate_user_id} for a in assignments)
