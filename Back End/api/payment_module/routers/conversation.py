"""Shared, immutable notes for participants in a payment request."""

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..models import PaymentRequest, RequestConversationMessage, User, WorkflowEvent, WorkflowInstance
from ..security import current_user
from .workflow import actor_roles

router = APIRouter(prefix="/api/v1/requests", tags=["request conversation"])


class ConversationPost(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


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


def message_view(message: RequestConversationMessage, author: User | None) -> dict:
    return {
        "id": str(message.id),
        "kind": "message",
        "body": message.body,
        "author_user_id": str(message.author_user_id),
        "author_name": author.display_name if author else "Former participant",
        "created_at": message.created_at.isoformat(),
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
    entries = [message_view(m, authors.get(m.author_user_id)) for m in messages]
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
    return {"request_id": str(item.id), "items": entries, "can_post": item.status in {"submitted", "returned"}}


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
    existing = db.scalar(
        select(RequestConversationMessage).where(
            RequestConversationMessage.author_user_id == actor.id,
            RequestConversationMessage.idempotency_key == key,
        )
    )
    if existing:
        if existing.request_id != item.id or existing.body != body:
            raise HTTPException(409, "Idempotency-Key was already used for another message")
        return message_view(existing, actor)
    if item.status not in {"submitted", "returned"}:
        raise HTTPException(409, "Conversation is read-only for this request")
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
        if existing is None or existing.request_id != item.id or existing.body != body:
            raise HTTPException(409, "Idempotency-Key was already used for another message")
        return message_view(existing, actor)
    message = db.get(RequestConversationMessage, message_id)
    audit(
        db,
        actor_id=actor.id,
        action="request.conversation.posted",
        entity_type="payment_request",
        entity_id=item.id,
        request_id=request.state.request_id,
        after={"message_id": str(message.id)},
    )
    result = message_view(message, actor)
    db.commit()
    return result
