from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

EmailField = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class LoginRequest(BaseModel):
    email: str = EmailField
    password: str = Field(min_length=8, max_length=200)


class UserCreate(BaseModel):
    email: str = EmailField
    display_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=12, max_length=200)
    department_id: UUID | None = None
    manager_id: UUID | None = None


class UserUpdate(BaseModel):
    email: str | None = Field(default=None, min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    display_name: str | None = Field(default=None, min_length=1, max_length=160)
    department_id: UUID | None = None
    manager_id: UUID | None = None
    is_active: bool | None = None
    is_suspended: bool | None = None


class RoleAssignment(BaseModel):
    role_ids: list[UUID]


class PermissionOverrideInput(BaseModel):
    permission_id: UUID
    effect: Literal["allow", "deny"]


class PermissionAssignments(BaseModel):
    overrides: list[PermissionOverrideInput]


class DepartmentCreate(BaseModel):
    code: str = Field(pattern=r"^[A-Z][A-Z0-9&_-]{0,29}$")
    name: str = Field(min_length=1, max_length=120)


class DepartmentUpdate(BaseModel):
    code: str | None = Field(default=None, pattern=r"^[A-Z][A-Z0-9&_-]{0,29}$")
    name: str | None = Field(default=None, min_length=1, max_length=120)
    is_active: bool | None = None


class RoleCreate(BaseModel):
    code: str = Field(pattern=r"^[a-z][a-z0-9_]{0,59}$")
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)


class RoleUpdate(BaseModel):
    code: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_]{0,59}$")
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)


class PermissionCreate(BaseModel):
    code: str = Field(pattern=r"^[a-z][a-z0-9_.]{0,99}$")
    description: str = Field(min_length=1, max_length=2000)


class PermissionUpdate(BaseModel):
    code: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_.]{0,99}$")
    description: str | None = Field(default=None, min_length=1, max_length=2000)


class PaymentRequestLineInput(BaseModel):
    invoice_date: date | None = None
    invoice_number: str | None = Field(default=None, max_length=120)
    vendor_name: str = Field(default="", max_length=200)
    particulars: str = Field(min_length=1, max_length=4000)
    chart_account_id: UUID | None = None
    cost_center_id: UUID | None = None
    amount: Decimal = Field(ge=0, max_digits=19, decimal_places=4)
    currency_code: str = Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    attachment_refs: list[str] = Field(default_factory=list, max_length=20)


class PaymentRequestCreate(BaseModel):
    request_type: Literal["reimbursement", "cashAdvance", "liquidation", "poPayment", "general"]
    department_id: UUID
    payee_name: str = Field(default="", max_length=200)
    vendor_external_id: str | None = Field(default=None, max_length=160)
    purpose: str = Field(default="", max_length=4000)
    currency_code: str = Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    type_data: dict = Field(default_factory=dict)
    lines: list[PaymentRequestLineInput] = Field(default_factory=list, max_length=100)


class PaymentRequestUpdate(PaymentRequestCreate):
    version: int = Field(ge=1)


class RequestTransition(BaseModel):
    version: int = Field(ge=1)
    note: str = Field(default="", max_length=2000)


class ReferenceCreate(BaseModel):
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_-]{0,39}$")
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    effective_from: str | None = None
    effective_to: str | None = None


class ReferenceUpdate(BaseModel):
    code: str | None = Field(default=None, pattern=r"^[A-Z][A-Z0-9_-]{0,39}$")
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None
    effective_from: str | None = None
    effective_to: str | None = None


class ChartAccountCreate(ReferenceCreate):
    account_type: Literal["asset", "liability", "equity", "income", "expense"]
    parent_id: UUID | None = None
    is_posting: bool = True
    normal_balance: Literal["debit", "credit"]


class ChartAccountUpdate(ReferenceUpdate):
    account_type: Literal["asset", "liability", "equity", "income", "expense"] | None = None
    parent_id: UUID | None = None
    is_posting: bool | None = None
    normal_balance: Literal["debit", "credit"] | None = None


class TaxCodeCreate(ReferenceCreate):
    vat_classification: str = Field(min_length=1, max_length=60)
    vat_rate: float = Field(ge=0, le=100)
    ewt_classification: str = Field(min_length=1, max_length=60)
    ewt_rate: float = Field(ge=0, le=100)


class TaxCodeUpdate(ReferenceUpdate):
    vat_classification: str | None = Field(default=None, min_length=1, max_length=60)
    vat_rate: float | None = Field(default=None, ge=0, le=100)
    ewt_classification: str | None = Field(default=None, min_length=1, max_length=60)
    ewt_rate: float | None = Field(default=None, ge=0, le=100)


class CurrencyCreate(BaseModel):
    code: str = Field(pattern=r"^[A-Z]{3}$")
    name: str = Field(min_length=1, max_length=80)
    symbol: str = Field(min_length=1, max_length=8)
    decimal_precision: int = Field(default=2, ge=0, le=6)


class CurrencyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    symbol: str | None = Field(default=None, min_length=1, max_length=8)
    decimal_precision: int | None = Field(default=None, ge=0, le=6)
    is_active: bool | None = None


class PaymentMethodCreate(ReferenceCreate):
    category: str = Field(min_length=1, max_length=40)
    requires_reference: bool = False


class PaymentMethodUpdate(ReferenceUpdate):
    category: str | None = Field(default=None, min_length=1, max_length=40)
    requires_reference: bool | None = None


class BankAccountCreate(BaseModel):
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_-]{0,39}$")
    bank_name: str = Field(min_length=1, max_length=160)
    account_name: str = Field(min_length=1, max_length=160)
    account_number: str = Field(min_length=4, max_length=80)
    currency_code: str = Field(pattern=r"^[A-Z]{3}$")
    branch: str = Field(default="", max_length=160)


class BankAccountUpdate(BaseModel):
    bank_name: str | None = Field(default=None, min_length=1, max_length=160)
    account_name: str | None = Field(default=None, min_length=1, max_length=160)
    account_number: str | None = Field(default=None, min_length=4, max_length=80)
    currency_code: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    branch: str | None = Field(default=None, max_length=160)
    is_active: bool | None = None


class DocumentTypeCreate(ReferenceCreate):
    allowed_request_types: list[str] = Field(default_factory=list)
    copy_requirement: Literal["soft", "hard", "both"] = "soft"


class DocumentTypeUpdate(ReferenceUpdate):
    allowed_request_types: list[str] | None = None
    copy_requirement: Literal["soft", "hard", "both"] | None = None


class BankAccessChange(BaseModel):
    user_id: UUID
    allowed: bool
    reason: str = Field(min_length=5, max_length=500)
