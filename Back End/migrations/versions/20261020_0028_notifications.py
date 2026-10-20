"""Durable workflow/payment inbox and local development mailbox."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "20261020_0028"
down_revision = "20261015_0027"
branch_labels = None
depends_on = None


def upgrade():
    op.create_foreign_key(
        "fk_notification_aggregate_request",
        "notification_outbox_events",
        "payment_requests",
        ["aggregate_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_table(
        "notification_attempts",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "outbox_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("notification_outbox_events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("outcome", sa.String(30), nullable=False),
        sa.Column("error_code", sa.String(80)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_notification_attempts_outbox_id", "notification_attempts", ["outbox_id"])
    op.alter_column("notification_outbox_events", "source_event_id", nullable=True)
    op.add_column("notification_outbox_events", sa.Column("source_key", sa.String(120)))
    op.create_unique_constraint("uq_notification_outbox_source_key", "notification_outbox_events", ["source_key"])
    op.add_column("notification_outbox_events", sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("notification_outbox_events", sa.Column("last_error_code", sa.String(80)))
    op.create_table(
        "notification_deliveries",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "outbox_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("notification_outbox_events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "request_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("payment_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recipient_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("channel", sa.String(30), nullable=False),
        sa.Column("template_version", sa.String(40), nullable=False),
        sa.Column("content", pg.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("outbox_id", "recipient_user_id", "channel", name="uq_notification_delivery_recipient"),
    )
    op.create_index("ix_notification_inbox", "notification_deliveries", ["recipient_user_id", "channel", "created_at"])


def downgrade():
    db = op.get_bind()
    if (
        db.scalar(sa.text("SELECT count(*) FROM notification_attempts"))
        or db.scalar(sa.text("SELECT count(*) FROM notification_deliveries"))
        or db.scalar(sa.text("SELECT count(*) FROM notification_outbox_events WHERE source_event_id IS NULL"))
    ):
        raise RuntimeError("Cannot discard delivered notifications or payment notification history")
    op.drop_table("notification_deliveries")
    op.drop_table("notification_attempts")
    op.drop_constraint("fk_notification_aggregate_request", "notification_outbox_events", type_="foreignkey")
    op.drop_column("notification_outbox_events", "last_error_code")
    op.drop_column("notification_outbox_events", "attempts")
    op.drop_constraint("uq_notification_outbox_source_key", "notification_outbox_events", type_="unique")
    op.drop_column("notification_outbox_events", "source_key")
    op.alter_column("notification_outbox_events", "source_event_id", nullable=False)
