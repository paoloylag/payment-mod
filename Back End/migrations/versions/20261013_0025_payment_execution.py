"""Multiple payment lines, evidence and immutable release/clearing history."""

from uuid import NAMESPACE_URL, uuid5

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "20261013_0025"
down_revision = "20261013_0024"
branch_labels = None
depends_on = None
GRANTS = {
    "payments.release": ("finance_associate", "system_administrator"),
    "payments.clear": ("finance_manager", "system_administrator"),
    "payments.exceptions": ("finance_manager", "system_administrator"),
}


def upgrade():
    op.drop_constraint("payment_instructions_voucher_id_key", "payment_instructions", type_="unique")
    op.add_column("payment_instructions", sa.Column("sequence", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("payment_instructions", sa.Column("amount", sa.Numeric(19, 4)))
    op.add_column(
        "payment_instructions",
        sa.Column("currency_code", sa.String(3), sa.ForeignKey("currencies.code", ondelete="RESTRICT")),
    )
    op.add_column(
        "payment_instructions",
        sa.Column(
            "predecessor_id", pg.UUID(as_uuid=True), sa.ForeignKey("payment_instructions.id", ondelete="CASCADE")
        ),
    )
    op.execute("UPDATE payment_instructions SET amount=(result->>'amount')::numeric, currency_code=result->>'currency'")
    op.alter_column("payment_instructions", "amount", nullable=False)
    op.alter_column("payment_instructions", "currency_code", nullable=False)
    op.create_unique_constraint("uq_payment_instruction_sequence", "payment_instructions", ["voucher_id", "sequence"])
    op.create_unique_constraint("uq_payment_instruction_predecessor", "payment_instructions", ["predecessor_id"])
    op.create_check_constraint("ck_payment_instruction_amount", "payment_instructions", "amount > 0")
    op.create_index("ix_payment_instructions_voucher_id", "payment_instructions", ["voucher_id"])
    op.create_table(
        "payment_line_events",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "instruction_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("payment_instructions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(25), nullable=False),
        sa.Column("command_key", sa.String(100), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("result", pg.JSONB(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "actor_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("instruction_id", "version"),
        sa.UniqueConstraint("instruction_id", "command_key"),
        sa.CheckConstraint(
            "state IN ('prepared','authorized','ready_for_pickup','released','cleared','failed','voided')",
            name="ck_payment_line_state",
        ),
    )
    op.create_index("ix_payment_line_events_instruction_id", "payment_line_events", ["instruction_id"])
    op.create_table(
        "payment_evidence",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "instruction_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("payment_instructions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "document_version_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("document_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("command_key", sa.String(100), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column(
            "actor_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("instruction_id", "command_key"),
    )
    op.create_index("ix_payment_evidence_instruction_id", "payment_evidence", ["instruction_id"])
    bind = op.get_bind()
    for code, roles in GRANTS.items():
        bind.execute(
            sa.text(
                "INSERT INTO permissions (id,code,description) VALUES (:id,:code,:description) "
                "ON CONFLICT(code) DO NOTHING"
            ),
            {"id": uuid5(NAMESPACE_URL, f"payment-module:permission:{code}"), "code": code, "description": code},
        )
        for role in roles:
            bind.execute(
                sa.text(
                    "INSERT INTO role_permissions (id,role_id,permission_id) "
                    "SELECT :id,r.id,p.id FROM roles r,permissions p "
                    "WHERE r.code=:role AND p.code=:code ON CONFLICT(role_id,permission_id) DO NOTHING"
                ),
                {
                    "id": uuid5(NAMESPACE_URL, f"payment-module:role-permission:{role}:{code}"),
                    "role": role,
                    "code": code,
                },
            )


def downgrade():
    bind = op.get_bind()
    if bind.scalar(
        sa.text("SELECT EXISTS(SELECT 1 FROM payment_line_events) OR EXISTS(SELECT 1 FROM payment_evidence)")
    ):
        raise RuntimeError("Cannot discard payment history; restore a pre-upgrade snapshot instead")
    if bind.scalar(
        sa.text("SELECT EXISTS(SELECT voucher_id FROM payment_instructions GROUP BY voucher_id HAVING count(*)>1)")
    ):
        raise RuntimeError("Cannot downgrade multiple payment lines")
    op.drop_table("payment_evidence")
    op.drop_table("payment_line_events")
    op.drop_index("ix_payment_instructions_voucher_id", table_name="payment_instructions")
    for name in ("uq_payment_instruction_sequence", "uq_payment_instruction_predecessor"):
        op.drop_constraint(name, "payment_instructions", type_="unique")
    op.drop_constraint("ck_payment_instruction_amount", "payment_instructions", type_="check")
    for field in ("predecessor_id", "currency_code", "amount", "sequence"):
        op.drop_column("payment_instructions", field)
    op.create_unique_constraint("payment_instructions_voucher_id_key", "payment_instructions", ["voucher_id"])
    for code in GRANTS:
        bind.execute(sa.text("DELETE FROM permissions WHERE code=:code"), {"code": code})
