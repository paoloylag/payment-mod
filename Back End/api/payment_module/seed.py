from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .models import Department, Permission, Role, RolePermission, SystemSetting, User, UserRole
from .security import hash_password

SEED_SETTINGS = {
    "application.name": "Automated Payment System",
    "application.timezone": "Asia/Manila",
    "application.phase": "0",
    "data_source.default": "hybrid",
}

DEPARTMENTS = {
    "DT": "DT",
    "OPERATIONS": "Operations",
    "MARKETING": "Marketing",
    "FINANCE": "Finance",
    "ACADEMICS": "Academics",
    "P&C": "P&C",
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
}
ROLE_PERMISSIONS = {code: {"session.read", "departments.read", "roles.read"} for code in ROLES}
ROLE_PERMISSIONS["system_administrator"] = set(PERMISSIONS)
DEMO_USERS = [
    ("requestor", "requestor@payment.local", "Development Requestor", "MARKETING"),
    ("department_head", "department.head@payment.local", "Development Department Head", "MARKETING"),
    ("finance_associate", "finance.associate@payment.local", "Development Finance Associate", "FINANCE"),
    ("finance_manager", "finance.manager@payment.local", "Development Finance Manager", "FINANCE"),
    ("coo", "coo@payment.local", "Development COO", "OPERATIONS"),
    ("president", "president@payment.local", "Development President", "DT"),
    ("board_member", "board.member@payment.local", "Development Board Member", "DT"),
    ("authorized_signatory", "signatory@payment.local", "Development Authorized Signatory", "FINANCE"),
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
            else:
                setting.value = value
        for code, name in DEPARTMENTS.items():
            item = session.get(Department, stable_id("department", code))
            if item is None:
                session.add(Department(id=stable_id("department", code), code=code, name=name))
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
                        department_id=stable_id("department", department_code),
                    )
                    session.add(user)
                elif settings.app_env == "test":
                    user.password_hash = hash_password(settings.development_demo_password)
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
