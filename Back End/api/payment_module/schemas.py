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
