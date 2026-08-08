import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from koranco.harvest.schemas import HarvestUnit


class HarvestUnitTotal(BaseModel):
    """A harvest quantity total grouped independently by its own unit."""

    unit: HarvestUnit
    record_count: int
    quantity: Decimal


class OverviewAttendance(BaseModel):
    submitted_sessions: int
    present_count: int
    absent_count: int
    roster_count: int


class OverviewHarvest(BaseModel):
    submitted_records: int
    by_unit: list[HarvestUnitTotal]


class RecentAttendanceSession(BaseModel):
    id: uuid.UUID
    attendance_date: date
    submitted_by_name: str | None
    submitted_at: datetime | None
    present_count: int
    absent_count: int
    roster_count: int


class RecentHarvestRecord(BaseModel):
    id: uuid.UUID
    harvest_date: date
    farm_unit_id: uuid.UUID
    farm_unit_code: str
    farm_unit_name: str
    quantity: Decimal
    unit: HarvestUnit
    submitted_by_name: str | None
    submitted_at: datetime | None


class OverviewResponse(BaseModel):
    date: date
    attendance: OverviewAttendance
    harvest: OverviewHarvest
    recent_attendance: list[RecentAttendanceSession]
    recent_harvest: list[RecentHarvestRecord]


class AttendanceSessionReport(BaseModel):
    """One submitted AttendanceSession with the roster it contains."""

    id: uuid.UUID
    attendance_date: date
    submitted_at: datetime | None
    submitted_by_id: uuid.UUID | None
    submitted_by_name: str | None
    recorded_by_name: str
    present_count: int
    absent_count: int
    roster_count: int


class AttendanceReportResponse(BaseModel):
    date_from: date
    date_to: date
    submitted_session_count: int
    present_count: int
    absent_count: int
    roster_count: int
    sessions: list[AttendanceSessionReport]


class HarvestFarmUnitTotal(BaseModel):
    """Harvest totals for one FarmUnit, keeping every unit separate."""

    farm_unit_id: uuid.UUID
    farm_unit_code: str
    farm_unit_name: str
    farm_unit_type: str
    record_count: int
    by_unit: list[HarvestUnitTotal]


class HarvestSourceRecord(BaseModel):
    id: uuid.UUID
    harvest_date: date
    farm_unit_id: uuid.UUID
    farm_unit_code: str
    farm_unit_name: str
    farm_unit_type: str
    quantity: Decimal
    unit: HarvestUnit
    notes: str | None
    submitted_by_name: str | None
    submitted_at: datetime | None


class HarvestReportResponse(BaseModel):
    date_from: date
    date_to: date
    submitted_record_count: int
    by_unit: list[HarvestUnitTotal]
    by_farm_unit: list[HarvestFarmUnitTotal]
    records: list[HarvestSourceRecord]
