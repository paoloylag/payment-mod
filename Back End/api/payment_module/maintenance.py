import argparse
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from .audit import audit
from .config import Settings, get_settings
from .database import SessionLocal
from .models import AuthSession, PaymentRequest

logger = logging.getLogger(__name__)


class MaintenanceRefusedError(RuntimeError):
    """Raised when a maintenance operation is unsafe for the current environment."""


@dataclass(frozen=True)
class SessionCleanupResult:
    matched: int
    deleted: int
    dry_run: bool


@dataclass(frozen=True)
class DraftArchivalResult:
    matched: int
    archived: int
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


def archive_expired_drafts(
    db: Session,
    settings: Settings,
    *,
    now: datetime | None = None,
    dry_run: bool = False,
) -> DraftArchivalResult:
    if not settings.draft_archival_enabled:
        raise MaintenanceRefusedError("Draft archival is disabled. Set DRAFT_ARCHIVAL_ENABLED=true explicitly.")
    effective_now = now or datetime.now(UTC)
    cutoff = effective_now - timedelta(days=settings.draft_retention_days)
    eligibility = (PaymentRequest.status == "draft") & (PaymentRequest.updated_at <= cutoff)
    matched = db.scalar(select(func.count()).select_from(PaymentRequest).where(eligibility)) or 0
    if dry_run or matched == 0:
        return DraftArchivalResult(matched=matched, archived=0, dry_run=dry_run)

    archived = 0
    while True:
        items = list(
            db.scalars(
                select(PaymentRequest)
                .where(eligibility)
                .order_by(PaymentRequest.updated_at, PaymentRequest.id)
                .limit(settings.draft_archival_batch_size)
                .with_for_update(skip_locked=True)
            )
        )
        if not items:
            break
        for item in items:
            item.status = "archived"
            item.archived_at = effective_now
            item.version += 1
            audit(
                db,
                actor_id=None,
                action="payment_request.draft_archived",
                entity_type="payment_request",
                entity_id=item.id,
                request_id=None,
                before={"status": "draft"},
                after={"status": "archived", "retention_days": settings.draft_retention_days},
            )
        archived += len(items)
        db.commit()
    logger.info("draft_archival_completed", extra={"archived_count": archived})
    return DraftArchivalResult(matched=matched, archived=archived, dry_run=False)


def main() -> int:
    parser = argparse.ArgumentParser(description="Development/test maintenance commands.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    cleanup_parser = subparsers.add_parser("cleanup-sessions", help="Remove retained invalid sessions.")
    cleanup_parser.add_argument("--dry-run", action="store_true", help="Count eligible sessions without deleting them.")
    archive_parser = subparsers.add_parser("archive-drafts", help="Archive drafts older than the retention period.")
    archive_parser.add_argument("--dry-run", action="store_true", help="Count eligible drafts without archiving them.")
    args = parser.parse_args()
    settings = get_settings()
    try:
        with SessionLocal() as db:
            if args.command == "cleanup-sessions":
                result = cleanup_sessions(db, settings, dry_run=args.dry_run)
                summary = f"matched={result.matched} deleted={result.deleted} dry_run={str(result.dry_run).lower()}"
            else:
                result = archive_expired_drafts(db, settings, dry_run=args.dry_run)
                summary = f"matched={result.matched} archived={result.archived} dry_run={str(result.dry_run).lower()}"
    except MaintenanceRefusedError as error:
        parser.error(str(error))
    print(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
