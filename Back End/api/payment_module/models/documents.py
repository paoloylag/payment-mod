from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (UniqueConstraint("request_id", "line_id", "id", name="uq_documents_context_id"),)

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(ForeignKey("payment_requests.id", ondelete="CASCADE"), index=True)
    line_id: Mapped[UUID | None] = mapped_column(ForeignKey("payment_request_lines.id", ondelete="CASCADE"), index=True)
    owner_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    document_type_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("document_types.id", ondelete="RESTRICT"), index=True
    )
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    removed_by_user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    removal_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "version", name="uq_document_versions_number"),)

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    media_type: Mapped[str] = mapped_column(String(160), nullable=False)
    byte_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    bucket: Mapped[str] = mapped_column(String(160), nullable=False)
    object_key: Mapped[str] = mapped_column(String(700), nullable=False, unique=True)
    storage_version_id: Mapped[str | None] = mapped_column(String(300))
    state: Mapped[str] = mapped_column(String(30), nullable=False, default="available", server_default="available")
    uploaded_by_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    cleanup_state: Mapped[str] = mapped_column(
        String(20), nullable=False, default="not_required", server_default="not_required"
    )
    cleanup_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    cleanup_error: Mapped[str | None] = mapped_column(String(500))
    cleaned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class DocumentRequirementRule(Base):
    __tablename__ = "document_requirement_rules"
    __table_args__ = (
        UniqueConstraint("request_type", "document_type_id", "scope", name="uq_document_requirement_rule"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    document_type_id: Mapped[UUID] = mapped_column(ForeignKey("document_types.id", ondelete="RESTRICT"), index=True)
    scope: Mapped[str] = mapped_column(String(20), nullable=False, default="request", server_default="request")
    minimum_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    guidance: Mapped[str | None] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class DocumentHardCopyEvent(Base):
    __tablename__ = "document_hard_copy_events"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class DocumentReviewDecision(Base):
    __tablename__ = "document_review_decisions"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    decision: Mapped[str] = mapped_column(String(30), nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
