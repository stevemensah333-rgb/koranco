"""Bounded, audited CSV export of Attendance and Harvest operational records.

Exports derive directly from the same submitted records that reports aggregate,
respect the report filters, use stable columns and UTF-8, and neutralize
spreadsheet formula injection (`=`, `+`, `-`, `@` prefixed text).
"""

import csv
import io
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from koranco.attendance.models import AttendanceEntry, AttendanceSession
from koranco.farm_structure.models import FarmUnit
from koranco.harvest.models import HarvestRecord
from koranco.harvest.schemas import HarvestUnit
from koranco.identity.models import ApplicationUser
from koranco.workers.models import Worker

# A value beginning with any of these characters can be interpreted by a
# spreadsheet as a formula. Prefixing with a single quote disarms it.
_FORMULA_LEADERS = frozenset("=+-@")


def csv_safe(value: object) -> str:
    """Return a spreadsheet-safe text form of a value.

    Text beginning with a formula leader is neutralized by prefixing a single
    quote, so it is treated as literal text rather than an expression.
    """
    if value is None:
        return ""
    text = str(value)
    if text and text[0] in _FORMULA_LEADERS:
        return "'" + text
    return text


def _render_csv(headers: list[str], rows: list[list[str]]) -> str:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return buffer.getvalue()


def attendance_csv(db: Session, date_from: date, date_to: date, limit: int) -> tuple[str, int]:
    """Attendance CSV (per-entry rows from submitted sessions) and row count."""
    submitter = aliased(ApplicationUser)
    creator = aliased(ApplicationUser)
    statement = (
        select(
            AttendanceSession.id,
            AttendanceSession.attendance_date,
            Worker.worker_code,
            Worker.full_name,
            AttendanceEntry.attendance_status,
            AttendanceEntry.time_in,
            AttendanceEntry.time_out,
            creator.display_name,
            submitter.display_name,
            AttendanceSession.submitted_at,
        )
        .join(AttendanceEntry, AttendanceEntry.attendance_session_id == AttendanceSession.id)
        .join(Worker, Worker.id == AttendanceEntry.worker_id)
        .join(submitter, submitter.id == AttendanceSession.submitted_by, isouter=True)
        .join(creator, creator.id == AttendanceSession.created_by)
        .where(
            AttendanceSession.status == "submitted",
            AttendanceSession.attendance_date.between(date_from, date_to),
        )
        .order_by(AttendanceSession.attendance_date, AttendanceSession.id, Worker.worker_code)
        .limit(limit)
    )
    rows = [
        [
            csv_safe(row.id),
            csv_safe(row.attendance_date),
            csv_safe(row.worker_code),
            csv_safe(row.full_name),
            csv_safe(row.attendance_status),
            csv_safe(row.time_in.isoformat(timespec="minutes") if row.time_in else ""),
            csv_safe(row.time_out.isoformat(timespec="minutes") if row.time_out else ""),
            csv_safe(row[7]),
            csv_safe(row[8]),
            csv_safe(row.submitted_at.isoformat(timespec="minutes") if row.submitted_at else ""),
        ]
        for row in db.execute(statement).all()
    ]
    headers = [
        "session_id",
        "attendance_date",
        "worker_code",
        "worker_name",
        "attendance_status",
        "time_in",
        "time_out",
        "recorded_by",
        "submitted_by",
        "submitted_at",
    ]
    return _render_csv(headers, rows), len(rows)


def harvest_csv(
    db: Session,
    date_from: date,
    date_to: date,
    farm_unit_id: uuid.UUID | None,
    unit: HarvestUnit | None,
    limit: int,
) -> tuple[str, int]:
    """Harvest CSV (source-record rows) and row count."""
    submitter = aliased(ApplicationUser)
    creator = aliased(ApplicationUser)
    statement = (
        select(
            HarvestRecord.id,
            HarvestRecord.harvest_date,
            FarmUnit.code,
            FarmUnit.name,
            FarmUnit.unit_type,
            HarvestRecord.quantity,
            HarvestRecord.unit,
            creator.display_name.label("recorded_by_name"),
            submitter.display_name.label("submitted_by_name"),
            HarvestRecord.submitted_at,
            HarvestRecord.notes,
        )
        .join(FarmUnit, FarmUnit.id == HarvestRecord.farm_unit_id)
        .join(submitter, submitter.id == HarvestRecord.submitted_by, isouter=True)
        .join(creator, creator.id == HarvestRecord.created_by)
        .where(
            HarvestRecord.status == "submitted",
            HarvestRecord.harvest_date.between(date_from, date_to),
            *([] if farm_unit_id is None else [HarvestRecord.farm_unit_id == farm_unit_id]),
            *([] if unit is None else [HarvestRecord.unit == unit]),
        )
        .order_by(HarvestRecord.harvest_date, HarvestRecord.id)
        .limit(limit)
    )
    rows = [
        [
            csv_safe(row.id),
            csv_safe(row.harvest_date),
            csv_safe(row.code),
            csv_safe(row.name),
            csv_safe(row.unit_type),
            csv_safe(row.quantity),
            csv_safe(row.unit),
            csv_safe(row.recorded_by_name),
            csv_safe(row.submitted_by_name),
            csv_safe(row.submitted_at.isoformat(timespec="minutes") if row.submitted_at else ""),
            csv_safe(row.notes),
        ]
        for row in db.execute(statement).all()
    ]
    headers = [
        "record_id",
        "harvest_date",
        "farm_unit_code",
        "farm_unit_name",
        "farm_unit_type",
        "quantity",
        "unit",
        "recorded_by",
        "submitted_by",
        "submitted_at",
        "notes",
    ]
    return _render_csv(headers, rows), len(rows)
