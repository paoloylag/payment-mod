"""Immutable Finance Associate decisions for individual request lines."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class FinanceLineReview(Base):
    __tablename__ = "finance_line_reviews"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(
        ForeignKey("payment_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_id: Mapped[UUID] = mapped_column(
        ForeignKey("payment_request_lines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    request_version: Mapped[int] = mapped_column(Integer, nullable=False)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    physical_original_received: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FinanceTaxSnapshot(Base):
    __tablename__ = "finance_tax_snapshots"
    __table_args__ = (
        UniqueConstraint("request_id", "version"),
        UniqueConstraint("request_id", "command_key"),
    )
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(ForeignKey("payment_requests.id", ondelete="CASCADE"), index=True)
    request_version: Mapped[int] = mapped_column(Integer, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    command_key: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FinanceConfiguration(Base):
    __tablename__ = "finance_configurations"
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    version: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    configuration: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    command_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FinanceCodingSnapshot(Base):
    __tablename__ = "finance_coding_snapshots"
    __table_args__ = (UniqueConstraint("request_id", "request_version"),)
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(ForeignKey("payment_requests.id", ondelete="CASCADE"), index=True)
    request_version: Mapped[int] = mapped_column(Integer, nullable=False)
    configuration_id: Mapped[UUID] = mapped_column(ForeignKey("finance_configurations.id", ondelete="RESTRICT"))
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FinanceJournalSnapshot(Base):
    __tablename__ = "finance_journal_snapshots"
    __table_args__ = (
        UniqueConstraint("request_id", "version"),
        UniqueConstraint("request_id", "command_key"),
        CheckConstraint("state IN ('draft', 'posted', 'reversed')", name="ck_finance_journal_state"),
        Index(
            "uq_finance_journal_posted_request", "request_id", unique=True, postgresql_where=text("state = 'posted'")
        ),
        Index(
            "uq_finance_journal_reversed_request",
            "request_id",
            unique=True,
            postgresql_where=text("state = 'reversed'"),
        ),
    )
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(ForeignKey("payment_requests.id", ondelete="CASCADE"), index=True)
    request_version: Mapped[int] = mapped_column(Integer, nullable=False)
    tax_snapshot_id: Mapped[UUID] = mapped_column(ForeignKey("finance_tax_snapshots.id", ondelete="RESTRICT"))
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(10), nullable=False)
    command_key: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FinanceVoucherDraft(Base):
    __tablename__ = "finance_voucher_drafts"
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(ForeignKey("payment_requests.id", ondelete="CASCADE"), unique=True)
    journal_id: Mapped[UUID] = mapped_column(
        ForeignKey("finance_journal_snapshots.id", ondelete="RESTRICT"), unique=True
    )
    command_key: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FinanceVoucherEvent(Base):
    __tablename__ = "finance_voucher_events"
    __table_args__ = (
        UniqueConstraint("voucher_id", "version"),
        UniqueConstraint("voucher_id", "command_key"),
        CheckConstraint(
            "state IN ('issued', 'payment_prepared', 'authorized', 'voided')", name="ck_finance_voucher_event_state"
        ),
    )
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    voucher_id: Mapped[UUID] = mapped_column(ForeignKey("finance_voucher_drafts.id", ondelete="CASCADE"), index=True)
    request_id: Mapped[UUID] = mapped_column(ForeignKey("payment_requests.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(25), nullable=False)
    voucher_number: Mapped[str | None] = mapped_column(String(40), unique=True)
    command_key: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FinanceVoucherSequence(Base):
    __tablename__ = "finance_voucher_sequences"
    period_key: Mapped[str] = mapped_column(String(60), primary_key=True)
    last_value: Mapped[int] = mapped_column(Integer, nullable=False)


class FinanceVoucherReplacement(Base):
    __tablename__ = "finance_voucher_replacements"
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    original_request_id: Mapped[UUID] = mapped_column(
        ForeignKey("payment_requests.id", ondelete="CASCADE"), unique=True
    )
    replacement_request_id: Mapped[UUID] = mapped_column(
        ForeignKey("payment_requests.id", ondelete="CASCADE"), unique=True
    )
    command_key: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    __table_args__ = (
        CheckConstraint(
            "original_request_id <> replacement_request_id",
            name="ck_voucher_replacement_distinct",
        ),
    )


class PaymentInstruction(Base):
    __tablename__ = "payment_instructions"
    __table_args__ = (
        UniqueConstraint("method_id", "reference"),
        UniqueConstraint("voucher_id", "sequence"),
        UniqueConstraint("predecessor_id"),
        CheckConstraint("amount > 0", name="ck_payment_instruction_amount"),
    )
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    voucher_id: Mapped[UUID] = mapped_column(ForeignKey("finance_voucher_drafts.id", ondelete="CASCADE"), index=True)
    request_id: Mapped[UUID] = mapped_column(ForeignKey("payment_requests.id", ondelete="CASCADE"), index=True)
    signatory_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    preparer_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    method_id: Mapped[UUID] = mapped_column(ForeignKey("payment_methods.id", ondelete="RESTRICT"), nullable=False)
    reference: Mapped[str] = mapped_column(String(100), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    amount: Mapped[Decimal] = mapped_column(
        Numeric(19, 4), nullable=False, default=lambda ctx: Decimal(ctx.get_current_parameters()["result"]["amount"])
    )
    currency_code: Mapped[str] = mapped_column(
        ForeignKey("currencies.code", ondelete="RESTRICT"),
        nullable=False,
        default=lambda ctx: ctx.get_current_parameters()["result"]["currency"],
    )
    predecessor_id: Mapped[UUID | None] = mapped_column(ForeignKey("payment_instructions.id", ondelete="CASCADE"))
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PaymentLineEvent(Base):
    __tablename__ = "payment_line_events"
    __table_args__ = (
        UniqueConstraint("instruction_id", "version"),
        UniqueConstraint("instruction_id", "command_key"),
        CheckConstraint(
            "state IN ('prepared','authorized','ready_for_pickup','released','cleared','failed','voided')",
            name="ck_payment_line_state",
        ),
    )
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    instruction_id: Mapped[UUID] = mapped_column(ForeignKey("payment_instructions.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(25), nullable=False)
    command_key: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PaymentEvidence(Base):
    __tablename__ = "payment_evidence"
    __table_args__ = (UniqueConstraint("instruction_id", "command_key"),)
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    instruction_id: Mapped[UUID] = mapped_column(ForeignKey("payment_instructions.id", ondelete="CASCADE"), index=True)
    document_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("document_versions.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    command_key: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
