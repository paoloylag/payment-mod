"""Database-only notification delivery. Never sends email or contacts external recipients."""

import argparse
import json
import time
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from .config import get_settings
from .database import SessionLocal
from .models import NotificationAttempt, NotificationDelivery, NotificationOutboxEvent, User

BACKOFF_SECONDS = (60, 300, 1800, 7200)


def deliver(db, event, development_mailbox=False):
    plan = event.payload.get("notification")

    if not plan:
        return "skipped"  # Historical events have no approved recipient snapshot; never guess or backfill.

    is_mention = plan.get("kind") == "conversation_mention"
    channels = [] if is_mention else ["in_app"]
    participants = None
    if is_mention:
        from .models import PaymentRequest
        from .routers.conversation import participant_users
        participants = {person["id"] for person in participant_users(db, db.get(PaymentRequest, event.aggregate_id))}

    if development_mailbox:
        if get_settings().app_env not in {"local", "test"}:
            raise ValueError("Development mailbox is restricted to local/test")

        channels.append("development_email")

    for recipient in plan["recipient_ids"]:
        user = db.get(User, UUID(recipient))

        if not user or not user.is_active or user.is_suspended or (participants is not None and recipient not in participants):
            continue

        for channel in channels:
            content = {"title": plan["title"], "preview": plan["preview"]}
            if is_mention and channel == "development_email":
                from .mention_email import mention_email
                content.update(mention_email(event.payload, user))
            db.execute(
                insert(NotificationDelivery)
                .values(
                    id=uuid4(),
                    outbox_id=event.id,
                    request_id=event.aggregate_id,
                    recipient_user_id=user.id,
                    channel=channel,
                    template_version=plan["version"],
                    content=content,
                )
                .on_conflict_do_nothing(constraint="uq_notification_delivery_recipient")
            )

    return "processed"


def run_batch(batch_size=50, development_mailbox=False):
    if not 1 <= batch_size <= 100:
        raise ValueError("Batch size must be 1–100")

    counts = {"processed": 0, "skipped": 0, "retry": 0, "failed": 0}

    with SessionLocal.begin() as db:
        events = db.scalars(
            select(NotificationOutboxEvent)
            .where(
                NotificationOutboxEvent.state == "pending",
                NotificationOutboxEvent.available_at <= datetime.now(UTC),
            )
            .order_by(NotificationOutboxEvent.created_at, NotificationOutboxEvent.id)
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        ).all()

        for event in events:
            event.attempts += 1

            try:
                with db.begin_nested():
                    state = deliver(db, event, development_mailbox)

                event.state, event.last_error_code = "delivered", None
                db.add(NotificationAttempt(outbox_id=event.id, attempt_number=event.attempts, outcome=state))

                counts[state] += 1

            except Exception as error:
                # Exception text may contain database values or credentials: persist only the class name.

                event.last_error_code = type(error).__name__[:80]

                if event.attempts >= 5:
                    event.state = "failed"

                    counts["failed"] += 1

                else:
                    event.available_at = datetime.now(UTC) + timedelta(seconds=BACKOFF_SECONDS[event.attempts - 1])

                    counts["retry"] += 1
                db.add(
                    NotificationAttempt(
                        outbox_id=event.id,
                        attempt_number=event.attempts,
                        outcome="failed" if event.state == "failed" else "retry",
                        error_code=event.last_error_code,
                    )
                )

    return counts


def health():
    with SessionLocal() as db:
        rows = db.execute(
            select(NotificationOutboxEvent.state, func.count(), func.min(NotificationOutboxEvent.created_at)).group_by(
                NotificationOutboxEvent.state
            )
        ).all()

        return [{"state": state, "count": count, "oldest_at": oldest.isoformat()} for state, count, oldest in rows]


def retry_failed(event_id):
    with SessionLocal.begin() as db:
        event = db.get(NotificationOutboxEvent, UUID(event_id), with_for_update=True)

        if not event or event.state != "failed":
            raise ValueError("Only a failed notification event can be retried")

        db.add(NotificationAttempt(outbox_id=event.id, attempt_number=event.attempts, outcome="manual_retry"))
        event.state, event.attempts, event.available_at = "pending", 0, datetime.now(UTC)


def main():
    parser = argparse.ArgumentParser(description=__doc__)

    parser.add_argument("--loop", action="store_true")

    parser.add_argument("--development-mailbox", action="store_true")

    parser.add_argument("--health", action="store_true")

    parser.add_argument("--retry-failed", metavar="EVENT_ID")

    args = parser.parse_args()

    if args.development_mailbox and get_settings().app_env not in {"local", "test"}:
        parser.error("Development mailbox is restricted to local/test")

    if args.health:
        print(json.dumps(health()))

        return

    if args.retry_failed:
        retry_failed(args.retry_failed)

        print("Failed event queued for controlled retry")

        return

    while True:
        print(json.dumps(run_batch(development_mailbox=args.development_mailbox)), flush=True)

        if not args.loop:
            break

        time.sleep(5)


if __name__ == "__main__":
    main()
