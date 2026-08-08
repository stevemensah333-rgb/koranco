"""Add reporting permissions and export audit detail metadata.

Revision ID: 0009_reporting_permissions
Revises: 0008_harvest_offline_sync
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0009_reporting_permissions"
down_revision: str | None = "0008_harvest_offline_sync"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_PERMISSIONS = "'reports.read', 'exports.create'"
PRIOR_PERMISSIONS = (
    "'system.status.read', 'users.read', 'users.create', 'users.update', 'users.disable', "
    "'users.reactivate', 'roles.assign', 'sessions.read', 'sessions.revoke', "
    "'security_events.read', 'workers.read', 'workers.create', 'workers.update', "
    "'workers.deactivate', 'farm_structure.read', 'farm_structure.create', "
    "'farm_structure.update', 'farm_structure.deactivate', 'operational_audit.read', "
    "'attendance.read', 'attendance.record', 'attendance.correct', "
    "'harvest.read', 'harvest.record', 'harvest.correct'"
)


def upgrade() -> None:
    op.add_column("security_events", sa.Column("details", postgresql.JSONB(astext_type=sa.Text())))
    op.drop_constraint(
        "ck_user_permissions_known_permission", "application_user_permissions", type_="check"
    )
    op.create_check_constraint(
        "ck_user_permissions_known_permission",
        "application_user_permissions",
        f"permission IN ({PRIOR_PERMISSIONS}, {NEW_PERMISSIONS})",
    )
    op.execute(
        """INSERT INTO application_user_permissions (user_id, permission)
        SELECT id, 'reports.read' FROM application_users
        WHERE role IN ('manager', 'supervisor') ON CONFLICT DO NOTHING"""
    )
    op.execute(
        """INSERT INTO application_user_permissions (user_id, permission)
        SELECT id, 'exports.create' FROM application_users
        WHERE role = 'manager' ON CONFLICT DO NOTHING"""
    )


def downgrade() -> None:
    op.execute(
        """DELETE FROM application_user_permissions
        WHERE permission IN ('reports.read', 'exports.create')"""
    )
    op.drop_constraint(
        "ck_user_permissions_known_permission", "application_user_permissions", type_="check"
    )
    op.create_check_constraint(
        "ck_user_permissions_known_permission",
        "application_user_permissions",
        f"permission IN ({PRIOR_PERMISSIONS})",
    )
    op.drop_column("security_events", "details")
