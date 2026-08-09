import asyncio
import uuid
from typing import Any

import pytest
from sqlalchemy import delete, select

from koranco.db.session import SessionFactory
from koranco.farm_structure.models import FarmUnit
from koranco.harvest.models import HarvestRecord
from koranco.identity.models import (
    ApplicationSession,
    ApplicationUser,
    LoginAttempt,
    SecurityEvent,
    UserPermission,
)
from koranco.identity.passwords import hash_password
from koranco.identity.permissions import Role, permissions_for_role
from koranco.operational_audit.models import OperationalAuditEvent
from tests.helpers import ORIGIN, PASSWORD, client_for

TODAY = "2026-08-07"


@pytest.fixture(autouse=True)
def clean_identity_and_master_tables() -> None:
    with SessionFactory.begin() as db:
        db.execute(delete(LoginAttempt))
        db.execute(delete(SecurityEvent))
        db.execute(delete(ApplicationSession))
        db.execute(delete(UserPermission))
        db.execute(delete(ApplicationUser))
        # master tables truncated by global conftest, but ensure harvest table clean
        db.execute(delete(HarvestRecord))


def setup() -> tuple[ApplicationUser, FarmUnit]:
    with SessionFactory.begin() as db:
        users = []
        for login, role in (("supervisor.a", Role.SUPERVISOR), ("manager.a", Role.MANAGER)):
            user = ApplicationUser(
                login_identifier=login,
                display_name=login.title(),
                password_hash=hash_password(PASSWORD),
                status="active",
                role=role,
            )
            user.permissions.extend(
                UserPermission(permission=p) for p in permissions_for_role(role)
            )
            db.add(user)
            users.append(user)
        db.flush()
        # ensure the primary test user has explicit harvest.record permission for sync tests
        # ensure the primary test user has explicit harvest.record permission for sync tests
        if not any(p.permission == "harvest.record" for p in users[0].permissions):
            users[0].permissions.append(UserPermission(permission="harvest.record"))
        db.flush()
        field = FarmUnit(
            code="E2E-FIELD",
            name="E2E Field",
            unit_type="field",
            status="active",
            created_by=users[0].id,
            updated_by=users[0].id,
        )
        db.add(field)
        db.flush()
        db.expunge(users[0])
        db.expunge(field)
        return users[0], field


def make_payload(
    op_id: uuid.UUID,
    record_id: uuid.UUID,
    farm_unit_id: str | uuid.UUID,
    *,
    payload_version: int = 1,
    base_server_version: int | None = None,
) -> dict[str, Any]:
    return {
        "operation_id": str(op_id),
        "operation_type": "submit_harvest_snapshot",
        "harvest_record_id": str(record_id),
        "payload_version": payload_version,
        "harvest_date": TODAY,
        "farm_unit_id": str(farm_unit_id),
        "quantity": "5.000",
        "unit": "fruit_count",
        "notes": "From device",
        "base_server_version": base_server_version,
    }


def test_harvest_sync_applies_and_replays_after_response_loss_and_audits_once() -> None:
    user, field = setup()

    async def flow() -> None:
        client = await client_for(user.login_identifier)
        op_id = uuid.uuid4()
        record_id = uuid.uuid4()
        payload = make_payload(op_id, record_id, field.id)

        # first attempt: should apply
        r = await client.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=payload,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["result"] == "applied"

        # simulate response lost: retry same operation_id
        r2 = await client.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=payload,
        )
        assert r2.status_code == 200
        body2 = r2.json()
        assert body2["result"] in ("already_applied", "applied")

        # exactly one submitted record exists and exactly one submission audit
        with SessionFactory.begin() as db:
            rows = db.scalars(
                select(HarvestRecord).where(HarvestRecord.status == "submitted")
            ).all()
            assert len(rows) == 1
            audits = db.scalars(
                select(OperationalAuditEvent).where(OperationalAuditEvent.action == "submitted")
            ).all()
            assert len(audits) == 1
        await client.aclose()

    asyncio.run(flow())


def test_harvest_sync_rejects_cross_actor_replay_and_unsupported_version() -> None:
    user, field = setup()

    async def flow() -> None:
        client_a = await client_for(user.login_identifier)
        op_id = uuid.uuid4()
        record_id = uuid.uuid4()
        payload = make_payload(op_id, record_id, field.id)
        # apply under user A
        r = await client_a.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client_a.cookies["koranco_csrf"]},
            json=payload,
        )
        assert r.status_code == 200
        assert r.json()["result"] == "applied"
        await client_a.aclose()

        # user B (different actor) attempts same operation_id -> rejected
        client_b = await client_for("manager.a")
        r2 = await client_b.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client_b.cookies["koranco_csrf"]},
            json=payload,
        )
        assert r2.status_code == 200
        assert r2.json()["result"] == "rejected"

        # unsupported payload version stored as rejected
        payload2 = {**payload, "operation_id": str(uuid.uuid4()), "payload_version": 999}
        r3 = await client_b.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client_b.cookies["koranco_csrf"]},
            json=payload2,
        )
        assert r3.status_code == 200
        assert r3.json()["result"] == "rejected"
        await client_b.aclose()

    asyncio.run(flow())


def test_harvest_sync_conflicts_on_stale_version_and_inactive_farm_unit() -> None:
    user, field = setup()

    async def flow() -> None:
        client = await client_for(user.login_identifier)
        # create an on-server draft to advance version
        r = await client.post(
            "/api/v1/harvest-records",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json={
                "harvest_date": TODAY,
                "farm_unit_id": str(field.id),
                "quantity": "2.000",
                "unit": "kilograms",
            },
        )
        assert r.status_code == 201
        server_draft = r.json()
        # now change server draft to bump version
        put = await client.put(
            f"/api/v1/harvest-records/{server_draft['id']}/draft",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json={
                "harvest_date": TODAY,
                "farm_unit_id": str(field.id),
                "quantity": "3.000",
                "unit": "kilograms",
                "expected_version": server_draft["version"],
            },
        )
        assert put.status_code == 200
        # now a device with stale base_server_version attempts to submit
        op_id = uuid.uuid4()
        # submit against the same server draft id with a stale base_server_version
        record_id = uuid.UUID(server_draft["id"])
        stale_payload = make_payload(op_id, record_id, field.id, base_server_version=1)
        r2 = await client.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=stale_payload,
        )
        assert r2.status_code == 200
        assert r2.json()["result"] == "conflict"

        # deactivate farm unit and attempt submission -> conflict
        with SessionFactory.begin() as db:
            farm_unit = db.get(FarmUnit, field.id)
            assert farm_unit is not None
            farm_unit.status = "inactive"
        op2 = uuid.uuid4()
        rec2 = uuid.uuid4()
        payload2 = make_payload(op2, rec2, field.id)
        r3 = await client.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=payload2,
        )
        assert r3.status_code == 200
        assert r3.json()["result"] in ("conflict", "rejected")
        await client.aclose()

    asyncio.run(flow())
