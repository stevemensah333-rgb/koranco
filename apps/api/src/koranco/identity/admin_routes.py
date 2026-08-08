import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from koranco.identity.admin_schemas import (
    ChangeOwnPasswordRequest,
    CreateUserRequest,
    PasswordResetRequest,
    RoleChangeRequest,
    SecurityEventListResponse,
    SecurityEventResponse,
    SensitiveActionRequest,
    UserListResponse,
    UserResponse,
)
from koranco.identity.administration import (
    change_role,
    create_user,
    load_user,
    require_recent_auth,
    reset_password,
    revoke_sessions,
    set_account_status,
)
from koranco.identity.dependencies import (
    AuthContext,
    DatabaseSession,
    require_csrf,
    require_permission,
)
from koranco.identity.models import ApplicationSession, ApplicationUser, SecurityEvent
from koranco.identity.passwords import hash_password, verify_password
from koranco.identity.permissions import Permission, Role
from koranco.identity.service import record_security_event

router = APIRouter(prefix="/api/v1")


def response_for_user(user: ApplicationUser) -> UserResponse:
    return UserResponse(
        id=user.id,
        login_identifier=user.login_identifier,
        display_name=user.display_name,
        role=Role(user.role),
        status=user.status,
        password_change_required=user.password_change_required,
        created_at=user.created_at,
    )


@router.get("/admin/users", response_model=UserListResponse)
def list_users(
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.USERS_READ))],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> UserListResponse:
    total = db.scalar(select(func.count()).select_from(ApplicationUser)) or 0
    users = db.scalars(
        select(ApplicationUser)
        .order_by(ApplicationUser.display_name, ApplicationUser.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return UserListResponse(items=[response_for_user(user) for user in users], total=total)


@router.get("/admin/users/{user_id}", response_model=UserResponse)
def view_user(
    user_id: uuid.UUID,
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.USERS_READ))],
) -> UserResponse:
    return response_for_user(load_user(db, user_id))


@router.post("/admin/users", response_model=UserResponse, status_code=201)
def add_user(
    payload: CreateUserRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.USERS_CREATE))],
) -> UserResponse:
    if payload.role == Role.MANAGER:
        require_recent_auth(auth.user, auth.session.created_at, payload.current_password)
    try:
        with db.begin_nested():
            user = create_user(
                db,
                auth.user,
                payload.login_identifier,
                payload.display_name,
                payload.role,
                payload.initial_password,
                request.state.request_id,
            )
            db.flush()
    except (ValueError, IntegrityError) as exc:
        raise HTTPException(status_code=409, detail="Login identifier is unavailable") from exc
    return response_for_user(user)


@router.post("/admin/users/{user_id}/role", response_model=UserResponse)
def update_role(
    user_id: uuid.UUID,
    payload: RoleChangeRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.ROLES_ASSIGN))],
) -> UserResponse:
    target = load_user(db, user_id)
    if target.role == Role.MANAGER or payload.role == Role.MANAGER:
        require_recent_auth(auth.user, auth.session.created_at, payload.current_password)
    change_role(db, auth.user, target, payload.role, request.state.request_id)
    return response_for_user(target)


@router.post("/admin/users/{user_id}/disable", response_model=UserResponse)
def disable_user(
    user_id: uuid.UUID,
    payload: SensitiveActionRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.USERS_DISABLE))],
) -> UserResponse:
    target = load_user(db, user_id)
    if target.role == Role.MANAGER:
        require_recent_auth(auth.user, auth.session.created_at, payload.current_password)
    set_account_status(db, auth.user, target, "disabled", request.state.request_id)
    return response_for_user(target)


@router.post("/admin/users/{user_id}/reactivate", response_model=UserResponse)
def reactivate_user(
    user_id: uuid.UUID,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.USERS_REACTIVATE))],
) -> UserResponse:
    target = load_user(db, user_id)
    set_account_status(db, auth.user, target, "active", request.state.request_id)
    return response_for_user(target)


@router.post("/admin/users/{user_id}/reset-password", status_code=204)
def manager_reset_password(
    user_id: uuid.UUID,
    payload: PasswordResetRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.USERS_UPDATE))],
) -> None:
    target = load_user(db, user_id)
    if target.role == Role.MANAGER:
        require_recent_auth(auth.user, auth.session.created_at, payload.current_password)
    reset_password(db, auth.user, target, payload.replacement_password, request.state.request_id)


@router.post("/admin/users/{user_id}/sessions/revoke", status_code=204)
def revoke_user_sessions(
    user_id: uuid.UUID,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
    _permission: Annotated[AuthContext, Depends(require_permission(Permission.SESSIONS_REVOKE))],
) -> None:
    target = load_user(db, user_id)
    revoke_sessions(db, target.id)
    record_security_event(db, "sessions_revoked", auth.user, request.state.request_id, target)


@router.get("/admin/security-events", response_model=SecurityEventListResponse)
def list_security_events(
    db: DatabaseSession,
    _auth: Annotated[AuthContext, Depends(require_permission(Permission.SECURITY_EVENTS_READ))],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SecurityEventListResponse:
    total = db.scalar(select(func.count()).select_from(SecurityEvent)) or 0
    events = db.scalars(
        select(SecurityEvent)
        .order_by(SecurityEvent.occurred_at.desc(), SecurityEvent.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return SecurityEventListResponse(
        items=[
            SecurityEventResponse(
                id=e.id,
                event_type=e.event_type,
                actor_user_id=e.user_id,
                subject_user_id=e.subject_user_id,
                details=e.details,
                occurred_at=e.occurred_at,
            )
            for e in events
        ],
        total=total,
    )


@router.post("/auth/change-password", status_code=204)
def change_own_password(
    payload: ChangeOwnPasswordRequest,
    request: Request,
    db: DatabaseSession,
    auth: Annotated[AuthContext, Depends(require_csrf)],
) -> None:
    if not verify_password(auth.user.password_hash, payload.current_password):
        raise HTTPException(status_code=400, detail="Current password is not valid")
    auth.user.password_hash = hash_password(payload.new_password)
    auth.user.password_change_required = False
    db.execute(
        update(ApplicationSession)
        .where(
            ApplicationSession.user_id == auth.user.id,
            ApplicationSession.id != auth.session.id,
            ApplicationSession.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    record_security_event(db, "password_changed", auth.user, request.state.request_id, auth.user)
