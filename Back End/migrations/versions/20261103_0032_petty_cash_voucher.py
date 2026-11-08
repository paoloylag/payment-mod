"""Finance Associate petty cash vouchers, independent of general accounting."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = "20261103_0032"
down_revision = "20261030_0031"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("petty_cash_vouchers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("request_id", sa.Uuid(), sa.ForeignKey("payment_requests.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("voucher_number", sa.String(40), nullable=False, unique=True),
        sa.Column("command_key", sa.String(100), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("result", postgresql.JSONB(), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))

def downgrade():
    if op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM petty_cash_vouchers)")).scalar():
        raise RuntimeError("Cannot remove issued Petty Cash vouchers")
    op.drop_table("petty_cash_vouchers")
