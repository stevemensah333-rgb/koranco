from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

MINIMUM_PASSWORD_LENGTH = 12
MAXIMUM_PASSWORD_LENGTH = 128
_hasher = PasswordHasher()
_dummy_hash = _hasher.hash("not-a-real-user-password")


class PasswordPolicyError(ValueError):
    pass


def validate_password(password: str) -> None:
    if len(password) < MINIMUM_PASSWORD_LENGTH:
        raise PasswordPolicyError(f"Password must be at least {MINIMUM_PASSWORD_LENGTH} characters")
    if len(password) > MAXIMUM_PASSWORD_LENGTH:
        raise PasswordPolicyError(f"Password must be at most {MAXIMUM_PASSWORD_LENGTH} characters")


def hash_password(password: str) -> str:
    validate_password(password)
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def verify_dummy_password(password: str) -> None:
    verify_password(_dummy_hash, password)


def password_hash_needs_upgrade(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)
