from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .models import (
    ChartAccount,
    CostCenter,
    Currency,
    Department,
    DocumentRequirementRule,
    DocumentType,
    PaymentMethod,
    PaymentRequest,
    PaymentRequestLine,
    Permission,
    Role,
    RolePermission,
    SystemSetting,
    TaxCode,
    User,
    UserRole,
)
from .security import hash_password

SEED_SETTINGS = {
    "application.name": "Automated Payment System",
    "application.timezone": "Asia/Manila",
    "application.phase": "0",
    "data_source.default": "hybrid",
    "requests.numbering_reset_month": "7",
    "requests.reimbursement_batch_cutoffs": "15,30",
    "requests.cash_advance_limit_amount": "40000.00",
    "requests.cash_advance_limit_currency": "PHP",
    "requests.cash_advance_one_outstanding": "true",
    "requests.cash_advance_liquidation_days": "15",
    "requests.reimbursement_invoice_age_days": "30",
    "requests.reimbursement_invoice_age_action": "warning",
}

DEPARTMENTS = {
    "OCP": "Office of the College President",
    "PNC": "People & Culture",
    "OOG": "Office of Growth",
    "DT": "Technology / Digital Transformation",
    "ACAD": "Academics / Residential Campus",
    "OPS": "Operations",
    "FIN": "Finance",
    "MKTG": "Marketing",
}
DEPARTMENT_CODE_ALIASES = {
    "P&C": "PNC",
    "ACADEMICS": "ACAD",
    "OPERATIONS": "OPS",
    "FINANCE": "FIN",
    "MARKETING": "MKTG",
}
ROLES = {
    "requestor": "Requestor",
    "department_head": "Department Head",
    "finance_associate": "Finance Associate",
    "finance_manager": "Finance Manager",
    "coo": "COO",
    "president": "President",
    "board_member": "Board Member",
    "authorized_signatory": "Authorized Signatory",
    "system_administrator": "System Administrator",
}
PERMISSIONS = {
    "session.read": "Read the current authenticated session",
    "departments.read": "List departments",
    "departments.manage": "Create and maintain departments",
    "users.read": "List users",
    "users.manage": "Create, activate, suspend, and update users",
    "roles.read": "List roles",
    "roles.assign": "Assign roles to users",
    "permissions.assign": "Assign explicit user permission overrides",
    "master_data.read": "Read active master data",
    "master_data.manage": "Create and maintain master data",
    "vendors.read": "Search external vendor reference data",
    "procurement.read": "Read eligible purchase orders from Procurement",
    "accounts.read": "Read the chart of accounts",
    "accounts.manage": "Create and maintain the chart of accounts",
    "requests.create": "Create and maintain owned payment request drafts",
    "requests.read_own": "Read owned payment requests",
    "requests.read_department": "Read payment requests for the user's department",
    "requests.read_all": "Read all payment requests",
    "requests.manage_lifecycle": "Return and administer submitted payment requests",
    "requests.numbering.manage": "Configure payment request numbering and reimbursement schedules",
    "documents.read": "Read document metadata and authorized content",
    "documents.manage_own": "Upload and replace documents on owned editable requests",
    "documents.review": "Record document review and hard-copy tracking decisions",
    "documents.rules.manage": "Configure required-document rules",
    "documents.cleanup": "Retry protected document object cleanup",
}
ROLE_PERMISSIONS = {code: {"session.read", "departments.read", "roles.read"} for code in ROLES}
for role_code in ROLES:
    ROLE_PERMISSIONS[role_code].add("documents.read")
ROLE_PERMISSIONS["system_administrator"] = set(PERMISSIONS)
ROLE_PERMISSIONS["finance_manager"] |= {
    "master_data.read",
    "master_data.manage",
    "vendors.read",
    "procurement.read",
    "accounts.read",
    "accounts.manage",
    "requests.read_all",
    "requests.manage_lifecycle",
    "requests.numbering.manage",
    "documents.review",
    "documents.rules.manage",
}
ROLE_PERMISSIONS["finance_associate"] |= {
    "master_data.read",
    "vendors.read",
    "procurement.read",
    "accounts.read",
    "requests.read_all",
    "requests.manage_lifecycle",
    "documents.review",
}
for role_code in ("requestor", "department_head", "coo", "president", "board_member", "authorized_signatory"):
    ROLE_PERMISSIONS[role_code] |= {"master_data.read", "vendors.read", "procurement.read", "accounts.read"}
ROLE_PERMISSIONS["requestor"] |= {"requests.create", "requests.read_own"}
ROLE_PERMISSIONS["requestor"].add("documents.manage_own")
ROLE_PERMISSIONS["department_head"] |= {
    "requests.create",
    "requests.read_own",
    "requests.read_department",
    "requests.manage_lifecycle",
}
ROLE_PERMISSIONS["department_head"].add("documents.manage_own")
ROLE_PERMISSIONS["system_administrator"] |= {
    "requests.create",
    "requests.read_own",
    "requests.read_department",
    "requests.read_all",
    "requests.manage_lifecycle",
}
ROLE_PERMISSIONS["system_administrator"].add("documents.manage_own")
DEMO_USERS = [
    ("requestor", "requestor@payment.local", "Development Requestor", "MKTG"),
    ("department_head", "department.head@payment.local", "Development Department Head", "MKTG"),
    ("finance_associate", "finance.associate@payment.local", "Development Finance Associate", "FIN"),
    ("finance_manager", "finance.manager@payment.local", "Development Finance Manager", "FIN"),
    ("coo", "coo@payment.local", "Development COO", "OPS"),
    ("president", "president@payment.local", "Development President", "DT"),
    ("board_member", "board.member@payment.local", "Development Board Member", "DT"),
    ("authorized_signatory", "signatory@payment.local", "Development Authorized Signatory", "FIN"),
    ("system_administrator", "admin@payment.local", "Development System Administrator", "DT"),
]

DOCUMENT_TYPES = (
    ("INVOICE", "Invoice", ["reimbursement", "poPayment", "general"], "soft"),
    ("BILLING_SOA", "Billing / Quotation / SOA", ["poPayment", "general"], "soft"),
    ("PROOF_PAYMENT", "Proof of Payment", ["reimbursement"], "soft"),
    ("BIR_2303", "BIR 2303", ["poPayment", "general"], "soft"),
    ("RECEIPT", "Official Receipt", ["reimbursement", "liquidation"], "soft"),
    ("APPROVED_PO", "Approved Purchase Order", ["poPayment"], "soft"),
    ("CASH_ADVANCE_FORM", "Cash Advance Form", ["cashAdvance", "liquidation"], "both"),
    ("DELIVERY_RECEIPT", "Delivery Receipt", ["poPayment"], "soft"),
    ("BUSINESS_PERMIT", "Business Permit", ["poPayment"], "soft"),
)

DOCUMENT_REQUIREMENT_RULES = (
    ("reimbursement", "PROOF_PAYMENT", "line", True, "Required for every reimbursement line"),
    ("poPayment", "BIR_2303", "request", False, "If new supplier"),
    ("poPayment", "BILLING_SOA", "request", True, None),
    ("poPayment", "INVOICE", "request", False, "If available"),
    ("poPayment", "DELIVERY_RECEIPT", "request", False, "If applicable"),
    ("poPayment", "BUSINESS_PERMIT", "request", False, "If new supplier"),
    ("general", "BIR_2303", "request", False, "If new supplier"),
    ("general", "BILLING_SOA", "request", True, None),
    ("general", "INVOICE", "request", False, "If available"),
)

DEMO_ACCOUNTS = (
    ("6100", "Office Supplies", "Routine office and operating supplies"),
    ("6200", "Travel and Transportation", "Business travel and local transportation"),
    ("6300", "Professional Services", "External professional and contracted services"),
    ("6400", "Technology Equipment", "Computers, peripherals, and technology equipment"),
    ("6500", "Events and Training", "Events, training, and staff development"),
)

DEMO_TAX_CODES = (
    ("VAT12-EWT2", "VAT 12% / EWT 2%", "VAT", Decimal("12"), "EWT services", Decimal("2")),
    ("VAT12-EWT1", "VAT 12% / EWT 1%", "VAT", Decimal("12"), "EWT goods", Decimal("1")),
    ("NONVAT", "Non-VAT", "Non-VAT", Decimal("0"), "No EWT", Decimal("0")),
)

DEMO_REQUESTS = (
    (
        "DEMO-DRAFT-001",
        "reimbursement",
        "draft",
        1,
        "Draft Request",
        "Marketing event materials",
        "Sample Event Supplier",
        "12500.00",
        True,
    ),
    (
        "DEMO-RET-001",
        "reimbursement",
        "returned",
        2,
        "Returned for Information",
        "Leadership workshop reimbursement",
        "Sample Training Center",
        "18450.00",
        True,
    ),
    (
        "DEMO-DEPT-001",
        "general",
        "submitted",
        3,
        "Department Approval",
        "Monthly utilities",
        "Sample City Utilities",
        "22500.00",
        True,
    ),
    (
        "DEMO-DOC-001",
        "reimbursement",
        "submitted",
        4,
        "Document Validation",
        "Staff conference reimbursement",
        "Sample Hotel",
        "84350.00",
        True,
    ),
    (
        "DEMO-FIN-001",
        "poPayment",
        "submitted",
        5,
        "Finance Budget Review",
        "Laptop replacement",
        "Sample BrightTech Supply",
        "90000.00",
        True,
    ),
    (
        "DEMO-COO-001",
        "general",
        "submitted",
        7,
        "COO Approval",
        "Campus facilities repair",
        "Sample BuildWorks",
        "248900.00",
        True,
    ),
    (
        "DEMO-PRES-001",
        "general",
        "submitted",
        8,
        "President Approval",
        "Learning platform renewal",
        "Sample CloudWorks",
        "329500.00",
        True,
    ),
    (
        "DEMO-BOARD-001",
        "poPayment",
        "submitted",
        8.5,
        "Board Approval",
        "Campus infrastructure project",
        "Sample Enterprise Systems",
        "1250000.00",
        False,
    ),
    (
        "DEMO-VCH-001",
        "reimbursement",
        "submitted",
        9,
        "Voucher Creation",
        "Training travel reimbursement",
        "Sample Travel Desk",
        "72300.00",
        True,
    ),
    (
        "DEMO-PROC-001",
        "general",
        "submitted",
        10,
        "Payment Processing",
        "Facilities maintenance",
        "Sample Metro Repairs",
        "66200.00",
        True,
    ),
    (
        "DEMO-SIGN-001",
        "poPayment",
        "submitted",
        11,
        "Signatory Authorization",
        "Office furniture acquisition",
        "Sample Office Systems",
        "141750.00",
        True,
    ),
    (
        "DEMO-NOTIFY-001",
        "poPayment",
        "submitted",
        12,
        "Vendor Notification",
        "Department equipment",
        "Sample Multi-Vendor Order",
        "287500.00",
        True,
    ),
    (
        "DEMO-RELEASE-001",
        "reimbursement",
        "submitted",
        13,
        "Payment Release",
        "Legal conference expenses",
        "Sample Travel Desk",
        "30750.00",
        True,
    ),
    (
        "DEMO-TRACK-001",
        "cashAdvance",
        "submitted",
        14,
        "Payment Tracker",
        "Academic outreach event",
        "Internal Cash Advance",
        "39000.00",
        True,
    ),
    (
        "DEMO-DONE-001",
        "general",
        "archived",
        15,
        "Completed",
        "Completed software subscription",
        "Sample Software Vendor",
        "101250.00",
        True,
    ),
)


def stable_id(kind: str, code: str):
    return uuid5(NAMESPACE_URL, f"payment-module:{kind}:{code}")


def seed(*, include_document_requirement_rules: bool | None = None) -> None:
    settings = get_settings()
    if include_document_requirement_rules is None:
        include_document_requirement_rules = settings.app_env != "test"
    with SessionLocal.begin() as session:
        for key, value in SEED_SETTINGS.items():
            setting = session.scalar(select(SystemSetting).where(SystemSetting.key == key))
            if setting is None:
                session.add(SystemSetting(id=uuid5(NAMESPACE_URL, f"payment-module:{key}"), key=key, value=value))
            elif not key.startswith("requests."):
                setting.value = value
        for old_code, new_code in DEPARTMENT_CODE_ALIASES.items():
            item = session.scalar(select(Department).where(Department.code == old_code))
            if item:
                item.code = new_code
        session.flush()
        department_ids = {}
        for code, name in DEPARTMENTS.items():
            item = session.scalar(select(Department).where(Department.code == code))
            if item is None:
                item = Department(id=stable_id("department", code), code=code, name=name)
                session.add(item)
            else:
                item.name = name
                item.is_active = True
            session.flush()
            department_ids[code] = item.id
            cost_center = session.scalar(select(CostCenter).where(CostCenter.department_id == item.id))
            if cost_center is None:
                session.add(CostCenter(id=stable_id("cost-center", code), code=code, name=name, department_id=item.id))
            else:
                cost_center.code, cost_center.name, cost_center.is_active = code, name, True
        session.flush()
        for code, name, description in DEMO_ACCOUNTS:
            account = session.scalar(select(ChartAccount).where(ChartAccount.code == code))
            if account is None:
                session.add(
                    ChartAccount(
                        id=stable_id("chart-account", code),
                        code=code,
                        name=name,
                        description=description,
                        account_type="expense",
                        is_posting=True,
                        normal_balance="debit",
                    )
                )
        for code, name, vat_classification, vat_rate, ewt_classification, ewt_rate in DEMO_TAX_CODES:
            tax_code = session.scalar(select(TaxCode).where(TaxCode.code == code))
            if tax_code is None:
                session.add(
                    TaxCode(
                        id=stable_id("tax-code", code),
                        code=code,
                        name=name,
                        description="Development sample; Finance approval is required before production use.",
                        vat_classification=vat_classification,
                        vat_rate=vat_rate,
                        ewt_classification=ewt_classification,
                        ewt_rate=ewt_rate,
                    )
                )
        for code, name, symbol in (("PHP", "Philippine Peso", "₱"), ("USD", "US Dollar", "$"), ("EUR", "Euro", "€")):
            item = session.get(Currency, code)
            if item is None:
                session.add(Currency(code=code, name=name, symbol=symbol, decimal_precision=2))
        for code, name, category, required in (
            ("CHECK", "Check", "check", True),
            ("BANK_TRANSFER", "Bank Transfer / DigiBanker", "bank_transfer", True),
            ("CASH", "Cash", "cash", False),
        ):
            item = session.scalar(select(PaymentMethod).where(PaymentMethod.code == code))
            if item is None:
                session.add(
                    PaymentMethod(
                        id=stable_id("payment-method", code),
                        code=code,
                        name=name,
                        category=category,
                        requires_reference=required,
                    )
                )
        document_type_ids = {}
        for code, name, request_types, copy_requirement in DOCUMENT_TYPES:
            item = session.scalar(select(DocumentType).where(DocumentType.code == code))
            if item is None:
                item = DocumentType(
                    id=stable_id("document-type", code),
                    code=code,
                    name=name,
                    allowed_request_types=request_types,
                    copy_requirement=copy_requirement,
                )
                session.add(item)
            else:
                item.name = name
                item.allowed_request_types = request_types
                item.copy_requirement = copy_requirement
                item.is_active = True
            session.flush()
            document_type_ids[code] = item.id
        if include_document_requirement_rules:
            # Reimbursements keep supporting files on each breakdown line.
            # Disable request-level defaults left by earlier builds.
            for document_code in ("INVOICE", "BILLING_SOA"):
                legacy = session.scalar(
                    select(DocumentRequirementRule).where(
                        DocumentRequirementRule.request_type == "reimbursement",
                        DocumentRequirementRule.document_type_id == document_type_ids[document_code],
                        DocumentRequirementRule.scope == "request",
                    )
                )
                if legacy is not None:
                    legacy.is_active = False
            for request_type, document_code, scope, is_required, guidance in DOCUMENT_REQUIREMENT_RULES:
                rule_id = stable_id("document-requirement-rule", f"{request_type}:{document_code}:{scope}")
                obsolete_scope = "line" if scope == "request" else "request"
                obsolete = session.get(
                    DocumentRequirementRule,
                    stable_id("document-requirement-rule", f"{request_type}:{document_code}:{obsolete_scope}"),
                )
                if obsolete is not None:
                    session.delete(obsolete)
                item = session.scalar(
                    select(DocumentRequirementRule).where(
                        DocumentRequirementRule.request_type == request_type,
                        DocumentRequirementRule.document_type_id == document_type_ids[document_code],
                        DocumentRequirementRule.scope == scope,
                    )
                )
                if item is None:
                    item = DocumentRequirementRule(id=rule_id)
                    session.add(item)
                item.request_type = request_type
                item.document_type_id = document_type_ids[document_code]
                item.scope = scope
                item.minimum_count = 1
                item.is_required = is_required
                item.guidance = guidance
                item.is_active = True
        for code, name in ROLES.items():
            item = session.get(Role, stable_id("role", code))
            if item is None:
                session.add(Role(id=stable_id("role", code), code=code, name=name, description=f"Initial {name} role"))
        for code, description in PERMISSIONS.items():
            item = session.get(Permission, stable_id("permission", code))
            if item is None:
                session.add(Permission(id=stable_id("permission", code), code=code, description=description))
        session.flush()
        for role_code, permission_codes in ROLE_PERMISSIONS.items():
            for permission_code in PERMISSIONS:
                if permission_code in permission_codes:
                    continue
                obsolete = session.get(RolePermission, stable_id("role-permission", f"{role_code}:{permission_code}"))
                if obsolete is not None:
                    session.delete(obsolete)
            for permission_code in permission_codes:
                item_id = stable_id("role-permission", f"{role_code}:{permission_code}")
                if session.get(RolePermission, item_id) is None:
                    session.add(
                        RolePermission(
                            id=item_id,
                            role_id=stable_id("role", role_code),
                            permission_id=stable_id("permission", permission_code),
                        )
                    )
        if settings.development_demo_password:
            user_ids = {}
            for role_code, email, display_name, department_code in DEMO_USERS:
                user_id = stable_id("user", email)
                user_ids[role_code] = user_id
                user = session.get(User, user_id)
                if user is None:
                    user = User(
                        id=user_id,
                        email=email,
                        display_name=display_name,
                        password_hash=hash_password(settings.development_demo_password),
                        department_id=department_ids[department_code],
                    )
                    session.add(user)
                elif settings.app_env == "test":
                    user.password_hash = hash_password(settings.development_demo_password)
                user.department_id = department_ids[department_code]
                user_role_id = stable_id("user-role", f"{email}:{role_code}")
                role_id = stable_id("role", role_code)
                existing_user_role = session.scalar(
                    select(UserRole).where(UserRole.user_id == user_id, UserRole.role_id == role_id)
                )
                if existing_user_role is None:
                    session.add(UserRole(id=user_role_id, user_id=user_id, role_id=stable_id("role", role_code)))
            session.flush()
            if settings.app_env in {"local", "development"}:
                marketing_cost_center_id = stable_id("cost-center", "MKTG")
                account_ids = [stable_id("chart-account", code) for code, _, _ in DEMO_ACCOUNTS]
                now = datetime.now(UTC)
                for index, (
                    seed_code,
                    request_type,
                    status,
                    current_step,
                    display_status,
                    purpose,
                    payee,
                    amount,
                    budgeted,
                ) in enumerate(DEMO_REQUESTS, 1):
                    request_id = stable_id("demo-payment-request", seed_code)
                    item = session.get(PaymentRequest, request_id)
                    request_number = None if status == "draft" else f"PR-2026-{900000 + index:06d}"
                    voucher_number = None if status == "draft" else f"VCH-2026-{900000 + index:06d}"
                    type_data = {
                        "development_seed": seed_code,
                        "demo_current_step": current_step,
                        "demo_display_status": display_status,
                        "budgeted": budgeted,
                        "validation_assignee": "Development Finance Associate",
                    }
                    if request_type == "cashAdvance":
                        type_data.update(
                            {
                                "event_end_date": date.today().isoformat(),
                                "liquidation_due_date": (date.today() + timedelta(days=15)).isoformat(),
                                "accountability_acknowledged": True,
                            }
                        )
                    if request_type == "poPayment":
                        type_data["po_reference"] = f"PO-DEMO-{1000 + index}"
                    if item is None:
                        item = PaymentRequest(id=request_id)
                        session.add(item)
                    item.request_number = request_number
                    item.voucher_number = voucher_number
                    item.request_type = request_type
                    item.status = status
                    item.requestor_id = user_ids["requestor"]
                    item.department_id = department_ids["MKTG"]
                    item.payee_name = payee
                    item.purpose = purpose
                    item.currency_code = "PHP"
                    item.gross_amount = Decimal(amount)
                    item.type_data = type_data
                    item.submitted_at = None if status == "draft" else now - timedelta(days=16 - index)
                    item.archived_at = now - timedelta(days=1) if status == "archived" else None
                    session.flush()
                    line_id = stable_id("demo-payment-request-line", seed_code)
                    line = session.get(PaymentRequestLine, line_id)
                    if line is None:
                        line = PaymentRequestLine(id=line_id, request_id=request_id, position=1)
                        session.add(line)
                    line.invoice_date = date.today() - timedelta(days=min(30, index + 2))
                    line.invoice_number = f"INV-DEMO-{index:03d}"
                    line.vendor_name = payee
                    line.particulars = purpose
                    line.chart_account_id = account_ids[(index - 1) % len(account_ids)]
                    line.cost_center_id = marketing_cost_center_id
                    line.amount = Decimal(amount)
                    line.currency_code = "PHP"
                    line.attachment_refs = [f"demo-{seed_code.lower()}.pdf"] if status != "draft" else []


if __name__ == "__main__":
    seed()
    print(f"Seeded {len(SEED_SETTINGS)} system settings.")
