import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator

from koranco.workers.schemas import validate_code


class FarmUnitType(StrEnum):
    FIELD = "field"
    BLOCK = "block"


class FarmUnitResponse(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    unit_type: FarmUnitType
    parent_id: uuid.UUID | None
    status: str
    created_by: uuid.UUID
    updated_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


class FarmUnitCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=160)
    unit_type: FarmUnitType
    parent_id: uuid.UUID | None = None

    _code = field_validator("code")(validate_code)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Name is required")
        return cleaned


class FarmUnitUpdateRequest(FarmUnitCreateRequest):
    pass


class LifecycleRequest(BaseModel):
    """Optional reason accompanying a FarmUnit status change."""

    reason: str | None = Field(default=None, max_length=500)


class FarmUnitListResponse(BaseModel):
    items: list[FarmUnitResponse]
    total: int
    limit: int
    offset: int
