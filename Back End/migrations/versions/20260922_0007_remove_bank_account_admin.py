"""Retire protected bank-account administration.

Revision ID: 20260922_0007
Revises: 20260908_0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260922_0007"
down_revision: str | None = "20260908_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

def upgrade() -> None:
    op.execute(
        """DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM company_bank_accounts) THEN
                RAISE EXCEPTION 'Cannot remove company_bank_accounts while records exist; archive and review first';
            END IF;
        END $$;"""
    )
    op.execute(
        """DELETE FROM role_permissions AS rp USING permissions AS p
        WHERE rp.permission_id = p.id AND p.code IN
        ('bank_accounts.read', 'bank_accounts.manage_sensitive', 'bank_accounts.manage_access')"""
    )
    op.execute(
        """DELETE FROM user_permission_overrides AS u USING permissions AS p
        WHERE u.permission_id = p.id AND p.code IN
        ('bank_accounts.read', 'bank_accounts.manage_sensitive', 'bank_accounts.manage_access')"""
    )
    op.execute(
        """DELETE FROM permissions WHERE code IN
        ('bank_accounts.read', 'bank_accounts.manage_sensitive', 'bank_accounts.manage_access')"""
    )
    op.drop_table("company_bank_accounts")


def downgrade() -> None:
    op.create_table(
        "company_bank_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
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
    # Downgrade restores the empty schema. The older application seed restores
    # default permissions; removed custom bank-access overrides are not restored.
