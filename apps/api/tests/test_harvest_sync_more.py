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
def clean_tables() -> None:
    with SessionFactory.begin() as db:
        db.execute(delete(LoginAttempt))
        db.execute(delete(SecurityEvent))
        db.execute(delete(ApplicationSession))
        db.execute(delete(UserPermission))
        db.execute(delete(ApplicationUser))
        db.execute(delete(HarvestRecord))


def setup_user_and_field(role: Role = Role.SUPERVISOR) -> tuple[ApplicationUser, FarmUnit]:
    with SessionFactory.begin() as db:
        user = ApplicationUser(
            login_identifier="sync.user",
            display_name="Sync User",
            password_hash=hash_password(PASSWORD),
            status="active",
            role=role,
        )
        user.permissions.extend(UserPermission(permission=p) for p in permissions_for_role(role))
        if not any(p.permission == "harvest.record" for p in user.permissions):
            user.permissions.append(UserPermission(permission="harvest.record"))
        db.add(user)
        db.flush()
        field = FarmUnit(
            code="SYNC-FIELD",
            name="Sync Field",
            unit_type="field",
            status="active",
            created_by=user.id,
            updated_by=user.id,
        )
        db.add(field)
        db.flush()
        db.expunge(user)
        db.expunge(field)
        return user, field


def make_payload(
    op_id: uuid.UUID,
    record_id: uuid.UUID,
    farm_unit_id: str | uuid.UUID,
    *,
    payload_version: int = 1,
    base_server_version: int | None = None,
    quantity: str = "1.000",
    unit: str = "fruit_count",
) -> dict[str, Any]:
    return {
        "operation_id": str(op_id),
        "operation_type": "submit_harvest_snapshot",
        "harvest_record_id": str(record_id),
        "payload_version": payload_version,
        "harvest_date": TODAY,
        "farm_unit_id": str(farm_unit_id),
        "quantity": quantity,
        "unit": unit,
        "notes": "From device",
        "base_server_version": base_server_version,
    }


def test_concurrent_replay_is_idempotent() -> None:
    user, field = setup_user_and_field()

    async def flow() -> None:
        client = await client_for(user.login_identifier)
        op_id = uuid.uuid4()
        record_id = uuid.uuid4()
        payload = make_payload(op_id, record_id, field.id)

        # run two concurrent posts with same operation id
        async def post() -> Any:
            return await client.post(
                "/api/v1/harvest-records/sync",
                headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
                json=payload,
            )

        r1, r2 = await asyncio.gather(post(), post())
        assert r1.status_code == 200 and r2.status_code == 200
        # at least one must be applied and the other already_applied
        results = {r1.json().get("result"), r2.json().get("result")}
        assert "applied" in results
        assert results.issubset({"applied", "already_applied"})

        with SessionFactory.begin() as db:
            rows = db.scalars(
                select(HarvestRecord).where(HarvestRecord.status == "submitted")
            ).all()
            assert len(rows) == 1
        await client.aclose()

    asyncio.run(flow())


def test_same_record_uuid_equivalence_and_conflict() -> None:
    user, field = setup_user_and_field()

    async def flow() -> None:
        client = await client_for(user.login_identifier)
        record_id = uuid.uuid4()
        # first operation: create record
        op1 = uuid.uuid4()
        p1 = make_payload(op1, record_id, field.id, quantity="2.000")
        r1 = await client.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=p1,
        )
        assert r1.status_code == 200 and r1.json()["result"] == "applied"
        # second: same uuid and semantically identical -> already_applied
        op2 = uuid.uuid4()
        p2 = make_payload(op2, record_id, field.id, quantity="2.000")
        r2 = await client.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=p2,
        )
        assert r2.status_code == 200 and r2.json()["result"] in ("already_applied", "applied")
        # third: same uuid but different quantity -> conflict
        op3 = uuid.uuid4()
        p3 = make_payload(op3, record_id, field.id, quantity="3.000")
        r3 = await client.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=p3,
        )
        assert r3.status_code == 200
        assert r3.json()["result"] in ("conflict", "rejected")
        await client.aclose()

    asyncio.run(flow())


def test_disabled_account_and_revoked_permission() -> None:
    # create user and then disable or revoke permission
    with SessionFactory.begin() as db:
        user = ApplicationUser(
            login_identifier="disabled.user",
            display_name="Disabled",
            password_hash=hash_password(PASSWORD),
            status="active",
            role=Role.SUPERVISOR,
        )
        user.permissions.extend(
            UserPermission(permission=p) for p in permissions_for_role(Role.SUPERVISOR)
        )
        if not any(p.permission == "harvest.record" for p in user.permissions):
            user.permissions.append(UserPermission(permission="harvest.record"))
        db.add(user)
        db.flush()
        field = FarmUnit(
            code="DIS-F",
            name="Dis Field",
            unit_type="field",
            status="active",
            created_by=user.id,
            updated_by=user.id,
        )
        db.add(field)
        db.flush()
        db.expunge(user)
        db.expunge(field)

    async def flow() -> None:
        client = await client_for("disabled.user")
        op = uuid.uuid4()
        rec = uuid.uuid4()
        payload = make_payload(op, rec, field.id)
        # disable account server-side
        with SessionFactory.begin() as db:
            u = db.execute(
                select(ApplicationUser).where(ApplicationUser.login_identifier == "disabled.user")
            ).scalar_one()
            u.status = "disabled"
        r = await client.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=payload,
        )
        # expect authorization failure (401/403)
        assert r.status_code in (401, 403)
        # re-enable and then revoke permission
        with SessionFactory.begin() as db:
            u = db.execute(
                select(ApplicationUser).where(ApplicationUser.login_identifier == "disabled.user")
            ).scalar_one()
            u.status = "active"
            db.execute(
                delete(UserPermission).where(
                    UserPermission.user_id == u.id, UserPermission.permission == "harvest.record"
                )
            )
        r2 = await client.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=payload,
        )
        assert r2.status_code in (401, 403, 200)
        if r2.status_code == 200:
            assert r2.json()["result"] in ("rejected", "conflict")
        await client.aclose()

    asyncio.run(flow())


def test_missing_farmunit_unsupported_unit_and_invalid_quantity() -> None:
    user, field = setup_user_and_field()

    async def flow() -> None:
        client = await client_for(user.login_identifier)
        # missing farm unit
        op = uuid.uuid4()
        rec = uuid.uuid4()
        payload = make_payload(op, rec, "00000000-0000-0000-0000-000000000001")
        r = await client.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=payload,
        )
        assert r.status_code == 200
        assert r.json()["result"] in ("rejected", "conflict")

        # unsupported unit
        op2 = uuid.uuid4()
        rec2 = uuid.uuid4()
        payload2 = make_payload(op2, rec2, field.id, unit="crates")
        r2 = await client.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=payload2,
        )
        assert r2.status_code in (200, 422)
        if r2.status_code == 200:
            assert r2.json()["result"] in ("rejected", "conflict")

        # invalid quantity
        op3 = uuid.uuid4()
        rec3 = uuid.uuid4()
        payload3 = make_payload(op3, rec3, field.id, quantity="-1")
        r3 = await client.post(
            "/api/v1/harvest-records/sync",
            headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
            json=payload3,
        )
        assert r3.status_code in (200, 422)
        if r3.status_code == 200:
            assert r3.json()["result"] in ("rejected", "conflict")
        await client.aclose()

    asyncio.run(flow())


def test_multiple_same_date_same_farmunit_allowed() -> None:
    user, field = setup_user_and_field()

    async def flow() -> None:
        client = await client_for(user.login_identifier)
        ops = []
        for q in ("5.000", "6.000"):
            op = uuid.uuid4()
            rec = uuid.uuid4()
            payload = make_payload(op, rec, field.id, quantity=q)
            r = await client.post(
                "/api/v1/harvest-records/sync",
                headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
                json=payload,
            )
            assert r.status_code == 200 and r.json()["result"] == "applied"
            ops.append(r.json())
        # ensure two submitted records and two audits
        with SessionFactory.begin() as db:
            rows = db.scalars(
                select(HarvestRecord).where(HarvestRecord.status == "submitted")
            ).all()
            assert len(rows) >= 2
            audits = db.scalars(
                select(OperationalAuditEvent).where(OperationalAuditEvent.action == "submitted")
            ).all()
            assert len(audits) >= 2
        await client.aclose()

    asyncio.run(flow())
