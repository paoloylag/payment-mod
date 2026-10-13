"""Save workflow events for future notification delivery.

Revision ID: 20261011_0017
Revises: 20261011_0016
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261011_0017"
down_revision: str | None = "20261011_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notification_outbox_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "source_event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_events.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("aggregate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("state", sa.String(20), server_default="pending", nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "state IN ('pending','processing','delivered','failed')", name="ck_notification_outbox_state"
        ),
    )
    op.create_index("ix_notification_outbox_events_aggregate_id", "notification_outbox_events", ["aggregate_id"])
    op.create_index("ix_notification_outbox_pending", "notification_outbox_events", ["state", "available_at"])


def downgrade() -> None:
    op.drop_index("ix_notification_outbox_pending", table_name="notification_outbox_events")
    op.drop_index("ix_notification_outbox_events_aggregate_id", table_name="notification_outbox_events")
    op.drop_table("notification_outbox_events")
