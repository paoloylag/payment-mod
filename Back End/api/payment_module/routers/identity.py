from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..models import Department, Permission, Role, RolePermission, User, UserPermissionOverride, UserRole
from ..schemas import (
    DepartmentCreate,
    DepartmentUpdate,
    PermissionAssignments,
    PermissionCreate,
    PermissionUpdate,
    RoleAssignment,
    RoleCreate,
    RoleUpdate,
    UserCreate,
    UserUpdate,
)
from ..security import hash_password, require_permission, revoke_user_sessions

router = APIRouter(prefix="/api/v1", tags=["identity and access"])


def user_row(db: Session, user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "department_id": str(user.department_id) if user.department_id else None,
        "manager_id": str(user.manager_id) if user.manager_id else None,
        "is_active": user.is_active,
        "is_suspended": user.is_suspended,
        "role_ids": [str(value) for value in db.scalars(select(UserRole.role_id).where(UserRole.user_id == user.id))],
    }


@router.get("/departments")
def departments(_: User = Depends(require_permission("departments.read")), db: Session = Depends(get_db)) -> list[dict]:
    return [
        {"id": str(item.id), "code": item.code, "name": item.name, "is_active": item.is_active}
        for item in db.scalars(select(Department).order_by(Department.name))
    ]


@router.post("/departments", status_code=201)
def create_department(
    payload: DepartmentCreate,
    request: Request,
    actor: User = Depends(require_permission("departments.manage")),
    db: Session = Depends(get_db),
) -> dict:
    if db.scalar(select(Department).where((Department.code == payload.code) | (Department.name == payload.name))):
        raise HTTPException(409, "Department code or name already exists")
    item = Department(code=payload.code, name=payload.name)
    db.add(item)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action="department.created",
        entity_type="department",
        entity_id=item.id,
        request_id=request.state.request_id,
        after={"code": item.code, "name": item.name},
    )
    db.commit()
    return {"id": str(item.id), "code": item.code, "name": item.name, "is_active": item.is_active}


@router.patch("/departments/{department_id}")
def update_department(
    department_id: UUID,
    payload: DepartmentUpdate,
    request: Request,
    actor: User = Depends(require_permission("departments.manage")),
    db: Session = Depends(get_db),
) -> dict:
    item = db.get(Department, department_id)
    if not item:
        raise HTTPException(404, "Department not found")
    changes = payload.model_dump(exclude_unset=True)
    if "code" in changes:
        changes["code"] = changes["code"].upper().strip()
    if "name" in changes:
        changes["name"] = changes["name"].strip()
    duplicate = db.scalar(
        select(Department).where(
            Department.id != item.id,
            (Department.code == changes.get("code", item.code)) | (Department.name == changes.get("name", item.name)),
        )
    )
    if duplicate:
        raise HTTPException(409, "Department code or name already exists")
    before = {"code": item.code, "name": item.name, "is_active": item.is_active}
    for key, value in changes.items():
        setattr(item, key, value)
    audit(
        db,
        actor_id=actor.id,
        action="department.updated",
        entity_type="department",
        entity_id=item.id,
        request_id=request.state.request_id,
        before=before,
        after=changes,
    )
    db.commit()
    return {"id": str(item.id), "code": item.code, "name": item.name, "is_active": item.is_active}


@router.delete("/departments/{department_id}", status_code=204)
def delete_department(
    department_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("departments.manage")),
    db: Session = Depends(get_db),
) -> None:
    item = db.get(Department, department_id)
    if not item:
        raise HTTPException(404, "Department not found")
    if db.scalar(select(User.id).where(User.department_id == item.id).limit(1)):
        raise HTTPException(409, "Department cannot be deleted while users are assigned to it")
    before = {"code": item.code, "name": item.name, "is_active": item.is_active}
    audit(
        db,
        actor_id=actor.id,
        action="department.deleted",
        entity_type="department",
        entity_id=item.id,
        request_id=request.state.request_id,
        before=before,
    )
    db.delete(item)
    db.commit()


@router.get("/roles")
def roles(_: User = Depends(require_permission("roles.read")), db: Session = Depends(get_db)) -> list[dict]:
    return [
        {
            "id": str(item.id),
            "code": item.code,
            "name": item.name,
            "description": item.description,
            "permission_ids": [
                str(value)
                for value in db.scalars(select(RolePermission.permission_id).where(RolePermission.role_id == item.id))
            ],
        }
        for item in db.scalars(select(Role).order_by(Role.name))
    ]


@router.post("/roles", status_code=201)
def create_role(
    payload: RoleCreate,
    request: Request,
    actor: User = Depends(require_permission("roles.assign")),
    db: Session = Depends(get_db),
) -> dict:
    if db.scalar(select(Role).where((Role.code == payload.code) | (Role.name == payload.name))):
        raise HTTPException(409, "Role code or name already exists")
    item = Role(code=payload.code, name=payload.name.strip(), description=payload.description.strip())
    db.add(item)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action="role.created",
        entity_type="role",
        entity_id=item.id,
        request_id=request.state.request_id,
        after=payload.model_dump(),
    )
    db.commit()
    return {
        "id": str(item.id),
        "code": item.code,
        "name": item.name,
        "description": item.description,
        "permission_ids": [],
    }


@router.patch("/roles/{role_id}")
def update_role(
    role_id: UUID,
    payload: RoleUpdate,
    request: Request,
    actor: User = Depends(require_permission("roles.assign")),
    db: Session = Depends(get_db),
) -> dict:
    item = db.get(Role, role_id)
    if not item:
        raise HTTPException(404, "Role not found")
    changes = payload.model_dump(exclude_unset=True)
    duplicate = db.scalar(
        select(Role).where(
            Role.id != item.id,
            (Role.code == changes.get("code", item.code)) | (Role.name == changes.get("name", item.name)),
        )
    )
    if duplicate:
        raise HTTPException(409, "Role code or name already exists")
    before = {"code": item.code, "name": item.name, "description": item.description}
    for key, value in changes.items():
        setattr(item, key, value.strip() if isinstance(value, str) else value)
    audit(
        db,
        actor_id=actor.id,
        action="role.updated",
        entity_type="role",
        entity_id=item.id,
        request_id=request.state.request_id,
        before=before,
        after=changes,
    )
    db.commit()
    return {
        "id": str(item.id),
        "code": item.code,
        "name": item.name,
        "description": item.description,
        "permission_ids": [
            str(value)
            for value in db.scalars(select(RolePermission.permission_id).where(RolePermission.role_id == item.id))
        ],
    }


@router.delete("/roles/{role_id}", status_code=204)
def delete_role(
    role_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("roles.assign")),
    db: Session = Depends(get_db),
) -> None:
    item = db.get(Role, role_id)
    if not item:
        raise HTTPException(404, "Role not found")
    if db.scalar(select(UserRole.id).where(UserRole.role_id == item.id).limit(1)):
        raise HTTPException(409, "Role cannot be deleted while it is assigned to users")
    audit(
        db,
        actor_id=actor.id,
        action="role.deleted",
        entity_type="role",
        entity_id=item.id,
        request_id=request.state.request_id,
        before={"code": item.code, "name": item.name, "description": item.description},
    )
    db.delete(item)
    db.commit()


@router.get("/permissions")
def permissions(_: User = Depends(require_permission("roles.read")), db: Session = Depends(get_db)) -> list[dict]:
    return [
        {"id": str(item.id), "code": item.code, "description": item.description}
        for item in db.scalars(select(Permission).order_by(Permission.code))
    ]


@router.post("/permissions", status_code=201)
def create_permission(
    payload: PermissionCreate,
    request: Request,
    actor: User = Depends(require_permission("permissions.assign")),
    db: Session = Depends(get_db),
) -> dict:
    if db.scalar(select(Permission).where(Permission.code == payload.code)):
        raise HTTPException(409, "Permission code already exists")
    item = Permission(code=payload.code, description=payload.description.strip())
    db.add(item)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action="permission.created",
        entity_type="permission",
        entity_id=item.id,
        request_id=request.state.request_id,
        after=payload.model_dump(),
    )
    db.commit()
    return {"id": str(item.id), "code": item.code, "description": item.description}


@router.patch("/permissions/{permission_id}")
def update_permission(
    permission_id: UUID,
    payload: PermissionUpdate,
    request: Request,
    actor: User = Depends(require_permission("permissions.assign")),
    db: Session = Depends(get_db),
) -> dict:
    item = db.get(Permission, permission_id)
    if not item:
        raise HTTPException(404, "Permission not found")
    changes = payload.model_dump(exclude_unset=True)
    if "code" in changes and db.scalar(
        select(Permission).where(Permission.id != item.id, Permission.code == changes["code"])
    ):
        raise HTTPException(409, "Permission code already exists")
    before = {"code": item.code, "description": item.description}
    for key, value in changes.items():
        setattr(item, key, value.strip())
    audit(
        db,
        actor_id=actor.id,
        action="permission.updated",
        entity_type="permission",
        entity_id=item.id,
        request_id=request.state.request_id,
        before=before,
        after=changes,
    )
    db.commit()
    return {"id": str(item.id), "code": item.code, "description": item.description}


@router.delete("/permissions/{permission_id}", status_code=204)
def delete_permission(
    permission_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("permissions.assign")),
    db: Session = Depends(get_db),
) -> None:
    item = db.get(Permission, permission_id)
    if not item:
        raise HTTPException(404, "Permission not found")
    assigned = db.scalar(
        select(RolePermission.id).where(RolePermission.permission_id == item.id).limit(1)
    ) or db.scalar(select(UserPermissionOverride.id).where(UserPermissionOverride.permission_id == item.id).limit(1))
    if assigned:
        raise HTTPException(409, "Permission cannot be deleted while it is assigned")
    audit(
        db,
        actor_id=actor.id,
        action="permission.deleted",
        entity_type="permission",
        entity_id=item.id,
        request_id=request.state.request_id,
        before={"code": item.code, "description": item.description},
    )
    db.delete(item)
    db.commit()


@router.get("/users")
def users(_: User = Depends(require_permission("users.read")), db: Session = Depends(get_db)) -> list[dict]:
    return [user_row(db, item) for item in db.scalars(select(User).order_by(User.display_name))]


@router.post("/users", status_code=201)
def create_user(
    payload: UserCreate,
    request: Request,
    actor: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> dict:
    email = payload.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email already exists")
    if payload.department_id and not db.get(Department, payload.department_id):
        raise HTTPException(422, "Department does not exist")
    if payload.manager_id and not db.get(User, payload.manager_id):
        raise HTTPException(422, "Manager does not exist")
    user = User(
        email=email,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        department_id=payload.department_id,
        manager_id=payload.manager_id,
    )
    db.add(user)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action="user.created",
        entity_type="user",
        entity_id=user.id,
        request_id=request.state.request_id,
        after={"email": email, "display_name": user.display_name},
    )
    db.commit()
    return user_row(db, user)


@router.patch("/users/{user_id}")
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    request: Request,
    actor: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> dict:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    before = {
        "email": user.email,
        "display_name": user.display_name,
        "department_id": str(user.department_id) if user.department_id else None,
        "manager_id": str(user.manager_id) if user.manager_id else None,
        "is_active": user.is_active,
        "is_suspended": user.is_suspended,
    }
    changes = payload.model_dump(exclude_unset=True)
    if "email" in changes:
        changes["email"] = changes["email"].lower().strip()
        if db.scalar(select(User).where(User.id != user.id, User.email == changes["email"])):
            raise HTTPException(409, "Email already exists")
    if "department_id" in changes and changes["department_id"] and not db.get(Department, changes["department_id"]):
        raise HTTPException(422, "Department does not exist")
    if "manager_id" in changes:
        manager_id = changes["manager_id"]
        if manager_id == user.id:
            raise HTTPException(422, "A user cannot be their own manager")
        if manager_id and not db.get(User, manager_id):
            raise HTTPException(422, "Manager does not exist")
        ancestor_id = manager_id
        visited: set[UUID] = set()
        while ancestor_id:
            if ancestor_id == user.id:
                raise HTTPException(422, "Manager assignment would create a reporting cycle")
            if ancestor_id in visited:
                raise HTTPException(422, "Existing manager hierarchy contains a reporting cycle")
            visited.add(ancestor_id)
            ancestor = db.get(User, ancestor_id)
            ancestor_id = ancestor.manager_id if ancestor else None
    for key, value in changes.items():
        setattr(user, key, value)
    if changes.get("is_suspended") or changes.get("is_active") is False:
        revoke_user_sessions(db, user.id)
    audit(
        db,
        actor_id=actor.id,
        action="user.updated",
        entity_type="user",
        entity_id=user.id,
        request_id=request.state.request_id,
        before=before,
        after={key: str(value) if isinstance(value, UUID) else value for key, value in changes.items()},
    )
    db.commit()
    return user_row(db, user)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> None:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == actor.id:
        raise HTTPException(409, "You cannot delete your own signed-in account")
    before = {
        "email": user.email,
        "display_name": user.display_name,
        "department_id": str(user.department_id) if user.department_id else None,
        "manager_id": str(user.manager_id) if user.manager_id else None,
    }
    audit(
        db,
        actor_id=actor.id,
        action="user.deleted",
        entity_type="user",
        entity_id=user.id,
        request_id=request.state.request_id,
        before=before,
    )
    db.delete(user)
    db.commit()


@router.put("/users/{user_id}/roles")
def assign_roles(
    user_id: UUID,
    payload: RoleAssignment,
    request: Request,
    actor: User = Depends(require_permission("roles.assign")),
    db: Session = Depends(get_db),
) -> dict:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    existing = set(db.scalars(select(UserRole.role_id).where(UserRole.user_id == user.id)))
    requested = set(payload.role_ids)
    if len(set(db.scalars(select(Role.id).where(Role.id.in_(requested))))) != len(requested):
        raise HTTPException(422, "One or more roles do not exist")
    db.execute(delete(UserRole).where(UserRole.user_id == user.id))
    db.add_all(UserRole(user_id=user.id, role_id=role_id) for role_id in requested)
    audit(
        db,
        actor_id=actor.id,
        action="user.roles_changed",
        entity_type="user",
        entity_id=user.id,
        request_id=request.state.request_id,
        before={"role_ids": sorted(map(str, existing))},
        after={"role_ids": sorted(map(str, requested))},
    )
    db.commit()
    return user_row(db, user)


@router.put("/users/{user_id}/permissions")
def assign_permissions(
    user_id: UUID,
    payload: PermissionAssignments,
    request: Request,
    actor: User = Depends(require_permission("permissions.assign")),
    db: Session = Depends(get_db),
) -> dict:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    ids = {item.permission_id for item in payload.overrides}
    if len(set(db.scalars(select(Permission.id).where(Permission.id.in_(ids))))) != len(ids):
        raise HTTPException(422, "One or more permissions do not exist")
    db.execute(delete(UserPermissionOverride).where(UserPermissionOverride.user_id == user.id))
    db.add_all(
        UserPermissionOverride(user_id=user.id, permission_id=item.permission_id, is_allowed=item.effect == "allow")
        for item in payload.overrides
    )
    audit(
        db,
        actor_id=actor.id,
        action="user.permissions_changed",
        entity_type="user",
        entity_id=user.id,
        request_id=request.state.request_id,
        after={"overrides": [{"permission_id": str(i.permission_id), "effect": i.effect} for i in payload.overrides]},
    )
    db.commit()
    return {"user_id": str(user.id), "overrides": payload.model_dump()["overrides"]}
