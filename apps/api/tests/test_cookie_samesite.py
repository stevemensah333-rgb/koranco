import pytest
from fastapi import FastAPI, Response
from fastapi.testclient import TestClient
from pydantic import ValidationError

from koranco.config.settings import Settings
from koranco.identity.security import CSRF_COOKIE, SESSION_COOKIE


def create_test_app(settings_override: Settings) -> FastAPI:
    test_app = FastAPI()

    @test_app.post("/test-login")
    def test_login(response: Response) -> dict[str, str]:
        max_age = settings_override.session_ttl_hours * 60 * 60
        response.set_cookie(
            SESSION_COOKIE,
            "dummy_session_token",
            httponly=True,
            secure=settings_override.secure_cookies,
            samesite=settings_override.cookie_samesite,
            max_age=max_age,
            path="/",
        )
        response.set_cookie(
            CSRF_COOKIE,
            "dummy_csrf_token",
            httponly=False,
            secure=settings_override.secure_cookies,
            samesite=settings_override.cookie_samesite,
            max_age=max_age,
            path="/",
        )
        return {"status": "ok"}

    return test_app


def test_cookie_samesite_default_is_lax() -> None:
    # Prove requirement: default/local/same-site deployment should remain SameSite=Lax.
    settings = Settings(
        environment="development",
        database_url="postgresql+psycopg://localhost/koranco",
        csrf_trusted_origins=["http://localhost:3000"],
        _env_file=None,
    )
    assert settings.cookie_samesite == "lax"
    assert settings.secure_cookies is False

    app = create_test_app(settings)
    client = TestClient(app)
    response = client.post("/test-login")

    # Extract cookies and verify Lax
    assert response.status_code == 200
    cookies = response.headers.get_list("set-cookie")

    # We expect 2 Set-Cookie headers
    assert len(cookies) == 2

    # Session cookie checks
    session_cookie = next(c for c in cookies if SESSION_COOKIE in c)
    assert "samesite=lax" in session_cookie.lower()
    assert "httponly" in session_cookie.lower()
    assert "secure" not in session_cookie.lower()

    # CSRF cookie checks
    csrf_cookie = next(c for c in cookies if CSRF_COOKIE in c)
    assert "samesite=lax" in csrf_cookie.lower()
    assert "httponly" not in csrf_cookie.lower()  # MUST NOT be HttpOnly
    assert "secure" not in csrf_cookie.lower()


def test_cookie_samesite_configured_none_emits_samesite_none() -> None:
    # Prove requirement: Permit an explicit production/staging configuration
    # SameSite=None, Secure=true
    settings = Settings(
        environment="production",
        database_url="postgresql+psycopg://localhost/koranco",
        csrf_trusted_origins=["https://koranco.example"],
        cookie_samesite="none",
        _env_file=None,
    )
    assert settings.cookie_samesite == "none"
    assert settings.secure_cookies is True

    app = create_test_app(settings)
    client = TestClient(app)
    response = client.post("/test-login")

    assert response.status_code == 200
    cookies = response.headers.get_list("set-cookie")

    # Session cookie checks
    session_cookie = next(c for c in cookies if SESSION_COOKIE in c)
    assert "samesite=none" in session_cookie.lower()
    assert "httponly" in session_cookie.lower()
    assert "secure" in session_cookie.lower()

    # CSRF cookie checks
    csrf_cookie = next(c for c in cookies if CSRF_COOKIE in c)
    assert "samesite=none" in csrf_cookie.lower()
    assert "httponly" not in csrf_cookie.lower()  # CSRF remains non-HttpOnly
    assert "secure" in csrf_cookie.lower()


def test_cookie_samesite_none_fails_safely_in_non_production() -> None:
    # Prove requirement: If SameSite=None is configured in an insecure/non-production
    # configuration, fail safely or ensure Secure is enforced.
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            environment="development",
            database_url="postgresql+psycopg://localhost/koranco",
            csrf_trusted_origins=["http://localhost:3000"],
            cookie_samesite="none",
            _env_file=None,
        )
    assert "SameSite=None requires KORANCO_ENVIRONMENT=production" in str(exc_info.value)


def test_cors_and_trusted_origin_behavior_remains_unchanged() -> None:
    # Prove requirement: Do not weaken CORS/trusted-origin validation and check
    # standard Pydantic constraints
    with pytest.raises(ValidationError, match="wildcard"):
        Settings(
            environment="production",
            database_url="postgresql+psycopg://localhost/koranco",
            cors_origins=["*"],
            csrf_trusted_origins=["https://koranco.example"],
            _env_file=None,
        )

    with pytest.raises(ValidationError, match="explicit origins"):
        Settings(
            environment="production",
            database_url="postgresql+psycopg://localhost/koranco",
            csrf_trusted_origins=["*"],
            _env_file=None,
        )

    # Valid config passes
    settings = Settings(
        environment="production",
        database_url="postgresql+psycopg://localhost/koranco",
        cors_origins=["https://koranco.vercel.app"],
        csrf_trusted_origins=["https://koranco.vercel.app"],
        _env_file=None,
    )
    assert settings.cors_origins == ["https://koranco.vercel.app"]
    assert settings.csrf_trusted_origins == ["https://koranco.vercel.app"]
