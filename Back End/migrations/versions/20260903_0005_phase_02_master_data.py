"""Create Phase 02 master-data tables.

Revision ID: 20260903_0005
Revises: 20260826_0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260903_0005"
down_revision: str | None = "20260826_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def id_column() -> sa.Column:
    return sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False)


def reference_columns() -> list[sa.Column]:
    return [
        id_column(),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("effective_from", sa.Date()),
        sa.Column("effective_to", sa.Date()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def reference_constraints(table: str) -> list[sa.Constraint]:
    return [sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("code"), sa.UniqueConstraint("name")]


def indexes(table: str) -> None:
    op.create_index(f"ix_{table}_code", table, ["code"], unique=True)


def upgrade() -> None:
    op.create_table(
        "cost_centers",
        *reference_columns(),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from",
            name="ck_cost_centers_dates",
        ),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="RESTRICT"),
        *reference_constraints("cost_centers"),
        sa.UniqueConstraint("department_id", name="uq_cost_centers_department_id"),
    )
    indexes("cost_centers")
    op.create_index("ix_cost_centers_department_id", "cost_centers", ["department_id"])

    op.create_table(
        "chart_accounts",
        *reference_columns(),
        sa.Column("account_type", sa.String(30), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True)),
        sa.Column("is_posting", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("normal_balance", sa.String(10), nullable=False),
        sa.CheckConstraint("parent_id IS NULL OR parent_id <> id", name="ck_chart_accounts_not_self_parent"),
        sa.ForeignKeyConstraint(["parent_id"], ["chart_accounts.id"], ondelete="RESTRICT"),
        *reference_constraints("chart_accounts"),
    )
    indexes("chart_accounts")
    op.create_index("ix_chart_accounts_parent_id", "chart_accounts", ["parent_id"])

    op.create_table(
        "tax_codes",
        *reference_columns(),
        sa.Column("vat_classification", sa.String(60), nullable=False),
        sa.Column("vat_rate", sa.Numeric(7, 4), server_default="0", nullable=False),
        sa.Column("ewt_classification", sa.String(60), nullable=False),
        sa.Column("ewt_rate", sa.Numeric(7, 4), server_default="0", nullable=False),
        sa.CheckConstraint("vat_rate >= 0 AND vat_rate <= 100", name="ck_tax_codes_vat_rate"),
        sa.CheckConstraint("ewt_rate >= 0 AND ewt_rate <= 100", name="ck_tax_codes_ewt_rate"),
        *reference_constraints("tax_codes"),
    )
    indexes("tax_codes")

    op.create_table(
        "currencies",
        sa.Column("code", sa.String(3), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("symbol", sa.String(8), nullable=False),
        sa.Column("decimal_precision", sa.Integer(), server_default="2", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("decimal_precision >= 0 AND decimal_precision <= 6", name="ck_currencies_precision"),
        sa.PrimaryKeyConstraint("code"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "payment_methods",
        *reference_columns(),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("requires_reference", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        *reference_constraints("payment_methods"),
    )
    indexes("payment_methods")

    op.create_table(
        "company_bank_accounts",
        id_column(),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("bank_name", sa.String(160), nullable=False),
        sa.Column("account_name", sa.String(160), nullable=False),
        sa.Column("encrypted_account_number", sa.Text(), nullable=False),
        sa.Column("account_number_last4", sa.String(4), nullable=False),
        sa.Column("currency_code", sa.String(3), nullable=False),
        sa.Column("branch", sa.String(160), server_default="", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["currency_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_company_bank_accounts_code", "company_bank_accounts", ["code"], unique=True)

    op.create_table(
        "document_types",
        *reference_columns(),
        sa.Column("allowed_request_types", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("copy_requirement", sa.String(20), server_default="soft", nullable=False),
        *reference_constraints("document_types"),
    )
    indexes("document_types")


def downgrade() -> None:
    for table in [
        "document_types",
        "company_bank_accounts",
        "payment_methods",
        "currencies",
        "tax_codes",
        "chart_accounts",
        "cost_centers",
    ]:
        op.drop_table(table)
