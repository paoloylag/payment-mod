"""Immutable links from voided vouchers to independently approved replacements."""

from uuid import NAMESPACE_URL, uuid5

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "20261014_0026"
down_revision = "20261013_0025"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "finance_voucher_replacements",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "original_request_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("payment_requests.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "replacement_request_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("payment_requests.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("command_key", sa.String(100), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "actor_user_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("result", pg.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "original_request_id <> replacement_request_id",
            name="ck_voucher_replacement_distinct",
        ),
    )
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "INSERT INTO permissions (id,code,description) "
            "VALUES (:id,'vouchers.replace','Link voided vouchers to approved replacements') "
            "ON CONFLICT(code) DO NOTHING"
        ),
        {"id": uuid5(NAMESPACE_URL, "payment-module:permission:vouchers.replace")},
    )
    for role in ("finance_manager", "system_administrator"):
        bind.execute(
            sa.text(
                "INSERT INTO role_permissions (id,role_id,permission_id) "
                "SELECT :id,r.id,p.id FROM roles r,permissions p "
                "WHERE r.code=:role AND p.code='vouchers.replace' "
                "ON CONFLICT(role_id,permission_id) DO NOTHING"
            ),
            {
                "id": uuid5(
                    NAMESPACE_URL,
                    f"payment-module:role-permission:{role}:vouchers.replace",
                ),
                "role": role,
            },
        )


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT EXISTS (SELECT 1 FROM finance_voucher_replacements)")):
        raise RuntimeError("Cannot discard recorded voucher replacement history")
    op.drop_table("finance_voucher_replacements")
    op.execute(
        "DELETE FROM user_permission_overrides WHERE permission_id IN "
        "(SELECT id FROM permissions WHERE code='vouchers.replace')"
    )
    op.execute(
        "DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code='vouchers.replace')"
    )
    op.execute("DELETE FROM permissions WHERE code='vouchers.replace'")
