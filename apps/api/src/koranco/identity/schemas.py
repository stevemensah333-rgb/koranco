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
    role: str
    password_change_required: bool


class AuthenticatedSessionResponse(AuthenticatedUserResponse):
    # The cross-origin web client cannot read a host-only cookie set by the API.
    # CORS protects this response; the backend still requires the matching cookie,
    # trusted Origin, and session-bound header token on every authenticated write.
    csrf_token: str
