from fastapi import Response

from koranco.config.settings import Settings
from koranco.identity.security import CSRF_COOKIE, SESSION_COOKIE

AUTH_COOKIE_PATH = "/"


def set_auth_cookies(
    response: Response,
    settings: Settings,
    *,
    session_token: str,
    csrf_token: str,
) -> None:
    """Set the authentication cookie pair with one shared attribute policy."""
    max_age = settings.session_ttl_hours * 60 * 60
    response.set_cookie(
        SESSION_COOKIE,
        session_token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite=settings.cookie_samesite,
        max_age=max_age,
        path=AUTH_COOKIE_PATH,
    )
    response.set_cookie(
        CSRF_COOKIE,
        csrf_token,
        httponly=False,
        secure=settings.secure_cookies,
        samesite=settings.cookie_samesite,
        max_age=max_age,
        path=AUTH_COOKIE_PATH,
    )


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    """Expire the cookie pair using the same attributes used when creating it."""
    response.delete_cookie(
        SESSION_COOKIE,
        httponly=True,
        secure=settings.secure_cookies,
        samesite=settings.cookie_samesite,
        path=AUTH_COOKIE_PATH,
    )
    response.delete_cookie(
        CSRF_COOKIE,
        httponly=False,
        secure=settings.secure_cookies,
        samesite=settings.cookie_samesite,
        path=AUTH_COOKIE_PATH,
    )
