from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .models import (
    CostCenter,
    Currency,
    Department,
    DocumentType,
    PaymentMethod,
    Permission,
    Role,
    RolePermission,
    SystemSetting,
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
    "accounts.read": "Read the chart of accounts",
    "accounts.manage": "Create and maintain the chart of accounts",
    "bank_accounts.read": "Read masked company bank accounts",
    "bank_accounts.manage_sensitive": "Create, update, and reveal protected company bank accounts",
    "bank_accounts.manage_access": "Grant or revoke protected bank-account access",
    "requests.create": "Create and maintain owned payment request drafts",
    "requests.read_own": "Read owned payment requests",
    "requests.read_department": "Read payment requests for the user's department",
    "requests.read_all": "Read all payment requests",
    "requests.manage_lifecycle": "Return and administer submitted payment requests",
    "requests.numbering.manage": "Configure the payment request numbering reset month",
}
ROLE_PERMISSIONS = {code: {"session.read", "departments.read", "roles.read"} for code in ROLES}
ROLE_PERMISSIONS["system_administrator"] = set(PERMISSIONS) - {"bank_accounts.manage_access"}
ROLE_PERMISSIONS["finance_manager"] |= {
    "master_data.read",
    "master_data.manage",
    "vendors.read",
    "accounts.read",
    "accounts.manage",
    "bank_accounts.read",
    "bank_accounts.manage_sensitive",
    "bank_accounts.manage_access",
    "requests.read_all",
    "requests.manage_lifecycle",
    "requests.numbering.manage",
}
ROLE_PERMISSIONS["finance_associate"] |= {
    "master_data.read",
    "vendors.read",
    "accounts.read",
    "bank_accounts.read",
    "requests.read_all",
    "requests.manage_lifecycle",
    "requests.numbering.manage",
}
for role_code in ("requestor", "department_head", "coo", "president", "board_member", "authorized_signatory"):
    ROLE_PERMISSIONS[role_code] |= {"master_data.read", "vendors.read", "accounts.read"}
ROLE_PERMISSIONS["requestor"] |= {"requests.create", "requests.read_own"}
ROLE_PERMISSIONS["department_head"] |= {
    "requests.create",
    "requests.read_own",
    "requests.read_department",
    "requests.manage_lifecycle",
}
ROLE_PERMISSIONS["system_administrator"] |= {
    "requests.create",
    "requests.read_own",
    "requests.read_department",
    "requests.read_all",
    "requests.manage_lifecycle",
}
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


def stable_id(kind: str, code: str):
    return uuid5(NAMESPACE_URL, f"payment-module:{kind}:{code}")


def seed() -> None:
    settings = get_settings()
    with SessionLocal.begin() as session:
        for key, value in SEED_SETTINGS.items():
            setting = session.scalar(select(SystemSetting).where(SystemSetting.key == key))
            if setting is None:
                session.add(SystemSetting(id=uuid5(NAMESPACE_URL, f"payment-module:{key}"), key=key, value=value))
            elif key != "requests.numbering_reset_month":
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
        for code, name, request_types, copy_requirement in (
            ("INVOICE", "Invoice / Billing", ["reimbursement", "poPayment", "general"], "soft"),
            ("RECEIPT", "Official Receipt", ["reimbursement", "liquidation"], "soft"),
            ("APPROVED_PO", "Approved Purchase Order", ["poPayment"], "soft"),
            ("CASH_ADVANCE_FORM", "Cash Advance Form", ["cashAdvance", "liquidation"], "both"),
        ):
            item = session.scalar(select(DocumentType).where(DocumentType.code == code))
            if item is None:
                session.add(
                    DocumentType(
                        id=stable_id("document-type", code),
                        code=code,
                        name=name,
                        allowed_request_types=request_types,
                        copy_requirement=copy_requirement,
                    )
                )
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
            for role_code, email, display_name, department_code in DEMO_USERS:
                user_id = stable_id("user", email)
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


if __name__ == "__main__":
    seed()
    print(f"Seeded {len(SEED_SETTINGS)} system settings.")
