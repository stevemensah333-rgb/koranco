"""Add application identity, sessions, permissions, and security events.

Revision ID: 0002_identity_authentication
Revises: 0001_foundation
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002_identity_authentication"
down_revision: str | None = "0001_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "application_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("login_identifier", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("status IN ('active', 'disabled')", name="ck_application_users_status"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("login_identifier"),
    )
    op.create_index(
        "ix_application_users_login_identifier", "application_users", ["login_identifier"]
    )

    op.create_table(
        "application_user_permissions",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("permission", sa.String(length=100), nullable=False),
        sa.CheckConstraint(
            "permission IN ('system.status.read')", name="ck_user_permissions_known_permission"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["application_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "permission"),
    )
    op.create_table(
        "application_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("csrf_token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["application_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_application_sessions_expires_at", "application_sessions", ["expires_at"])
    op.create_index("ix_application_sessions_user_id", "application_sessions", ["user_id"])

    op.create_table(
        "security_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("request_id", sa.String(length=128), nullable=True),
        sa.Column(
            "occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["application_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_security_events_event_type", "security_events", ["event_type"])
    op.create_index("ix_security_events_occurred_at", "security_events", ["occurred_at"])
    op.create_index(
        "ix_security_events_user_occurred", "security_events", ["user_id", "occurred_at"]
    )

    op.create_table(
        "authentication_login_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("identifier_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("successful", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_login_attempt_identifier_occurred",
        "authentication_login_attempts",
        ["identifier_hash", "occurred_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_login_attempt_identifier_occurred", table_name="authentication_login_attempts"
    )
    op.drop_table("authentication_login_attempts")
    op.drop_index("ix_security_events_user_occurred", table_name="security_events")
    op.drop_index("ix_security_events_occurred_at", table_name="security_events")
    op.drop_index("ix_security_events_event_type", table_name="security_events")
    op.drop_table("security_events")
    op.drop_index("ix_application_sessions_user_id", table_name="application_sessions")
    op.drop_index("ix_application_sessions_expires_at", table_name="application_sessions")
    op.drop_table("application_sessions")
    op.drop_table("application_user_permissions")
    op.drop_index("ix_application_users_login_identifier", table_name="application_users")
    op.drop_table("application_users")
