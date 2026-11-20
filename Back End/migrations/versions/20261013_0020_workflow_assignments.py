"""Named approval assignments and exception authority."""

from uuid import NAMESPACE_URL, uuid5

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261013_0020"
down_revision = "20261011_0019"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "workflow_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workflow_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_instances.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("stage_index", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column(
            "assigned_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("delegate_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("delegation_starts_at", sa.DateTime(timezone=True)),
        sa.Column("delegation_ends_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("workflow_id", "stage_index", "kind", name="uq_workflow_assignment_stage"),
        sa.CheckConstraint("kind IN ('approval', 'response')", name="ck_workflow_assignment_kind"),
        sa.CheckConstraint("stage_index >= 0", name="ck_workflow_assignment_stage"),
        sa.CheckConstraint(
            "delegate_user_id IS NULL OR (delegate_user_id <> assigned_user_id "
            "AND delegation_starts_at IS NOT NULL AND delegation_ends_at > delegation_starts_at)",
            name="ck_workflow_assignment_delegate",
        ),
    )
    for column in ("workflow_id", "assigned_user_id", "delegate_user_id"):
        op.create_index(f"ix_workflow_assignments_{column}", "workflow_assignments", [column])
    db = op.get_bind()
    permission_id = uuid5(NAMESPACE_URL, "payment-module:permission:workflow.exceptions.manage")
    db.execute(
        sa.text(
            "INSERT INTO permissions (id,code,description) VALUES (:id,'workflow.exceptions.manage',"
            "'Manage eligible assignments and controlled workflow recovery') ON CONFLICT (code) DO NOTHING"
        ),
        {"id": permission_id},
    )
    permission_id = db.execute(
        sa.text("SELECT id FROM permissions WHERE code='workflow.exceptions.manage'")
    ).scalar_one()
    for role_id, role_code in db.execute(
        sa.text("SELECT id,code FROM roles WHERE code IN ('finance_manager','system_administrator')")
    ):
        db.execute(
            sa.text(
                "INSERT INTO role_permissions (id,role_id,permission_id) VALUES (:id,:role,:permission) "
                "ON CONFLICT (role_id,permission_id) DO NOTHING"
            ),
            {
                "id": uuid5(NAMESPACE_URL, f"payment-module:role-permission:{role_code}:workflow.exceptions.manage"),
                "role": role_id,
                "permission": permission_id,
            },
        )


def downgrade():
    op.execute("DELETE FROM permissions WHERE code='workflow.exceptions.manage'")
    op.drop_table("workflow_assignments")
