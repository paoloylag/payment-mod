import argparse
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from .audit import audit
from .config import Settings, get_settings
from .database import SessionLocal
from .models import AuthSession

logger = logging.getLogger(__name__)


class MaintenanceRefusedError(RuntimeError):
    """Raised when a maintenance operation is unsafe for the current environment."""


@dataclass(frozen=True)
class SessionCleanupResult:
    matched: int
    deleted: int
    dry_run: bool


def assert_session_cleanup_allowed(settings: Settings) -> None:
    if settings.app_env in {"staging", "production"}:
        raise MaintenanceRefusedError(
            f"Session cleanup is development/test-only and is refused in {settings.app_env}."
        )
    if not settings.session_cleanup_enabled:
        raise MaintenanceRefusedError("Session cleanup is disabled. Set SESSION_CLEANUP_ENABLED=true locally.")


def _cleanup_eligibility(settings: Settings, now: datetime):
    retention_cutoff = now - timedelta(days=settings.session_cleanup_retention_days)
    idle_retention_cutoff = retention_cutoff - timedelta(minutes=settings.session_idle_minutes)
    return or_(
        AuthSession.revoked_at <= retention_cutoff,
        AuthSession.expires_at <= retention_cutoff,
        AuthSession.last_seen_at <= idle_retention_cutoff,
    )


def cleanup_sessions(
    db: Session,
    settings: Settings,
    *,
    now: datetime | None = None,
    dry_run: bool = False,
) -> SessionCleanupResult:
    assert_session_cleanup_allowed(settings)
    effective_now = now or datetime.now(UTC)
    eligibility = _cleanup_eligibility(settings, effective_now)
    matched = db.scalar(select(func.count()).select_from(AuthSession).where(eligibility)) or 0
    if dry_run or matched == 0:
        return SessionCleanupResult(matched=matched, deleted=0, dry_run=dry_run)

    deleted = 0
    while True:
        session_ids = list(
            db.scalars(
                select(AuthSession.id)
                .where(eligibility)
                .order_by(AuthSession.expires_at)
                .limit(settings.session_cleanup_batch_size)
            )
        )
        if not session_ids:
            break
        result = db.execute(delete(AuthSession).where(AuthSession.id.in_(session_ids)))
        deleted += result.rowcount or 0
        db.commit()

    audit(
        db,
        actor_id=None,
        action="maintenance.sessions_cleaned",
        entity_type="auth_session",
        entity_id=None,
        request_id=None,
        after={"deleted_count": deleted, "retention_days": settings.session_cleanup_retention_days},
    )
    db.commit()
    logger.info("session_cleanup_completed", extra={"deleted_count": deleted})
    return SessionCleanupResult(matched=matched, deleted=deleted, dry_run=False)


def main() -> int:
    parser = argparse.ArgumentParser(description="Development/test maintenance commands.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    cleanup_parser = subparsers.add_parser("cleanup-sessions", help="Remove retained invalid sessions.")
    cleanup_parser.add_argument("--dry-run", action="store_true", help="Count eligible sessions without deleting them.")
    args = parser.parse_args()
    settings = get_settings()
    try:
        with SessionLocal() as db:
            result = cleanup_sessions(db, settings, dry_run=args.dry_run)
    except MaintenanceRefusedError as error:
        parser.error(str(error))
    print(f"matched={result.matched} deleted={result.deleted} dry_run={str(result.dry_run).lower()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
