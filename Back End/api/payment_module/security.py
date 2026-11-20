import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import AuthSession, Permission, RolePermission, User, UserPermissionOverride, UserRole

settings = get_settings()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt$16384$8$1${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(derived).decode()}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        _, n, r, p, salt, expected = encoded.split("$", 5)
        actual = hashlib.scrypt(
            password.encode(), salt=base64.urlsafe_b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32
        )
        return hmac.compare_digest(actual, base64.urlsafe_b64decode(expected))
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User) -> tuple[AuthSession, str, str]:
    now = datetime.now(UTC)
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    session = AuthSession(
        user_id=user.id,
        token_hash=token_hash(token),
        csrf_token_hash=token_hash(csrf),
        last_seen_at=now,
        expires_at=now + timedelta(hours=settings.session_absolute_hours),
    )
    db.add(session)
    db.flush()
    return session, token, csrf


def revoke_user_sessions(db: Session, user_id) -> None:
    db.query(AuthSession).filter(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)).update(
        {AuthSession.revoked_at: datetime.now(UTC)}, synchronize_session=False
    )


def effective_permissions(db: Session, user_id) -> set[str]:
    role_codes = set(
        db.scalars(
            select(Permission.code)
            .join(RolePermission)
            .join(UserRole, UserRole.role_id == RolePermission.role_id)
            .where(UserRole.user_id == user_id)
        )
    )
    overrides = db.execute(
        select(Permission.code, UserPermissionOverride.is_allowed)
        .join(UserPermissionOverride)
        .where(UserPermissionOverride.user_id == user_id)
    ).all()
    for code, allowed in overrides:
        role_codes.add(code) if allowed else role_codes.discard(code)
    return role_codes


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    raw_token = request.cookies.get(settings.session_cookie_name)
    if not raw_token:
        raise HTTPException(401, "Authentication required")
    now = datetime.now(UTC)
    auth_session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash(raw_token)))
    if not auth_session or auth_session.revoked_at or auth_session.expires_at <= now:
        raise HTTPException(401, "Session is invalid or expired")
    if auth_session.last_seen_at + timedelta(minutes=settings.session_idle_minutes) <= now:
        auth_session.revoked_at = now
        db.commit()
        raise HTTPException(401, "Session expired due to inactivity")
    user = db.get(User, auth_session.user_id)
    if not user or not user.is_active or user.is_suspended:
        auth_session.revoked_at = now
        db.commit()
        raise HTTPException(401, "Account is not available")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        csrf = request.headers.get("X-CSRF-Token", "")
        if not csrf or not hmac.compare_digest(token_hash(csrf), auth_session.csrf_token_hash):
            raise HTTPException(403, "CSRF token is missing or invalid")
    auth_session.last_seen_at = now
    db.commit()
    request.state.auth_session = auth_session
    request.state.permissions = effective_permissions(db, user.id)
    return user


def require_permission(code: str):
    def dependency(request: Request, user: User = Depends(current_user)) -> User:
        if code not in getattr(request.state, "permissions", set()):
            raise HTTPException(403, f"Permission required: {code}")
        return user

    return dependency
