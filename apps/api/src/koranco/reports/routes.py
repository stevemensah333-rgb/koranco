import uuid
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from koranco.harvest.schemas import HarvestUnit
from koranco.identity.dependencies import (
    AuthContext,
    DatabaseSession,
    require_csrf,
    require_permission,
)
from koranco.identity.permissions import Permission
from koranco.identity.service import record_security_event
from koranco.reports.csv_export import attendance_csv, harvest_csv
from koranco.reports.schemas import (
    AttendanceReportResponse,
    HarvestReportResponse,
    OverviewAttendance,
    OverviewHarvest,
    OverviewResponse,
    RecentAttendanceSession,
    RecentHarvestRecord,
)
from koranco.reports.service import (
    attendance_sessions,
    attendance_totals,
    harvest_by_farm_unit,
    harvest_record_count,
    harvest_source_records,
    harvest_unit_totals,
    recent_attendance_sessions,
    recent_harvest_records,
)

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

MAX_SOURCE_LIMIT = 500
DEFAULT_SOURCE_LIMIT = 100
MAX_EXPORT_LIMIT = 10_000
DEFAULT_EXPORT_LIMIT = 10_000
DEFAULT_RECENT_LIMIT = 10


def _today() -> date:
    # Ghana observes GMT/UTC with no daylight saving, so the server UTC calendar
    # date is the local operational date. Callers may override with an explicit
    # `date`/`date_from`/`date_to`.
    return datetime.now(UTC).date()


def _report_date_range(
    date_from: date | None,
    date_to: date | None,
    *,
    default: date,
) -> tuple[date, date]:
    start = date_from if date_from is not None else (date_to if date_to is not None else default)
    end = date_to if date_to is not None else (date_from if date_from is not None else default)
    if end < start:
        raise HTTPException(status_code=422, detail="date_to cannot precede date_from")
    return start, end


@router.get("/overview", response_model=OverviewResponse)
def overview(
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.REPORTS_READ))],
    date: date | None = None,
    recent: Annotated[int, Query(ge=1, le=50)] = DEFAULT_RECENT_LIMIT,
) -> OverviewResponse:
    op_date = date or _today()
    attendance = attendance_totals(db, op_date, op_date)
    by_unit = harvest_unit_totals(db, op_date, op_date, None, None)
    harvest_count = harvest_record_count(db, op_date, op_date, None, None)
    recent_attendance = [
        RecentAttendanceSession(
            id=s.id,
            attendance_date=s.attendance_date,
            submitted_by_name=s.submitted_by_name,
            submitted_at=s.submitted_at,
            present_count=s.present_count,
            absent_count=s.absent_count,
            roster_count=s.roster_count,
        )
        for s in recent_attendance_sessions(db, recent)
    ]
    recent_harvest = [
        RecentHarvestRecord(
            id=r.id,
            harvest_date=r.harvest_date,
            farm_unit_id=r.farm_unit_id,
            farm_unit_code=r.farm_unit_code,
            farm_unit_name=r.farm_unit_name,
            quantity=r.quantity,
            unit=r.unit,
            submitted_by_name=r.submitted_by_name,
            submitted_at=r.submitted_at,
        )
        for r in recent_harvest_records(db, recent)
    ]
    return OverviewResponse(
        date=op_date,
        attendance=OverviewAttendance(**attendance),
        harvest=OverviewHarvest(submitted_records=harvest_count, by_unit=by_unit),
        recent_attendance=recent_attendance,
        recent_harvest=recent_harvest,
    )


@router.get("/attendance", response_model=AttendanceReportResponse)
def attendance_report(
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.REPORTS_READ))],
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=MAX_SOURCE_LIMIT)] = DEFAULT_SOURCE_LIMIT,
) -> AttendanceReportResponse:
    start, end = _report_date_range(date_from, date_to, default=_today())
    totals = attendance_totals(db, start, end)
    sessions = attendance_sessions(db, start, end, limit)
    return AttendanceReportResponse(
        date_from=start,
        date_to=end,
        submitted_session_count=totals["submitted_sessions"],
        present_count=totals["present_count"],
        absent_count=totals["absent_count"],
        roster_count=totals["roster_count"],
        sessions=sessions,
    )


@router.get("/harvest", response_model=HarvestReportResponse)
def harvest_report(
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.REPORTS_READ))],
    date_from: date | None = None,
    date_to: date | None = None,
    farm_unit_id: uuid.UUID | None = None,
    unit: HarvestUnit | None = None,
    limit: Annotated[int, Query(ge=1, le=MAX_SOURCE_LIMIT)] = DEFAULT_SOURCE_LIMIT,
) -> HarvestReportResponse:
    start, end = _report_date_range(date_from, date_to, default=_today())
    return HarvestReportResponse(
        date_from=start,
        date_to=end,
        submitted_record_count=harvest_record_count(db, start, end, farm_unit_id, unit),
        by_unit=harvest_unit_totals(db, start, end, farm_unit_id, unit),
        by_farm_unit=harvest_by_farm_unit(db, start, end, farm_unit_id, unit),
        records=harvest_source_records(db, start, end, farm_unit_id, unit, limit),
    )


def _json_safe(value: object) -> object:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, HarvestUnit):
        return value.value
    return value


def _export_filters(params: dict[str, object]) -> dict[str, object]:
    return {
        key: _json_safe(value)
        for key, value in params.items()
        if value is not None and _json_safe(value) is not None
    }


@router.post("/exports/attendance")
def export_attendance(
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.EXPORTS_CREATE))],
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=MAX_EXPORT_LIMIT)] = DEFAULT_EXPORT_LIMIT,
) -> Response:
    start, end = _report_date_range(date_from, date_to, default=_today())
    body, row_count = attendance_csv(db, start, end, limit)
    filters = _export_filters({"date_from": start, "date_to": end, "limit": limit})
    record_security_event(
        db,
        "export_created",
        auth.user,
        request.state.request_id,
        details={"export_type": "attendance", "row_count": row_count, "filters": filters},
    )
    return _csv_response(body, f"koranco-attendance-{start}-to-{end}.csv")


@router.post("/exports/harvest")
def export_harvest(
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.EXPORTS_CREATE))],
    date_from: date | None = None,
    date_to: date | None = None,
    farm_unit_id: uuid.UUID | None = None,
    unit: HarvestUnit | None = None,
    limit: Annotated[int, Query(ge=1, le=MAX_EXPORT_LIMIT)] = DEFAULT_EXPORT_LIMIT,
) -> Response:
    start, end = _report_date_range(date_from, date_to, default=_today())
    body, row_count = harvest_csv(db, start, end, farm_unit_id, unit, limit)
    filters = _export_filters(
        {
            "date_from": start,
            "date_to": end,
            "farm_unit_id": farm_unit_id,
            "unit": unit,
            "limit": limit,
        }
    )
    record_security_event(
        db,
        "export_created",
        auth.user,
        request.state.request_id,
        details={"export_type": "harvest", "row_count": row_count, "filters": filters},
    )
    return _csv_response(body, f"koranco-harvest-{start}-to-{end}.csv")


def _csv_response(body: str, filename: str) -> Response:
    return Response(
        content=body.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
