"""Add worker, farm-unit, operational audit, and operational permissions.

Revision ID: 0004_master_data_registers
Revises: 0003_role_administration
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004_master_data_registers"
down_revision: str | None = "0003_role_administration"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ALL_PERMISSIONS = (
    "'system.status.read', 'users.read', 'users.create', 'users.update', 'users.disable', "
    "'users.reactivate', 'roles.assign', 'sessions.read', 'sessions.revoke', "
    "'security_events.read', 'workers.read', 'workers.create', 'workers.update', "
    "'workers.deactivate', 'farm_structure.read', 'farm_structure.create', "
    "'farm_structure.update', 'farm_structure.deactivate', 'operational_audit.read'"
)


def upgrade() -> None:
    op.drop_constraint(
        "ck_user_permissions_known_permission", "application_user_permissions", type_="check"
    )
    op.create_check_constraint(
        "ck_user_permissions_known_permission",
        "application_user_permissions",
        f"permission IN ({ALL_PERMISSIONS})",
    )
    op.execute(
        """INSERT INTO application_user_permissions (user_id, permission)
        SELECT id, permission FROM application_users
        CROSS JOIN (VALUES
          ('workers.read'), ('workers.create'), ('workers.update'), ('workers.deactivate'),
          ('farm_structure.read'), ('farm_structure.create'), ('farm_structure.update'),
          ('farm_structure.deactivate'), ('operational_audit.read')
        ) AS approved(permission)
        WHERE role = 'manager' ON CONFLICT DO NOTHING"""
    )
    op.execute(
        """INSERT INTO application_user_permissions (user_id, permission)
        SELECT id, permission FROM application_users
        CROSS JOIN (VALUES ('workers.read'), ('farm_structure.read')) AS approved(permission)
        WHERE role = 'supervisor' ON CONFLICT DO NOTHING"""
    )

    op.create_table(
        "workers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("worker_code", sa.String(length=64), nullable=False),
        sa.Column("full_name", sa.String(length=160), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_workers_status"),
        sa.ForeignKeyConstraint(["created_by"], ["application_users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["updated_by"], ["application_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("worker_code"),
    )
    op.create_index("ix_workers_status", "workers", ["status"])

    op.create_table(
        "farm_units",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("unit_type", sa.String(length=16), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("unit_type IN ('field', 'block')", name="ck_farm_units_type"),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_farm_units_status"),
        sa.CheckConstraint(
            "parent_id IS NULL OR parent_id <> id", name="ck_farm_units_not_self_parent"
        ),
        sa.ForeignKeyConstraint(["parent_id"], ["farm_units.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["application_users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["updated_by"], ["application_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_farm_units_parent_id", "farm_units", ["parent_id"])
    op.create_index("ix_farm_units_status_type", "farm_units", ["status", "unit_type"])

    op.create_table(
        "operational_audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_id", sa.String(length=128), nullable=True),
        sa.Column("before_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column(
            "occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["application_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_operational_audit_events_actor_user_id", "operational_audit_events", ["actor_user_id"]
    )
    op.create_index(
        "ix_operational_audit_events_occurred_at", "operational_audit_events", ["occurred_at"]
    )
    op.create_index(
        "ix_operational_audit_entity",
        "operational_audit_events",
        ["entity_type", "entity_id", "occurred_at"],
    )
    op.execute(
        """CREATE FUNCTION prevent_operational_audit_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'operational audit events are append-only';
        END;
        $$"""
    )
    op.execute(
        """CREATE TRIGGER operational_audit_append_only
        BEFORE UPDATE OR DELETE ON operational_audit_events
        FOR EACH ROW EXECUTE FUNCTION prevent_operational_audit_mutation()"""
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER operational_audit_append_only ON operational_audit_events")
    op.execute("DROP FUNCTION prevent_operational_audit_mutation()")
    op.drop_index("ix_operational_audit_entity", table_name="operational_audit_events")
    op.drop_index("ix_operational_audit_events_occurred_at", table_name="operational_audit_events")
    op.drop_index(
        "ix_operational_audit_events_actor_user_id", table_name="operational_audit_events"
    )
    op.drop_table("operational_audit_events")
    op.drop_index("ix_farm_units_status_type", table_name="farm_units")
    op.drop_index("ix_farm_units_parent_id", table_name="farm_units")
    op.drop_table("farm_units")
    op.drop_index("ix_workers_status", table_name="workers")
    op.drop_table("workers")
    op.execute(
        """DELETE FROM application_user_permissions WHERE permission IN (
        'workers.read', 'workers.create', 'workers.update', 'workers.deactivate',
        'farm_structure.read', 'farm_structure.create', 'farm_structure.update',
        'farm_structure.deactivate', 'operational_audit.read')"""
    )
    op.drop_constraint(
        "ck_user_permissions_known_permission", "application_user_permissions", type_="check"
    )
    op.create_check_constraint(
        "ck_user_permissions_known_permission",
        "application_user_permissions",
        """permission IN (
        'system.status.read', 'users.read', 'users.create', 'users.update',
        'users.disable', 'users.reactivate', 'roles.assign', 'sessions.read',
        'sessions.revoke', 'security_events.read')""",
    )
