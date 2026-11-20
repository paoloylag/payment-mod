"""Add system-generated voucher numbers to payment requests.

Revision ID: 20260930_0010
Revises: 20260923_0009
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260930_0010"
down_revision: str | None = "20260923_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("payment_requests", sa.Column("voucher_number", sa.String(21)))
    op.execute(
        """
        UPDATE payment_requests
        SET voucher_number = regexp_replace(request_number, '^PR-', 'VCH-')
        WHERE request_number IS NOT NULL
        """
    )
    op.create_index("ix_payment_requests_voucher_number", "payment_requests", ["voucher_number"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_payment_requests_voucher_number", table_name="payment_requests")
    op.drop_column("payment_requests", "voucher_number")
