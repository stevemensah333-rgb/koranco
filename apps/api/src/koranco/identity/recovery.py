import argparse
import getpass
import sys

from sqlalchemy import select

from koranco.db.session import SessionFactory
from koranco.identity.administration import revoke_sessions
from koranco.identity.models import ApplicationUser
from koranco.identity.passwords import PasswordPolicyError, hash_password
from koranco.identity.permissions import Role
from koranco.identity.security import normalize_login_identifier
from koranco.identity.service import record_security_event


def recover_manager(login: str, password: str, confirmed: bool) -> None:
    if not confirmed:
        raise ValueError("Recovery requires --confirm-emergency-recovery")
    with SessionFactory.begin() as db:
        user = db.scalar(
            select(ApplicationUser).where(
                ApplicationUser.login_identifier == normalize_login_identifier(login)
            )
        )
        if user is None or user.role != Role.MANAGER:
            raise ValueError("The selected account is not a Manager")
        user.password_hash = hash_password(password)
        user.password_change_required = True
        user.status = "active"
        revoke_sessions(db, user.id)
        record_security_event(db, "operator_manager_recovery", None, None, user)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Emergency operator-only Manager credential recovery"
    )
    parser.add_argument("--login", required=True)
    parser.add_argument("--confirm-emergency-recovery", action="store_true")
    args = parser.parse_args()
    password = getpass.getpass("Replacement temporary password: ")
    confirmation = getpass.getpass("Confirm temporary password: ")
    if password != confirmation:
        print("Passwords do not match", file=sys.stderr)
        return 2
    try:
        recover_manager(args.login, password, args.confirm_emergency_recovery)
    except (ValueError, PasswordPolicyError) as exc:
        print(f"Recovery failed: {exc}", file=sys.stderr)
        return 2
    print("Manager recovery completed; all sessions were revoked")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
