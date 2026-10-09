"""Add immutable request conversation messages.

Revision ID: 20261009_0014
Revises: 20261008_0013
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261009_0014"
down_revision: str | None = "20261008_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "request_conversation_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "request_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payment_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "author_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(120), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("author_user_id", "idempotency_key", name="uq_request_conversation_author_key"),
        sa.CheckConstraint("length(trim(body)) > 0", name="ck_request_conversation_body"),
    )
    op.create_index("ix_request_conversation_messages_request_id", "request_conversation_messages", ["request_id"])
    op.create_index(
        "ix_request_conversation_request_time", "request_conversation_messages", ["request_id", "created_at", "id"]
    )


def downgrade() -> None:
    op.drop_index("ix_request_conversation_request_time", table_name="request_conversation_messages")
    op.drop_index("ix_request_conversation_messages_request_id", table_name="request_conversation_messages")
    op.drop_table("request_conversation_messages")
