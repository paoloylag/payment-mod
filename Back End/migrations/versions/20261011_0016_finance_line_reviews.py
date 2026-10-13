"""Persist Finance Associate line reviews and physical-original receipt.

Revision ID: 20261011_0016
Revises: 20261009_0015
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261011_0016"
down_revision: str | None = "20261009_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "finance_line_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "request_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payment_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "line_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payment_request_lines.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("request_version", sa.Integer(), nullable=False),
        sa.Column("decision", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text(), server_default="", nullable=False),
        sa.Column("physical_original_received", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "actor_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("decision IN ('accepted','flagged')", name="ck_finance_line_reviews_decision"),
        sa.CheckConstraint(
            "decision <> 'flagged' OR length(trim(reason)) > 0", name="ck_finance_line_reviews_flag_reason"
        ),
    )
    op.create_index("ix_finance_line_reviews_request_id", "finance_line_reviews", ["request_id"])
    op.create_index("ix_finance_line_reviews_line_id", "finance_line_reviews", ["line_id"])
    op.create_index("ix_finance_line_reviews_line_time", "finance_line_reviews", ["line_id", "created_at", "id"])


def downgrade() -> None:
    op.drop_index("ix_finance_line_reviews_line_time", table_name="finance_line_reviews")
    op.drop_index("ix_finance_line_reviews_line_id", table_name="finance_line_reviews")
    op.drop_index("ix_finance_line_reviews_request_id", table_name="finance_line_reviews")
    op.drop_table("finance_line_reviews")
