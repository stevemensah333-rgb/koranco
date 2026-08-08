from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from koranco.config.settings import Settings
from koranco.identity.models import (
    ApplicationSession,
    ApplicationUser,
    LoginAttempt,
    SecurityEvent,
)
from koranco.identity.passwords import (
    hash_password,
    password_hash_needs_upgrade,
    verify_dummy_password,
    verify_password,
)
from koranco.identity.security import generate_token, hash_token, normalize_login_identifier


class AuthenticationFailed(Exception):
    pass


class LoginRateLimited(Exception):
    pass


@dataclass(frozen=True)
class NewSession:
    user: ApplicationUser
    session_token: str
    csrf_token: str


def record_security_event(
    session: Session,
    event_type: str,
    user: ApplicationUser | None,
    request_id: str | None,
    subject: ApplicationUser | None = None,
    details: dict[str, object] | None = None,
) -> None:
    session.add(
        SecurityEvent(
            event_type=event_type,
            user_id=user.id if user else None,
            subject_user_id=subject.id if subject else None,
            request_id=request_id,
            details=details,
        )
    )


def authenticate(
    session: Session,
    settings: Settings,
    login_identifier: str,
    password: str,
    request_id: str | None,
) -> NewSession:
    try:
        normalized = normalize_login_identifier(login_identifier)
    except ValueError:
        normalized = login_identifier.strip().casefold()[:64]
    identifier_hash = hash_token(normalized)
    window_start = datetime.now(UTC) - timedelta(minutes=settings.login_failure_window_minutes)
    failures = session.scalar(
        select(func.count())
        .select_from(LoginAttempt)
        .where(
            LoginAttempt.identifier_hash == identifier_hash,
            LoginAttempt.successful.is_(False),
            LoginAttempt.occurred_at >= window_start,
        )
    )
    if failures is not None and failures >= settings.login_failure_limit:
        record_security_event(session, "login_rate_limited", None, request_id)
        raise LoginRateLimited

    user = session.scalar(
        select(ApplicationUser)
        .options(selectinload(ApplicationUser.permissions))
        .where(ApplicationUser.login_identifier == normalized)
    )
    valid_password = verify_password(user.password_hash, password) if user else False
    if user is None:
        verify_dummy_password(password)

    if user is None or not valid_password or user.status != "active":
        session.add(LoginAttempt(identifier_hash=identifier_hash, successful=False))
        record_security_event(session, "login_failed", user, request_id)
        raise AuthenticationFailed

    if password_hash_needs_upgrade(user.password_hash):
        user.password_hash = hash_password(password)

    session.execute(delete(LoginAttempt).where(LoginAttempt.identifier_hash == identifier_hash))
    session_token = generate_token()
    csrf_token = generate_token()
    session.add(
        ApplicationSession(
            user_id=user.id,
            token_hash=hash_token(session_token),
            csrf_token_hash=hash_token(csrf_token),
            expires_at=datetime.now(UTC) + timedelta(hours=settings.session_ttl_hours),
        )
    )
    record_security_event(session, "login_succeeded", user, request_id)
    return NewSession(user=user, session_token=session_token, csrf_token=csrf_token)
