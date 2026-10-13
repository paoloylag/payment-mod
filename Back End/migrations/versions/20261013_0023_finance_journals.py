"""Immutable accounting drafts, posting and voucher preparation."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "20261013_0023"
down_revision = "20261013_0022"
branch_labels = None
depends_on = None


def common_columns():
    return [
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "request_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("payment_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("command_key", sa.String(100), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("result", pg.JSONB(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "actor_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade():
    op.create_table(
        "finance_journal_snapshots",
        *common_columns(),
        sa.Column("request_version", sa.Integer(), nullable=False),
        sa.Column(
            "tax_snapshot_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("finance_tax_snapshots.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(10), nullable=False),
        sa.UniqueConstraint("request_id", "version"),
        sa.UniqueConstraint("request_id", "command_key"),
        sa.CheckConstraint("state IN ('draft', 'posted')", name="ck_finance_journal_state"),
    )
    op.create_index("ix_finance_journal_snapshots_request_id", "finance_journal_snapshots", ["request_id"])
    op.create_index(
        "uq_finance_journal_posted_request",
        "finance_journal_snapshots",
        ["request_id"],
        unique=True,
        postgresql_where=sa.text("state = 'posted'"),
    )
    op.create_table(
        "finance_voucher_drafts",
        *common_columns(),
        sa.Column(
            "journal_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("finance_journal_snapshots.id", ondelete="RESTRICT"),
            nullable=False,
            unique=True,
        ),
        sa.UniqueConstraint("request_id"),
    )


def downgrade():
    op.drop_table("finance_voucher_drafts")
    op.drop_table("finance_journal_snapshots")
