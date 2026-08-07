from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from koranco.config.settings import get_settings
from koranco.db.session import get_db_session
from koranco.identity.models import ApplicationSession, ApplicationUser
from koranco.identity.permissions import Permission
from koranco.identity.security import (
    CSRF_COOKIE,
    CSRF_HEADER,
    SESSION_COOKIE,
    hash_token,
    tokens_match,
)
from koranco.identity.service import record_security_event


@dataclass(frozen=True)
class AuthContext:
    user: ApplicationUser
    session: ApplicationSession


DatabaseSession = Annotated[Session, Depends(get_db_session)]


def require_trusted_origin(request: Request) -> None:
    origin = request.headers.get("Origin")
    if origin not in get_settings().csrf_trusted_origins:
        raise HTTPException(status_code=403, detail="Request origin is not allowed")


def require_authenticated_user(request: Request, db: DatabaseSession) -> AuthContext:
    raw_token = request.cookies.get(SESSION_COOKIE)
    if not raw_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    application_session = db.scalar(
        select(ApplicationSession)
        .options(selectinload(ApplicationSession.user).selectinload(ApplicationUser.permissions))
        .where(ApplicationSession.token_hash == hash_token(raw_token))
    )
    now = datetime.now(UTC)
    if (
        application_session is None
        or application_session.revoked_at is not None
        or application_session.expires_at <= now
    ):
        raise HTTPException(status_code=401, detail="Authentication required")
    if application_session.user.status != "active":
        application_session.revoked_at = now
        record_security_event(
            db,
            "session_revoked_disabled_account",
            application_session.user,
            request.state.request_id,
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Authentication required")
    return AuthContext(user=application_session.user, session=application_session)


Authenticated = Annotated[AuthContext, Depends(require_authenticated_user)]


def require_csrf(request: Request, auth: Authenticated) -> AuthContext:
    require_trusted_origin(request)
    cookie_token = request.cookies.get(CSRF_COOKIE, "")
    header_token = request.headers.get(CSRF_HEADER, "")
    if (
        not cookie_token
        or not header_token
        or not tokens_match(cookie_token, header_token)
        or not tokens_match(hash_token(header_token), auth.session.csrf_token_hash)
    ):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
    return auth


def require_permission(permission: Permission) -> Callable[[AuthContext], AuthContext]:
    def dependency(auth: Authenticated) -> AuthContext:
        if auth.user.password_change_required:
            raise HTTPException(status_code=403, detail="Password change required")
        granted = {item.permission for item in auth.user.permissions}
        if permission not in granted:
            raise HTTPException(status_code=403, detail="Permission denied")
        return auth

    return dependency
