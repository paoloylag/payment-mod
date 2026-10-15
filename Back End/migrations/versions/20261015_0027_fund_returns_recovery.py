"""Evidence-backed full fund returns and post-release payment recovery."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "20261015_0027"
down_revision = "20261014_0026"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_payment_line_state", "payment_line_events", type_="check")
    op.create_check_constraint(
        "ck_payment_line_state",
        "payment_line_events",
        "state IN ('prepared','authorized','ready_for_pickup','released','cleared','failed','voided',"
        "'recovery_pending','reversed')",
    )
    op.create_table(
        "fund_return_events",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "voucher_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("finance_voucher_drafts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(19, 4), nullable=False),
        sa.Column("command_key", sa.String(100), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("result", pg.JSONB(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "actor_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("voucher_id", "version"),
        sa.UniqueConstraint("voucher_id", "command_key"),
        sa.CheckConstraint("state IN ('recorded','verified','rejected')", name="ck_fund_return_state"),
        sa.CheckConstraint("amount > 0", name="ck_fund_return_amount"),
    )
    op.create_index("ix_fund_return_events_voucher_id", "fund_return_events", ["voucher_id"])


def downgrade():
    bind = op.get_bind()
    if bind.scalar(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM fund_return_events) OR EXISTS "
            "(SELECT 1 FROM payment_line_events WHERE state IN ('recovery_pending','reversed'))"
        )
    ):
        raise RuntimeError("Cannot discard recorded fund return or payment recovery history")
    op.drop_table("fund_return_events")
    op.drop_constraint("ck_payment_line_state", "payment_line_events", type_="check")
    op.create_check_constraint(
        "ck_payment_line_state",
        "payment_line_events",
        "state IN ('prepared','authorized','ready_for_pickup','released','cleared','failed','voided')",
    )
