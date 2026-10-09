"""Shared, immutable notes for participants in a payment request."""

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..models import (
    PaymentRequest,
    RequestConversationMessage,
    RequestMentionNotification,
    Role,
    User,
    UserRole,
    WorkflowEvent,
    WorkflowInstance,
)
from ..security import current_user, effective_permissions
from .workflow import actor_roles

router = APIRouter(prefix="/api/v1/requests", tags=["request conversation"])


class ConversationPost(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    mention_user_ids: list[UUID] = Field(default_factory=list, max_length=10)


def participant_users(db: Session, item: PaymentRequest) -> list[dict]:
    owner = db.get(User, item.requestor_id)
    found = {}
    if owner and owner.is_active and not owner.is_suspended:
        found[owner.id] = {"id": str(owner.id), "display_name": owner.display_name, "role": "requestor"}
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id))
    if instance is None:
        return list(found.values())
    route_roles = {stage["role"] for stage in instance.route_snapshot.get("stages", [])}
    if not route_roles:
        return list(found.values())
    for user, role_code in db.execute(
        select(User, Role.code)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.code.in_(route_roles), User.is_active.is_(True), User.is_suspended.is_(False))
    ):
        if user.id == item.requestor_id or role_code == "department_head" and user.department_id != item.department_id:
            continue
        if "workflow.review" not in effective_permissions(db, user.id):
            continue
        found.setdefault(user.id, {"id": str(user.id), "display_name": user.display_name, "role": role_code})
    return sorted(found.values(), key=lambda person: (person["display_name"].casefold(), person["id"]))


def participant(db: Session, request: Request, actor: User, item: PaymentRequest) -> bool:
    if actor.id == item.requestor_id:
        return True
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id))
    if instance is None or "workflow.review" not in getattr(request.state, "permissions", set()):
        return False
    roles = actor_roles(db, actor)
    return any(
        stage.get("role") in roles
        and (stage.get("role") != "department_head" or actor.department_id == item.department_id)
        for stage in instance.route_snapshot.get("stages", [])
    )


def visible_participant(db: Session, request: Request, actor: User, request_id: UUID) -> PaymentRequest:
    item = db.get(PaymentRequest, request_id)
    if item is None or not participant(db, request, actor, item):
        raise HTTPException(404, "Payment request not found")
    return item


def mention_ids(db: Session, message_id: UUID) -> list[str]:
    return sorted(
        str(value)
        for value in db.scalars(
            select(RequestMentionNotification.recipient_user_id).where(
                RequestMentionNotification.message_id == message_id
            )
        )
    )


def message_view(message: RequestConversationMessage, author: User | None, mentions: list[str]) -> dict:
    return {
        "id": str(message.id),
        "kind": "message",
        "body": message.body,
        "author_user_id": str(message.author_user_id),
        "author_name": author.display_name if author else "Former participant",
        "created_at": message.created_at.isoformat(),
        "mention_user_ids": mentions,
    }


@router.get("/{request_id}/conversation")
def get_conversation(
    request_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    item = visible_participant(db, request, actor, request_id)
    messages = list(
        db.scalars(select(RequestConversationMessage).where(RequestConversationMessage.request_id == item.id))
    )
    events = list(
        db.scalars(
            select(WorkflowEvent).where(
                WorkflowEvent.request_id == item.id,
                WorkflowEvent.action.in_(("information_requested", "information_provided")),
            )
        )
    )
    author_ids = {m.author_user_id for m in messages} | {e.actor_user_id for e in events if e.actor_user_id}
    authors = {user.id: user for user in db.scalars(select(User).where(User.id.in_(author_ids)))} if author_ids else {}
    notification_rows = list(
        db.scalars(
            select(RequestMentionNotification).where(
                RequestMentionNotification.request_id == item.id,
            )
        )
    )
    mentions_by_message = {}
    for notification in notification_rows:
        mentions_by_message.setdefault(notification.message_id, []).append(str(notification.recipient_user_id))
    entries = [
        message_view(m, authors.get(m.author_user_id), sorted(mentions_by_message.get(m.id, []))) for m in messages
    ]
    entries.extend(
        {
            "id": str(e.id),
            "kind": e.action,
            "body": e.note,
            "author_user_id": str(e.actor_user_id) if e.actor_user_id else None,
            "author_name": authors[e.actor_user_id].display_name if e.actor_user_id in authors else "System",
            "created_at": e.occurred_at.isoformat(),
        }
        for e in events
    )
    entries.sort(key=lambda entry: (entry["created_at"], entry["id"]))
    return {
        "request_id": str(item.id),
        "items": entries,
        "participants": participant_users(db, item),
        "can_post": item.status in {"submitted", "returned"},
    }


@router.post("/{request_id}/conversation", status_code=201)
def post_conversation(
    request_id: UUID,
    payload: ConversationPost,
    request: Request,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=120),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    body = payload.body.strip()
    key = idempotency_key.strip()
    if not body or not key:
        raise HTTPException(422, "Message and Idempotency-Key are required")
    item = visible_participant(db, request, actor, request_id)
    mentioned = set(payload.mention_user_ids)
    if len(mentioned) != len(payload.mention_user_ids) or actor.id in mentioned:
        raise HTTPException(422, "Mention each other participant at most once")
    existing = db.scalar(
        select(RequestConversationMessage).where(
            RequestConversationMessage.author_user_id == actor.id,
            RequestConversationMessage.idempotency_key == key,
        )
    )
    if existing:
        if (
            existing.request_id != item.id
            or existing.body != body
            or set(mention_ids(db, existing.id)) != {str(user_id) for user_id in mentioned}
        ):
            raise HTTPException(409, "Idempotency-Key was already used for another message")
        return message_view(existing, actor, mention_ids(db, existing.id))
    if item.status not in {"submitted", "returned"}:
        raise HTTPException(409, "Conversation is read-only for this request")
    candidates = {UUID(person["id"]): person for person in participant_users(db, item)}
    if not mentioned.issubset(candidates):
        raise HTTPException(422, "Mentions must be active participants in this request")
    if any(f"@{candidates[user_id]['display_name']}" not in body for user_id in mentioned):
        raise HTTPException(422, "Every selected participant must appear in the message")
    message_id = uuid4()
    inserted = db.scalar(
        insert(RequestConversationMessage)
        .values(id=message_id, request_id=item.id, author_user_id=actor.id, idempotency_key=key, body=body)
        .on_conflict_do_nothing(constraint="uq_request_conversation_author_key")
        .returning(RequestConversationMessage.id)
    )
    if inserted is None:
        existing = db.scalar(
            select(RequestConversationMessage).where(
                RequestConversationMessage.author_user_id == actor.id,
                RequestConversationMessage.idempotency_key == key,
            )
        )
        if (
            existing is None
            or existing.request_id != item.id
            or existing.body != body
            or set(mention_ids(db, existing.id)) != {str(user_id) for user_id in mentioned}
        ):
            raise HTTPException(409, "Idempotency-Key was already used for another message")
        return message_view(existing, actor, mention_ids(db, existing.id))
    message = db.get(RequestConversationMessage, message_id)
    for user_id in mentioned:
        db.add(RequestMentionNotification(request_id=item.id, message_id=message.id, recipient_user_id=user_id))
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action="request.conversation.posted",
        entity_type="payment_request",
        entity_id=item.id,
        request_id=request.state.request_id,
        after={"message_id": str(message.id), "mention_user_ids": sorted(str(user_id) for user_id in mentioned)},
    )
    result = message_view(message, actor, sorted(str(user_id) for user_id in mentioned))
    db.commit()
    return result
