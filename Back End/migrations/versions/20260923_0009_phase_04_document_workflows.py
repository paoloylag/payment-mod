"""Add Phase 04 document rules, removal, hard-copy, and review history.

Revision ID: 20260923_0009
Revises: 20260923_0008
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260923_0009"
down_revision: str | None = "20260923_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("document_type_id", postgresql.UUID(as_uuid=True)))
    op.add_column("documents", sa.Column("removed_at", sa.DateTime(timezone=True)))
    op.add_column("documents", sa.Column("removed_by_user_id", postgresql.UUID(as_uuid=True)))
    op.add_column("documents", sa.Column("removal_reason", sa.Text()))
    op.create_foreign_key(
        "fk_documents_document_type", "documents", "document_types", ["document_type_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_foreign_key(
        "fk_documents_removed_by", "documents", "users", ["removed_by_user_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_index("ix_documents_document_type_id", "documents", ["document_type_id"])
    op.create_index("ix_documents_removed_at", "documents", ["removed_at"])

    op.add_column(
        "document_versions", sa.Column("cleanup_state", sa.String(20), server_default="not_required", nullable=False)
    )
    op.add_column("document_versions", sa.Column("cleanup_attempts", sa.Integer(), server_default="0", nullable=False))
    op.add_column("document_versions", sa.Column("cleanup_error", sa.String(500)))
    op.add_column("document_versions", sa.Column("cleaned_at", sa.DateTime(timezone=True)))
    op.create_check_constraint(
        "ck_document_versions_cleanup_state",
        "document_versions",
        "cleanup_state IN ('not_required','pending','completed','failed')",
    )

    op.create_table(
        "document_requirement_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_type", sa.String(30), nullable=False),
        sa.Column(
            "document_type_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("document_types.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("scope", sa.String(20), server_default="request", nullable=False),
        sa.Column("minimum_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("is_required", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("guidance", sa.String(200)),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("request_type", "document_type_id", "scope", name="uq_document_requirement_rule"),
        sa.CheckConstraint("scope IN ('request','line')", name="ck_document_requirement_scope"),
        sa.CheckConstraint("minimum_count > 0", name="ck_document_requirement_count"),
    )
    op.create_index("ix_document_requirement_rules_request_type", "document_requirement_rules", ["request_type"])
    op.create_index(
        "ix_document_requirement_rules_document_type_id", "document_requirement_rules", ["document_type_id"]
    )

    op.create_table(
        "document_hard_copy_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "actor_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('not_required','required','received','missing','waived')", name="ck_document_hard_copy_status"
        ),
    )
    op.create_index("ix_document_hard_copy_events_document_id", "document_hard_copy_events", ["document_id"])
    op.create_index("ix_document_hard_copy_events_actor_user_id", "document_hard_copy_events", ["actor_user_id"])

    op.create_table(
        "document_review_decisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("decision", sa.String(30), nullable=False),
        sa.Column("comment", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "actor_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "decision IN ('accepted','rejected','replacement_required')", name="ck_document_review_decision"
        ),
    )
    op.create_index("ix_document_review_decisions_document_id", "document_review_decisions", ["document_id"])
    op.create_index("ix_document_review_decisions_actor_user_id", "document_review_decisions", ["actor_user_id"])


def downgrade() -> None:
    op.drop_table("document_review_decisions")
    op.drop_table("document_hard_copy_events")
    op.drop_table("document_requirement_rules")
    op.drop_constraint("ck_document_versions_cleanup_state", "document_versions", type_="check")
    op.drop_column("document_versions", "cleaned_at")
    op.drop_column("document_versions", "cleanup_error")
    op.drop_column("document_versions", "cleanup_attempts")
    op.drop_column("document_versions", "cleanup_state")
    op.drop_index("ix_documents_removed_at", table_name="documents")
    op.drop_index("ix_documents_document_type_id", table_name="documents")
    op.drop_constraint("fk_documents_removed_by", "documents", type_="foreignkey")
    op.drop_constraint("fk_documents_document_type", "documents", type_="foreignkey")
    op.drop_column("documents", "removal_reason")
    op.drop_column("documents", "removed_by_user_id")
    op.drop_column("documents", "removed_at")
    op.drop_column("documents", "document_type_id")
