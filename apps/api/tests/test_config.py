import pytest
from pydantic import ValidationError

from koranco.config.settings import Settings


def test_required_configuration_is_validated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("KORANCO_ENVIRONMENT", raising=False)
    monkeypatch.delenv("KORANCO_DATABASE_URL", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_non_postgresql_database_is_rejected() -> None:
    with pytest.raises(ValidationError, match="PostgreSQL"):
        Settings(
            environment="test",
            database_url="sqlite:///local.db",
            _env_file=None,
        )


def test_wildcard_cors_is_rejected() -> None:
    with pytest.raises(ValidationError, match="wildcard"):
        Settings(
            environment="test",
            database_url="postgresql+psycopg://localhost/koranco",
            cors_origins=["*"],
            _env_file=None,
        )


def test_production_disables_api_documentation() -> None:
    settings = Settings(
        environment="production",
        database_url="postgresql+psycopg://localhost/koranco",
        _env_file=None,
    )

    assert settings.expose_api_docs is False
