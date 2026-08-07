import hashlib
import re
import secrets
from hmac import compare_digest

LOGIN_IDENTIFIER_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")
SESSION_COOKIE = "koranco_session"
CSRF_COOKIE = "koranco_csrf"
CSRF_HEADER = "X-CSRF-Token"


def normalize_login_identifier(value: str) -> str:
    normalized = value.strip().casefold()
    if not LOGIN_IDENTIFIER_PATTERN.fullmatch(normalized):
        raise ValueError(
            "Login identifier must use 3-64 lowercase letters, numbers, '.', '_' or '-'"
        )
    return normalized


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def tokens_match(first: str, second: str) -> bool:
    return compare_digest(first, second)
