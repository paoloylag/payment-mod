from datetime import UTC, datetime, timedelta
from uuid import uuid4

from payment_module.database import SessionLocal
from payment_module.models import (
    AuditEvent,
    AuthSession,
    Department,
    Permission,
    Role,
    User,
    UserPermissionOverride,
    UserRole,
)
from payment_module.security import hash_password, verify_password
from payment_module.seed import DEPARTMENTS, PERMISSIONS, ROLES, seed
from sqlalchemy import func, select

PASSWORD = "Phase01-Test-Only!"


def login(client, email="admin@payment.local", password=PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_password_hash_is_salted_and_verifiable() -> None:
    first = hash_password(PASSWORD)
    second = hash_password(PASSWORD)
    assert first != second
    assert verify_password(PASSWORD, first)
    assert not verify_password("incorrect-password", first)


def test_phase_01_seed_is_deterministic() -> None:
    seed()
    seed()
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Department)) >= len(DEPARTMENTS)
        assert db.scalar(select(func.count()).select_from(User)) == len(ROLES)
        assert len(PERMISSIONS) == 16


def test_login_session_logout_and_revocation(client) -> None:
    seed()
    response = login(client)
    assert response.status_code == 200
    assert response.json()["user"]["roles"] == ["system_administrator"]
    csrf = response.json()["csrf_token"]
    assert client.get("/api/v1/auth/session").status_code == 200
    assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 204
    assert client.get("/api/v1/auth/session").status_code == 401


def test_invalid_login_and_unauthenticated_request_are_rejected(client) -> None:
    seed()
    assert login(client, password="incorrect-password").status_code == 401
    client.cookies.clear()
    assert client.get("/api/v1/users").status_code == 401


def test_role_permissions_and_explicit_deny_take_precedence(client) -> None:
    seed()
    requestor_login = login(client, "requestor@payment.local")
    assert requestor_login.status_code == 200
    assert client.get("/api/v1/departments").status_code == 200
    assert client.get("/api/v1/users").status_code == 403


def test_admin_can_add_department_and_change_is_audited(client) -> None:
    seed()
    response = login(client)
    csrf = response.json()["csrf_token"]
    created = client.post(
        "/api/v1/departments",
        json={"code": "LEGAL", "name": "Legal"},
        headers={"X-CSRF-Token": csrf},
    )
    assert created.status_code in {201, 409}
    with SessionLocal() as db:
        department = db.scalar(select(Department).where(Department.code == "LEGAL"))
        assert department is not None
        if created.status_code == 201:
            assert (
                db.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.entity_id == department.id))
                == 1
            )


def test_idle_session_and_suspended_user_are_rejected(client) -> None:
    seed()
    response = login(client, "finance.associate@payment.local")
    assert response.status_code == 200
    with SessionLocal.begin() as db:
        user = db.scalar(select(User).where(User.email == "finance.associate@payment.local"))
        auth_session = db.scalar(
            select(AuthSession).where(AuthSession.user_id == user.id).order_by(AuthSession.created_at.desc())
        )
        auth_session.last_seen_at = datetime.now(UTC) - timedelta(minutes=61)
    assert client.get("/api/v1/auth/session").status_code == 401

    client.cookies.clear()
    with SessionLocal.begin() as db:
        user = db.scalar(select(User).where(User.email == "finance.associate@payment.local"))
        user.is_suspended = True
    assert login(client, "finance.associate@payment.local").status_code == 401
    with SessionLocal.begin() as db:
        user = db.scalar(select(User).where(User.email == "finance.associate@payment.local"))
        user.is_suspended = False


def test_admin_can_replace_roles_and_change_is_audited(client) -> None:
    seed()
    response = login(client)
    csrf = response.json()["csrf_token"]
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        role = db.scalar(select(Role).where(Role.code == "requestor"))
    assigned = client.put(
        f"/api/v1/users/{user.id}/roles",
        json={"role_ids": [str(role.id)]},
        headers={"X-CSRF-Token": csrf},
    )
    assert assigned.status_code == 200
    with SessionLocal() as db:
        assert set(db.scalars(select(UserRole.role_id).where(UserRole.user_id == user.id))) == {role.id}
        assert (
            db.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.action == "user.roles_changed"))
            >= 1
        )


def test_explicit_permission_deny_overrides_role_grant(client) -> None:
    seed()
    admin = login(client)
    csrf = admin.json()["csrf_token"]
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        permission = db.scalar(select(Permission).where(Permission.code == "departments.read"))
    changed = client.put(
        f"/api/v1/users/{user.id}/permissions",
        json={"overrides": [{"permission_id": str(permission.id), "effect": "deny"}]},
        headers={"X-CSRF-Token": csrf},
    )
    assert changed.status_code == 200
    client.cookies.clear()
    assert login(client, "requestor@payment.local").status_code == 200
    assert client.get("/api/v1/departments").status_code == 403
    with SessionLocal.begin() as db:
        db.query(UserPermissionOverride).filter(UserPermissionOverride.user_id == user.id).delete()


def test_csrf_is_required_for_authenticated_mutations(client) -> None:
    seed()
    assert login(client).status_code == 200
    response = client.post("/api/v1/departments", json={"code": "RISK", "name": "Risk"})
    assert response.status_code == 403


def test_admin_can_create_and_suspend_user_with_session_revocation(client) -> None:
    seed()
    admin = login(client)
    csrf = admin.json()["csrf_token"]
    email = f"phase01-{uuid4().hex}@payment.local"
    with SessionLocal() as db:
        department = db.scalar(select(Department).where(Department.code == "DT"))
    created = client.post(
        "/api/v1/users",
        json={
            "email": email,
            "display_name": "Phase 01 Validation User",
            "password": PASSWORD,
            "department_id": str(department.id),
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert created.status_code == 201
    user_id = created.json()["id"]
    client.cookies.clear()
    assert login(client, email).status_code == 200
    client.cookies.clear()
    admin = login(client)
    suspended = client.patch(
        f"/api/v1/users/{user_id}",
        json={"is_suspended": True},
        headers={"X-CSRF-Token": admin.json()["csrf_token"]},
    )
    assert suspended.status_code == 200
    assert login(client, email).status_code == 401
    with SessionLocal.begin() as db:
        user = db.get(User, user_id)
        db.delete(user)


def test_admin_can_assign_requestor_manager_and_cycles_are_rejected(client) -> None:
    seed()
    admin = login(client)
    csrf = admin.json()["csrf_token"]
    with SessionLocal() as db:
        manager = db.scalar(select(User).where(User.email == "finance.manager@payment.local"))
        requestor = db.scalar(select(User).where(User.email == "requestor@payment.local"))

    assigned = client.patch(
        f"/api/v1/users/{requestor.id}",
        json={"manager_id": str(manager.id)},
        headers={"X-CSRF-Token": csrf},
    )
    assert assigned.status_code == 200
    assert assigned.json()["manager_id"] == str(manager.id)

    self_assignment = client.patch(
        f"/api/v1/users/{requestor.id}",
        json={"manager_id": str(requestor.id)},
        headers={"X-CSRF-Token": csrf},
    )
    assert self_assignment.status_code == 422

    cycle = client.patch(
        f"/api/v1/users/{manager.id}",
        json={"manager_id": str(requestor.id)},
        headers={"X-CSRF-Token": csrf},
    )
    assert cycle.status_code == 422


def test_admin_crud_for_users_departments_roles_and_permissions(client) -> None:
    seed()
    admin = login(client)
    csrf = admin.json()["csrf_token"]
    suffix = uuid4().hex[:8]
    headers = {"X-CSRF-Token": csrf}

    department = client.post(
        "/api/v1/departments", json={"code": f"QA{suffix.upper()}", "name": f"Quality {suffix}"}, headers=headers
    )
    assert department.status_code == 201
    department_id = department.json()["id"]
    updated_department = client.patch(
        f"/api/v1/departments/{department_id}", json={"name": f"Quality Updated {suffix}"}, headers=headers
    )
    assert updated_department.status_code == 200

    user = client.post(
        "/api/v1/users",
        json={
            "email": f"crud-{suffix}@payment.local",
            "display_name": "CRUD User",
            "password": PASSWORD,
            "department_id": department_id,
        },
        headers=headers,
    )
    assert user.status_code == 201
    user_id = user.json()["id"]
    updated_user = client.patch(f"/api/v1/users/{user_id}", json={"display_name": "Updated CRUD User"}, headers=headers)
    assert updated_user.status_code == 200
    assert client.delete(f"/api/v1/departments/{department_id}", headers=headers).status_code == 409
    assert client.delete(f"/api/v1/users/{user_id}", headers=headers).status_code == 204
    assert client.delete(f"/api/v1/departments/{department_id}", headers=headers).status_code == 204

    role = client.post(
        "/api/v1/roles",
        json={"code": f"qa_{suffix}", "name": f"QA Role {suffix}", "description": "Temporary test role"},
        headers=headers,
    )
    assert role.status_code == 201
    role_id = role.json()["id"]
    assert (
        client.patch(f"/api/v1/roles/{role_id}", json={"description": "Updated role"}, headers=headers).status_code
        == 200
    )
    assert client.delete(f"/api/v1/roles/{role_id}", headers=headers).status_code == 204

    permission = client.post(
        "/api/v1/permissions",
        json={"code": f"qa.{suffix}", "description": "Temporary test permission"},
        headers=headers,
    )
    assert permission.status_code == 201
    permission_id = permission.json()["id"]
    assert (
        client.patch(
            f"/api/v1/permissions/{permission_id}", json={"description": "Updated permission"}, headers=headers
        ).status_code
        == 200
    )
    assert client.delete(f"/api/v1/permissions/{permission_id}", headers=headers).status_code == 204
