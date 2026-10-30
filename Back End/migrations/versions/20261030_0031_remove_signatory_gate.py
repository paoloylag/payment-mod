"""Remove required signatory assignment; retain historical approvals."""
from alembic import op
revision = "20261030_0031"
down_revision = "20261030_0030"
branch_labels = None
depends_on = None

def upgrade():
    op.alter_column("payment_instructions", "signatory_user_id", nullable=True)

def downgrade():
    # Refuse to invent signatories for payments prepared under the new workflow.
    op.alter_column("payment_instructions", "signatory_user_id", nullable=False)
