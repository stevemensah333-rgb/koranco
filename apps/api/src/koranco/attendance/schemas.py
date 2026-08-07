import uuid
from datetime import date, datetime, time
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator


class AttendanceStatus(StrEnum):
    PRESENT = "present"
    ABSENT = "absent"


class DraftEntryRequest(BaseModel):
    worker_id: uuid.UUID
    attendance_status: AttendanceStatus | None = None
    time_in: time | None = None
    time_out: time | None = None

    @model_validator(mode="after")
    def validate_times(self) -> "DraftEntryRequest":
        if self.attendance_status == AttendanceStatus.ABSENT and (self.time_in or self.time_out):
            raise ValueError("Absent workers cannot have time-in or time-out")
        if self.time_in and self.time_out and self.time_out < self.time_in:
            raise ValueError("Time-out cannot precede time-in")
        return self


class CreateAttendanceRequest(BaseModel):
    attendance_date: date


class UpdateDraftRequest(BaseModel):
    expected_version: int = Field(ge=1)
    entries: list[DraftEntryRequest] = Field(max_length=5000)


class CorrectEntryRequest(BaseModel):
    expected_version: int = Field(ge=1)
    attendance_status: AttendanceStatus
    time_in: time | None = None
    time_out: time | None = None
    reason: str = Field(min_length=3, max_length=500)

    @model_validator(mode="after")
    def validate_times(self) -> "CorrectEntryRequest":
        DraftEntryRequest(
            worker_id=uuid.uuid4(),
            attendance_status=self.attendance_status,
            time_in=self.time_in,
            time_out=self.time_out,
        )
        if not self.reason.strip():
            raise ValueError("Correction reason is required")
        self.reason = self.reason.strip()
        return self


class AttendanceEntryResponse(BaseModel):
    id: uuid.UUID
    worker_id: uuid.UUID
    worker_code: str
    worker_name: str
    worker_active: bool
    attendance_status: AttendanceStatus | None
    time_in: time | None
    time_out: time | None
    version: int
    corrected_at: datetime | None


class AttendanceSessionResponse(BaseModel):
    id: uuid.UUID
    attendance_date: date
    status: str
    version: int
    created_by: uuid.UUID
    created_by_name: str
    created_at: datetime
    updated_at: datetime
    submitted_by: uuid.UUID | None
    submitted_by_name: str | None
    submitted_at: datetime | None
    present_count: int
    absent_count: int
    unmarked_count: int
    entries: list[AttendanceEntryResponse]


class AttendanceSessionListItem(BaseModel):
    id: uuid.UUID
    attendance_date: date
    status: str
    created_by_name: str
    submitted_by_name: str | None
    submitted_at: datetime | None
    entry_count: int


class AttendanceSessionListResponse(BaseModel):
    items: list[AttendanceSessionListItem]
    total: int
    limit: int
    offset: int


class AttendanceSyncRequest(BaseModel):
    operation_id: uuid.UUID
    operation_type: str = Field(pattern="^submit_snapshot$")
    target_session_id: uuid.UUID
    payload_version: int = Field(ge=1)
    attendance_date: date
    base_server_version: int | None = Field(default=None, ge=1)
    entries: list[DraftEntryRequest] = Field(min_length=1, max_length=5000)


class AttendanceSyncResponse(BaseModel):
    operation_id: uuid.UUID
    result: str
    message: str
    session: AttendanceSessionResponse | None = None
