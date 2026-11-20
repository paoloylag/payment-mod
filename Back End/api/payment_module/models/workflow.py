from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class WorkflowInstance(Base):
    __tablename__ = "workflow_instances"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(
        ForeignKey("payment_requests.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    policy_version: Mapped[str | None] = mapped_column(String(80))
    route_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    state: Mapped[str] = mapped_column(String(24), nullable=False)
    current_stage: Mapped[int | None] = mapped_column(Integer)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class WorkflowEvent(Base):
    __tablename__ = "workflow_events"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(
        ForeignKey("payment_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workflow_id: Mapped[UUID] = mapped_column(ForeignKey("workflow_instances.id", ondelete="CASCADE"), nullable=False)
    actor_user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    stage_index: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class WorkflowCommand(Base):
    __tablename__ = "workflow_commands"
    __table_args__ = (UniqueConstraint("actor_user_id", "idempotency_key", name="uq_workflow_commands_actor_key"),)

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(ForeignKey("payment_requests.id", ondelete="CASCADE"), nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(120), nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)


class WorkflowAssignment(Base):
    __tablename__ = "workflow_assignments"
    __table_args__ = (
        UniqueConstraint("workflow_id", "stage_index", "kind", name="uq_workflow_assignment_stage"),
        CheckConstraint("kind IN ('approval', 'response')", name="ck_workflow_assignment_kind"),
        CheckConstraint("stage_index >= 0", name="ck_workflow_assignment_stage"),
        CheckConstraint(
            "delegate_user_id IS NULL OR (delegate_user_id <> assigned_user_id "
            "AND delegation_starts_at IS NOT NULL AND delegation_ends_at > delegation_starts_at)",
            name="ck_workflow_assignment_delegate",
        ),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    workflow_id: Mapped[UUID] = mapped_column(
        ForeignKey("workflow_instances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_index: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    assigned_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    delegate_user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    delegation_starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delegation_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
