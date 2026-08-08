from datetime import date
from typing import Any

from pydantic import BaseModel, Field


class OverviewToday(BaseModel):
    attendance_sessions: int = 0
    present_count: int = 0
    absent_count: int = 0
    harvest_records: int = 0
    harvest_totals: dict[str, float] = Field(default_factory=dict)  # unit -> total


class OverviewAttention(BaseModel):
    # Only genuine server-visible states
    harvest_needs_attention: int = 0  # placeholder for future sync visibility
    attendance_needs_attention: int = 0


class RecentHarvestRecord(BaseModel):
    id: str
    harvest_date: date
    farm_unit_code: str
    farm_unit_name: str
    quantity: str
    unit: str
    submitted_by: str | None = None


class RecentAttendanceSession(BaseModel):
    id: str
    attendance_date: date
    present_count: int
    absent_count: int
    submitted_by: str | None = None


class OverviewResponse(BaseModel):
    today: OverviewToday
    attention: OverviewAttention
    recent_harvest: list[RecentHarvestRecord]
    recent_attendance: list[RecentAttendanceSession]


class AttendanceReportRow(BaseModel):
    attendance_date: date
    session_id: str
    present_count: int
    absent_count: int
    roster_count: int
    submitted_by: str | None = None


class HarvestReportRow(BaseModel):
    harvest_date: date
    record_id: str
    farm_unit_code: str
    farm_unit_name: str
    quantity: str
    unit: str
    submitted_by: str | None = None


class HarvestTotalsByUnit(BaseModel):
    unit: str
    total: float
    record_count: int


class HarvestReportResponse(BaseModel):
    totals_by_unit: list[HarvestTotalsByUnit]
    records: list[HarvestReportRow]
    total_records: int


class AttendanceReportResponse(BaseModel):
    sessions: list[AttendanceReportRow]
    total_sessions: int
