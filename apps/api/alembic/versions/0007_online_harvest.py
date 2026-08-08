"""Add online harvest records and permissions.

Revision ID: 0007_online_harvest
Revises: 0006_attendance_offline_sync
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0007_online_harvest"
down_revision: str | None = "0006_attendance_offline_sync"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

HARVEST_PERMISSIONS = "'harvest.read', 'harvest.record', 'harvest.correct'"
PRIOR_PERMISSIONS = (
    "'system.status.read', 'users.read', 'users.create', 'users.update', 'users.disable', "
    "'users.reactivate', 'roles.assign', 'sessions.read', 'sessions.revoke', "
    "'security_events.read', 'workers.read', 'workers.create', 'workers.update', "
    "'workers.deactivate', 'farm_structure.read', 'farm_structure.create', "
    "'farm_structure.update', 'farm_structure.deactivate', 'operational_audit.read', "
    "'attendance.read', 'attendance.record', 'attendance.correct'"
)


def upgrade() -> None:
    op.drop_constraint(
        "ck_user_permissions_known_permission", "application_user_permissions", type_="check"
    )
    op.create_check_constraint(
        "ck_user_permissions_known_permission",
        "application_user_permissions",
        f"permission IN ({PRIOR_PERMISSIONS}, {HARVEST_PERMISSIONS})",
    )
    op.execute(
        """INSERT INTO application_user_permissions (user_id, permission)
        SELECT id, permission FROM application_users
        CROSS JOIN (VALUES ('harvest.read'), ('harvest.record'), ('harvest.correct'))
          AS approved(permission)
        WHERE role IN ('manager', 'supervisor') ON CONFLICT DO NOTHING"""
    )
    op.create_table(
        "harvest_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("harvest_date", sa.Date(), nullable=False),
        sa.Column("farm_unit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit", sa.String(24), nullable=False),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submitted_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('draft', 'submitted')", name="ck_harvest_records_status"),
        sa.CheckConstraint("unit IN ('fruit_count', 'kilograms')", name="ck_harvest_records_unit"),
        sa.CheckConstraint("quantity > 0", name="ck_harvest_records_positive_quantity"),
        sa.CheckConstraint(
            "unit <> 'fruit_count' OR quantity = trunc(quantity)",
            name="ck_harvest_records_whole_fruit_count",
        ),
        sa.CheckConstraint(
            "(status = 'draft' AND submitted_by IS NULL AND submitted_at IS NULL) OR "
            "(status = 'submitted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL)",
            name="ck_harvest_records_submission_state",
        ),
        sa.ForeignKeyConstraint(["farm_unit_id"], ["farm_units.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["application_users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["submitted_by"], ["application_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_harvest_records_date_status", "harvest_records", ["harvest_date", "status"])
    op.create_index(
        "ix_harvest_records_farm_unit_date", "harvest_records", ["farm_unit_id", "harvest_date"]
    )
    op.create_index("ix_harvest_records_unit_date", "harvest_records", ["unit", "harvest_date"])
    op.execute(
        """CREATE FUNCTION prevent_submitted_harvest_delete() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.status = 'submitted' THEN
            RAISE EXCEPTION 'submitted harvest cannot be deleted';
          END IF;
          RETURN OLD;
        END;
        $$"""
    )
    op.execute(
        """CREATE TRIGGER submitted_harvest_no_delete
        BEFORE DELETE ON harvest_records
        FOR EACH ROW EXECUTE FUNCTION prevent_submitted_harvest_delete()"""
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER submitted_harvest_no_delete ON harvest_records")
    op.execute("DROP FUNCTION prevent_submitted_harvest_delete()")
    op.drop_table("harvest_records")
    op.execute(
        """DELETE FROM application_user_permissions
        WHERE permission IN ('harvest.read', 'harvest.record', 'harvest.correct')"""
    )
    op.drop_constraint(
        "ck_user_permissions_known_permission", "application_user_permissions", type_="check"
    )
    from koranco.identity.permissions import Permission

    previous = ", ".join(f"'{p.value}'" for p in Permission if not p.value.startswith("harvest."))
    op.create_check_constraint(
        "ck_user_permissions_known_permission",
        "application_user_permissions",
        f"permission IN ({previous})",
    )
