"""Transactional integration events, separate from the email notification queue."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class ProcurementApprovalEvent(Base):
    __tablename__ = "procurement_approval_events"
    __table_args__ = (Index("ix_procurement_approval_pending", "state", "available_at"),)
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    sequence: Mapped[int] = mapped_column(BigInteger, Identity(), unique=True)
    source_key: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    source_event_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("workflow_events.id", ondelete="CASCADE"), unique=True
    )
    request_id: Mapped[UUID] = mapped_column(ForeignKey("payment_requests.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    state: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_error_code: Mapped[str | None] = mapped_column(String(80))
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
