import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session, selectinload

from koranco.identity.models import ApplicationSession, ApplicationUser, UserPermission
from koranco.identity.passwords import hash_password, verify_password
from koranco.identity.permissions import Role, permissions_for_role
from koranco.identity.security import normalize_login_identifier
from koranco.identity.service import record_security_event

# Arbitrary unique key serializing Manager demotion/disable transactions so
# concurrent administrators cannot leave the system without an active Manager.
MANAGER_INVARIANT_LOCK = 4_891_317
RECENT_AUTHENTICATION_MINUTES = 15


def load_user(session: Session, user_id: uuid.UUID) -> ApplicationUser:
    user = session.scalar(
        select(ApplicationUser)
        .options(selectinload(ApplicationUser.permissions))
        .where(ApplicationUser.id == user_id)
    )
    if user is None:
        raise HTTPException(status_code=404, detail="Application user not found")
    return user


def replace_role_permissions(user: ApplicationUser, role: Role) -> None:
    user.role = role
    user.permissions = [UserPermission(permission=value) for value in permissions_for_role(role)]


def revoke_sessions(session: Session, user_id: uuid.UUID) -> None:
    session.execute(
        update(ApplicationSession)
        .where(ApplicationSession.user_id == user_id, ApplicationSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


def require_recent_auth(
    actor: ApplicationUser, authenticated_at: datetime, password: str | None
) -> None:
    recent = authenticated_at >= datetime.now(UTC) - timedelta(
        minutes=RECENT_AUTHENTICATION_MINUTES
    )
    if recent or (password and verify_password(actor.password_hash, password)):
        return
    raise HTTPException(status_code=403, detail="Recent authentication required")


def lock_manager_invariant(session: Session) -> None:
    session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": MANAGER_INVARIANT_LOCK})


def ensure_not_final_active_manager(session: Session, target: ApplicationUser) -> None:
    if target.role != Role.MANAGER or target.status != "active":
        return
    lock_manager_invariant(session)
    active_managers = session.scalar(
        select(func.count())
        .select_from(ApplicationUser)
        .where(ApplicationUser.role == Role.MANAGER, ApplicationUser.status == "active")
    )
    if active_managers is None or active_managers <= 1:
        raise HTTPException(status_code=409, detail="The final active Manager must be preserved")


def create_user(
    session: Session,
    actor: ApplicationUser,
    login: str,
    display_name: str,
    role: Role,
    initial_password: str,
    request_id: str | None,
) -> ApplicationUser:
    user = ApplicationUser(
        login_identifier=normalize_login_identifier(login),
        display_name=display_name.strip(),
        password_hash=hash_password(initial_password),
        status="active",
        role=role,
        password_change_required=True,
    )
    replace_role_permissions(user, role)
    session.add(user)
    session.flush()
    record_security_event(session, "account_created", actor, request_id, user)
    return user


def change_role(
    session: Session,
    actor: ApplicationUser,
    target: ApplicationUser,
    role: Role,
    request_id: str | None,
) -> None:
    if target.role == role:
        return
    if target.role == Role.MANAGER:
        ensure_not_final_active_manager(session, target)
    replace_role_permissions(target, role)
    revoke_sessions(session, target.id)
    record_security_event(session, "role_changed", actor, request_id, target)


def set_account_status(
    session: Session,
    actor: ApplicationUser,
    target: ApplicationUser,
    status: str,
    request_id: str | None,
) -> None:
    if target.status == status:
        return
    if status == "disabled":
        ensure_not_final_active_manager(session, target)
        revoke_sessions(session, target.id)
        event = "account_disabled"
    else:
        event = "account_reactivated"
    target.status = status
    record_security_event(session, event, actor, request_id, target)


def reset_password(
    session: Session,
    actor: ApplicationUser,
    target: ApplicationUser,
    replacement_password: str,
    request_id: str | None,
) -> None:
    target.password_hash = hash_password(replacement_password)
    target.password_change_required = True
    revoke_sessions(session, target.id)
    record_security_event(session, "password_reset", actor, request_id, target)
