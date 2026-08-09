import asyncio
import uuid
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import delete, select

from koranco.attendance.models import AttendanceSyncOperation
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
from koranco.workers.models import Worker
from tests.helpers import (
    add_user,
    add_worker,
    client_for,
    write,
)

TODAY = "2026-08-07"


@pytest.fixture(autouse=True)
def clean_identity() -> None:
    with SessionFactory.begin() as db:
        db.execute(delete(LoginAttempt))
        db.execute(delete(SecurityEvent))
        db.execute(delete(ApplicationSession))
        db.execute(delete(UserPermission))
        db.execute(delete(ApplicationUser))


async def create_draft(client: AsyncClient) -> Response:
    return await write(client, "POST", "/api/v1/attendance-sessions", {"attendance_date": TODAY})


async def save_roster(
    client: AsyncClient, session_id: str, version: int, entries: list[dict[str, Any]]
) -> Response:
    return await write(
        client,
        "PUT",
        f"/api/v1/attendance-sessions/{session_id}/draft",
        {"expected_version": version, "entries": entries},
    )


def setup_roles() -> tuple[ApplicationUser, Worker, Worker]:
    manager = add_user("manager", Role.MANAGER)
    add_user("supervisor", Role.SUPERVISOR)
    add_user("app.worker", Role.WORKER)
    return manager, add_worker("KOR-1", manager.id), add_worker("KOR-2", manager.id)


def sync_payload(
    worker: Worker,
    *,
    operation_id: uuid.UUID | None = None,
    target_id: uuid.UUID | None = None,
    payload_version: int = 1,
) -> dict[str, Any]:
    return {
        "operation_id": str(operation_id or uuid.uuid4()),
        "operation_type": "submit_snapshot",
        "target_session_id": str(target_id or uuid.uuid4()),
        "payload_version": payload_version,
        "attendance_date": TODAY,
        "base_server_version": None,
        "entries": [{"worker_id": str(worker.id), "attendance_status": "present"}],
    }


def test_manager_and_supervisor_create_worker_role_denied() -> None:
    setup_roles()

    async def flow() -> None:
        for login in ("manager", "supervisor"):
            client = await client_for(login)
            assert (await create_draft(client)).status_code == 201
            await client.aclose()
        worker = await client_for("app.worker")
        assert (await create_draft(worker)).status_code == 403
        assert (await worker.get("/api/v1/attendance-sessions")).status_code == 403
        await worker.aclose()

    asyncio.run(flow())


def test_draft_batch_validation_active_worker_uniqueness_status_and_times() -> None:
    manager, w1, w2 = setup_roles()
    inactive = add_worker("KOR-X", manager.id, active=False)

    async def flow() -> None:
        client = await client_for("supervisor")
        draft = (await create_draft(client)).json()
        sid = draft["id"]
        valid = await save_roster(
            client,
            sid,
            draft["version"],
            [
                {
                    "worker_id": str(w1.id),
                    "attendance_status": "present",
                    "time_in": "07:30",
                    "time_out": "16:00",
                },
                {"worker_id": str(w2.id), "attendance_status": "absent"},
            ],
        )
        assert valid.status_code == 200 and valid.json()["present_count"] == 1
        stale = await save_roster(client, sid, draft["version"], [])
        assert stale.status_code == 409
        duplicate = await save_roster(
            client,
            sid,
            valid.json()["version"],
            [
                {"worker_id": str(w1.id), "attendance_status": "present"},
                {"worker_id": str(w1.id), "attendance_status": "absent"},
            ],
        )
        assert duplicate.status_code == 422
        inactive_result = await save_roster(
            client,
            sid,
            valid.json()["version"],
            [{"worker_id": str(inactive.id), "attendance_status": "present"}],
        )
        assert inactive_result.status_code == 409
        absent_time = await save_roster(
            client,
            sid,
            valid.json()["version"],
            [{"worker_id": str(w1.id), "attendance_status": "absent", "time_in": "08:00"}],
        )
        assert absent_time.status_code == 422
        bad_order = await save_roster(
            client,
            sid,
            valid.json()["version"],
            [
                {
                    "worker_id": str(w1.id),
                    "attendance_status": "present",
                    "time_in": "10:00",
                    "time_out": "09:00",
                }
            ],
        )
        assert bad_order.status_code == 422
        await client.aclose()

    asyncio.run(flow())


def test_submission_validation_repeat_safety_duplicate_population_and_audit() -> None:
    _, w1, w2 = setup_roles()

    async def flow() -> None:
        client = await client_for("manager")
        empty = (await create_draft(client)).json()
        assert (
            await write(client, "POST", f"/api/v1/attendance-sessions/{empty['id']}/submit")
        ).status_code == 422
        draft = (await create_draft(client)).json()
        saved = (
            await save_roster(
                client,
                draft["id"],
                draft["version"],
                [
                    {"worker_id": str(w1.id), "attendance_status": None},
                    {"worker_id": str(w2.id), "attendance_status": "present"},
                ],
            )
        ).json()
        assert (
            await write(client, "POST", f"/api/v1/attendance-sessions/{draft['id']}/submit")
        ).status_code == 422
        saved = (
            await save_roster(
                client,
                draft["id"],
                saved["version"],
                [
                    {"worker_id": str(w1.id), "attendance_status": "absent"},
                    {"worker_id": str(w2.id), "attendance_status": "present"},
                ],
            )
        ).json()
        submitted = await write(client, "POST", f"/api/v1/attendance-sessions/{draft['id']}/submit")
        assert submitted.status_code == 200 and submitted.json()["status"] == "submitted"
        repeated = await write(client, "POST", f"/api/v1/attendance-sessions/{draft['id']}/submit")
        assert (
            repeated.status_code == 200
            and repeated.json()["submitted_at"] == submitted.json()["submitted_at"]
        )
        assert (
            await save_roster(client, draft["id"], submitted.json()["version"], [])
        ).status_code == 409
        assert (
            await write(client, "POST", f"/api/v1/attendance-sessions/{draft['id']}/discard")
        ).status_code == 409
        duplicate = (await create_draft(client)).json()
        duplicate_saved = (
            await save_roster(
                client,
                duplicate["id"],
                duplicate["version"],
                [
                    {"worker_id": str(w2.id), "attendance_status": "present"},
                    {"worker_id": str(w1.id), "attendance_status": "absent"},
                ],
            )
        ).json()
        assert duplicate_saved
        assert (
            await write(client, "POST", f"/api/v1/attendance-sessions/{duplicate['id']}/submit")
        ).status_code == 409
        assert (
            await client.delete(f"/api/v1/attendance-sessions/{draft['id']}")
        ).status_code == 405
        await client.aclose()

    asyncio.run(flow())
    with SessionFactory() as db:
        submitted_events = db.scalars(
            select(OperationalAuditEvent).where(OperationalAuditEvent.action == "submitted")
        ).all()
        assert len(submitted_events) == 1


def test_concurrent_repeat_submission_creates_one_fact_and_one_audit_event() -> None:
    _, worker, _ = setup_roles()

    async def flow() -> None:
        first = await client_for("manager")
        second = await client_for("manager")
        draft = (await create_draft(first)).json()
        saved = await save_roster(
            first,
            draft["id"],
            draft["version"],
            [{"worker_id": str(worker.id), "attendance_status": "present"}],
        )
        assert saved.status_code == 200
        responses = await asyncio.gather(
            write(first, "POST", f"/api/v1/attendance-sessions/{draft['id']}/submit"),
            write(second, "POST", f"/api/v1/attendance-sessions/{draft['id']}/submit"),
        )
        assert [response.status_code for response in responses] == [200, 200]
        assert responses[0].json()["id"] == responses[1].json()["id"]
        assert responses[0].json()["submitted_at"] == responses[1].json()["submitted_at"]
        await first.aclose()
        await second.aclose()

    asyncio.run(flow())
    with SessionFactory() as db:
        events = db.scalars(
            select(OperationalAuditEvent).where(OperationalAuditEvent.action == "submitted")
        ).all()
        assert len(events) == 1


def test_correction_reason_authorization_stale_history_and_inactive_worker() -> None:
    _, w1, _ = setup_roles()

    async def flow() -> None:
        supervisor = await client_for("supervisor")
        draft = (await create_draft(supervisor)).json()
        await save_roster(
            supervisor,
            draft["id"],
            draft["version"],
            [{"worker_id": str(w1.id), "attendance_status": "present", "time_in": "08:00"}],
        )
        submitted = (
            await write(supervisor, "POST", f"/api/v1/attendance-sessions/{draft['id']}/submit")
        ).json()
        entry = submitted["entries"][0]
        missing_reason = await write(
            supervisor,
            "POST",
            f"/api/v1/attendance-sessions/{draft['id']}/entries/{entry['id']}/correct",
            {"expected_version": entry["version"], "attendance_status": "absent", "reason": ""},
        )
        assert missing_reason.status_code == 422
        corrected = await write(
            supervisor,
            "POST",
            f"/api/v1/attendance-sessions/{draft['id']}/entries/{entry['id']}/correct",
            {
                "expected_version": entry["version"],
                "attendance_status": "absent",
                "reason": "Supervisor confirmed absence",
            },
        )
        assert corrected.status_code == 200 and corrected.json()["absent_count"] == 1
        stale = await write(
            supervisor,
            "POST",
            f"/api/v1/attendance-sessions/{draft['id']}/entries/{entry['id']}/correct",
            {
                "expected_version": entry["version"],
                "attendance_status": "present",
                "reason": "Stale correction",
            },
        )
        assert stale.status_code == 409
        worker_role = await client_for("app.worker")
        assert (
            await write(
                worker_role,
                "POST",
                f"/api/v1/attendance-sessions/{draft['id']}/entries/{entry['id']}/correct",
                {
                    "expected_version": 2,
                    "attendance_status": "present",
                    "reason": "Denied correction",
                },
            )
        ).status_code == 403
        await worker_role.aclose()
        with SessionFactory.begin() as db:
            stored = db.get(Worker, w1.id)
            assert stored
            stored.status = "inactive"
        historical = await supervisor.get(f"/api/v1/attendance-sessions/{draft['id']}")
        assert (
            historical.status_code == 200
            and historical.json()["entries"][0]["worker_active"] is False
        )
        history = await supervisor.get(f"/api/v1/attendance-sessions/{draft['id']}/audit")
        assert history.status_code == 200 and any(
            item["action"] == "corrected" and item["reason"] == "Supervisor confirmed absence"
            for item in history.json()["items"]
        )
        await supervisor.aclose()

    asyncio.run(flow())
    with SessionFactory() as db:
        event = db.scalar(
            select(OperationalAuditEvent).where(OperationalAuditEvent.action == "corrected")
        )
        assert (
            event
            and event.before_state
            and event.after_state
            and event.before_state["attendance_status"] == "present"
            and event.after_state["attendance_status"] == "absent"
        )


def test_list_pagination_filters_discard_and_realistic_roster() -> None:
    manager = add_user("manager", Role.MANAGER)
    workers = [add_worker(f"LOAD-{index:03}", manager.id) for index in range(150)]

    async def flow() -> None:
        client = await client_for("manager")
        draft = (await create_draft(client)).json()
        saved = await save_roster(
            client,
            draft["id"],
            draft["version"],
            [{"worker_id": str(worker.id), "attendance_status": "present"} for worker in workers],
        )
        assert saved.status_code == 200 and len(saved.json()["entries"]) == 150
        listing = await client.get(
            "/api/v1/attendance-sessions",
            params={
                "status": "draft",
                "date_from": TODAY,
                "date_to": TODAY,
                "limit": 1,
                "offset": 0,
            },
        )
        assert (
            listing.status_code == 200
            and listing.json()["total"] == 1
            and listing.json()["limit"] == 1
        )
        assert (
            await write(client, "POST", f"/api/v1/attendance-sessions/{draft['id']}/discard")
        ).status_code == 204
        assert (await client.get(f"/api/v1/attendance-sessions/{draft['id']}")).status_code == 404
        await client.aclose()

    asyncio.run(flow())


def test_sync_applies_replays_after_response_loss_and_audits_once() -> None:
    _, worker, _ = setup_roles()
    payload = sync_payload(worker)

    async def flow() -> None:
        client = await client_for("supervisor")
        first = await write(client, "POST", "/api/v1/attendance-sessions/sync", payload)
        assert first.status_code == 200 and first.json()["result"] == "applied"
        replay = await write(client, "POST", "/api/v1/attendance-sessions/sync", payload)
        assert replay.status_code == 200 and replay.json()["result"] == "already_applied"
        assert replay.json()["session"]["id"] == payload["target_session_id"]
        await client.aclose()

    asyncio.run(flow())
    with SessionFactory() as db:
        assert len(db.scalars(select(AttendanceSyncOperation)).all()) == 1
        assert (
            len(
                db.scalars(
                    select(OperationalAuditEvent).where(OperationalAuditEvent.action == "submitted")
                ).all()
            )
            == 1
        )


def test_sync_rejects_unsupported_version_wrong_owner_and_inactive_worker() -> None:
    manager, worker, _ = setup_roles()

    async def flow() -> None:
        supervisor = await client_for("supervisor")
        unsupported = sync_payload(worker, payload_version=99)
        result = await write(supervisor, "POST", "/api/v1/attendance-sessions/sync", unsupported)
        assert result.status_code == 200 and result.json()["result"] == "rejected"
        malformed = await write(
            supervisor,
            "POST",
            "/api/v1/attendance-sessions/sync",
            {"operation_id": "not-a-uuid", "operation_type": "unknown"},
        )
        assert malformed.status_code == 422
        assert malformed.json()["error"]["code"] == "validation_error"

        operation_id = uuid.uuid4()
        owned = sync_payload(worker, operation_id=operation_id)
        assert (await write(supervisor, "POST", "/api/v1/attendance-sessions/sync", owned)).json()[
            "result"
        ] == "applied"
        manager_client = await client_for("manager")
        wrong_owner = await write(manager_client, "POST", "/api/v1/attendance-sessions/sync", owned)
        assert wrong_owner.json()["result"] == "rejected"

        inactive = add_worker("SYNC-X", manager.id, active=False)
        invalid = await write(
            supervisor,
            "POST",
            "/api/v1/attendance-sessions/sync",
            sync_payload(inactive),
        )
        assert invalid.json()["result"] == "conflict"
        await supervisor.aclose()
        await manager_client.aclose()

    asyncio.run(flow())


def test_sync_detects_stale_draft_and_concurrent_operation_replay() -> None:
    _, worker, other = setup_roles()

    async def flow() -> None:
        first = await client_for("supervisor")
        second = await client_for("supervisor")
        draft = (await create_draft(first)).json()
        await save_roster(
            first,
            draft["id"],
            draft["version"],
            [{"worker_id": str(other.id), "attendance_status": "absent"}],
        )
        stale = sync_payload(worker, target_id=uuid.UUID(draft["id"]))
        stale["base_server_version"] = draft["version"]
        conflict = await write(first, "POST", "/api/v1/attendance-sessions/sync", stale)
        assert conflict.json()["result"] == "conflict"

        payload = sync_payload(worker)
        results = await asyncio.gather(
            write(first, "POST", "/api/v1/attendance-sessions/sync", payload),
            write(second, "POST", "/api/v1/attendance-sessions/sync", payload),
        )
        assert {item.json()["result"] for item in results} == {"applied", "already_applied"}
        await first.aclose()
        await second.aclose()

    asyncio.run(flow())


def test_sync_stops_for_disabled_account_or_removed_permission() -> None:
    _, worker, _ = setup_roles()

    async def flow() -> None:
        supervisor = await client_for("supervisor")
        with SessionFactory.begin() as db:
            user = db.scalar(
                select(ApplicationUser).where(ApplicationUser.login_identifier == "supervisor")
            )
            assert user
            db.execute(
                delete(UserPermission).where(
                    UserPermission.user_id == user.id,
                    UserPermission.permission == "attendance.record",
                )
            )
        denied = await write(
            supervisor,
            "POST",
            "/api/v1/attendance-sessions/sync",
            sync_payload(worker),
        )
        assert denied.status_code == 403
        with SessionFactory.begin() as db:
            user = db.scalar(
                select(ApplicationUser).where(ApplicationUser.login_identifier == "supervisor")
            )
            assert user
            user.status = "disabled"
        disabled = await write(
            supervisor,
            "POST",
            "/api/v1/attendance-sessions/sync",
            sync_payload(worker),
        )
        assert disabled.status_code == 401
        await supervisor.aclose()

    asyncio.run(flow())
