"""Record workflow events and delivery intent in the same database transaction."""

from sqlalchemy.orm import Session

from .models import NotificationOutboxEvent, WorkflowEvent


def record_workflow_event(db: Session, event: WorkflowEvent) -> None:
    db.add(event)
    db.flush()
    db.add(NotificationOutboxEvent(
        source_event_id=event.id,
        aggregate_id=event.request_id,
        event_type=f"workflow.{event.action}",
        payload={
            "request_id": str(event.request_id),
            "workflow_id": str(event.workflow_id),
            "stage_index": event.stage_index,
            "action": event.action,
        },
    ))
