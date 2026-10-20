"""Approved reached-stage recipients, snapshotted with each business event."""

from sqlalchemy import select

from .models import PaymentRequest, User, WorkflowAssignment, WorkflowInstance
from .workflow_assignments import base_eligible, current_assignment, effective_assignee, eligible_users
from .workflow_visibility import reached_stages


def reviewers(db, item, instance, role, current=False):
    if current:
        assignment = current_assignment(db, instance)
    else:
        stages = instance.route_snapshot.get("stages", [])
        index = next((i for i, stage in enumerate(stages) if stage["role"] == role), None)
        assignment = (
            db.scalar(
                select(WorkflowAssignment).where(
                    WorkflowAssignment.workflow_id == instance.id,
                    WorkflowAssignment.stage_index == index,
                    WorkflowAssignment.kind == "approval",
                )
            )
            if index is not None
            else None
        )
    if assignment:
        user = db.get(User, effective_assignee(assignment))
        return {user.id} if base_eligible(db, user, item, role) else set()
    return {user.id for user in eligible_users(db, item, role)}


def finance_recipients(db, item, instance):
    if not instance:
        return set()
    reached = {stage["role"] for stage in reached_stages(db, instance)}
    return reviewers(db, item, instance, "finance_associate") if "finance_associate" in reached else set()


def workflow_plan(db, event):
    item = db.get(PaymentRequest, event.request_id)
    instance = db.get(WorkflowInstance, event.workflow_id)
    recipients = set()
    title = "Request updated"
    if instance.state in {"active", "information_requested"} and instance.current_stage is not None:
        stage = instance.route_snapshot["stages"][instance.current_stage]
        role = "finance_associate" if instance.state == "information_requested" else stage["role"]
        recipients |= reviewers(db, item, instance, role, current=True)
        title = "More information requested" if instance.state == "information_requested" else "Approval action needed"
    if instance.state in {"returned", "declined", "approved"}:
        recipients |= {item.requestor_id} | finance_recipients(db, item, instance)
        title = {"returned": "Request returned", "declined": "Request declined", "approved": "Request approved"}[
            instance.state
        ]
    return plan(db, item, recipients - {event.actor_user_id}, title)


def payment_plan(db, item, instruction, state, actor_id):
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id))
    if state == "prepared":
        recipients = {instruction.signatory_user_id}
    else:
        finance = finance_recipients(db, item, instance)
        reached = {stage["role"] for stage in reached_stages(db, instance)} if instance else set()
        if state in {"released", "recovery_pending"} and "finance_manager" in reached:
            finance = reviewers(db, item, instance, "finance_manager")
        recipients = {item.requestor_id} | finance
    title = "Payment authorization needed" if state == "prepared" else "Payment " + state.replace("_", " ")
    return plan(db, item, recipients - {actor_id}, title)


def plan(db, item, recipients, title):
    active = (
        db.scalars(
            select(User.id).where(User.id.in_(recipients), User.is_active.is_(True), User.is_suspended.is_(False))
        ).all()
        if recipients
        else []
    )
    return {
        "version": "phase08-v1",
        "recipient_ids": sorted(str(user_id) for user_id in active),
        "title": title,
        "preview": title + ". Open the request to review its current status.",
    }
