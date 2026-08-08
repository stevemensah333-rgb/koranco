import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from koranco.db.session import SessionFactory
from koranco.identity.bootstrap import bootstrap
from koranco.identity.models import (
    ApplicationSession,
    ApplicationUser,
    LoginAttempt,
    SecurityEvent,
    UserPermission,
)
from koranco.identity.passwords import hash_password, password_hash_needs_upgrade, verify_password
from koranco.identity.permissions import Role, permissions_for_role
from koranco.identity.security import (
    CSRF_COOKIE,
    SESSION_COOKIE,
    hash_token,
    normalize_login_identifier,
)
from koranco.main import app

TRUSTED_ORIGIN = "http://test"


@pytest.fixture(autouse=True)
def clean_identity_tables() -> None:
    with SessionFactory.begin() as session:
        session.execute(delete(LoginAttempt))
        session.execute(delete(SecurityEvent))
        session.execute(delete(ApplicationSession))
        session.execute(delete(UserPermission))
        session.execute(delete(ApplicationUser))


def create_user(
    *,
    login: str = "operator",
    password: str = "a long example password",
    status: str = "active",
    permission: bool = True,
    role: Role = Role.SUPERVISOR,
) -> ApplicationUser:
    with SessionFactory.begin() as session:
        user = ApplicationUser(
            login_identifier=login,
            display_name="Example Operator",
            password_hash=hash_password(password),
            status=status,
            role=role,
        )
        if permission:
            user.permissions.extend(
                UserPermission(permission=value) for value in permissions_for_role(role)
            )
        session.add(user)
        session.flush()
        session.expunge(user)
        return user


async def request(
    method: str,
    path: str,
    *,
    client: AsyncClient | None = None,
    headers: dict[str, str] | None = None,
    json: dict[str, str] | None = None,
) -> Response:
    if client is not None:
        return await client.request(method, path, headers=headers, json=json)
    async with AsyncClient(transport=ASGITransport(app=app), base_url=TRUSTED_ORIGIN) as new_client:
        return await new_client.request(method, path, headers=headers, json=json)


def login_payload(password: str = "a long example password") -> dict[str, str]:
    return {"login_identifier": "operator", "password": password}


def test_passwords_use_argon2id_and_verify() -> None:
    password_hash = hash_password("a long example password")

    assert password_hash.startswith("$argon2id$")
    assert verify_password(password_hash, "a long example password") is True
    assert verify_password(password_hash, "wrong password") is False
    assert password_hash_needs_upgrade(password_hash) is False


def test_login_identifier_normalization_is_deliberate() -> None:
    assert normalize_login_identifier("  Example.User ") == "example.user"
    with pytest.raises(ValueError):
        normalize_login_identifier("not an allowed identifier")


def test_successful_login_sets_hardened_cookie_and_never_exposes_hash() -> None:
    create_user()
    response = asyncio.run(
        request(
            "POST",
            "/api/v1/auth/login",
            headers={"Origin": TRUSTED_ORIGIN},
            json=login_payload(),
        )
    )

    assert response.status_code == 200
    assert response.json()["login_identifier"] == "operator"
    assert response.json()["csrf_token"] == response.cookies[CSRF_COOKIE]
    assert "password_hash" not in response.text
    assert "a long example password" not in response.text
    session_cookie = next(
        value
        for value in response.headers.get_list("set-cookie")
        if value.startswith(SESSION_COOKIE)
    )
    assert "HttpOnly" in session_cookie
    assert "SameSite=lax" in session_cookie
    raw_token = response.cookies[SESSION_COOKIE]
    with SessionFactory() as session:
        stored = session.scalar(select(ApplicationSession))
        assert stored is not None
        assert stored.token_hash == hash_token(raw_token)
        assert raw_token not in stored.token_hash
        assert session.scalar(
            select(SecurityEvent).where(SecurityEvent.event_type == "login_succeeded")
        )


def test_invalid_and_disabled_accounts_return_same_generic_failure() -> None:
    create_user(status="disabled")
    disabled = asyncio.run(
        request(
            "POST",
            "/api/v1/auth/login",
            headers={"Origin": TRUSTED_ORIGIN},
            json=login_payload(),
        )
    )
    missing = asyncio.run(
        request(
            "POST",
            "/api/v1/auth/login",
            headers={"Origin": TRUSTED_ORIGIN},
            json={"login_identifier": "missing", "password": "a long example password"},
        )
    )

    assert disabled.status_code == missing.status_code == 401
    assert disabled.json()["error"]["message"] == missing.json()["error"]["message"]


def test_unauthenticated_malformed_and_permission_denied_requests_are_rejected() -> None:
    unauthenticated = asyncio.run(request("GET", "/api/v1/system/status"))
    malformed = asyncio.run(
        request("GET", "/api/v1/system/status", headers={"Cookie": f"{SESSION_COOKIE}=malformed"})
    )
    create_user(permission=False)

    async def denied_flow() -> Response:
        async with AsyncClient(transport=ASGITransport(app=app), base_url=TRUSTED_ORIGIN) as client:
            await client.post(
                "/api/v1/auth/login",
                headers={"Origin": TRUSTED_ORIGIN},
                json=login_payload(),
            )
            return await client.get("/api/v1/system/status")

    denied = asyncio.run(denied_flow())
    assert unauthenticated.status_code == malformed.status_code == 401
    assert denied.status_code == 403


def test_authorized_session_logout_and_revocation() -> None:
    create_user()

    async def flow() -> tuple[Response, Response, Response]:
        async with AsyncClient(transport=ASGITransport(app=app), base_url=TRUSTED_ORIGIN) as client:
            login_response = await client.post(
                "/api/v1/auth/login",
                headers={"Origin": TRUSTED_ORIGIN},
                json=login_payload(),
            )
            allowed = await client.get("/api/v1/system/status")
            logged_out = await client.post(
                "/api/v1/auth/logout",
                headers={
                    "Origin": TRUSTED_ORIGIN,
                    "X-CSRF-Token": login_response.json()["csrf_token"],
                },
            )
            rejected = await client.get("/api/v1/auth/session")
            return allowed, logged_out, rejected

    allowed, logged_out, rejected = asyncio.run(flow())
    assert allowed.status_code == 200
    assert logged_out.status_code == 204
    deletion_cookies = logged_out.headers.get_list("set-cookie")
    assert len(deletion_cookies) == 2
    assert any(value.startswith(f"{SESSION_COOKIE}=") for value in deletion_cookies)
    assert any(value.startswith(f"{CSRF_COOKIE}=") for value in deletion_cookies)
    assert all("Max-Age=0" in value and "Path=/" in value for value in deletion_cookies)
    assert rejected.status_code == 401
    with SessionFactory() as session:
        stored = session.scalar(select(ApplicationSession))
        assert stored is not None and stored.revoked_at is not None


def test_expired_and_explicitly_revoked_sessions_are_rejected() -> None:
    user = create_user()
    for revoked_at, expires_at in [
        (datetime.now(UTC), datetime.now(UTC) + timedelta(hours=1)),
        (None, datetime.now(UTC) - timedelta(seconds=1)),
    ]:
        raw_token = f"token-{expires_at.timestamp()}"
        with SessionFactory.begin() as session:
            session.add(
                ApplicationSession(
                    user_id=user.id,
                    token_hash=hash_token(raw_token),
                    csrf_token_hash=hash_token("csrf"),
                    expires_at=expires_at,
                    revoked_at=revoked_at,
                )
            )
        response = asyncio.run(
            request(
                "GET",
                "/api/v1/auth/session",
                headers={"Cookie": f"{SESSION_COOKIE}={raw_token}"},
            )
        )
        assert response.status_code == 401


def test_disabled_account_revokes_an_existing_session() -> None:
    user = create_user()
    raw_token = "existing-session-token"
    with SessionFactory.begin() as session:
        session.add(
            ApplicationSession(
                user_id=user.id,
                token_hash=hash_token(raw_token),
                csrf_token_hash=hash_token("csrf"),
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        stored_user = session.get(ApplicationUser, user.id)
        assert stored_user is not None
        stored_user.status = "disabled"

    response = asyncio.run(
        request(
            "GET",
            "/api/v1/auth/session",
            headers={"Cookie": f"{SESSION_COOKIE}={raw_token}"},
        )
    )
    assert response.status_code == 401
    with SessionFactory() as session:
        stored = session.scalar(select(ApplicationSession))
        assert stored is not None and stored.revoked_at is not None


def test_origin_and_csrf_are_required_for_state_changes() -> None:
    create_user()
    no_origin = asyncio.run(request("POST", "/api/v1/auth/login", json=login_payload()))

    async def logout_without_csrf() -> Response:
        async with AsyncClient(transport=ASGITransport(app=app), base_url=TRUSTED_ORIGIN) as client:
            await client.post(
                "/api/v1/auth/login",
                headers={"Origin": TRUSTED_ORIGIN},
                json=login_payload(),
            )
            return await client.post("/api/v1/auth/logout", headers={"Origin": TRUSTED_ORIGIN})

    no_csrf = asyncio.run(logout_without_csrf())
    assert no_origin.status_code == 403
    assert no_csrf.status_code == 403


def test_repeated_failures_are_temporarily_rate_limited() -> None:
    create_user()
    statuses = [
        asyncio.run(
            request(
                "POST",
                "/api/v1/auth/login",
                headers={"Origin": TRUSTED_ORIGIN},
                json=login_payload("wrong password"),
            )
        ).status_code
        for _ in range(6)
    ]
    assert statuses[:5] == [401] * 5
    assert statuses[5] == 429


def test_bootstrap_is_one_time_and_records_security_event() -> None:
    user = bootstrap(
        "first.user",
        "First User",
        "a long bootstrap password",
        confirmed=True,
    )
    assert user.login_identifier == "first.user"
    with pytest.raises(ValueError, match="already exists"):
        bootstrap(
            "second.user",
            "Second User",
            "another long password",
            confirmed=True,
        )
    with SessionFactory() as session:
        assert session.scalar(
            select(SecurityEvent).where(SecurityEvent.event_type == "bootstrap_user_created")
        )


def test_database_rejects_duplicate_login_identifiers() -> None:
    create_user()
    with pytest.raises(IntegrityError), SessionFactory.begin() as session:
        session.add(
            ApplicationUser(
                login_identifier="operator",
                display_name="Duplicate",
                password_hash=hash_password("a different long password"),
                status="active",
                role=Role.SUPERVISOR,
            )
        )
