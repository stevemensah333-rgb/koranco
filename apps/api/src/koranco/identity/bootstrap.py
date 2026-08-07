import argparse
import getpass
import sys

from sqlalchemy import func, select

from koranco.db.session import SessionFactory
from koranco.identity.models import ApplicationUser, UserPermission
from koranco.identity.passwords import PasswordPolicyError, hash_password
from koranco.identity.permissions import Role, permissions_for_role
from koranco.identity.security import normalize_login_identifier
from koranco.identity.service import record_security_event


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create the first Koranco application user with foundation access."
    )
    parser.add_argument("--login", required=True, help="Normalized login identifier")
    parser.add_argument("--display-name", required=True, help="Display identity for attribution")
    parser.add_argument(
        "--confirm-bootstrap",
        action="store_true",
        help="Confirm this is the intentional first-user bootstrap",
    )
    return parser


def bootstrap(login: str, display_name: str, password: str, confirmed: bool) -> ApplicationUser:
    if not confirmed:
        raise ValueError("Bootstrap requires --confirm-bootstrap")
    normalized = normalize_login_identifier(login)
    clean_display_name = display_name.strip()
    if not 2 <= len(clean_display_name) <= 120:
        raise ValueError("Display name must contain 2-120 characters")
    password_hash = hash_password(password)

    with SessionFactory.begin() as session:
        if session.scalar(select(func.count()).select_from(ApplicationUser)) != 0:
            raise ValueError("Bootstrap refused because an application user already exists")
        user = ApplicationUser(
            login_identifier=normalized,
            display_name=clean_display_name,
            password_hash=password_hash,
            status="active",
            role=Role.MANAGER,
        )
        user.permissions.extend(
            UserPermission(permission=permission)
            for permission in permissions_for_role(Role.MANAGER)
        )
        session.add(user)
        session.flush()
        record_security_event(session, "bootstrap_user_created", user, request_id=None)
        session.expunge(user)
        return user


def main() -> int:
    args = build_parser().parse_args()
    password = getpass.getpass("New password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        print("Passwords do not match", file=sys.stderr)
        return 2
    try:
        user = bootstrap(args.login, args.display_name, password, args.confirm_bootstrap)
    except (ValueError, PasswordPolicyError) as exc:
        print(f"Bootstrap failed: {exc}", file=sys.stderr)
        return 2
    print(f"Created first application user {user.id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
