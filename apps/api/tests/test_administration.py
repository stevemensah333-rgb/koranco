import asyncio
import threading
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import delete, select

from koranco.db.session import SessionFactory
from koranco.identity.administration import change_role, load_user
from koranco.identity.models import (
    ApplicationSession,
    ApplicationUser,
    LoginAttempt,
    SecurityEvent,
    UserPermission,
)
from koranco.identity.permissions import Role
from koranco.main import app
from tests.helpers import ORIGIN, PASSWORD, add_user


@pytest.fixture(autouse=True)
def clean() -> None:
    with SessionFactory.begin() as db:
        db.execute(delete(LoginAttempt))
        db.execute(delete(SecurityEvent))
        db.execute(delete(ApplicationSession))
        db.execute(delete(UserPermission))
        db.execute(delete(ApplicationUser))


async def authenticated_client(login: str) -> AsyncClient:
    client = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    response = await client.post(
        "/api/v1/auth/login",
        headers={"Origin": ORIGIN},
        json={"login_identifier": login, "password": PASSWORD},
    )
    assert response.status_code == 200
    return client


def mutate(
    client: AsyncClient, method: str, path: str, payload: dict[str, str] | None = None
) -> Response:
    return asyncio.run(
        client.request(
            method,
            path,
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=payload,
        )
    )


def test_manager_creates_account_and_non_managers_are_denied() -> None:
    add_user("manager", Role.MANAGER)
    add_user("supervisor", Role.SUPERVISOR)
    add_user("worker", Role.WORKER)
    payload = {
        "login_identifier": "new.user",
        "display_name": "New User",
        "role": "supervisor",
        "initial_password": "temporary secure password",
    }
    manager = asyncio.run(authenticated_client("manager"))
    created = mutate(manager, "POST", "/api/v1/admin/users", payload)
    assert created.status_code == 201 and created.json()["password_change_required"] is True
    assert "password_hash" not in created.text
    assert "temporary secure password" not in created.text
    for login in ("supervisor", "worker"):
        client = asyncio.run(authenticated_client(login))
        assert mutate(client, "POST", "/api/v1/admin/users", payload).status_code == 403
        asyncio.run(client.aclose())
    asyncio.run(manager.aclose())


def test_invalid_role_rejected_and_security_events_restricted() -> None:
    add_user("manager", Role.MANAGER)
    add_user("supervisor", Role.SUPERVISOR)
    manager = asyncio.run(authenticated_client("manager"))
    invalid = mutate(
        manager,
        "POST",
        "/api/v1/admin/users",
        {
            "login_identifier": "bad.role",
            "display_name": "Bad Role",
            "role": "administrator",
            "initial_password": "temporary secure password",
        },
    )
    assert invalid.status_code == 422
    supervisor = asyncio.run(authenticated_client("supervisor"))
    assert asyncio.run(supervisor.get("/api/v1/admin/security-events")).status_code == 403
    assert asyncio.run(manager.get("/api/v1/admin/security-events")).status_code == 200
    asyncio.run(manager.aclose())
    asyncio.run(supervisor.aclose())


def test_disable_reactivate_role_change_reset_and_session_revoke() -> None:
    add_user("manager", Role.MANAGER)
    target = add_user("target", Role.SUPERVISOR)
    manager = asyncio.run(authenticated_client("manager"))
    target_client = asyncio.run(authenticated_client("target"))
    disabled = mutate(manager, "POST", f"/api/v1/admin/users/{target.id}/disable", {})
    assert (
        disabled.status_code == 200
        and asyncio.run(target_client.get("/api/v1/auth/session")).status_code == 401
    )
    reactivated = mutate(manager, "POST", f"/api/v1/admin/users/{target.id}/reactivate", {})
    assert (
        reactivated.status_code == 200
        and asyncio.run(target_client.get("/api/v1/auth/session")).status_code == 401
    )
    target_client = asyncio.run(authenticated_client("target"))
    changed = mutate(manager, "POST", f"/api/v1/admin/users/{target.id}/role", {"role": "worker"})
    assert (
        changed.status_code == 200
        and asyncio.run(target_client.get("/api/v1/auth/session")).status_code == 401
    )
    target_client = asyncio.run(authenticated_client("target"))
    reset = mutate(
        manager,
        "POST",
        f"/api/v1/admin/users/{target.id}/reset-password",
        {"replacement_password": "replacement secure password"},
    )
    assert (
        reset.status_code == 204
        and asyncio.run(target_client.get("/api/v1/auth/session")).status_code == 401
    )
    with SessionFactory() as db:
        types = set(db.scalars(select(SecurityEvent.event_type)).all())
        assert {
            "account_disabled",
            "account_reactivated",
            "role_changed",
            "password_reset",
        } <= types
    asyncio.run(manager.aclose())
    asyncio.run(target_client.aclose())


def test_final_manager_cannot_be_disabled_or_demoted() -> None:
    manager_user = add_user("manager", Role.MANAGER)
    manager = asyncio.run(authenticated_client("manager"))
    assert (
        mutate(manager, "POST", f"/api/v1/admin/users/{manager_user.id}/disable", {}).status_code
        == 409
    )
    assert (
        mutate(
            manager, "POST", f"/api/v1/admin/users/{manager_user.id}/role", {"role": "supervisor"}
        ).status_code
        == 409
    )
    asyncio.run(manager.aclose())


def test_sensitive_manager_action_requires_recent_authentication() -> None:
    manager_user = add_user("manager", Role.MANAGER)
    target = add_user("target", Role.SUPERVISOR)
    manager = asyncio.run(authenticated_client("manager"))
    with SessionFactory.begin() as db:
        session = db.scalar(
            select(ApplicationSession).where(ApplicationSession.user_id == manager_user.id)
        )
        assert session
        session.created_at = datetime.now(UTC) - timedelta(minutes=20)
    denied = mutate(manager, "POST", f"/api/v1/admin/users/{target.id}/role", {"role": "manager"})
    allowed = mutate(
        manager,
        "POST",
        f"/api/v1/admin/users/{target.id}/role",
        {"role": "manager", "current_password": PASSWORD},
    )
    assert denied.status_code == 403 and allowed.status_code == 200
    asyncio.run(manager.aclose())


def test_concurrent_manager_demotions_preserve_one_active_manager() -> None:
    first = add_user("first.manager", Role.MANAGER)
    second = add_user("second.manager", Role.MANAGER)
    barrier = threading.Barrier(2)
    outcomes: list[str] = []

    def demote(target_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        try:
            with SessionFactory.begin() as db:
                target = load_user(db, target_id)
                actor = load_user(db, actor_id)
                barrier.wait()
                change_role(db, actor, target, Role.SUPERVISOR, "concurrency-test")
            outcomes.append("changed")
        except Exception:
            outcomes.append("blocked")

    one = threading.Thread(target=demote, args=(first.id, second.id))
    two = threading.Thread(target=demote, args=(second.id, first.id))
    one.start()
    two.start()
    one.join()
    two.join()
    assert sorted(outcomes) == ["blocked", "changed"]
    with SessionFactory() as db:
        active = db.scalars(
            select(ApplicationUser).where(
                ApplicationUser.role == Role.MANAGER, ApplicationUser.status == "active"
            )
        ).all()
        assert len(active) == 1
