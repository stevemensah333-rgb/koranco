import asyncio

from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy.exc import SQLAlchemyError

from koranco.db.session import get_db_session
from koranco.main import app


async def send_request(path: str, headers: dict[str, str] | None = None) -> Response:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(path, headers=headers)


def test_health_returns_ok() -> None:
    response = asyncio.run(send_request("/api/v1/health"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["X-Request-ID"]


def test_valid_request_id_is_returned() -> None:
    request_id = "client-request-123"
    response = asyncio.run(send_request("/api/v1/health", headers={"X-Request-ID": request_id}))

    assert response.headers["X-Request-ID"] == request_id


def test_invalid_request_id_is_replaced() -> None:
    response = asyncio.run(send_request("/api/v1/health", headers={"X-Request-ID": "bad value"}))

    assert response.headers["X-Request-ID"] != "bad value"


def test_http_errors_follow_the_error_convention() -> None:
    response = asyncio.run(send_request("/api/v1/not-found"))

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "http_404", "message": "Not Found"},
        "request_id": response.headers["X-Request-ID"],
    }


def test_readiness_checks_database() -> None:
    class StubSession:
        def execute(self, statement: object) -> None:
            assert str(statement) == "SELECT 1"

    def override_session() -> StubSession:
        return StubSession()

    app.dependency_overrides[get_db_session] = override_session
    try:
        response = asyncio.run(send_request("/api/v1/readiness"))
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_readiness_reports_an_unavailable_database() -> None:
    class FailingSession:
        def execute(self, statement: object) -> None:
            raise SQLAlchemyError("connection failed")

    def override_session() -> FailingSession:
        return FailingSession()

    app.dependency_overrides[get_db_session] = override_session
    try:
        response = asyncio.run(send_request("/api/v1/readiness"))
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["error"] == {
        "code": "http_503",
        "message": "Database is unavailable",
    }
