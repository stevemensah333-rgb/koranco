import uuid

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    login_identifier: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class AuthenticatedUserResponse(BaseModel):
    id: uuid.UUID
    login_identifier: str
    display_name: str
    permissions: list[str]
