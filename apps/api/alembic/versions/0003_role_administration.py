"""Add confirmed roles and account administration state.

Revision ID: 0003_role_administration
Revises: 0002_identity_authentication
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003_role_administration"
down_revision: str | None = "0002_identity_authentication"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PERMISSIONS = (
    "'system.status.read', 'users.read', 'users.create', 'users.update', "
    "'users.disable', 'users.reactivate', 'roles.assign', 'sessions.read', "
    "'sessions.revoke', 'security_events.read'"
)


def upgrade() -> None:
    op.add_column("application_users", sa.Column("role", sa.String(length=16), nullable=True))
    op.add_column(
        "application_users",
        sa.Column(
            "password_change_required", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
    )
    op.execute(
        """DO $$
        BEGIN
          IF (SELECT count(*) FROM application_users) > 1 THEN
            RAISE EXCEPTION
              'Role migration requires manual review: more than one pre-role user exists';
          END IF;
        END $$"""
    )
    op.execute("UPDATE application_users SET role = 'manager'")
    op.alter_column("application_users", "role", nullable=False)
    op.create_check_constraint(
        "ck_application_users_role",
        "application_users",
        "role IN ('manager', 'supervisor', 'worker')",
    )
    op.drop_constraint(
        "ck_user_permissions_known_permission", "application_user_permissions", type_="check"
    )
    op.create_check_constraint(
        "ck_user_permissions_known_permission",
        "application_user_permissions",
        f"permission IN ({PERMISSIONS})",
    )
    op.execute(
        """INSERT INTO application_user_permissions (user_id, permission)
        SELECT id, permission
        FROM application_users
        CROSS JOIN (VALUES
          ('system.status.read'), ('users.read'), ('users.create'), ('users.update'),
          ('users.disable'), ('users.reactivate'), ('roles.assign'), ('sessions.read'),
          ('sessions.revoke'), ('security_events.read')
        ) AS approved(permission)
        ON CONFLICT DO NOTHING"""
    )
    op.add_column(
        "security_events",
        sa.Column("subject_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_security_events_subject_user_id",
        "security_events",
        "application_users",
        ["subject_user_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_security_events_subject_user_id", "security_events", type_="foreignkey")
    op.drop_column("security_events", "subject_user_id")
    op.execute("DELETE FROM application_user_permissions WHERE permission <> 'system.status.read'")
    op.drop_constraint(
        "ck_user_permissions_known_permission", "application_user_permissions", type_="check"
    )
    op.create_check_constraint(
        "ck_user_permissions_known_permission",
        "application_user_permissions",
        "permission IN ('system.status.read')",
    )
    op.drop_constraint("ck_application_users_role", "application_users", type_="check")
    op.drop_column("application_users", "password_change_required")
    op.drop_column("application_users", "role")
