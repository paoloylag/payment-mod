"""Allow a terminal declined request state.

Revision ID: 20261008_0013
Revises: 20261008_0012
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261008_0013"
down_revision: str | None = "20261008_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_payment_requests_status", "payment_requests", type_="check")
    op.create_check_constraint(
        "ck_payment_requests_status",
        "payment_requests",
        "status IN ('draft','submitted','returned','declined','cancelled','archived')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_payment_requests_status", "payment_requests", type_="check")
    op.create_check_constraint(
        "ck_payment_requests_status",
        "payment_requests",
        "status IN ('draft','submitted','returned','cancelled','archived')",
    )
