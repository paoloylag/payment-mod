"""Add in-app notifications for request conversation mentions.

Revision ID: 20261009_0015
Revises: 20261009_0014
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261009_0015"
down_revision: str | None = "20261009_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "request_mention_notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "request_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payment_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("request_conversation_messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recipient_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("message_id", "recipient_user_id", name="uq_request_mention_recipient"),
    )
    op.create_index("ix_request_mention_notifications_request_id", "request_mention_notifications", ["request_id"])
    op.create_index(
        "ix_request_mention_notifications_recipient_user_id", "request_mention_notifications", ["recipient_user_id"]
    )
    op.create_index(
        "ix_request_mention_inbox", "request_mention_notifications", ["recipient_user_id", "read_at", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_request_mention_inbox", table_name="request_mention_notifications")
    op.drop_index("ix_request_mention_notifications_recipient_user_id", table_name="request_mention_notifications")
    op.drop_index("ix_request_mention_notifications_request_id", table_name="request_mention_notifications")
    op.drop_table("request_mention_notifications")
