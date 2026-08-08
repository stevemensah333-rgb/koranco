import asyncio
import csv
import io
from typing import Any, cast

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import delete, select

from koranco.db.session import SessionFactory
from koranco.farm_structure.models import FarmUnit
from koranco.identity.models import (
    ApplicationSession,
    ApplicationUser,
    LoginAttempt,
    SecurityEvent,
    UserPermission,
)
from koranco.identity.passwords import hash_password
from koranco.identity.permissions import Role, permissions_for_role
from koranco.main import app
from koranco.workers.models import Worker

ORIGIN = "http://test"
PASSWORD = "a long example password"
DATE_A = "2026-08-05"
DATE_B = "2026-08-07"


@pytest.fixture(autouse=True)
def clean_identity() -> None:
    with SessionFactory.begin() as db:
        db.execute(delete(LoginAttempt))
        db.execute(delete(SecurityEvent))
        db.execute(delete(ApplicationSession))
        db.execute(delete(UserPermission))
        db.execute(delete(ApplicationUser))


def add_user(login: str, role: Role) -> ApplicationUser:
    with SessionFactory.begin() as db:
        user = ApplicationUser(
            login_identifier=login,
            display_name=login.title(),
            password_hash=hash_password(PASSWORD),
            status="active",
            role=role,
        )
        user.permissions.extend(UserPermission(permission=p) for p in permissions_for_role(role))
        db.add(user)
        db.flush()
        db.expunge(user)
        return user


def add_worker(code: str, full_name: str, actor_id: Any) -> Worker:
    with SessionFactory.begin() as db:
        worker = Worker(
            worker_code=code,
            full_name=full_name,
            status="active",
            created_by=actor_id,
            updated_by=actor_id,
        )
        db.add(worker)
        db.flush()
        db.expunge(worker)
        return worker


def add_farm_unit(
    code: str, name: str, unit_type: str, actor_id: Any, parent_id: Any = None
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


def setup() -> dict[str, Any]:
    manager = add_user("manager", Role.MANAGER)
    add_user("supervisor", Role.SUPERVISOR)
    add_user("app.worker", Role.WORKER)
    workers = [
        add_worker("KOR-1", "Ama Mensah", manager.id),
        add_worker("KOR-2", "Kofi Boateng", manager.id),
        add_worker("KOR-3", "Esi Owusu", manager.id),
    ]
    field = add_farm_unit("FIELD-1", "Field One", "field", manager.id)
    block = add_farm_unit("BLOCK-1", "Block One", "block", manager.id, parent_id=field.id)
    standalone = add_farm_unit("FIELD-2", "Field Two", "field", manager.id)
    return {
        "manager": manager,
        "block": block,
        "standalone": standalone,
        "workers": workers,
    }


async def client_for(login: str) -> AsyncClient:
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
    client: AsyncClient, method: str, path: str, payload: dict[str, Any] | None = None
) -> Response:
    return await client.request(
        method,
        path,
        headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
        json=payload,
    )


async def submit_attendance(
    client: AsyncClient, date_str: str, workers: list[Worker], statuses: list[str]
) -> dict[str, Any]:
    draft = (
        await write(client, "POST", "/api/v1/attendance-sessions", {"attendance_date": date_str})
    ).json()
    entries = [
        {"worker_id": str(worker.id), "attendance_status": status}
        for worker, status in zip(workers, statuses, strict=True)
    ]
    await write(
        client,
        "PUT",
        f"/api/v1/attendance-sessions/{draft['id']}/draft",
        {"expected_version": draft["version"], "entries": entries},
    )
    submitted = await write(client, "POST", f"/api/v1/attendance-sessions/{draft['id']}/submit")
    assert submitted.status_code == 200
    return cast(dict[str, Any], submitted.json())


async def submit_harvest(
    client: AsyncClient,
    date_str: str,
    unit_id: Any,
    quantity: str,
    unit: str,
    name: str = "Field One",
) -> dict[str, Any]:
    draft = (
        await write(
            client,
            "POST",
            "/api/v1/harvest-records",
            {
                "harvest_date": date_str,
                "farm_unit_id": str(unit_id),
                "quantity": quantity,
                "unit": unit,
                "notes": f"Harvest on {name}",
            },
        )
    ).json()
    submitted = await write(client, "POST", f"/api/v1/harvest-records/{draft['id']}/submit")
    assert submitted.status_code == 200
    return cast(dict[str, Any], submitted.json())


async def post_export(
    client: AsyncClient, path: str, params: dict[str, Any] | None = None
) -> Response:
    return await client.post(
        path,
        headers={"Origin": ORIGIN, "X-CSRF-Token": client.cookies["koranco_csrf"]},
        params=params,
    )


def parse_csv(response: Response) -> tuple[list[str], list[list[str]]]:
    reader = csv.reader(io.StringIO(response.text))
    rows = list(reader)
    return rows[0], rows[1:]


def test_reports_authorization_matrix() -> None:
    setup()

    async def flow() -> None:
        paths = [
            "/api/v1/reports/overview",
            "/api/v1/reports/attendance",
            "/api/v1/reports/harvest",
        ]
        for login, expected in (("manager", 200), ("supervisor", 200), ("app.worker", 403)):
            client = await client_for(login)
            for path in paths:
                assert (await client.get(path)).status_code == expected
            await client.aclose()

    asyncio.run(flow())


def test_attendance_report_aggregation_and_source_linkage() -> None:
    data = setup()
    w = data["workers"]

    async def flow() -> None:
        client = await client_for("manager")
        session_a = await submit_attendance(
            client, DATE_A, [w[0], w[1], w[2]], ["present", "present", "absent"]
        )
        session_b = await submit_attendance(client, DATE_B, [w[0], w[2]], ["present", "absent"])
        result = await client.get(
            "/api/v1/reports/attendance",
            params={"date_from": DATE_A, "date_to": DATE_B},
        )
        assert result.status_code == 200
        payload = result.json()
        assert payload["date_from"] == DATE_A
        assert payload["date_to"] == DATE_B
        assert payload["submitted_session_count"] == 2
        assert payload["present_count"] == 3
        assert payload["absent_count"] == 2
        assert payload["roster_count"] == 5
        session_ids = {s["id"] for s in payload["sessions"]}
        assert session_ids == {session_a["id"], session_b["id"]}
        by_id = {s["id"]: s for s in payload["sessions"]}
        assert by_id[session_a["id"]]["present_count"] == 2
        assert by_id[session_a["id"]]["absent_count"] == 1
        assert by_id[session_a["id"]]["roster_count"] == 3
        assert by_id[session_b["id"]]["roster_count"] == 2
        await client.aclose()

    asyncio.run(flow())


def test_attendance_date_filtering_is_inclusive() -> None:
    data = setup()
    w = data["workers"]

    async def flow() -> None:
        client = await client_for("manager")
        await submit_attendance(client, DATE_A, [w[0]], ["present"])
        await submit_attendance(client, DATE_B, [w[1]], ["absent"])
        single = await client.get(
            "/api/v1/reports/attendance", params={"date_from": DATE_A, "date_to": DATE_A}
        )
        assert single.status_code == 200
        assert single.json()["submitted_session_count"] == 1
        assert single.json()["present_count"] == 1
        bounded = await client.get(
            "/api/v1/reports/attendance", params={"date_from": DATE_A, "date_to": DATE_B}
        )
        assert bounded.json()["submitted_session_count"] == 2
        await client.aclose()

    asyncio.run(flow())


def test_harvest_report_units_remain_separate_and_farm_unit_grouping() -> None:
    data = setup()
    block, standalone = data["block"], data["standalone"]

    async def flow() -> None:
        client = await client_for("manager")
        await submit_harvest(client, DATE_A, block.id, "12", "fruit_count", "Block One")
        await submit_harvest(client, DATE_A, block.id, "13", "fruit_count", "Block One")
        await submit_harvest(client, DATE_A, block.id, "840.500", "kilograms", "Block One")
        await submit_harvest(client, DATE_A, standalone.id, "25", "fruit_count", "Field Two")
        result = await client.get(
            "/api/v1/reports/harvest", params={"date_from": DATE_A, "date_to": DATE_A}
        )
        assert result.status_code == 200
        payload = result.json()
        assert payload["submitted_record_count"] == 4
        by_unit = {u["unit"]: u for u in payload["by_unit"]}
        assert set(by_unit) == {"fruit_count", "kilograms"}
        assert by_unit["fruit_count"]["record_count"] == 3
        assert by_unit["fruit_count"]["quantity"] == "50.000"
        assert by_unit["kilograms"]["record_count"] == 1
        assert by_unit["kilograms"]["quantity"] == "840.500"
        # The two units must never be summed together into one total.
        assert "total" not in payload and len(payload["by_unit"]) == 2
        by_fu = {u["farm_unit_code"]: u for u in payload["by_farm_unit"]}
        assert set(by_fu) == {"BLOCK-1", "FIELD-2"}
        block_units = {u["unit"]: u["quantity"] for u in by_fu["BLOCK-1"]["by_unit"]}
        assert block_units["fruit_count"] == "25.000"
        assert block_units["kilograms"] == "840.500"
        assert by_fu["FIELD-2"]["record_count"] == 1
        await client.aclose()

    asyncio.run(flow())


def test_harvest_farm_unit_filter() -> None:
    data = setup()
    block, standalone = data["block"], data["standalone"]

    async def flow() -> None:
        client = await client_for("manager")
        await submit_harvest(client, DATE_A, block.id, "10", "fruit_count", "Block One")
        await submit_harvest(client, DATE_A, standalone.id, "20", "fruit_count", "Field Two")
        result = await client.get(
            "/api/v1/reports/harvest",
            params={
                "date_from": DATE_A,
                "date_to": DATE_A,
                "farm_unit_id": str(block.id),
            },
        )
        payload = result.json()
        assert payload["submitted_record_count"] == 1
        assert len(payload["by_farm_unit"]) == 1
        assert payload["by_farm_unit"][0]["farm_unit_code"] == "BLOCK-1"
        assert payload["by_unit"][0]["quantity"] == "10.000"
        assert len(payload["records"]) == 1
        await client.aclose()

    asyncio.run(flow())


def test_empty_results_distinguish_zero_from_data() -> None:
    setup()

    async def flow() -> None:
        client = await client_for("manager")
        att = await client.get(
            "/api/v1/reports/attendance",
            params={"date_from": "2026-01-01", "date_to": "2026-01-31"},
        )
        assert att.status_code == 200
        body = att.json()
        assert body["submitted_session_count"] == 0
        assert body["present_count"] == 0
        assert body["absent_count"] == 0
        assert body["roster_count"] == 0
        assert body["sessions"] == []
        harv = await client.get(
            "/api/v1/reports/harvest", params={"date_from": "2026-01-01", "date_to": "2026-01-31"}
        )
        assert harv.status_code == 200
        assert harv.json()["submitted_record_count"] == 0
        assert harv.json()["by_unit"] == []
        await client.aclose()

    asyncio.run(flow())


def test_harvest_source_records_include_identifiers() -> None:
    data = setup()
    block = data["block"]

    async def flow() -> None:
        client = await client_for("manager")
        record = await submit_harvest(client, DATE_A, block.id, "9", "fruit_count", "Block One")
        result = await client.get(
            "/api/v1/reports/harvest", params={"date_from": DATE_A, "date_to": DATE_A}
        )
        records = result.json()["records"]
        assert [r["id"] for r in records] == [record["id"]]
        assert records[0]["farm_unit_code"] == "BLOCK-1"
        assert records[0]["quantity"] == "9.000"
        assert records[0]["unit"] == "fruit_count"
        await client.aclose()

    asyncio.run(flow())


def test_overview_totals_and_recent_activity() -> None:
    data = setup()
    w = data["workers"]
    block = data["block"]

    async def flow() -> None:
        client = await client_for("manager")
        await submit_attendance(client, DATE_B, [w[0], w[1]], ["present", "absent"])
        await submit_harvest(client, DATE_B, block.id, "5", "fruit_count", "Block One")
        result = await client.get("/api/v1/reports/overview", params={"date": DATE_B})
        assert result.status_code == 200
        payload = result.json()
        assert payload["date"] == DATE_B
        assert payload["attendance"]["submitted_sessions"] == 1
        assert payload["attendance"]["present_count"] == 1
        assert payload["attendance"]["absent_count"] == 1
        assert payload["attendance"]["roster_count"] == 2
        assert payload["harvest"]["submitted_records"] == 1
        assert payload["harvest"]["by_unit"][0]["quantity"] == "5.000"
        assert len(payload["recent_attendance"]) == 1
        assert len(payload["recent_harvest"]) == 1
        await client.aclose()

    asyncio.run(flow())


def test_invalid_date_range_rejected() -> None:
    setup()

    async def flow() -> None:
        client = await client_for("manager")
        for path in ("/api/v1/reports/attendance", "/api/v1/reports/harvest"):
            response = await client.get(path, params={"date_from": DATE_B, "date_to": DATE_A})
            assert response.status_code == 422
        await client.aclose()

    asyncio.run(flow())


def test_export_authorization() -> None:
    data = setup()
    block = data["block"]

    async def flow() -> None:
        manager = await client_for("manager")
        await submit_harvest(manager, DATE_A, block.id, "7", "fruit_count", "Block One")
        await manager.aclose()
        for login in ("supervisor", "app.worker"):
            client = await client_for(login)
            assert (
                await post_export(
                    client,
                    "/api/v1/reports/exports/attendance",
                    {"date_from": DATE_A, "date_to": DATE_A},
                )
            ).status_code == 403
            assert (
                await post_export(
                    client,
                    "/api/v1/reports/exports/harvest",
                    {"date_from": DATE_A, "date_to": DATE_A},
                )
            ).status_code == 403
            await client.aclose()

    asyncio.run(flow())


def test_csv_export_correctness_and_escaping() -> None:
    data = setup()
    w = data["workers"]
    block = data["block"]
    add_worker("KOR-4", 'Na, "Doe"\nLine', data["manager"].id)

    async def flow() -> None:
        client = await client_for("manager")
        await submit_attendance(client, DATE_A, [w[0]], ["present"])
        await submit_harvest(client, DATE_A, block.id, "12.500", "kilograms", "Block One")
        attendance = await post_export(
            client,
            "/api/v1/reports/exports/attendance",
            {"date_from": DATE_A, "date_to": DATE_A},
        )
        assert attendance.status_code == 200
        assert attendance.headers["content-type"].startswith("text/csv")
        headers, rows = parse_csv(attendance)
        assert headers == [
            "session_id",
            "attendance_date",
            "worker_code",
            "worker_name",
            "attendance_status",
            "time_in",
            "time_out",
            "recorded_by",
            "submitted_by",
            "submitted_at",
        ]
        assert rows[0][1] == DATE_A
        assert rows[0][2] == "KOR-1"
        assert rows[0][4] == "present"

        harvest = await post_export(
            client,
            "/api/v1/reports/exports/harvest",
            {"date_from": DATE_A, "date_to": DATE_A},
        )
        assert harvest.status_code == 200
        headers, rows = parse_csv(harvest)
        assert headers[0] == "record_id"
        assert rows[0][1] == DATE_A
        assert rows[0][5] == "12.500"
        assert rows[0][6] == "kilograms"
        await client.aclose()

    asyncio.run(flow())


def test_csv_formula_injection_protection() -> None:
    data = setup()
    w = data["workers"]
    eq = add_worker("KOR-5", "=2+2", data["manager"].id)
    at = add_worker("KOR-6", "@SUM(A1)", data["manager"].id)
    plus = add_worker("KOR-7", "+cmd", data["manager"].id)
    minus = add_worker("KOR-8", "-x", data["manager"].id)

    async def flow() -> None:
        client = await client_for("manager")
        await submit_attendance(client, DATE_A, [eq, at, plus, minus, w[0]], ["present"] * 5)
        response = await post_export(
            client,
            "/api/v1/reports/exports/attendance",
            {"date_from": DATE_A, "date_to": DATE_A},
        )
        assert response.status_code == 200
        _, rows = parse_csv(response)
        names = [row[3] for row in rows if row[2] in ("KOR-5", "KOR-6", "KOR-7", "KOR-8")]
        assert len(names) == 4
        assert all(name.startswith("'") for name in names)
        assert "'=2+2" in names and "'-x" in names
        await client.aclose()

    asyncio.run(flow())


def test_csv_formula_injection_harvest_notes() -> None:
    data = setup()
    block = data["block"]

    async def flow() -> None:
        client = await client_for("manager")
        draft = (
            await write(
                client,
                "POST",
                "/api/v1/harvest-records",
                {
                    "harvest_date": DATE_A,
                    "farm_unit_id": str(block.id),
                    "quantity": "3",
                    "unit": "fruit_count",
                    "notes": "-3+1",
                },
            )
        ).json()
        assert (
            await write(client, "POST", f"/api/v1/harvest-records/{draft['id']}/submit")
        ).status_code == 200
        response = await post_export(
            client,
            "/api/v1/reports/exports/harvest",
            {"date_from": DATE_A, "date_to": DATE_A},
        )
        _, rows = parse_csv(response)
        notes = rows[0][10]
        assert notes == "'-3+1"
        await client.aclose()

    asyncio.run(flow())


def test_export_creates_audit_security_event() -> None:
    data = setup()
    block = data["block"]

    async def flow() -> None:
        client = await client_for("manager")
        await submit_harvest(client, DATE_A, block.id, "4", "fruit_count", "Block One")
        await post_export(
            client,
            "/api/v1/reports/exports/harvest",
            {"date_from": DATE_A, "date_to": DATE_A, "unit": "fruit_count"},
        )
        await client.aclose()
        with SessionFactory() as db:
            events = db.scalars(
                select(SecurityEvent).where(SecurityEvent.event_type == "export_created")
            ).all()
            assert len(events) == 1
            assert events[0].details is not None
            assert events[0].details["export_type"] == "harvest"
            assert events[0].details["filters"]["unit"] == "fruit_count"
            assert events[0].user_id is not None

    asyncio.run(flow())
