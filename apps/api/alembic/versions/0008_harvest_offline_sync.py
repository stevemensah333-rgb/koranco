"""Add durable harvest synchronization operation results.

Revision ID: 0008_harvest_offline_sync
Revises: 0007_online_harvest
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0008_harvest_offline_sync"
down_revision: str | None = "0007_online_harvest"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "harvest_sync_operations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_type", sa.String(length=48), nullable=False),
        sa.Column("harvest_record_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payload_version", sa.Integer(), nullable=False),
        sa.Column("result_status", sa.String(length=24), nullable=False),
        sa.Column("result_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("request_id", sa.String(length=128), nullable=True),
        sa.Column(
            "processed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "operation_type = 'submit_harvest_snapshot'", name="ck_harvest_sync_operation_type"
        ),
        sa.CheckConstraint(
            "result_status IN ('applied', 'already_applied', 'conflict', 'rejected')",
            name="ck_harvest_sync_result_status",
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["application_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("operation_id", name="uq_harvest_sync_operation_id"),
    )
    op.create_index(
        "ix_harvest_sync_actor_processed",
        "harvest_sync_operations",
        ["actor_user_id", "processed_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_harvest_sync_actor_processed", table_name="harvest_sync_operations")
    op.drop_table("harvest_sync_operations")
