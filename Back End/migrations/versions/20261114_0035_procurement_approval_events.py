"""Queue final PO approval notifications atomically with approval."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261114_0035"
down_revision = "20261111_0034"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "procurement_approval_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_key", sa.String(160), nullable=False, unique=True),
        sa.Column(
            "source_event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_events.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "request_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payment_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("state", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error_code", sa.String(80)),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_procurement_approval_pending", "procurement_approval_events", ["state", "available_at"])
    op.create_index("ix_procurement_approval_events_request_id", "procurement_approval_events", ["request_id"])


def downgrade():
    op.drop_table("procurement_approval_events")
