"""Configure PHP conversion rate per currency for approval routing.

Revision ID: 20261008_0012
Revises: 20261007_0011
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261008_0012"
down_revision: str | None = "20261007_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("currencies", sa.Column("php_per_unit", sa.Numeric(18, 8)))
    op.create_check_constraint("ck_currencies_php_per_unit_positive", "currencies", "php_per_unit > 0")
    op.execute("UPDATE currencies SET php_per_unit = 1 WHERE code = 'PHP'")


def downgrade() -> None:
    op.drop_constraint("ck_currencies_php_per_unit_positive", "currencies", type_="check")
    op.drop_column("currencies", "php_per_unit")
