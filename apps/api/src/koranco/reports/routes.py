from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from koranco.db.session import get_db
from koranco.identity.dependencies import CurrentUser, require_permission
from koranco.reports.schemas import (
    AttendanceReportResponse,
    HarvestReportResponse,
    OverviewResponse,
)
from koranco.reports.service import (
    get_attendance_report,
    get_harvest_report,
    get_overview_today,
    get_recent_activity,
)

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.get("/overview", response_model=OverviewResponse)
def get_overview(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_permission("reports.read")),
):
    today = date.today()
    today_data = get_overview_today(db, today)
    recent = get_recent_activity(db)

    return {
        "today": today_data,
        "attention": {"harvest_needs_attention": 0, "attendance_needs_attention": 0},
        "recent_harvest": recent["recent_harvest"],
        "recent_attendance": recent["recent_attendance"],
    }


@router.get("/attendance", response_model=AttendanceReportResponse)
def get_attendance_report_endpoint(
    start_date: Annotated[date, Query()] = date.today() - timedelta(days=30),
    end_date: Annotated[date, Query()] = date.today(),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_permission("reports.read")),
):
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")

    rows = get_attendance_report(db, start_date, end_date)
    return {"sessions": rows, "total_sessions": len(rows)}


@router.get("/harvest", response_model=HarvestReportResponse)
def get_harvest_report_endpoint(
    start_date: Annotated[date, Query()] = date.today() - timedelta(days=30),
    end_date: Annotated[date, Query()] = date.today(),
    farm_unit_id: Annotated[str | None, Query()] = None,
    unit: Annotated[str | None, Query()] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_permission("reports.read")),
):
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")

    result = get_harvest_report(db, start_date, end_date, farm_unit_id, unit)
    return result
