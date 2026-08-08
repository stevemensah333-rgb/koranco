import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class HarvestUnit(StrEnum):
    FRUIT_COUNT = "fruit_count"
    KILOGRAMS = "kilograms"


class HarvestValues(BaseModel):
    harvest_date: date
    farm_unit_id: uuid.UUID
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit: HarvestUnit
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("notes")
    @classmethod
    def normalize_notes(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        return value or None

    @model_validator(mode="after")
    def validate_unit_quantity(self) -> "HarvestValues":
        if (
            self.unit == HarvestUnit.FRUIT_COUNT
            and self.quantity != self.quantity.to_integral_value()
        ):
            raise ValueError("Fruit count must be a whole number")
        return self


class CreateHarvestRequest(HarvestValues):
    id: uuid.UUID | None = None


class UpdateHarvestDraftRequest(HarvestValues):
    expected_version: int = Field(ge=1)


class CorrectHarvestRequest(HarvestValues):
    expected_version: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=500)
    confirmed: bool

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Correction reason is required")
        return value

    @model_validator(mode="after")
    def require_confirmation(self) -> "CorrectHarvestRequest":
        if not self.confirmed:
            raise ValueError("Correction must be explicitly confirmed")
        return self


class HarvestRecordResponse(BaseModel):
    id: uuid.UUID
    harvest_date: date
    farm_unit_id: uuid.UUID
    farm_unit_code: str
    farm_unit_name: str
    farm_unit_type: str
    farm_unit_active: bool
    quantity: Decimal
    unit: HarvestUnit
    notes: str | None
    status: str
    version: int
    created_by: uuid.UUID
    created_by_name: str
    created_at: datetime
    updated_at: datetime
    submitted_by: uuid.UUID | None
    submitted_by_name: str | None
    submitted_at: datetime | None


class HarvestRecordListResponse(BaseModel):
    items: list[HarvestRecordResponse]
    total: int
    limit: int
    offset: int


class HarvestSyncRequest(HarvestValues):
    operation_id: uuid.UUID
    operation_type: Literal["submit_harvest_snapshot"]
    harvest_record_id: uuid.UUID
    payload_version: int = Field(ge=1)
    base_server_version: int | None = Field(default=None, ge=1)


class HarvestSyncResponse(BaseModel):
    operation_id: uuid.UUID
    result: Literal["applied", "already_applied", "conflict", "rejected"]
    message: str
    record: HarvestRecordResponse | None = None
