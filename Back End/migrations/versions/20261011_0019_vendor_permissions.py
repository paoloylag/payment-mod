"""Grant dedicated vendor maintenance access."""

from uuid import NAMESPACE_URL, uuid5

import sqlalchemy as sa
from alembic import op

revision = "20261011_0019"
down_revision = "20261011_0018"
branch_labels = None
depends_on = None


def upgrade():
    db = op.get_bind()
    db.execute(
        sa.text(
            "INSERT INTO permissions (id,code,description) "
            "VALUES (:id,'vendors.manage','Create and edit vendor records') "
            "ON CONFLICT (code) DO NOTHING"
        ),
        {"id": uuid5(NAMESPACE_URL, "payment-module:permission:vendors.manage")},
    )
    permission = db.execute(sa.text("SELECT id FROM permissions WHERE code='vendors.manage'")).scalar_one()
    for role in db.execute(
        sa.text("SELECT id, code FROM roles WHERE code IN ('finance_associate','system_administrator')")
    ):
        role_id, role_code = role
        db.execute(
            sa.text(
                "INSERT INTO role_permissions (id,role_id,permission_id) VALUES (:id,:role,:permission) "
                "ON CONFLICT (role_id,permission_id) DO NOTHING"
            ),
            {
                "id": uuid5(NAMESPACE_URL, f"payment-module:role-permission:{role_code}:vendors.manage"),
                "role": role_id,
                "permission": permission,
            },
        )


def downgrade():
    op.execute("DELETE FROM permissions WHERE code='vendors.manage'")
