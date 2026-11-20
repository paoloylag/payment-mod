"""Extend the Procurement event stream with ordered financial snapshots."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261117_0036"
down_revision = "20261114_0035"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "procurement_approval_events", "source_event_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True
    )
    op.add_column("procurement_approval_events", sa.Column("sequence", sa.BigInteger(), sa.Identity(), nullable=False))
    op.create_unique_constraint("uq_procurement_event_sequence", "procurement_approval_events", ["sequence"])


def downgrade():
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM procurement_approval_events WHERE source_event_id IS NULL) THEN
            RAISE EXCEPTION 'Cannot downgrade while financial event audit rows exist; preserve or archive them first';
        END IF;
    END $$""")
    op.drop_constraint("uq_procurement_event_sequence", "procurement_approval_events", type_="unique")
    op.drop_column("procurement_approval_events", "sequence")
    op.alter_column(
        "procurement_approval_events", "source_event_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False
    )
