"""Add requestor-manager association.

Revision ID: 20260825_0003
Revises: 20260825_0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260825_0003"
down_revision: str | None = "20260825_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("manager_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_users_manager_id_users", "users", "users", ["manager_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_users_manager_id", "users", ["manager_id"])


def downgrade() -> None:
    op.drop_index("ix_users_manager_id", table_name="users")
    op.drop_constraint("fk_users_manager_id_users", "users", type_="foreignkey")
    op.drop_column("users", "manager_id")
