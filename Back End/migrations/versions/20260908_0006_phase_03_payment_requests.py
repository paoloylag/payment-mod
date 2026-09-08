"""Create Phase 03 payment request persistence.

Revision ID: 20260908_0006
Revises: 20260903_0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260908_0006"
down_revision: str | None = "20260903_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    op.create_table(
        "request_sequences",
        sa.Column("year", sa.Integer(), primary_key=True),
        sa.Column("last_value", sa.Integer(), nullable=False),
    )
    op.create_table(
        "payment_requests",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("request_number", sa.String(20), unique=True),
        sa.Column("request_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("requestor_id", uuid, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("department_id", uuid, sa.ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("payee_name", sa.String(200), server_default="", nullable=False),
        sa.Column("vendor_external_id", sa.String(160)),
        sa.Column("purpose", sa.Text(), server_default="", nullable=False),
        sa.Column("currency_code", sa.String(3), sa.ForeignKey("currencies.code", ondelete="RESTRICT"), nullable=False),
        sa.Column("gross_amount", sa.Numeric(19, 4), server_default="0", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("type_data", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "request_type IN ('reimbursement','cashAdvance','liquidation','poPayment','general')",
            name="ck_payment_requests_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft','submitted','returned','cancelled','archived')", name="ck_payment_requests_status"
        ),
        sa.CheckConstraint("gross_amount >= 0", name="ck_payment_requests_amount"),
    )
    for column in ("request_number", "request_type", "status", "requestor_id", "department_id"):
        op.create_index(f"ix_payment_requests_{column}", "payment_requests", [column])
    op.create_table(
        "payment_request_lines",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("request_id", uuid, sa.ForeignKey("payment_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("invoice_date", sa.Date()),
        sa.Column("invoice_number", sa.String(120)),
        sa.Column("vendor_name", sa.String(200), server_default="", nullable=False),
        sa.Column("particulars", sa.Text(), nullable=False),
        sa.Column("chart_account_id", uuid, sa.ForeignKey("chart_accounts.id", ondelete="RESTRICT")),
        sa.Column("cost_center_id", uuid, sa.ForeignKey("cost_centers.id", ondelete="RESTRICT")),
        sa.Column("amount", sa.Numeric(19, 4), nullable=False),
        sa.Column("currency_code", sa.String(3), sa.ForeignKey("currencies.code", ondelete="RESTRICT"), nullable=False),
        sa.Column("attachment_refs", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.UniqueConstraint("request_id", "position", name="uq_request_lines_position"),
        sa.CheckConstraint("amount >= 0", name="ck_request_lines_amount"),
    )
    op.create_index("ix_payment_request_lines_request_id", "payment_request_lines", ["request_id"])
    op.create_index("ix_payment_request_lines_invoice_number", "payment_request_lines", ["invoice_number"])
    op.create_table(
        "payment_request_versions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("request_id", uuid, sa.ForeignKey("payment_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", uuid, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("request_id", "version", name="uq_request_versions_version"),
    )
    op.create_index("ix_payment_request_versions_request_id", "payment_request_versions", ["request_id"])
    op.create_table(
        "payment_request_status_history",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("request_id", uuid, sa.ForeignKey("payment_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_status", sa.String(20)),
        sa.Column("to_status", sa.String(20), nullable=False),
        sa.Column("actor_user_id", uuid, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_payment_request_status_history_request_id", "payment_request_status_history", ["request_id"])
    op.create_table(
        "request_commands",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("request_id", uuid, sa.ForeignKey("payment_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_user_id", uuid, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("idempotency_key", sa.String(120), nullable=False),
        sa.Column("result", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("actor_user_id", "action", "idempotency_key", name="uq_request_commands_key"),
    )


def downgrade() -> None:
    for table in (
        "request_commands",
        "payment_request_status_history",
        "payment_request_versions",
        "payment_request_lines",
        "payment_requests",
        "request_sequences",
    ):
        op.drop_table(table)
