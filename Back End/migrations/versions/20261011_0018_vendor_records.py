"""Persist vendor JSON records."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20261011_0018"
down_revision = "20261011_0017"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "vendor_records", sa.Column("id", sa.String(80), primary_key=True), sa.Column("payload", JSONB, nullable=False)
    )


def downgrade():
    op.drop_table("vendor_records")
