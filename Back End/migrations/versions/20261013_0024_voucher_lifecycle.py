"""Voucher issuance, reversal and assigned payment authorization."""

from uuid import NAMESPACE_URL, uuid5

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "20261013_0024"
down_revision = "20261013_0023"
branch_labels = None
depends_on = None
GRANTS = {
    "vouchers.read": ("finance_associate", "finance_manager", "authorized_signatory", "system_administrator"),
    "vouchers.issue": ("finance_manager", "system_administrator"),
    "vouchers.void": ("finance_manager", "system_administrator"),
    "payments.prepare": ("finance_associate", "system_administrator"),
    "payments.authorize": ("authorized_signatory", "system_administrator"),
}


def upgrade():
    op.drop_constraint("ck_finance_journal_state", "finance_journal_snapshots", type_="check")
    op.create_check_constraint(
        "ck_finance_journal_state", "finance_journal_snapshots", "state IN ('draft', 'posted', 'reversed')"
    )
    op.create_index(
        "uq_finance_journal_reversed_request",
        "finance_journal_snapshots",
        ["request_id"],
        unique=True,
        postgresql_where=sa.text("state = 'reversed'"),
    )
    op.create_table(
        "finance_voucher_sequences",
        sa.Column("period_key", sa.String(60), primary_key=True),
        sa.Column("last_value", sa.Integer(), nullable=False),
    )
    op.create_table(
        "finance_voucher_events",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "voucher_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("finance_voucher_drafts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "request_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("payment_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(25), nullable=False),
        sa.Column("voucher_number", sa.String(40), unique=True),
        sa.Column("command_key", sa.String(100), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("result", pg.JSONB(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "actor_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("voucher_id", "version"),
        sa.UniqueConstraint("voucher_id", "command_key"),
        sa.CheckConstraint(
            "state IN ('issued', 'payment_prepared', 'authorized', 'voided')", name="ck_finance_voucher_event_state"
        ),
    )
    op.create_index("ix_finance_voucher_events_request_id", "finance_voucher_events", ["request_id"])
    op.create_index("ix_finance_voucher_events_voucher_id", "finance_voucher_events", ["voucher_id"])
    op.create_table(
        "payment_instructions",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "voucher_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("finance_voucher_drafts.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "request_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("payment_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "signatory_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "preparer_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "method_id", pg.UUID(as_uuid=True), sa.ForeignKey("payment_methods.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("reference", sa.String(100), nullable=False),
        sa.Column("result", pg.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("method_id", "reference"),
    )
    for field in ("request_id", "signatory_user_id"):
        op.create_index(f"ix_payment_instructions_{field}", "payment_instructions", [field])
    bind = op.get_bind()
    for code, roles in GRANTS.items():
        permission_id = uuid5(NAMESPACE_URL, f"payment-module:permission:{code}")
        bind.execute(
            sa.text(
                "INSERT INTO permissions (id, code, description) VALUES (:id, :code, :description) "
                "ON CONFLICT (code) DO NOTHING"
            ),
            {"id": permission_id, "code": code, "description": code},
        )
        for role in roles:
            bind.execute(
                sa.text(
                    "INSERT INTO role_permissions (id, role_id, permission_id) "
                    "SELECT :id, r.id, p.id FROM roles r, permissions p WHERE r.code=:role AND p.code=:code "
                    "ON CONFLICT (role_id, permission_id) DO NOTHING"
                ),
                {
                    "id": uuid5(NAMESPACE_URL, f"payment-module:role-permission:{role}:{code}"),
                    "role": role,
                    "code": code,
                },
            )


def downgrade():
    bind = op.get_bind()
    # A rollback must never discard an accounting reversal.
    if bind.scalar(sa.text("SELECT EXISTS (SELECT 1 FROM finance_journal_snapshots WHERE state='reversed')")):
        raise RuntimeError("Cannot downgrade while accounting reversals exist; restore a pre-upgrade snapshot instead")
    op.drop_table("payment_instructions")
    op.drop_table("finance_voucher_events")
    op.drop_table("finance_voucher_sequences")
    op.drop_index("uq_finance_journal_reversed_request", table_name="finance_journal_snapshots")
    op.drop_constraint("ck_finance_journal_state", "finance_journal_snapshots", type_="check")
    op.create_check_constraint("ck_finance_journal_state", "finance_journal_snapshots", "state IN ('draft', 'posted')")
    for code in GRANTS:
        bind.execute(sa.text("DELETE FROM permissions WHERE code=:code"), {"code": code})
