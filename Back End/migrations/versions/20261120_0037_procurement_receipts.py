"""Durable authenticated Procurement requestor receipt confirmations."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261120_0037"
down_revision = "20261117_0036"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "procurement_receipt_events",
        sa.Column("event_id", sa.String(100), primary_key=True),
        sa.Column("po_id", sa.String(100), nullable=False),
        sa.Column("po_version", sa.Integer(), nullable=False),
        sa.Column("body_hash", sa.String(64), nullable=False),
        sa.Column("body", postgresql.JSONB(), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "po_id", "po_version", name="uq_procurement_receipt_version"
        ),
    )
    op.create_index(
        "ix_procurement_receipt_events_po_id", "procurement_receipt_events", ["po_id"]
    )
    op.execute(
        'CREATE FUNCTION protect_procurement_receipt_history() RETURNS trigger LANGUAGE plpgsql AS $$ '
        "BEGIN RAISE EXCEPTION 'Procurement receipt history is immutable'; END $$ "
    )
    op.execute(
        'CREATE TRIGGER immutable_procurement_receipts BEFORE UPDATE OR DELETE ON '
        'procurement_receipt_events FOR EACH ROW EXECUTE FUNCTION protect_procurement_receipt_history() '
    )


def downgrade():
    op.execute(
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM procurement_receipt_events) THEN RAISE EXCEPTION 'Preserve "
        "receipt audit history before downgrade'; END IF; END $$ "
    )
    op.drop_table("procurement_receipt_events")
    op.execute("DROP FUNCTION protect_procurement_receipt_history()")
