import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from koranco.identity.permissions import Role


class UserResponse(BaseModel):
    id: uuid.UUID
    login_identifier: str
    display_name: str
    role: Role
    status: str
    password_change_required: bool
    created_at: datetime


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int


class CreateUserRequest(BaseModel):
    login_identifier: str = Field(min_length=3, max_length=64)
    display_name: str = Field(min_length=2, max_length=120)
    role: Role
    initial_password: str = Field(min_length=12, max_length=128)
    current_password: str | None = Field(default=None, max_length=128)


class RoleChangeRequest(BaseModel):
    role: Role
    current_password: str | None = Field(default=None, max_length=128)


class SensitiveActionRequest(BaseModel):
    current_password: str | None = Field(default=None, max_length=128)


class PasswordResetRequest(SensitiveActionRequest):
    replacement_password: str = Field(min_length=12, max_length=128)


class ChangeOwnPasswordRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class SecurityEventResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    actor_user_id: uuid.UUID | None
    subject_user_id: uuid.UUID | None
    details: dict[str, Any] | None = None
    occurred_at: datetime


class SecurityEventListResponse(BaseModel):
    items: list[SecurityEventResponse]
    total: int
