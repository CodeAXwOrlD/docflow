"""auth_byok_and_usage_logs

Revision ID: 002_auth_byok
Revises: 001_initial
Create Date: 2026-11-12 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "002_auth_byok"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "ai_provider_connections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=True),
        sa.Column("encrypted_api_key", sa.Text(), nullable=False),
        sa.Column("key_last_four", sa.String(length=8), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("connection_status", sa.String(length=32), nullable=False, server_default="untested"),
        sa.Column("last_tested_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_provider_connections_user_id", "ai_provider_connections", ["user_id"])
    op.create_index("ix_ai_conn_user_provider", "ai_provider_connections", ["user_id", "provider"])
    op.create_index("ix_ai_conn_user_default", "ai_provider_connections", ["user_id", "is_default"])
    op.create_index("ix_ai_conn_user_active", "ai_provider_connections", ["user_id", "is_active"])

    op.add_column("documents", sa.Column("user_id", sa.String(length=36), nullable=True))
    op.add_column(
        "documents",
        sa.Column("document_type", sa.String(length=50), nullable=False, server_default="auto"),
    )
    op.add_column("documents", sa.Column("batch_id", sa.String(length=36), nullable=True))
    op.add_column("documents", sa.Column("ai_connection_id", sa.String(length=36), nullable=True))
    op.add_column("documents", sa.Column("ai_provider", sa.String(length=50), nullable=True))
    op.add_column("documents", sa.Column("ai_model", sa.String(length=120), nullable=True))
    op.add_column("documents", sa.Column("invoice_number", sa.String(length=120), nullable=True))
    op.add_column("documents", sa.Column("vendor_name", sa.String(length=255), nullable=True))

    op.create_foreign_key(
        "fk_documents_user_id", "documents", "users", ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "fk_documents_ai_connection_id",
        "documents",
        "ai_provider_connections",
        ["ai_connection_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_documents_user_id", "documents", ["user_id"])
    op.create_index("ix_documents_batch_id", "documents", ["batch_id"])
    op.create_index("ix_documents_invoice_number", "documents", ["invoice_number"])
    op.create_index("ix_documents_vendor_name", "documents", ["vendor_name"])
    op.create_index("ix_documents_user_created", "documents", ["user_id", "created_at"])
    op.create_index("ix_documents_user_invoice", "documents", ["user_id", "invoice_number"])

    op.create_table(
        "ai_usage_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("connection_id", sa.String(length=36), nullable=True),
        sa.Column("document_id", sa.String(length=36), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processing_duration", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("error_category", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["connection_id"], ["ai_provider_connections.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_usage_logs_user_id", "ai_usage_logs", ["user_id"])
    op.create_index("ix_ai_usage_logs_connection_id", "ai_usage_logs", ["connection_id"])
    op.create_index("ix_ai_usage_logs_document_id", "ai_usage_logs", ["document_id"])
    op.create_index("ix_ai_usage_logs_created_at", "ai_usage_logs", ["created_at"])
    op.create_index("ix_ai_usage_user_created", "ai_usage_logs", ["user_id", "created_at"])
    op.create_index("ix_ai_usage_provider_status", "ai_usage_logs", ["provider", "status"])


def downgrade() -> None:
    op.drop_table("ai_usage_logs")

    op.drop_index("ix_documents_user_invoice", table_name="documents")
    op.drop_index("ix_documents_user_created", table_name="documents")
    op.drop_index("ix_documents_vendor_name", table_name="documents")
    op.drop_index("ix_documents_invoice_number", table_name="documents")
    op.drop_index("ix_documents_batch_id", table_name="documents")
    op.drop_index("ix_documents_user_id", table_name="documents")
    op.drop_constraint("fk_documents_ai_connection_id", "documents", type_="foreignkey")
    op.drop_constraint("fk_documents_user_id", "documents", type_="foreignkey")
    op.drop_column("documents", "vendor_name")
    op.drop_column("documents", "invoice_number")
    op.drop_column("documents", "ai_model")
    op.drop_column("documents", "ai_provider")
    op.drop_column("documents", "ai_connection_id")
    op.drop_column("documents", "batch_id")
    op.drop_column("documents", "document_type")
    op.drop_column("documents", "user_id")

    op.drop_table("ai_provider_connections")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

