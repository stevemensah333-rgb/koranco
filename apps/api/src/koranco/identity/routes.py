from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from koranco.config.settings import get_settings
from koranco.db.session import DatabaseSession
from koranco.identity.cookies import clear_auth_cookies, set_auth_cookies
from koranco.identity.dependencies import (
    AuthContext,
    Authenticated,
    require_csrf,
    require_permission,
    require_trusted_origin,
)
from koranco.identity.models import ApplicationUser
from koranco.identity.permissions import Permission
from koranco.identity.schemas import AuthenticatedSessionResponse, LoginRequest
from koranco.identity.security import CSRF_COOKIE, hash_token, tokens_match
from koranco.identity.service import (
    AuthenticationFailed,
    LoginRateLimited,
    authenticate,
    record_security_event,
)

router = APIRouter(prefix="/api/v1")


def session_response(user: ApplicationUser, csrf_token: str) -> AuthenticatedSessionResponse:
    return AuthenticatedSessionResponse(
        id=user.id,
        login_identifier=user.login_identifier,
        display_name=user.display_name,
        permissions=sorted(item.permission for item in user.permissions),
        role=user.role,
        password_change_required=user.password_change_required,
        csrf_token=csrf_token,
    )


@router.post("/auth/login", response_model=AuthenticatedSessionResponse)
def login(
    payload: LoginRequest, request: Request, response: Response, db: DatabaseSession
) -> AuthenticatedSessionResponse:
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

    set_auth_cookies(
        response,
        get_settings(),
        session_token=new_session.session_token,
        csrf_token=new_session.csrf_token,
    )
    return session_response(new_session.user, new_session.csrf_token)


@router.get("/auth/session", response_model=AuthenticatedSessionResponse)
def current_session(request: Request, auth: Authenticated) -> AuthenticatedSessionResponse:
    csrf_token = request.cookies.get(CSRF_COOKIE, "")
    if not csrf_token or not tokens_match(hash_token(csrf_token), auth.session.csrf_token_hash):
        # The browser needs the complete cookie pair for a usable authenticated
        # session. Keep the response generic rather than accepting or echoing an
        # unverified token supplied by the client.
        raise HTTPException(status_code=401, detail="Authentication required")
    return session_response(auth.user, csrf_token)


@router.post("/auth/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
) -> None:
    auth.session.revoked_at = datetime.now(UTC)
    record_security_event(db, "logout", auth.user, request.state.request_id)
    clear_auth_cookies(response, get_settings())


@router.get("/system/status")
def protected_status(
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.SYSTEM_STATUS_READ))],
) -> dict[str, str]:
    return {"status": "foundation"}
