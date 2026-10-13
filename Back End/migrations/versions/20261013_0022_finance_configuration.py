"""Immutable Finance activation and request coding snapshots."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "20261013_0022"
down_revision = "20261013_0021"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "finance_configurations",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False, unique=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("configuration", pg.JSONB(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("command_key", sa.String(100), unique=True, nullable=False),
        sa.Column(
            "actor_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "finance_coding_snapshots",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "request_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("payment_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("request_version", sa.Integer(), nullable=False),
        sa.Column(
            "configuration_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("finance_configurations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("result", pg.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("request_id", "request_version"),
    )
    op.create_index("ix_finance_coding_snapshots_request_id", "finance_coding_snapshots", ["request_id"])


def downgrade():
    op.drop_table("finance_coding_snapshots")
    op.drop_table("finance_configurations")
