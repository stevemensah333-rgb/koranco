import asyncio

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.exc import DBAPIError

from koranco.db.session import SessionFactory
from koranco.identity.models import (
    ApplicationSession,
    ApplicationUser,
    LoginAttempt,
    SecurityEvent,
    UserPermission,
)
from koranco.identity.permissions import Role
from koranco.operational_audit.models import OperationalAuditEvent
from tests.helpers import add_user, client_for, write


@pytest.fixture(autouse=True)
def clean_master_data() -> None:
    with SessionFactory.begin() as db:
        db.execute(delete(LoginAttempt))
        db.execute(delete(SecurityEvent))
        db.execute(delete(ApplicationSession))
        db.execute(delete(UserPermission))
        db.execute(delete(ApplicationUser))


def setup_roles() -> None:
    add_user("manager", Role.MANAGER)
    add_user("supervisor", Role.SUPERVISOR)
    add_user("app.worker", Role.WORKER)


def test_worker_permissions_create_update_lifecycle_and_audit() -> None:
    setup_roles()

    async def flow() -> None:
        manager = await client_for("manager")
        supervisor = await client_for("supervisor")
        worker_user = await client_for("app.worker")
        created = await write(
            manager,
            "POST",
            "/api/v1/workers",
            {"worker_code": "KOR-014", "full_name": "Ama Mensah"},
        )
        assert created.status_code == 201
        worker_id = created.json()["id"]
        assert (await supervisor.get("/api/v1/workers")).status_code == 200
        assert (await worker_user.get("/api/v1/workers")).status_code == 403
        assert (
            await write(
                supervisor, "POST", "/api/v1/workers", {"worker_code": "NO", "full_name": "Denied"}
            )
        ).status_code == 403
        updated = await write(
            manager,
            "PUT",
            f"/api/v1/workers/{worker_id}",
            {"worker_code": "KOR-014", "full_name": "Ama A. Mensah"},
        )
        assert updated.status_code == 200
        assert (
            await write(
                supervisor,
                "PUT",
                f"/api/v1/workers/{worker_id}",
                {"worker_code": "KOR-014", "full_name": "Denied"},
            )
        ).status_code == 403
        inactive = await write(
            manager,
            "POST",
            f"/api/v1/workers/{worker_id}/deactivate",
            {"reason": "No longer on active roster"},
        )
        assert inactive.json()["status"] == "inactive"
        assert (await manager.get(f"/api/v1/workers/{worker_id}")).status_code == 200
        active = await write(manager, "POST", f"/api/v1/workers/{worker_id}/reactivate", {})
        assert active.json()["status"] == "active"
        history = await manager.get(f"/api/v1/workers/{worker_id}/audit")
        assert history.status_code == 200 and history.json()["total"] == 4
        assert (await supervisor.get(f"/api/v1/workers/{worker_id}/audit")).status_code == 403
        assert (await manager.delete(f"/api/v1/workers/{worker_id}")).status_code == 405
        await manager.aclose()
        await supervisor.aclose()
        await worker_user.aclose()

    asyncio.run(flow())
    with SessionFactory() as db:
        events = db.scalars(
            select(OperationalAuditEvent).order_by(OperationalAuditEvent.occurred_at)
        ).all()
        assert events[1].before_state == {
            "worker_code": "KOR-014",
            "full_name": "Ama Mensah",
            "status": "active",
        }
        assert events[1].after_state and events[1].after_state["full_name"] == "Ama A. Mensah"
        assert events[0].actor_user_id is not None and "password" not in str(events[0].after_state)


def test_worker_duplicate_search_pagination_and_validation() -> None:
    add_user("manager", Role.MANAGER)

    async def flow() -> None:
        client = await client_for("manager")
        for code, name in [("KOR-A", "Ama One"), ("KOR-B", "Kojo Two")]:
            assert (
                await write(
                    client, "POST", "/api/v1/workers", {"worker_code": code, "full_name": name}
                )
            ).status_code == 201
        duplicate = await write(
            client,
            "POST",
            "/api/v1/workers",
            {"worker_code": "KOR-A", "full_name": "Different Name"},
        )
        assert duplicate.status_code == 409
        result = await client.get(
            "/api/v1/workers", params={"search": "kojo", "limit": 1, "offset": 0}
        )
        assert result.json()["total"] == 1 and result.json()["limit"] == 1
        invalid = await write(
            client, "POST", "/api/v1/workers", {"worker_code": "   ", "full_name": ""}
        )
        assert invalid.status_code == 422
        await client.aclose()

    asyncio.run(flow())


def test_farm_structure_hierarchy_validation_filters_lifecycle_and_audit() -> None:
    setup_roles()

    async def flow() -> None:
        manager = await client_for("manager")
        supervisor = await client_for("supervisor")
        app_worker = await client_for("app.worker")
        field = await write(
            manager,
            "POST",
            "/api/v1/farm-units",
            {"code": "F-01", "name": "North Field", "unit_type": "field", "parent_id": None},
        )
        assert field.status_code == 201
        field_id = field.json()["id"]
        block = await write(
            manager,
            "POST",
            "/api/v1/farm-units",
            {"code": "B-01", "name": "North Block", "unit_type": "block", "parent_id": field_id},
        )
        assert block.status_code == 201
        block_id = block.json()["id"]
        assert (await supervisor.get("/api/v1/farm-units")).status_code == 200
        assert (await app_worker.get("/api/v1/farm-units")).status_code == 403
        assert (
            await write(
                supervisor,
                "POST",
                "/api/v1/farm-units",
                {"code": "DENIED", "name": "Denied", "unit_type": "field"},
            )
        ).status_code == 403
        missing = await write(
            manager,
            "POST",
            "/api/v1/farm-units",
            {
                "code": "B-X",
                "name": "Bad parent",
                "unit_type": "block",
                "parent_id": "00000000-0000-0000-0000-000000000001",
            },
        )
        assert missing.status_code == 422
        self_parent = await write(
            manager,
            "PUT",
            f"/api/v1/farm-units/{field_id}",
            {"code": "F-01", "name": "North Field", "unit_type": "field", "parent_id": field_id},
        )
        assert self_parent.status_code == 422
        cycle = await write(
            manager,
            "PUT",
            f"/api/v1/farm-units/{field_id}",
            {"code": "F-01", "name": "North Field", "unit_type": "field", "parent_id": block_id},
        )
        assert cycle.status_code == 422
        duplicate = await write(
            manager,
            "POST",
            "/api/v1/farm-units",
            {"code": "B-01", "name": "Duplicate", "unit_type": "field"},
        )
        assert duplicate.status_code == 409
        await write(
            manager,
            "POST",
            f"/api/v1/farm-units/{field_id}/deactivate",
            {"reason": "Temporarily inactive"},
        )
        historical_child = await write(
            manager,
            "PUT",
            f"/api/v1/farm-units/{block_id}",
            {
                "code": "B-01",
                "name": "North Block Updated",
                "unit_type": "block",
                "parent_id": field_id,
            },
        )
        assert historical_child.status_code == 200
        bad_child = await write(
            manager,
            "POST",
            "/api/v1/farm-units",
            {"code": "B-02", "name": "New Block", "unit_type": "block", "parent_id": field_id},
        )
        assert bad_child.status_code == 422
        filtered = await manager.get(
            "/api/v1/farm-units", params={"status": "inactive", "unit_type": "field"}
        )
        assert filtered.json()["total"] == 1
        await write(manager, "POST", f"/api/v1/farm-units/{field_id}/reactivate", {})
        history = await manager.get(f"/api/v1/farm-units/{field_id}/audit")
        assert history.json()["total"] == 3
        assert (await supervisor.get(f"/api/v1/farm-units/{field_id}/audit")).status_code == 403
        await manager.aclose()
        await supervisor.aclose()
        await app_worker.aclose()

    asyncio.run(flow())


def test_operational_audit_is_database_append_only() -> None:
    add_user("manager", Role.MANAGER)

    async def create() -> None:
        client = await client_for("manager")
        await write(
            client, "POST", "/api/v1/workers", {"worker_code": "AUD-1", "full_name": "Audit Worker"}
        )
        await client.aclose()

    asyncio.run(create())
    with pytest.raises(DBAPIError), SessionFactory.begin() as db:
        event_id = db.scalar(select(OperationalAuditEvent.id))
        assert event_id
        db.execute(
            update(OperationalAuditEvent)
            .where(OperationalAuditEvent.id == event_id)
            .values(action="changed")
        )
