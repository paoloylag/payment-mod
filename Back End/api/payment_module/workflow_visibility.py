"""The approval stages whose participants have gained request access."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import WorkflowEvent, WorkflowInstance


def reached_stage_index(db: Session, instance: WorkflowInstance) -> int:
    if instance.state in {"active", "information_requested"}:
        return instance.current_stage if instance.current_stage is not None else -1
    if instance.state == "approved":
        return len(instance.route_snapshot.get("stages", [])) - 1
    if instance.state in {"returned", "declined"}:
        event = db.scalar(
            select(WorkflowEvent)
            .where(WorkflowEvent.workflow_id == instance.id, WorkflowEvent.action == instance.state)
            .order_by(WorkflowEvent.occurred_at.desc(), WorkflowEvent.id.desc())
        )
        return event.stage_index if event and event.stage_index is not None else -1
    if instance.state == "cancelled":
        route_start = db.scalar(
            select(WorkflowEvent)
            .where(WorkflowEvent.workflow_id == instance.id, WorkflowEvent.action == "route_started")
            .order_by(WorkflowEvent.occurred_at.desc(), WorkflowEvent.id.desc())
        )
        if route_start is None:
            return -1
        stages = db.scalars(
            select(WorkflowEvent.stage_index).where(
                WorkflowEvent.workflow_id == instance.id,
                WorkflowEvent.occurred_at >= route_start.occurred_at,
                WorkflowEvent.stage_index.is_not(None),
            )
        )
        return max(stages, default=-1)
    return -1


def reached_stages(db: Session, instance: WorkflowInstance) -> list[dict]:
    limit = reached_stage_index(db, instance)
    return instance.route_snapshot.get("stages", [])[: limit + 1]
