from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from payment_module.config import Settings
from payment_module.database import SessionLocal
from payment_module.maintenance import MaintenanceRefusedError, cleanup_sessions
from payment_module.models import AuthSession, User
from payment_module.seed import seed
from sqlalchemy import select


def cleanup_settings(**overrides) -> Settings:
    values = {
        "app_env": "test",
        "session_cleanup_enabled": True,
        "session_cleanup_retention_days": 30,
        "session_cleanup_batch_size": 2,
        "session_idle_minutes": 60,
    }
    values.update(overrides)
    return Settings(**values)


def make_session(user_id, now: datetime, **overrides) -> AuthSession:
    values = {
        "user_id": user_id,
        "token_hash": uuid4().hex + uuid4().hex,
        "csrf_token_hash": uuid4().hex + uuid4().hex,
        "created_at": now,
        "last_seen_at": now,
        "expires_at": now + timedelta(hours=8),
        "revoked_at": None,
    }
    values.update(overrides)
    return AuthSession(**values)


def test_cleanup_deletes_only_sessions_past_retention() -> None:
    seed()
    now = datetime.now(UTC)
    with SessionLocal.begin() as db:
        user = db.scalar(select(User).where(User.email == "admin@payment.local"))
        active = make_session(user.id, now)
        recently_revoked = make_session(user.id, now, revoked_at=now - timedelta(days=2))
        old_revoked = make_session(user.id, now, revoked_at=now - timedelta(days=31))
        old_expired = make_session(user.id, now, expires_at=now - timedelta(days=31))
        old_idle = make_session(user.id, now, last_seen_at=now - timedelta(days=31, hours=2))
        db.add_all([active, recently_revoked, old_revoked, old_expired, old_idle])
        db.flush()
        retained_ids = {active.id, recently_revoked.id}
        removable_ids = {old_revoked.id, old_expired.id, old_idle.id}

    with SessionLocal() as db:
        preview = cleanup_sessions(db, cleanup_settings(), now=now, dry_run=True)
        assert preview.matched == 3
        assert preview.deleted == 0

    with SessionLocal() as db:
        result = cleanup_sessions(db, cleanup_settings(), now=now)
        remaining = set(db.scalars(select(AuthSession.id).where(AuthSession.id.in_(retained_ids | removable_ids))))
        assert result.matched == 3
        assert result.deleted == 3
        assert remaining == retained_ids

    with SessionLocal.begin() as db:
        db.query(AuthSession).filter(AuthSession.id.in_(retained_ids)).delete(synchronize_session=False)


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_cleanup_is_refused_outside_local_and_test(environment: str) -> None:
    with SessionLocal() as db:
        with pytest.raises(MaintenanceRefusedError, match="development/test-only"):
            cleanup_sessions(db, cleanup_settings(app_env=environment), dry_run=True)


def test_cleanup_must_be_explicitly_enabled() -> None:
    with SessionLocal() as db:
        with pytest.raises(MaintenanceRefusedError, match="disabled"):
            cleanup_sessions(db, cleanup_settings(session_cleanup_enabled=False), dry_run=True)
