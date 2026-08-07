"""Add durable attendance synchronization operation results.

Revision ID: 0006_attendance_offline_sync
Revises: 0005_online_attendance
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006_attendance_offline_sync"
down_revision: str | None = "0005_online_attendance"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "attendance_sync_operations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_type", sa.String(length=32), nullable=False),
        sa.Column("target_session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payload_version", sa.Integer(), nullable=False),
        sa.Column("result_status", sa.String(length=24), nullable=False),
        sa.Column("result_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("request_id", sa.String(length=128), nullable=True),
        sa.Column(
            "processed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "operation_type = 'submit_snapshot'", name="ck_attendance_sync_operation_type"
        ),
        sa.CheckConstraint(
            "result_status IN ('applied', 'already_applied', 'conflict', 'rejected')",
            name="ck_attendance_sync_result_status",
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["application_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("operation_id", name="uq_attendance_sync_operation_id"),
    )
    op.create_index(
        "ix_attendance_sync_actor_processed",
        "attendance_sync_operations",
        ["actor_user_id", "processed_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_attendance_sync_actor_processed", table_name="attendance_sync_operations")
    op.drop_table("attendance_sync_operations")
