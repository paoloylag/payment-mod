"""Persist ownership for the shared APS/Procurement vendor master."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0033"
down_revision = "20261103_0032"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("vendor_records", sa.Column("source_system", sa.String(20), nullable=False, server_default="aps"))
    # Recognize explicit prior metadata and the two known Procurement demo IDs;
    # never infer ownership from a display name or overwrite transaction snapshots.
    op.execute("""
        UPDATE vendor_records SET source_system = 'procurement'
        WHERE payload->>'source' = 'procurement' OR id IN ('VEND-DEMO-001', 'VEND-DEMO-003')
    """)
    op.create_check_constraint(
        "ck_vendor_records_source_system", "vendor_records", "source_system IN ('aps', 'procurement')"
    )
    op.create_index("ix_vendor_records_source_system", "vendor_records", ["source_system"])
    op.execute("""
        CREATE FUNCTION vendor_records_ownership_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.source_system IS DISTINCT FROM OLD.source_system THEN
                RAISE EXCEPTION 'Vendor ownership cannot be changed in place' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER vendor_records_ownership_immutable
        BEFORE UPDATE OF source_system ON vendor_records
        FOR EACH ROW EXECUTE FUNCTION vendor_records_ownership_guard()
    """)


def downgrade():
    if (
        op.get_bind()
        .execute(sa.text("SELECT EXISTS (SELECT 1 FROM vendor_records WHERE source_system = 'procurement')"))
        .scalar()
    ):
        raise RuntimeError("Cannot discard shared Procurement vendor ownership; reconcile these records first")
    op.execute("DROP TRIGGER vendor_records_ownership_immutable ON vendor_records")
    op.execute("DROP FUNCTION vendor_records_ownership_guard()")
    op.drop_index("ix_vendor_records_source_system", table_name="vendor_records")
    op.drop_constraint("ck_vendor_records_source_system", "vendor_records", type_="check")
    op.drop_column("vendor_records", "source_system")
