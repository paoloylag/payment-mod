"""Petty Cash approval-only request type."""
from alembic import op
revision = "20261030_0030"
down_revision = "20261030_0029"
branch_labels = None
depends_on = None

def upgrade():
    op.drop_constraint("ck_payment_requests_type", "payment_requests", type_="check")
    op.create_check_constraint("ck_payment_requests_type", "payment_requests", "request_type IN ('reimbursement','cashAdvance','liquidation','poPayment','general','pettyCash')")
    op.execute("""UPDATE document_types SET allowed_request_types = allowed_request_types || '["pettyCash"]'::jsonb WHERE code IN ('INVOICE','BILLING_SOA') AND NOT allowed_request_types @> '["pettyCash"]'::jsonb""")

def downgrade():
    # Existing Petty Cash records must be retained; refuse a destructive downgrade.
    op.execute("""DO $$ BEGIN IF EXISTS (SELECT 1 FROM payment_requests WHERE request_type='pettyCash') THEN RAISE EXCEPTION 'Petty Cash requests exist; retain this migration'; END IF; END $$""")
    op.execute("UPDATE document_types SET allowed_request_types = allowed_request_types - 'pettyCash'")
    op.drop_constraint("ck_payment_requests_type", "payment_requests", type_="check")
    op.create_check_constraint("ck_payment_requests_type", "payment_requests", "request_type IN ('reimbursement','cashAdvance','liquidation','poPayment','general')")
