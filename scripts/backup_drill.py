"""Seed and verify representative data for the backup/restore drill.

This is operational test tooling, not a product feature. It seeds a fresh,
synthetic database with representative Koranco records (application users,
permissions, workers, farm units, submitted Attendance, submitted Harvest,
operational audit events, a security event, and sync-processed-operation
records), then verifies those records and invariants survive a backup/restore
round trip.

Usage (with the API dependencies on the Python path, e.g. apps/api/src):
  python scripts/backup_drill.py seed   --url <postgres url>
  python scripts/backup_drill.py verify --url <postgres url>

The migrations must already be applied to the target database before seeding.
This script never uses real Koranco data.
"""

from __future__ import annotations

import argparse
import uuid
from datetime import date
from decimal import Decimal

from koranco.attendance.models import AttendanceSyncOperation
from koranco.attendance.schemas import AttendanceStatus, DraftEntryRequest
from koranco.attendance.service import create_draft, submit_session, update_draft
from koranco.farm_structure.models import FarmUnit
from koranco.harvest.models import HarvestRecord, HarvestSyncOperation
from koranco.harvest.schemas import HarvestUnit, HarvestValues
from koranco.harvest.service import create_draft as create_harvest_draft
from koranco.harvest.service import submit_record
from koranco.identity.models import ApplicationUser, SecurityEvent, UserPermission
from koranco.identity.passwords import hash_password, verify_password
from koranco.identity.permissions import Role, permissions_for_role
from koranco.identity.service import record_security_event
from koranco.reports.service import attendance_totals, harvest_unit_totals
from koranco.workers.models import Worker
from sqlalchemy import create_engine, func, select, text

DRILL_PASSWORD = "a long drill password"
DRILL_DATE = date(2026, 8, 1)


def _db_url_from_args(argv: list[str]) -> tuple[str, str]:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["seed", "verify"])
    parser.add_argument("--url", required=True)
    args = parser.parse_args(argv)
    return args.command, args.url


def _make_user(db, login: str, role: Role) -> ApplicationUser:
    user = ApplicationUser(
        login_identifier=login,
        display_name=login.title(),
        password_hash=hash_password(DRILL_PASSWORD),
        status="active",
        role=role,
    )
    user.permissions.extend(
        UserPermission(permission=permission)
        for permission in permissions_for_role(role)
    )
    db.add(user)
    db.flush()
    return user


def seed(database_url: str) -> None:
    from koranco.db.session import SessionFactory

    SessionFactory.configure(bind=create_engine(database_url))
    with SessionFactory.begin() as db:
        manager = _make_user(db, "drill.manager", Role.MANAGER)
        supervisor = _make_user(db, "drill.supervisor", Role.SUPERVISOR)
        _make_user(db, "drill.worker", Role.WORKER)

        worker_a = Worker(
            worker_code="DRL-1",
            full_name="Drill Worker A",
            status="active",
            created_by=manager.id,
            updated_by=manager.id,
        )
        worker_b = Worker(
            worker_code="DRL-2",
            full_name="Drill Worker B",
            status="active",
            created_by=manager.id,
            updated_by=manager.id,
        )
        db.add_all([worker_a, worker_b])
        db.flush()

        field = FarmUnit(
            code="DRL-FIELD",
            name="Drill Field",
            unit_type="field",
            status="active",
            created_by=manager.id,
            updated_by=manager.id,
        )
        db.add(field)
        db.flush()
        block = FarmUnit(
            code="DRL-BLOCK",
            name="Drill Block",
            unit_type="block",
            parent_id=field.id,
            status="active",
            created_by=manager.id,
            updated_by=manager.id,
        )
        db.add(block)
        db.flush()

        # Submitted Attendance (present + absent) records its audit events.
        session = create_draft(db, supervisor, DRILL_DATE, "drill-request")
        update_draft(
            db,
            supervisor,
            session,
            session.version,
            [
                DraftEntryRequest(
                    worker_id=worker_a.id,
                    attendance_status=AttendanceStatus.PRESENT,
                ),
                DraftEntryRequest(
                    worker_id=worker_b.id,
                    attendance_status=AttendanceStatus.ABSENT,
                ),
            ],
        )
        submit_session(db, supervisor, session, "drill-request")

        # Submitted Harvest on the block (units kept separate across records).
        harvest = create_harvest_draft(
            db,
            supervisor,
            HarvestValues(
                harvest_date=DRILL_DATE,
                farm_unit_id=block.id,
                quantity=Decimal(12),
                unit=HarvestUnit.FRUIT_COUNT,
                notes="Drill harvest",
            ),
            "drill-request",
        )
        submit_record(db, supervisor, harvest, "drill-request")

        # A second harvest in kilograms to prove cross-unit separation survives.
        harvest_kg = create_harvest_draft(
            db,
            supervisor,
            HarvestValues(
                harvest_date=DRILL_DATE,
                farm_unit_id=block.id,
                quantity=Decimal("840.500"),
                unit=HarvestUnit.KILOGRAMS,
                notes="Drill harvest kg",
            ),
            "drill-request",
        )
        submit_record(db, supervisor, harvest_kg, "drill-request")

        # Sync-processed-operation records (retained where expected).
        db.add(
            AttendanceSyncOperation(
                operation_id=uuid.uuid4(),
                actor_user_id=supervisor.id,
                operation_type="submit_snapshot",
                target_session_id=session.id,
                payload_version=1,
                result_status="applied",
                result_data={"ok": True},
                request_id="drill-request",
            )
        )
        db.add(
            HarvestSyncOperation(
                operation_id=uuid.uuid4(),
                actor_user_id=supervisor.id,
                operation_type="submit_harvest_snapshot",
                harvest_record_id=harvest.id,
                payload_version=1,
                result_status="applied",
                result_data={"ok": True},
                request_id="drill-request",
            )
        )

        # A security event.
        record_security_event(db, "drill_security_event", manager, "drill-request")

    print(f"backup_drill: seeded representative data into {database_url}")


def _expect(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(f"verify failed: {message}")
    print(f"  ok: {message}")


def verify(database_url: str) -> None:
    from koranco.db.session import SessionFactory

    SessionFactory.configure(bind=create_engine(database_url))
    with SessionFactory() as db:
        users = db.scalars(select(ApplicationUser)).all()
        _expect(len(users) == 3, f"3 application users retained (found {len(users)})")
        manager = next(u for u in users if u.role == Role.MANAGER.value)
        supervisor = next(u for u in users if u.role == Role.SUPERVISOR.value)
        _expect(
            {p.permission for p in manager.permissions}
            == set(permissions_for_role(Role.MANAGER)),
            "Manager permissions retained",
        )
        _expect(
            {p.permission for p in supervisor.permissions}
            == set(permissions_for_role(Role.SUPERVISOR)),
            "Supervisor permissions retained",
        )
        _expect(
            verify_password(manager.password_hash, DRILL_PASSWORD),
            "Manager password verifies",
        )

        _expect(
            db.scalar(select(func.count()).select_from(Worker)) == 2,
            "2 workers retained",
        )
        _expect(
            db.scalar(select(func.count()).select_from(FarmUnit)) == 2,
            "2 FarmUnits retained",
        )

        # Attendance retained and submitted.
        from koranco.attendance.models import AttendanceEntry, AttendanceSession

        submitted_sessions = db.scalars(
            select(AttendanceSession).where(AttendanceSession.status == "submitted")
        ).all()
        _expect(len(submitted_sessions) == 1, "1 submitted Attendance session retained")
        session = submitted_sessions[0]
        entries = db.scalars(
            select(AttendanceEntry).where(
                AttendanceEntry.attendance_session_id == session.id
            )
        ).all()
        _expect(len(entries) == 2, "2 Attendance entries retained")
        _expect(
            {e.attendance_status for e in entries} == {"present", "absent"},
            "Attendance present/absent statuses retained",
        )

        # Harvest retained, submitted, both units.
        harvest_rows = db.scalars(
            select(HarvestRecord).where(HarvestRecord.status == "submitted")
        ).all()
        _expect(len(harvest_rows) == 2, "2 submitted Harvest records retained")
        _expect(
            {str(r.unit) for r in harvest_rows} == {"fruit_count", "kilograms"},
            "Harvest units retained",
        )

        # Sync-processed-operation records retained.
        _expect(
            db.scalar(select(func.count()).select_from(AttendanceSyncOperation)) == 1,
            "Attendance sync-operation record retained",
        )
        _expect(
            db.scalar(select(func.count()).select_from(HarvestSyncOperation)) == 1,
            "Harvest sync-operation record retained",
        )

        # Operational audit events retained.
        from koranco.operational_audit.models import OperationalAuditEvent

        audit_count = db.scalar(select(func.count()).select_from(OperationalAuditEvent))
        _expect(
            audit_count is not None and audit_count >= 4,
            f"operational audit events retained (found {audit_count})",
        )

        # Security event retained.
        sec_count = db.scalar(
            select(func.count())
            .select_from(SecurityEvent)
            .where(SecurityEvent.event_type == "drill_security_event")
        )
        _expect(sec_count == 1, "security event retained")

        # Reporting consistency: units stay separate; attendance totals match.
        totals = attendance_totals(db, DRILL_DATE, DRILL_DATE)
        _expect(
            totals["submitted_sessions"] == 1
            and totals["roster_count"] == 2
            and totals["present_count"] == 1
            and totals["absent_count"] == 1,
            "attendance report totals consistent after restore",
        )
        harvest_totals = harvest_unit_totals(db, DRILL_DATE, DRILL_DATE, None, None)
        by_unit = {u.unit.value: u.quantity for u in harvest_totals}
        _expect(
            by_unit.get("fruit_count") == Decimal(12)
            and by_unit.get("kilograms") == Decimal("840.500"),
            "harvest report totals keep units separate after restore",
        )

        # Basic referential integrity sanity.
        db.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
        fk_violations = db.scalar(
            text(
                "SELECT count(*) FROM harvest_records h "
                "LEFT JOIN farm_units f ON f.id = h.farm_unit_id WHERE f.id IS NULL"
            )
        )
        _expect(fk_violations == 0, "harvest->farm_unit foreign keys intact")

    print(f"backup_drill: verification passed for {database_url}")


def main(argv: list[str] | None = None) -> None:
    command, url = _db_url_from_args(
        argv if argv is not None else __import__("sys").argv[1:]
    )
    if command == "seed":
        seed(url)
    else:
        verify(url)


if __name__ == "__main__":
    main()
