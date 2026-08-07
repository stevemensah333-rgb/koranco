from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from koranco.config.settings import get_settings
from koranco.identity.dependencies import (
    AuthContext,
    Authenticated,
    DatabaseSession,
    require_csrf,
    require_permission,
    require_trusted_origin,
)
from koranco.identity.models import ApplicationUser
from koranco.identity.permissions import Permission
from koranco.identity.schemas import AuthenticatedUserResponse, LoginRequest
from koranco.identity.security import CSRF_COOKIE, SESSION_COOKIE
from koranco.identity.service import (
    AuthenticationFailed,
    LoginRateLimited,
    authenticate,
    record_security_event,
)

router = APIRouter(prefix="/api/v1")


def user_response(user: ApplicationUser) -> AuthenticatedUserResponse:
    return AuthenticatedUserResponse(
        id=user.id,
        login_identifier=user.login_identifier,
        display_name=user.display_name,
        permissions=sorted(item.permission for item in user.permissions),
        role=user.role,
        password_change_required=user.password_change_required,
    )


@router.post("/auth/login", response_model=AuthenticatedUserResponse)
def login(
    payload: LoginRequest, request: Request, response: Response, db: DatabaseSession
) -> AuthenticatedUserResponse:
    require_trusted_origin(request)
    try:
        new_session = authenticate(
            db,
            get_settings(),
            payload.login_identifier,
            payload.password,
            request.state.request_id,
        )
    except (AuthenticationFailed, LoginRateLimited) as exc:
        db.commit()
        status_code = 429 if isinstance(exc, LoginRateLimited) else 401
        raise HTTPException(status_code=status_code, detail="Invalid login credentials") from exc

    settings = get_settings()
    max_age = settings.session_ttl_hours * 60 * 60
    response.set_cookie(
        SESSION_COOKIE,
        new_session.session_token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE,
        new_session.csrf_token,
        httponly=False,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    return user_response(new_session.user)


@router.get("/auth/session", response_model=AuthenticatedUserResponse)
def current_session(auth: Authenticated) -> AuthenticatedUserResponse:
    return user_response(auth.user)


@router.post("/auth/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
) -> None:
    auth.session.revoked_at = datetime.now(UTC)
    record_security_event(db, "logout", auth.user, request.state.request_id)
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


@router.get("/system/status")
def protected_status(
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.SYSTEM_STATUS_READ))],
) -> dict[str, str]:
    return {"status": "foundation"}
