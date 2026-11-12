"""Enable request-bound supplier documents without changing existing Finance rules."""

import sqlalchemy as sa
from alembic import op

revision = "20261111_0034"
down_revision = "20261111_0033"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        sa.text("""UPDATE document_types SET allowed_request_types = allowed_request_types || '["general"]'::jsonb
        WHERE code = 'BUSINESS_PERMIT' AND NOT allowed_request_types @> '["general"]'::jsonb""")
    )
    op.execute(
        sa.text("""INSERT INTO document_types (id, code, name, allowed_request_types, copy_requirement)
        VALUES (gen_random_uuid(), 'BUSINESS_REGISTRATION', 'Business registration (SEC/DTI)',
        '["general"]'::jsonb, 'soft')
        ON CONFLICT (code) DO NOTHING""")
    )


def downgrade():
    # Keep document types and General eligibility: existing uploads may reference them.
    pass
