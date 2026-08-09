import asyncio
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
from tests.helpers import PASSWORD, client_for, write

TODAY = "2026-08-07"


@pytest.fixture(autouse=True)
def clean_identity() -> None:
    with SessionFactory.begin() as db:
        db.execute(delete(LoginAttempt))
        db.execute(delete(SecurityEvent))
        db.execute(delete(ApplicationSession))
        db.execute(delete(UserPermission))
        db.execute(delete(ApplicationUser))


def setup() -> tuple[ApplicationUser, FarmUnit, FarmUnit, FarmUnit]:
    with SessionFactory.begin() as db:
        users = []
        for login, role in (
            ("manager", Role.MANAGER),
            ("supervisor", Role.SUPERVISOR),
            ("app.worker", Role.WORKER),
        ):
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
        field = FarmUnit(
            code="FIELD-1",
            name="Field One",
            unit_type="field",
            status="active",
            created_by=users[0].id,
            updated_by=users[0].id,
        )
        standalone = FarmUnit(
            code="FIELD-2",
            name="Field Two",
            unit_type="field",
            status="active",
            created_by=users[0].id,
            updated_by=users[0].id,
        )
        db.add_all([field, standalone])
        db.flush()
        block = FarmUnit(
            code="BLOCK-1",
            name="Block One",
            unit_type="block",
            parent_id=field.id,
            status="active",
            created_by=users[0].id,
            updated_by=users[0].id,
        )
        db.add(block)
        db.flush()
        for item in (users[0], field, block, standalone):
            db.expunge(item)
        return users[0], field, block, standalone


def values(unit_id: Any, quantity: str = "12", unit: str = "fruit_count") -> dict[str, Any]:
    return {
        "harvest_date": TODAY,
        "farm_unit_id": str(unit_id),
        "quantity": quantity,
        "unit": unit,
        "notes": "Morning harvest",
    }


def test_roles_validation_and_unit_semantics() -> None:
    _, _, block, _ = setup()

    async def flow() -> None:
        for login in ("manager", "supervisor"):
            client = await client_for(login)
            assert (
                await write(client, "POST", "/api/v1/harvest-records", values(block.id))
            ).status_code == 201
            await client.aclose()
        worker = await client_for("app.worker")
        assert (
            await write(worker, "POST", "/api/v1/harvest-records", values(block.id))
        ).status_code == 403
        assert (await worker.get("/api/v1/harvest-records")).status_code == 403
        await worker.aclose()
        manager = await client_for("manager")
        for quantity in ("0", "-1"):
            assert (
                await write(manager, "POST", "/api/v1/harvest-records", values(block.id, quantity))
            ).status_code == 422
        assert (
            await write(manager, "POST", "/api/v1/harvest-records", values(block.id, "1.5"))
        ).status_code == 422
        assert (
            await write(
                manager, "POST", "/api/v1/harvest-records", values(block.id, "1.125", "kilograms")
            )
        ).status_code == 201
        bad = values(block.id)
        bad["unit"] = "crates"
        assert (await write(manager, "POST", "/api/v1/harvest-records", bad)).status_code == 422
        missing = values("00000000-0000-0000-0000-000000000001")
        assert (await write(manager, "POST", "/api/v1/harvest-records", missing)).status_code == 422
        await manager.aclose()

    asyncio.run(flow())


def test_submission_specific_unit_inactive_repeat_and_multiple_same_day() -> None:
    _, field, block, standalone = setup()

    async def flow() -> None:
        client = await client_for("supervisor")
        field_draft = (
            await write(client, "POST", "/api/v1/harvest-records", values(field.id))
        ).json()
        denied = await write(client, "POST", f"/api/v1/harvest-records/{field_draft['id']}/submit")
        assert denied.status_code == 409
        assert "active child Blocks" in denied.json()["error"]["message"]
        inactive_draft = (
            await write(client, "POST", "/api/v1/harvest-records", values(standalone.id))
        ).json()
        with SessionFactory.begin() as db:
            db.get(FarmUnit, standalone.id).status = "inactive"  # type: ignore[union-attr]
        assert (
            await write(client, "POST", f"/api/v1/harvest-records/{inactive_draft['id']}/submit")
        ).status_code == 409
        submissions = []
        for amount in ("12", "13"):
            draft = (
                await write(client, "POST", "/api/v1/harvest-records", values(block.id, amount))
            ).json()
            submitted = await write(client, "POST", f"/api/v1/harvest-records/{draft['id']}/submit")
            assert submitted.status_code == 200
            submissions.append(submitted.json())
        repeated = await write(
            client, "POST", f"/api/v1/harvest-records/{submissions[0]['id']}/submit"
        )
        assert (
            repeated.status_code == 200
            and repeated.json()["submitted_at"] == submissions[0]["submitted_at"]
        )
        assert (
            await write(
                client,
                "PUT",
                f"/api/v1/harvest-records/{submissions[0]['id']}/draft",
                {**values(block.id), "expected_version": submissions[0]["version"]},
            )
        ).status_code == 409
        assert (
            await write(client, "POST", f"/api/v1/harvest-records/{submissions[0]['id']}/discard")
        ).status_code == 409
        assert (
            await client.delete(f"/api/v1/harvest-records/{submissions[0]['id']}")
        ).status_code == 405
        await client.aclose()

    asyncio.run(flow())
    with SessionFactory() as db:
        assert (
            len(db.scalars(select(HarvestRecord).where(HarvestRecord.status == "submitted")).all())
            == 2
        )
        assert (
            len(
                db.scalars(
                    select(OperationalAuditEvent).where(OperationalAuditEvent.action == "submitted")
                ).all()
            )
            == 2
        )


def test_draft_update_correction_conflict_history_and_historical_inactive() -> None:
    _, _, block, standalone = setup()

    async def flow() -> None:
        client = await client_for("manager")
        draft = (await write(client, "POST", "/api/v1/harvest-records", values(block.id))).json()
        updated = await write(
            client,
            "PUT",
            f"/api/v1/harvest-records/{draft['id']}/draft",
            {**values(block.id, "20"), "expected_version": draft["version"]},
        )
        assert updated.status_code == 200 and updated.json()["quantity"] == "20.000"
        assert (
            await write(
                client,
                "PUT",
                f"/api/v1/harvest-records/{draft['id']}/draft",
                {**values(block.id), "expected_version": draft["version"]},
            )
        ).status_code == 409
        submitted = (
            await write(client, "POST", f"/api/v1/harvest-records/{draft['id']}/submit")
        ).json()
        no_reason = {
            **values(standalone.id, "22"),
            "expected_version": submitted["version"],
            "reason": "",
            "confirmed": True,
        }
        assert (
            await write(client, "POST", f"/api/v1/harvest-records/{draft['id']}/correct", no_reason)
        ).status_code == 422
        correction = {
            **values(standalone.id, "22"),
            "harvest_date": "2026-08-08",
            "expected_version": submitted["version"],
            "reason": "Corrected source form",
            "confirmed": True,
        }
        corrected = await write(
            client, "POST", f"/api/v1/harvest-records/{draft['id']}/correct", correction
        )
        assert corrected.status_code == 200 and corrected.json()["farm_unit_id"] == str(
            standalone.id
        )
        assert (
            await write(
                client, "POST", f"/api/v1/harvest-records/{draft['id']}/correct", correction
            )
        ).status_code == 409
        with SessionFactory.begin() as db:
            db.get(FarmUnit, standalone.id).status = "inactive"  # type: ignore[union-attr]
        historical = await client.get(f"/api/v1/harvest-records/{draft['id']}")
        assert historical.status_code == 200 and historical.json()["farm_unit_active"] is False
        history = await client.get(f"/api/v1/harvest-records/{draft['id']}/audit")
        event = next(item for item in history.json()["items"] if item["action"] == "corrected")
        assert (
            event["reason"] == "Corrected source form"
            and event["before_state"]["quantity"] == "20.000"
            and event["after_state"]["quantity"] == "22.000"
        )
        await client.aclose()

    asyncio.run(flow())


def test_filters_pagination_discard_and_bounded_list() -> None:
    _, _, block, standalone = setup()

    async def flow() -> None:
        client = await client_for("manager")
        for index in range(5):
            payload = values(
                block.id if index < 4 else standalone.id,
                str(index + 1),
                "kilograms" if index % 2 else "fruit_count",
            )
            draft = (await write(client, "POST", "/api/v1/harvest-records", payload)).json()
            if index < 3:
                await write(client, "POST", f"/api/v1/harvest-records/{draft['id']}/submit")
        page = await client.get(f"/api/v1/harvest-records?farm_unit_id={block.id}&limit=2&offset=1")
        assert (
            page.status_code == 200 and page.json()["total"] == 4 and len(page.json()["items"]) == 2
        )
        units = await client.get("/api/v1/harvest-records?unit=kilograms")
        assert units.json()["total"] == 2
        draft_id = (await client.get("/api/v1/harvest-records?status=draft&limit=1")).json()[
            "items"
        ][0]["id"]
        assert (
            await write(client, "POST", f"/api/v1/harvest-records/{draft_id}/discard")
        ).status_code == 204
        assert (
            await client.get("/api/v1/harvest-records?date_from=2026-08-09&date_to=2026-08-01")
        ).status_code == 422
        await client.aclose()

    asyncio.run(flow())
