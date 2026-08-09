import uuid
from datetime import date
from typing import Any

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session, aliased

from koranco.attendance.models import AttendanceEntry, AttendanceSession
from koranco.farm_structure.models import FarmUnit
from koranco.harvest.models import HarvestRecord
from koranco.harvest.schemas import HarvestUnit
from koranco.identity.models import ApplicationUser
from koranco.reports.schemas import (
    AttendanceDateTotal,
    AttendanceSessionReport,
    HarvestDateUnitTotal,
    HarvestFarmUnitTotal,
    HarvestSourceRecord,
    HarvestUnitTotal,
)

SUBMITTED = "submitted"
PRESENT = "present"
ABSENT = "absent"


def _attendance_where(date_from: date, date_to: date) -> list[ColumnElement[bool]]:
    return [
        AttendanceSession.status == SUBMITTED,
        AttendanceSession.attendance_date.between(date_from, date_to),
    ]


def _harvest_where(
    date_from: date, date_to: date, farm_unit_id: uuid.UUID | None, unit: HarvestUnit | None
) -> list[ColumnElement[bool]]:
    clauses = [
        HarvestRecord.status == SUBMITTED,
        HarvestRecord.harvest_date.between(date_from, date_to),
    ]
    if farm_unit_id is not None:
        clauses.append(HarvestRecord.farm_unit_id == farm_unit_id)
    if unit is not None:
        clauses.append(HarvestRecord.unit == unit)
    return clauses


def attendance_totals(db: Session, date_from: date, date_to: date) -> dict[str, int]:
    """Present/Absent/roster counts over submitted sessions in an inclusive date range."""
    statement = (
        select(
            func.count(func.distinct(AttendanceSession.id)).label("submitted_sessions"),
            func.count(AttendanceEntry.id)
            .filter(AttendanceEntry.attendance_status == PRESENT)
            .label("present_count"),
            func.count(AttendanceEntry.id)
            .filter(AttendanceEntry.attendance_status == ABSENT)
            .label("absent_count"),
            func.count(AttendanceEntry.id).label("roster_count"),
        )
        .join(AttendanceEntry, AttendanceEntry.attendance_session_id == AttendanceSession.id)
        .where(*_attendance_where(date_from, date_to))
    )
    row = db.execute(statement).one()
    return {
        "submitted_sessions": int(row.submitted_sessions),
        "present_count": int(row.present_count),
        "absent_count": int(row.absent_count),
        "roster_count": int(row.roster_count),
    }


def attendance_by_date(db: Session, date_from: date, date_to: date) -> list[AttendanceDateTotal]:
    """Per-operational-date Attendance totals over submitted sessions, newest first.

    Aggregation is performed in PostgreSQL; the frontend never sums session rows.
    """
    statement = (
        select(
            AttendanceSession.attendance_date,
            func.count(func.distinct(AttendanceSession.id)).label("submitted_sessions"),
            func.count(AttendanceEntry.id)
            .filter(AttendanceEntry.attendance_status == PRESENT)
            .label("present_count"),
            func.count(AttendanceEntry.id)
            .filter(AttendanceEntry.attendance_status == ABSENT)
            .label("absent_count"),
            func.count(AttendanceEntry.id).label("roster_count"),
        )
        .join(AttendanceEntry, AttendanceEntry.attendance_session_id == AttendanceSession.id)
        .where(*_attendance_where(date_from, date_to))
        .group_by(AttendanceSession.attendance_date)
        .order_by(AttendanceSession.attendance_date.desc())
    )
    return [
        AttendanceDateTotal(
            date=row.attendance_date,
            submitted_sessions=int(row.submitted_sessions),
            present_count=int(row.present_count),
            absent_count=int(row.absent_count),
            roster_count=int(row.roster_count),
        )
        for row in db.execute(statement).all()
    ]


def attendance_sessions(
    db: Session, date_from: date, date_to: date, limit: int
) -> list[AttendanceSessionReport]:
    submitter = aliased(ApplicationUser)
    creator = aliased(ApplicationUser)
    statement = (
        select(
            AttendanceSession.id,
            AttendanceSession.attendance_date,
            AttendanceSession.submitted_at,
            AttendanceSession.submitted_by,
            submitter.display_name.label("submitted_by_name"),
            creator.display_name.label("recorded_by_name"),
            func.count(AttendanceEntry.id)
            .filter(AttendanceEntry.attendance_status == PRESENT)
            .label("present_count"),
            func.count(AttendanceEntry.id)
            .filter(AttendanceEntry.attendance_status == ABSENT)
            .label("absent_count"),
            func.count(AttendanceEntry.id).label("roster_count"),
        )
        .join(AttendanceEntry, AttendanceEntry.attendance_session_id == AttendanceSession.id)
        .join(submitter, submitter.id == AttendanceSession.submitted_by, isouter=True)
        .join(creator, creator.id == AttendanceSession.created_by)
        .where(*_attendance_where(date_from, date_to))
        .group_by(
            AttendanceSession.id,
            AttendanceSession.attendance_date,
            AttendanceSession.submitted_at,
            AttendanceSession.submitted_by,
            submitter.display_name,
            creator.display_name,
        )
        .order_by(AttendanceSession.attendance_date.desc(), AttendanceSession.submitted_at.desc())
        .limit(limit)
    )
    return [
        AttendanceSessionReport(
            id=row.id,
            attendance_date=row.attendance_date,
            submitted_at=row.submitted_at,
            submitted_by_id=row.submitted_by,
            submitted_by_name=row.submitted_by_name,
            recorded_by_name=row.recorded_by_name,
            present_count=row.present_count,
            absent_count=row.absent_count,
            roster_count=row.roster_count,
        )
        for row in db.execute(statement).all()
    ]


def harvest_unit_totals(
    db: Session,
    date_from: date,
    date_to: date,
    farm_unit_id: uuid.UUID | None,
    unit: HarvestUnit | None,
) -> list[HarvestUnitTotal]:
    """Harvest quantities grouped independently by unit. Units are never summed together."""
    statement = (
        select(
            HarvestRecord.unit,
            func.count(HarvestRecord.id).label("record_count"),
            func.sum(HarvestRecord.quantity).label("quantity"),
        )
        .where(*_harvest_where(date_from, date_to, farm_unit_id, unit))
        .group_by(HarvestRecord.unit)
        .order_by(HarvestRecord.unit)
    )
    return [
        HarvestUnitTotal(
            unit=HarvestUnit(row.unit),
            record_count=int(row.record_count),
            quantity=row.quantity,
        )
        for row in db.execute(statement).all()
    ]


def harvest_by_date(
    db: Session,
    date_from: date,
    date_to: date,
    farm_unit_id: uuid.UUID | None,
    unit: HarvestUnit | None,
) -> list[HarvestDateUnitTotal]:
    """Per-operational-date Harvest totals, grouped by (date, unit), newest first.

    Each row belongs to exactly one unit, so the visualization layer can never
    accidentally combine incompatible units: a date with both fruit and kg
    yields two independent rows.
    """
    statement = (
        select(
            HarvestRecord.harvest_date,
            HarvestRecord.unit,
            func.count(HarvestRecord.id).label("record_count"),
            func.sum(HarvestRecord.quantity).label("quantity"),
        )
        .where(*_harvest_where(date_from, date_to, farm_unit_id, unit))
        .group_by(HarvestRecord.harvest_date, HarvestRecord.unit)
        .order_by(HarvestRecord.harvest_date.desc(), HarvestRecord.unit)
    )
    return [
        HarvestDateUnitTotal(
            date=row.harvest_date,
            unit=HarvestUnit(row.unit),
            record_count=int(row.record_count),
            quantity=row.quantity,
        )
        for row in db.execute(statement).all()
    ]


def harvest_by_farm_unit(
    db: Session,
    date_from: date,
    date_to: date,
    farm_unit_id: uuid.UUID | None,
    unit: HarvestUnit | None,
) -> list[HarvestFarmUnitTotal]:
    """Per-FarmUnit totals, each keeping every unit separate. Exact FarmUnit match only."""
    statement = (
        select(
            HarvestRecord.farm_unit_id,
            FarmUnit.code,
            FarmUnit.name,
            FarmUnit.unit_type,
            HarvestRecord.unit,
            func.count(HarvestRecord.id).label("record_count"),
            func.sum(HarvestRecord.quantity).label("quantity"),
        )
        .join(FarmUnit, FarmUnit.id == HarvestRecord.farm_unit_id)
        .where(*_harvest_where(date_from, date_to, farm_unit_id, unit))
        .group_by(
            HarvestRecord.farm_unit_id,
            FarmUnit.code,
            FarmUnit.name,
            FarmUnit.unit_type,
            HarvestRecord.unit,
        )
        .order_by(FarmUnit.code, HarvestRecord.unit)
    )
    grouped: dict[uuid.UUID, dict[str, Any]] = {}
    for row in db.execute(statement).all():
        bucket = grouped.setdefault(
            row.farm_unit_id,
            {
                "farm_unit_id": row.farm_unit_id,
                "farm_unit_code": row.code,
                "farm_unit_name": row.name,
                "farm_unit_type": row.unit_type,
                "record_count": 0,
                "by_unit": [],
            },
        )
        bucket["record_count"] += int(row.record_count)
        bucket["by_unit"].append(
            HarvestUnitTotal(
                unit=HarvestUnit(row.unit),
                record_count=int(row.record_count),
                quantity=row.quantity,
            )
        )
    return [HarvestFarmUnitTotal(**value) for value in grouped.values()]


def harvest_record_count(
    db: Session,
    date_from: date,
    date_to: date,
    farm_unit_id: uuid.UUID | None,
    unit: HarvestUnit | None,
) -> int:
    statement = select(func.count(HarvestRecord.id)).where(
        *_harvest_where(date_from, date_to, farm_unit_id, unit)
    )
    return int(db.scalar(statement) or 0)


def harvest_source_records(
    db: Session,
    date_from: date,
    date_to: date,
    farm_unit_id: uuid.UUID | None,
    unit: HarvestUnit | None,
    limit: int,
) -> list[HarvestSourceRecord]:
    submitter = aliased(ApplicationUser)
    statement = (
        select(
            HarvestRecord.id,
            HarvestRecord.harvest_date,
            HarvestRecord.farm_unit_id,
            FarmUnit.code,
            FarmUnit.name,
            FarmUnit.unit_type,
            HarvestRecord.quantity,
            HarvestRecord.unit,
            HarvestRecord.notes,
            submitter.display_name.label("submitted_by_name"),
            HarvestRecord.submitted_at,
        )
        .join(FarmUnit, FarmUnit.id == HarvestRecord.farm_unit_id)
        .join(submitter, submitter.id == HarvestRecord.submitted_by, isouter=True)
        .where(*_harvest_where(date_from, date_to, farm_unit_id, unit))
        .order_by(HarvestRecord.harvest_date.desc(), HarvestRecord.submitted_at.desc())
        .limit(limit)
    )
    return [
        HarvestSourceRecord(
            id=row.id,
            harvest_date=row.harvest_date,
            farm_unit_id=row.farm_unit_id,
            farm_unit_code=row.code,
            farm_unit_name=row.name,
            farm_unit_type=row.unit_type,
            quantity=row.quantity,
            unit=HarvestUnit(row.unit),
            notes=row.notes,
            submitted_by_name=row.submitted_by_name,
            submitted_at=row.submitted_at,
        )
        for row in db.execute(statement).all()
    ]


def recent_attendance_sessions(db: Session, limit: int) -> list[AttendanceSessionReport]:
    """Most recently submitted Attendance sessions, newest first, regardless of date."""
    submitter = aliased(ApplicationUser)
    creator = aliased(ApplicationUser)
    statement = (
        select(
            AttendanceSession.id,
            AttendanceSession.attendance_date,
            AttendanceSession.submitted_at,
            AttendanceSession.submitted_by,
            submitter.display_name.label("submitted_by_name"),
            creator.display_name.label("recorded_by_name"),
            func.count(AttendanceEntry.id)
            .filter(AttendanceEntry.attendance_status == PRESENT)
            .label("present_count"),
            func.count(AttendanceEntry.id)
            .filter(AttendanceEntry.attendance_status == ABSENT)
            .label("absent_count"),
            func.count(AttendanceEntry.id).label("roster_count"),
        )
        .join(AttendanceEntry, AttendanceEntry.attendance_session_id == AttendanceSession.id)
        .join(submitter, submitter.id == AttendanceSession.submitted_by, isouter=True)
        .join(creator, creator.id == AttendanceSession.created_by)
        .where(AttendanceSession.status == SUBMITTED)
        .group_by(
            AttendanceSession.id,
            AttendanceSession.attendance_date,
            AttendanceSession.submitted_at,
            AttendanceSession.submitted_by,
            submitter.display_name,
            creator.display_name,
        )
        .order_by(AttendanceSession.submitted_at.desc(), AttendanceSession.attendance_date.desc())
        .limit(limit)
    )
    return [
        AttendanceSessionReport(
            id=row.id,
            attendance_date=row.attendance_date,
            submitted_at=row.submitted_at,
            submitted_by_id=row.submitted_by,
            submitted_by_name=row.submitted_by_name,
            recorded_by_name=row.recorded_by_name,
            present_count=row.present_count,
            absent_count=row.absent_count,
            roster_count=row.roster_count,
        )
        for row in db.execute(statement).all()
    ]


def recent_harvest_records(db: Session, limit: int) -> list[HarvestSourceRecord]:
    """Most recently submitted Harvest records, newest first, regardless of date."""
    submitter = aliased(ApplicationUser)
    statement = (
        select(
            HarvestRecord.id,
            HarvestRecord.harvest_date,
            HarvestRecord.farm_unit_id,
            FarmUnit.code,
            FarmUnit.name,
            FarmUnit.unit_type,
            HarvestRecord.quantity,
            HarvestRecord.unit,
            HarvestRecord.notes,
            submitter.display_name.label("submitted_by_name"),
            HarvestRecord.submitted_at,
        )
        .join(FarmUnit, FarmUnit.id == HarvestRecord.farm_unit_id)
        .join(submitter, submitter.id == HarvestRecord.submitted_by, isouter=True)
        .where(HarvestRecord.status == SUBMITTED)
        .order_by(HarvestRecord.submitted_at.desc(), HarvestRecord.harvest_date.desc())
        .limit(limit)
    )
    return [
        HarvestSourceRecord(
            id=row.id,
            harvest_date=row.harvest_date,
            farm_unit_id=row.farm_unit_id,
            farm_unit_code=row.code,
            farm_unit_name=row.name,
            farm_unit_type=row.unit_type,
            quantity=row.quantity,
            unit=HarvestUnit(row.unit),
            notes=row.notes,
            submitted_by_name=row.submitted_by_name,
            submitted_at=row.submitted_at,
        )
        for row in db.execute(statement).all()
    ]
