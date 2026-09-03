from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
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


class ReferenceRecordMixin:
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    effective_from: Mapped[date | None] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class CostCenter(ReferenceRecordMixin, Base):
    __tablename__ = "cost_centers"
    __table_args__ = (
        UniqueConstraint("department_id", name="uq_cost_centers_department_id"),
        CheckConstraint(
            "effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from",
            name="ck_cost_centers_dates",
        ),
    )

    department_id: Mapped[UUID] = mapped_column(
        ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False, index=True
    )


class ChartAccount(ReferenceRecordMixin, Base):
    __tablename__ = "chart_accounts"
    __table_args__ = (
        CheckConstraint("parent_id IS NULL OR parent_id <> id", name="ck_chart_accounts_not_self_parent"),
    )

    account_type: Mapped[str] = mapped_column(String(30), nullable=False)
    parent_id: Mapped[UUID | None] = mapped_column(ForeignKey("chart_accounts.id", ondelete="RESTRICT"), index=True)
    is_posting: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    normal_balance: Mapped[str] = mapped_column(String(10), nullable=False)


class TaxCode(ReferenceRecordMixin, Base):
    __tablename__ = "tax_codes"
    __table_args__ = (
        CheckConstraint("vat_rate >= 0 AND vat_rate <= 100", name="ck_tax_codes_vat_rate"),
        CheckConstraint("ewt_rate >= 0 AND ewt_rate <= 100", name="ck_tax_codes_ewt_rate"),
    )

    vat_classification: Mapped[str] = mapped_column(String(60), nullable=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False, default=0, server_default="0")
    ewt_classification: Mapped[str] = mapped_column(String(60), nullable=False)
    ewt_rate: Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False, default=0, server_default="0")


class Currency(Base):
    __tablename__ = "currencies"

    code: Mapped[str] = mapped_column(String(3), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    symbol: Mapped[str] = mapped_column(String(8), nullable=False)
    decimal_precision: Mapped[int] = mapped_column(nullable=False, default=2, server_default="2")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class PaymentMethod(ReferenceRecordMixin, Base):
    __tablename__ = "payment_methods"

    category: Mapped[str] = mapped_column(String(40), nullable=False)
    requires_reference: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")


class CompanyBankAccount(Base):
    __tablename__ = "company_bank_accounts"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(160), nullable=False)
    account_name: Mapped[str] = mapped_column(String(160), nullable=False)
    encrypted_account_number: Mapped[str] = mapped_column(Text, nullable=False)
    account_number_last4: Mapped[str] = mapped_column(String(4), nullable=False)
    currency_code: Mapped[str] = mapped_column(ForeignKey("currencies.code", ondelete="RESTRICT"), nullable=False)
    branch: Mapped[str] = mapped_column(String(160), nullable=False, default="", server_default="")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class DocumentType(ReferenceRecordMixin, Base):
    __tablename__ = "document_types"

    allowed_request_types: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    copy_requirement: Mapped[str] = mapped_column(String(20), nullable=False, default="soft", server_default="soft")
