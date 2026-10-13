"""Durable business events awaiting a future notification worker."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class NotificationOutboxEvent(Base):
    __tablename__ = "notification_outbox_events"
    __table_args__ = (Index("ix_notification_outbox_pending", "state", "available_at"),)

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    source_event_id: Mapped[UUID] = mapped_column(
        ForeignKey("workflow_events.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    aggregate_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
