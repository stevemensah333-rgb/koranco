import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


def validate_code(value: str) -> str:
    cleaned = value.strip()
    if not cleaned or any(ord(character) < 32 for character in cleaned):
        raise ValueError("Code is required and must not contain control characters")
    return cleaned


def validate_name(value: str) -> str:
    cleaned = " ".join(value.split())
    if not cleaned:
        raise ValueError("Full name is required")
    return cleaned


class WorkerResponse(BaseModel):
    id: uuid.UUID
    worker_code: str
    full_name: str
    status: str
    created_by: uuid.UUID
    updated_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


class WorkerCreateRequest(BaseModel):
    worker_code: str = Field(min_length=1, max_length=64)
    full_name: str = Field(min_length=1, max_length=160)

    _code = field_validator("worker_code")(validate_code)

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return validate_name(value)


class WorkerUpdateRequest(BaseModel):
    worker_code: str = Field(min_length=1, max_length=64)
    full_name: str = Field(min_length=1, max_length=160)

    _code = field_validator("worker_code")(validate_code)
    _name = field_validator("full_name")(validate_name)


class LifecycleRequest(BaseModel):
    """Optional reason accompanying a Worker status change."""

    reason: str | None = Field(default=None, max_length=500)


class WorkerListResponse(BaseModel):
    items: list[WorkerResponse]
    total: int
    limit: int
    offset: int
