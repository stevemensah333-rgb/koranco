"""Shared helpers for the backend integration test suite.

Consolidates the user/worker/FarmUnit seeding and authenticated HTTP-client
helpers that several test modules previously redefined. Test files keep their
own autouse cleanup fixtures and domain-specific setup helpers; this module
holds only the genuinely shared pieces.
"""

from typing import Any

from httpx import ASGITransport, AsyncClient, Response

from koranco.db.session import SessionFactory
from koranco.farm_structure.models import FarmUnit
from koranco.identity.models import ApplicationUser, UserPermission
from koranco.identity.passwords import hash_password
from koranco.identity.permissions import Role, permissions_for_role
from koranco.main import app
from koranco.workers.models import Worker

ORIGIN = "http://test"
PASSWORD = "a long example password"


def add_user(login: str, role: Role, *, status: str = "active") -> ApplicationUser:
    with SessionFactory.begin() as db:
        user = ApplicationUser(
            login_identifier=login,
            display_name=login.title(),
            password_hash=hash_password(PASSWORD),
            status=status,
            role=role,
        )
        user.permissions.extend(UserPermission(permission=p) for p in permissions_for_role(role))
        db.add(user)
        db.flush()
        db.expunge(user)
        return user


def add_worker(
    code: str,
    actor_id: Any,
    *,
    full_name: str | None = None,
    active: bool = True,
) -> Worker:
    with SessionFactory.begin() as db:
        worker = Worker(
            worker_code=code,
            full_name=full_name or f"Worker {code}",
            status="active" if active else "inactive",
            created_by=actor_id,
            updated_by=actor_id,
        )
        db.add(worker)
        db.flush()
        db.expunge(worker)
        return worker


def add_farm_unit(
    code: str,
    name: str,
    unit_type: str,
    actor_id: Any,
    parent_id: Any = None,
) -> FarmUnit:
    with SessionFactory.begin() as db:
        unit = FarmUnit(
            code=code,
            name=name,
            unit_type=unit_type,
            parent_id=parent_id,
            status="active",
            created_by=actor_id,
            updated_by=actor_id,
        )
        db.add(unit)
        db.flush()
        db.expunge(unit)
        return unit


async def client_for(login: str) -> AsyncClient:
    """An authenticated API client for an existing application user."""
    client = AsyncClient(transport=ASGITransport(app=app), base_url=ORIGIN)
    assert (
        await client.post(
            "/api/v1/auth/login",
            headers={"Origin": ORIGIN},
            json={"login_identifier": login, "password": PASSWORD},
        )
    ).status_code == 200
    return client


async def write(
    client: AsyncClient,
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
) -> Response:
    """A state-changing request with the CSRF token from the login cookies."""
    return await client.request(
        method,
        path,
        headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
        json=payload,
    )
