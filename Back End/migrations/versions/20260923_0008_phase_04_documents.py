"""Create Phase 04 document metadata and immutable versions.

Revision ID: 20260923_0008
Revises: 20260922_0007
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260923_0008"
down_revision: str | None = "20260922_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "request_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payment_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "line_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payment_request_lines.id", ondelete="CASCADE")
        ),
        sa.Column(
            "owner_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("current_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("request_id", "line_id", "id", name="uq_documents_context_id"),
    )
    op.create_index("ix_documents_request_id", "documents", ["request_id"])
    op.create_index("ix_documents_line_id", "documents", ["line_id"])
    op.create_index("ix_documents_owner_user_id", "documents", ["owner_user_id"])
    op.create_table(
        "document_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("media_type", sa.String(160), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("bucket", sa.String(160), nullable=False),
        sa.Column("object_key", sa.String(700), nullable=False, unique=True),
        sa.Column("storage_version_id", sa.String(300)),
        sa.Column("state", sa.String(30), server_default="available", nullable=False),
        sa.Column(
            "uploaded_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("is_current", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("document_id", "version", name="uq_document_versions_number"),
        sa.CheckConstraint("byte_size > 0", name="ck_document_versions_positive_size"),
        sa.CheckConstraint(
            "state IN ('pending','available','quarantined','rejected','missing')", name="ck_document_versions_state"
        ),
    )
    op.create_index("ix_document_versions_document_id", "document_versions", ["document_id"])
    op.create_index("ix_document_versions_sha256", "document_versions", ["sha256"])
    op.create_index("ix_document_versions_uploaded_by_user_id", "document_versions", ["uploaded_by_user_id"])
    op.create_index(
        "uq_document_versions_current",
        "document_versions",
        ["document_id"],
        unique=True,
        postgresql_where=sa.text("is_current"),
    )


def downgrade() -> None:
    op.drop_table("document_versions")
    op.drop_table("documents")
