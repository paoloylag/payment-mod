"""In-app inbox for mentions in request conversations."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import PaymentRequest, RequestConversationMessage, RequestMentionNotification, User, WorkflowInstance
from ..security import current_user
from .requests import serialize_many

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("")
def list_notifications(db: Session = Depends(get_db), actor: User = Depends(current_user)):
    unread_count = (
        db.scalar(
            select(func.count())
            .select_from(RequestMentionNotification)
            .where(
                RequestMentionNotification.recipient_user_id == actor.id,
                RequestMentionNotification.read_at.is_(None),
            )
        )
        or 0
    )
    rows = db.execute(
        select(RequestMentionNotification, RequestConversationMessage, PaymentRequest, User)
        .join(RequestConversationMessage, RequestConversationMessage.id == RequestMentionNotification.message_id)
        .join(PaymentRequest, PaymentRequest.id == RequestMentionNotification.request_id)
        .join(User, User.id == RequestConversationMessage.author_user_id)
        .where(RequestMentionNotification.recipient_user_id == actor.id)
        .order_by(RequestMentionNotification.created_at.desc(), RequestMentionNotification.id.desc())
        .limit(50)
    ).all()
    request_summaries = {
        item["id"]: item for item in serialize_many(db, list({row[2].id: row[2] for row in rows}.values()))
    }
    workflow_by_request = (
        {
            instance.request_id: instance
            for instance in db.scalars(
                select(WorkflowInstance).where(WorkflowInstance.request_id.in_({row[2].id for row in rows}))
            )
        }
        if rows
        else {}
    )
    items = []
    for notification, message, payment_request, author in rows:
        instance = workflow_by_request.get(payment_request.id)
        stage = None
        if instance and instance.current_stage is not None:
            stage = instance.route_snapshot.get("stages", [])[instance.current_stage]
        items.append(
            {
                "id": str(notification.id),
                "request_id": str(payment_request.id),
                "message_id": str(message.id),
                "author_name": author.display_name,
                "preview": message.body[:160],
                "created_at": notification.created_at.isoformat(),
                "read_at": notification.read_at.isoformat() if notification.read_at else None,
                "request": request_summaries[str(payment_request.id)],
                "workflow_stage_role": stage["role"] if stage else None,
                "workflow_stage_purpose": stage["purpose"] if stage else None,
            }
        )
    return {"unread_count": unread_count, "items": items}


@router.post("/{notification_id}/read")
def mark_notification_read(notification_id: UUID, db: Session = Depends(get_db), actor: User = Depends(current_user)):
    notification = db.get(RequestMentionNotification, notification_id)
    if notification is None or notification.recipient_user_id != actor.id:
        raise HTTPException(404, "Notification not found")
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        db.commit()
    return {"id": str(notification.id), "read_at": notification.read_at.isoformat()}
