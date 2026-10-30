"""Assign one Department Head approver per cost center."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg
revision = "20261030_0029"
down_revision = "20261020_0028"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("cost_centers", sa.Column("approver_user_id", pg.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_cost_centers_approver_user", "cost_centers", "users", ["approver_user_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_cost_centers_approver_user_id", "cost_centers", ["approver_user_id"])
    # Preserve an existing unambiguous department reviewer; ambiguous departments need configuration.
    op.execute("""UPDATE cost_centers c SET approver_user_id = candidates.user_id FROM (
        SELECT u.department_id, (array_agg(u.id))[1] AS user_id FROM users u
        JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
        WHERE r.code='department_head' AND u.is_active AND NOT u.is_suspended
        GROUP BY u.department_id HAVING count(*)=1
    ) candidates WHERE candidates.department_id=c.department_id""")

def downgrade():
    op.drop_index("ix_cost_centers_approver_user_id", table_name="cost_centers")
    op.drop_constraint("fk_cost_centers_approver_user", "cost_centers", type_="foreignkey")
    op.drop_column("cost_centers", "approver_user_id")
