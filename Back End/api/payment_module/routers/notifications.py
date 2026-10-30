"""In-app inbox for mentions in request conversations."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    NotificationDelivery,
    PaymentRequest,
    RequestConversationMessage,
    RequestMentionNotification,
    User,
    WorkflowInstance,
)
from ..security import current_user
from .requests import serialize_many, visible_query

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("")
def list_notifications(
    request: Request,
    page: int = Query(default=1, ge=1, le=100),
    page_size: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    accessible = visible_query(db, request, actor).with_only_columns(PaymentRequest.id)
    mention_scope = [
        RequestMentionNotification.recipient_user_id == actor.id,
        RequestMentionNotification.request_id.in_(accessible),
    ]
    delivery_scope = [
        NotificationDelivery.recipient_user_id == actor.id,
        NotificationDelivery.channel == "in_app",
        NotificationDelivery.request_id.in_(accessible),
    ]
    unread_count = (
        db.scalar(
            select(func.count())
            .select_from(RequestMentionNotification)
            .where(
                *mention_scope,
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
        .where(*mention_scope)
        .order_by(RequestMentionNotification.created_at.desc(), RequestMentionNotification.id.desc())
        .limit(page * page_size)
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
    deliveries = db.scalars(
        select(NotificationDelivery)
        .where(*delivery_scope)
        .order_by(NotificationDelivery.created_at.desc(), NotificationDelivery.id.desc())
        .limit(page * page_size)
    ).all()
    summaries = (
        {
            item["id"]: item
            for item in serialize_many(
                db,
                list(
                    db.scalars(
                        select(PaymentRequest).where(PaymentRequest.id.in_({entry.request_id for entry in deliveries}))
                    )
                ),
            )
        }
        if deliveries
        else {}
    )
    for entry in deliveries:
        instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == entry.request_id))
        stage = (
            instance.route_snapshot["stages"][instance.current_stage]
            if (instance and instance.current_stage is not None)
            else None
        )
        items.append(
            {
                "id": str(entry.id),
                "request_id": str(entry.request_id),
                "message_id": None,
                "title": entry.content["title"],
                "preview": entry.content["preview"],
                "created_at": entry.created_at.isoformat(),
                "read_at": entry.read_at.isoformat() if entry.read_at else None,
                "request": summaries[str(entry.request_id)],
                "workflow_stage_role": stage["role"] if stage else None,
                "workflow_stage_purpose": stage["purpose"] if stage else None,
            }
        )
    unread_count += (
        db.scalar(
            select(func.count())
            .select_from(NotificationDelivery)
            .where(*delivery_scope, NotificationDelivery.read_at.is_(None))
        )
        or 0
    )
    items.sort(key=lambda entry: (datetime.fromisoformat(entry["created_at"]), entry["id"]), reverse=True)
    total = (db.scalar(select(func.count()).select_from(RequestMentionNotification).where(*mention_scope)) or 0) + (
        db.scalar(select(func.count()).select_from(NotificationDelivery).where(*delivery_scope)) or 0
    )
    return {
        "unread_count": unread_count,
        "items": items[(page - 1) * page_size : page * page_size],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


def own_notification(db, request, actor, notification_id):
    entry = db.get(NotificationDelivery, notification_id) or db.get(RequestMentionNotification, notification_id)
    if (
        entry is None
        or entry.recipient_user_id != actor.id
        or (isinstance(entry, NotificationDelivery) and entry.channel != "in_app")
        or db.scalar(visible_query(db, request, actor).where(PaymentRequest.id == entry.request_id)) is None
    ):
        raise HTTPException(404, "Notification not found")
    return entry


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    entry = own_notification(db, request, actor, notification_id)
    if entry.read_at is None:
        entry.read_at = datetime.now(UTC)
        db.commit()
    return {"id": str(entry.id), "read_at": entry.read_at.isoformat()}


@router.post("/{notification_id}/unread")
def mark_notification_unread(
    notification_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    entry = own_notification(db, request, actor, notification_id)
    entry.read_at = None
    db.commit()
    return {"id": str(entry.id), "read_at": None}


@router.get("/email-previews")
def email_previews(request: Request, page: int = Query(default=1, ge=1),
    db: Session = Depends(get_db), actor: User = Depends(current_user)):
    from ..config import get_settings
    if get_settings().app_env not in {"local", "test"}:
        raise HTTPException(404, "Email previews are unavailable")
    accessible = visible_query(db, request, actor).with_only_columns(PaymentRequest.id)
    entries = db.scalars(select(NotificationDelivery).where(NotificationDelivery.recipient_user_id == actor.id,
        NotificationDelivery.channel == "development_email", NotificationDelivery.request_id.in_(accessible))
        .order_by(NotificationDelivery.created_at.desc(), NotificationDelivery.id.desc()).offset((page - 1) * 25).limit(25)).all()
    return {"page": page, "items": [{"id": str(entry.id), "request_id": str(entry.request_id),
        "created_at": entry.created_at.isoformat(), **entry.content} for entry in entries]}
