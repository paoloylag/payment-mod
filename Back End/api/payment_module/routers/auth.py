from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models import AuthSession, Department, Role, User, UserRole
from ..schemas import LoginRequest
from ..security import create_session, current_user, effective_permissions, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
settings = get_settings()


def user_payload(db: Session, user: User) -> dict:
    roles = list(db.scalars(select(Role.code).join(UserRole).where(UserRole.user_id == user.id)))
    department = db.get(Department, user.department_id) if user.department_id else None
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "department": {"id": str(department.id), "code": department.code, "name": department.name}
        if department
        else None,
        "roles": roles,
        "permissions": sorted(effective_permissions(db, user.id)),
    }


@router.post("/login")
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_active or user.is_suspended:
        raise HTTPException(401, "Account is not available")
    session, raw_token, csrf = create_session(db, user)
    db.commit()
    cookie_options = dict(secure=settings.session_cookie_secure, samesite="lax", path="/")
    response.set_cookie(settings.session_cookie_name, raw_token, httponly=True, **cookie_options)
    response.set_cookie("aps_csrf", csrf, httponly=False, **cookie_options)
    return {"user": user_payload(db, user), "csrf_token": csrf, "expires_at": session.expires_at}


@router.get("/session")
def session(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    auth_session = request.state.auth_session
    return {
        "user": user_payload(db, user),
        "csrf_token": request.cookies.get("aps_csrf"),
        "expires_at": auth_session.expires_at,
    }


@router.post("/logout", status_code=204)
def logout(
    request: Request, response: Response, _: User = Depends(current_user), db: Session = Depends(get_db)
) -> None:
    auth_session: AuthSession = request.state.auth_session
    auth_session.revoked_at = datetime.now(auth_session.expires_at.tzinfo)
    db.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.delete_cookie("aps_csrf", path="/")
