from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class RequestSequence(Base):
    __tablename__ = "request_sequences"
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PaymentRequest(Base):
    __tablename__ = "payment_requests"
    __table_args__ = (
        CheckConstraint(
            "request_type IN ('reimbursement','cashAdvance','liquidation','poPayment','general')",
            name="ck_payment_requests_type",
        ),
        CheckConstraint(
            "status IN ('draft','submitted','returned','cancelled','archived')", name="ck_payment_requests_status"
        ),
        CheckConstraint("gross_amount >= 0", name="ck_payment_requests_amount"),
    )
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_number: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    request_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", server_default="draft", index=True)
    requestor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    department_id: Mapped[UUID] = mapped_column(
        ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    payee_name: Mapped[str] = mapped_column(String(200), nullable=False, default="", server_default="")
    vendor_external_id: Mapped[str | None] = mapped_column(String(160))
    purpose: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    currency_code: Mapped[str] = mapped_column(ForeignKey("currencies.code", ondelete="RESTRICT"), nullable=False)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False, default=0, server_default="0")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    type_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class PaymentRequestLine(Base):
    __tablename__ = "payment_request_lines"
    __table_args__ = (
        UniqueConstraint("request_id", "position", name="uq_request_lines_position"),
        CheckConstraint("amount >= 0", name="ck_request_lines_amount"),
    )
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(
        ForeignKey("payment_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    invoice_date: Mapped[date | None] = mapped_column(Date)
    invoice_number: Mapped[str | None] = mapped_column(String(120), index=True)
    vendor_name: Mapped[str] = mapped_column(String(200), nullable=False, default="", server_default="")
    particulars: Mapped[str] = mapped_column(Text, nullable=False)
    chart_account_id: Mapped[UUID | None] = mapped_column(ForeignKey("chart_accounts.id", ondelete="RESTRICT"))
    cost_center_id: Mapped[UUID | None] = mapped_column(ForeignKey("cost_centers.id", ondelete="RESTRICT"))
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 4), nullable=False)
    currency_code: Mapped[str] = mapped_column(ForeignKey("currencies.code", ondelete="RESTRICT"), nullable=False)
    attachment_refs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")


class PaymentRequestVersion(Base):
    __tablename__ = "payment_request_versions"
    __table_args__ = (UniqueConstraint("request_id", "version", name="uq_request_versions_version"),)
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(
        ForeignKey("payment_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PaymentRequestStatusHistory(Base):
    __tablename__ = "payment_request_status_history"
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(
        ForeignKey("payment_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class RequestCommand(Base):
    __tablename__ = "request_commands"
    __table_args__ = (UniqueConstraint("actor_user_id", "action", "idempotency_key", name="uq_request_commands_key"),)
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(ForeignKey("payment_requests.id", ondelete="CASCADE"), nullable=False)
    actor_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(120), nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
