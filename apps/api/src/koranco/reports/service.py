"""Reporting service – PostgreSQL aggregation only (ADR-010).

All queries use authoritative data. No client-side aggregation of full result sets.
Harvest units are never combined.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from koranco.attendance.models import AttendanceEntry, AttendanceSession
from koranco.farm_structure.models import FarmUnit
from koranco.harvest.models import HarvestRecord
from koranco.identity.models import ApplicationUser
from koranco.operational_audit.models import OperationalAuditEvent


def get_overview_today(db: Session, target_date: date) -> dict[str, Any]:
    # Attendance today
    att_sessions = db.execute(
        select(func.count(AttendanceSession.id)).where(
            AttendanceSession.attendance_date == target_date,
            AttendanceSession.status == "submitted",
        )
    ).scalar_one()

    present = db.execute(
        select(func.count(AttendanceEntry.id)).join(AttendanceSession).where(
            AttendanceSession.attendance_date == target_date,
            AttendanceSession.status == "submitted",
            AttendanceEntry.status == "present",
        )
    ).scalar_one()

    absent = db.execute(
        select(func.count(AttendanceEntry.id)).join(AttendanceSession).where(
            AttendanceSession.attendance_date == target_date,
            AttendanceSession.status == "submitted",
            AttendanceEntry.status == "absent",
        )
    ).scalar_one()

    # Harvest today – unit aware
    harvest_rows = db.execute(
        select(HarvestRecord.unit, func.sum(HarvestRecord.quantity), func.count(HarvestRecord.id))
        .where(
            HarvestRecord.harvest_date == target_date,
            HarvestRecord.status == "submitted",
        )
        .group_by(HarvestRecord.unit)
    ).all()

    harvest_totals: dict[str, float] = {}
    harvest_count = 0
    for unit, total, cnt in harvest_rows:
        harvest_totals[unit] = float(total or 0)
        harvest_count += cnt or 0

    return {
        "attendance_sessions": att_sessions or 0,
        "present_count": present or 0,
        "absent_count": absent or 0,
        "harvest_records": harvest_count,
        "harvest_totals": harvest_totals,
    }


def get_recent_activity(db: Session, limit: int = 5) -> dict[str, list]:
    # Recent submitted Harvest
    recent_h = db.execute(
        select(
            HarvestRecord.id,
            HarvestRecord.harvest_date,
            FarmUnit.code,
            FarmUnit.name,
            HarvestRecord.quantity,
            HarvestRecord.unit,
            ApplicationUser.display_name,
        )
        .join(FarmUnit, HarvestRecord.farm_unit_id == FarmUnit.id)
        .outerjoin(ApplicationUser, HarvestRecord.submitted_by == ApplicationUser.id)
        .where(HarvestRecord.status == "submitted")
        .order_by(HarvestRecord.submitted_at.desc())
        .limit(limit)
    ).all()

    recent_harvest = [
        {
            "id": str(r[0]),
            "harvest_date": r[1],
            "farm_unit_code": r[2],
            "farm_unit_name": r[3],
            "quantity": str(r[4]),
            "unit": r[5],
            "submitted_by": r[6],
        }
        for r in recent_h
    ]

    # Recent submitted Attendance sessions
    recent_a = db.execute(
        select(
            AttendanceSession.id,
            AttendanceSession.attendance_date,
            func.count(AttendanceEntry.id).filter(AttendanceEntry.status == "present"),
            func.count(AttendanceEntry.id).filter(AttendanceEntry.status == "absent"),
            ApplicationUser.display_name,
        )
        .join(AttendanceEntry, AttendanceSession.id == AttendanceEntry.session_id)
        .outerjoin(ApplicationUser, AttendanceSession.submitted_by == ApplicationUser.id)
        .where(AttendanceSession.status == "submitted")
        .group_by(AttendanceSession.id, AttendanceSession.attendance_date, ApplicationUser.display_name)
        .order_by(AttendanceSession.submitted_at.desc())
        .limit(limit)
    ).all()

    recent_attendance = [
        {
            "id": str(r[0]),
            "attendance_date": r[1],
            "present_count": r[2] or 0,
            "absent_count": r[3] or 0,
            "submitted_by": r[4],
        }
        for r in recent_a
    ]

    return {"recent_harvest": recent_harvest, "recent_attendance": recent_attendance}


def get_attendance_report(
    db: Session, start_date: date, end_date: date, farm_unit_id: str | None = None
) -> list[dict]:
    stmt = (
        select(
            AttendanceSession.attendance_date,
            AttendanceSession.id,
            func.count(AttendanceEntry.id).filter(AttendanceEntry.status == "present"),
            func.count(AttendanceEntry.id).filter(AttendanceEntry.status == "absent"),
            func.count(AttendanceEntry.id),
            ApplicationUser.display_name,
        )
        .join(AttendanceEntry, AttendanceSession.id == AttendanceEntry.session_id)
        .outerjoin(ApplicationUser, AttendanceSession.submitted_by == ApplicationUser.id)
        .where(
            AttendanceSession.attendance_date.between(start_date, end_date),
            AttendanceSession.status == "submitted",
        )
        .group_by(
            AttendanceSession.attendance_date,
            AttendanceSession.id,
            ApplicationUser.display_name,
        )
        .order_by(AttendanceSession.attendance_date.desc())
    )

    rows = db.execute(stmt).all()
    return [
        {
            "attendance_date": r[0],
            "session_id": str(r[1]),
            "present_count": r[2] or 0,
            "absent_count": r[3] or 0,
            "roster_count": r[4] or 0,
            "submitted_by": r[5],
        }
        for r in rows
    ]


def get_harvest_report(
    db: Session, start_date: date, end_date: date, farm_unit_id: str | None = None, unit: str | None = None
) -> dict:
    base = (
        select(HarvestRecord)
        .where(
            HarvestRecord.harvest_date.between(start_date, end_date),
            HarvestRecord.status == "submitted",
        )
        .order_by(HarvestRecord.harvest_date.desc())
    )
    if farm_unit_id:
        base = base.where(HarvestRecord.farm_unit_id == farm_unit_id)
    if unit:
        base = base.where(HarvestRecord.unit == unit)

    records = db.execute(base).scalars().all()

    # Unit-aware totals
    totals_stmt = (
        select(HarvestRecord.unit, func.sum(HarvestRecord.quantity), func.count())
        .where(
            HarvestRecord.harvest_date.between(start_date, end_date),
            HarvestRecord.status == "submitted",
        )
        .group_by(HarvestRecord.unit)
    )
    if farm_unit_id:
        totals_stmt = totals_stmt.where(HarvestRecord.farm_unit_id == farm_unit_id)
    if unit:
        totals_stmt = totals_stmt.where(HarvestRecord.unit == unit)

    totals = db.execute(totals_stmt).all()

    return {
        "totals_by_unit": [
            {"unit": u, "total": float(t or 0), "record_count": c} for u, t, c in totals
        ],
        "records": [
            {
                "harvest_date": rec.harvest_date,
                "record_id": str(rec.id),
                "farm_unit_code": rec.farm_unit.code,
                "farm_unit_name": rec.farm_unit.name,
                "quantity": str(rec.quantity),
                "unit": rec.unit,
                "submitted_by": rec.submitted_by_user.display_name if rec.submitted_by_user else None,
            }
            for rec in records
        ],
        "total_records": len(records),
    }
