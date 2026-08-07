"""Add online attendance sessions, entries, and permissions.

Revision ID: 0005_online_attendance
Revises: 0004_master_data_registers
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005_online_attendance"
down_revision: str | None = "0004_master_data_registers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ALL_PERMISSIONS = (
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
        f"permission IN ({ALL_PERMISSIONS})",
    )
    op.execute(
        """INSERT INTO application_user_permissions (user_id, permission)
        SELECT id, permission FROM application_users
        CROSS JOIN (VALUES ('attendance.read'), ('attendance.record'), ('attendance.correct'))
          AS approved(permission)
        WHERE role IN ('manager', 'supervisor') ON CONFLICT DO NOTHING"""
    )
    op.create_table(
        "attendance_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attendance_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("roster_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submitted_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted')", name="ck_attendance_sessions_status"
        ),
        sa.CheckConstraint(
            "(status = 'draft' AND submitted_by IS NULL AND submitted_at IS NULL "
            "AND roster_fingerprint IS NULL) OR "
            "(status = 'submitted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL "
            "AND roster_fingerprint IS NOT NULL)",
            name="ck_attendance_sessions_submission_state",
        ),
        sa.ForeignKeyConstraint(["created_by"], ["application_users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["submitted_by"], ["application_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_attendance_sessions_created_by", "attendance_sessions", ["created_by"])
    op.create_index(
        "ix_attendance_sessions_date_status", "attendance_sessions", ["attendance_date", "status"]
    )
    op.create_index(
        "uq_attendance_submitted_population",
        "attendance_sessions",
        ["attendance_date", "roster_fingerprint"],
        unique=True,
        postgresql_where=sa.text("status = 'submitted'"),
    )
    op.create_table(
        "attendance_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attendance_session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("worker_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attendance_status", sa.String(length=16), nullable=True),
        sa.Column("time_in", sa.Time(timezone=False), nullable=True),
        sa.Column("time_out", sa.Time(timezone=False), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("corrected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "attendance_status IS NULL OR attendance_status IN ('present', 'absent')",
            name="ck_attendance_entries_status",
        ),
        sa.CheckConstraint(
            "attendance_status <> 'absent' OR (time_in IS NULL AND time_out IS NULL)",
            name="ck_attendance_absent_has_no_time",
        ),
        sa.CheckConstraint(
            "time_in IS NULL OR time_out IS NULL OR time_out >= time_in",
            name="ck_attendance_time_order",
        ),
        sa.ForeignKeyConstraint(
            ["attendance_session_id"], ["attendance_sessions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["worker_id"], ["workers.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_attendance_entries_worker_id", "attendance_entries", ["worker_id"])
    op.create_index(
        "uq_attendance_session_worker",
        "attendance_entries",
        ["attendance_session_id", "worker_id"],
        unique=True,
    )
    op.execute(
        """CREATE FUNCTION prevent_submitted_attendance_delete() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD.status = 'submitted' THEN
            RAISE EXCEPTION 'submitted attendance cannot be deleted';
          END IF;
          RETURN OLD;
        END;
        $$"""
    )
    op.execute(
        """CREATE TRIGGER submitted_attendance_no_delete
        BEFORE DELETE ON attendance_sessions
        FOR EACH ROW EXECUTE FUNCTION prevent_submitted_attendance_delete()"""
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER submitted_attendance_no_delete ON attendance_sessions")
    op.execute("DROP FUNCTION prevent_submitted_attendance_delete()")
    op.drop_index("uq_attendance_session_worker", table_name="attendance_entries")
    op.drop_index("ix_attendance_entries_worker_id", table_name="attendance_entries")
    op.drop_table("attendance_entries")
    op.drop_index("uq_attendance_submitted_population", table_name="attendance_sessions")
    op.drop_index("ix_attendance_sessions_date_status", table_name="attendance_sessions")
    op.drop_index("ix_attendance_sessions_created_by", table_name="attendance_sessions")
    op.drop_table("attendance_sessions")
    op.execute(
        """DELETE FROM application_user_permissions
        WHERE permission IN ('attendance.read', 'attendance.record', 'attendance.correct')"""
    )
    op.drop_constraint(
        "ck_user_permissions_known_permission", "application_user_permissions", type_="check"
    )
    previous = ALL_PERMISSIONS.replace(
        ", 'attendance.read', 'attendance.record', 'attendance.correct'", ""
    )
    op.create_check_constraint(
        "ck_user_permissions_known_permission",
        "application_user_permissions",
        f"permission IN ({previous})",
    )
