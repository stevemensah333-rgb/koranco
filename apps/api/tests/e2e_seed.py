"""Reset and seed only the disposable koranco_e2e database."""

from sqlalchemy import text

from koranco.config.settings import get_settings
from koranco.db.session import SessionFactory
from koranco.identity.models import ApplicationUser, UserPermission
from koranco.identity.passwords import hash_password
from koranco.identity.permissions import Role, permissions_for_role
from koranco.workers.models import Worker

PASSWORD = "a long example password"


def main() -> None:
    if not get_settings().database_url.endswith("/koranco_e2e"):
        raise RuntimeError("E2E seed refuses to run outside koranco_e2e")
    with SessionFactory.begin() as db:
        db.execute(
            text(
                "TRUNCATE attendance_sync_operations, attendance_entries, attendance_sessions, "
                "operational_audit_events, farm_units, workers, security_events, "
                "authentication_login_attempts, application_sessions, "
                "application_user_permissions, application_users CASCADE"
            )
        )
        for login, role in (("supervisor.a", Role.SUPERVISOR), ("supervisor.b", Role.SUPERVISOR)):
            user = ApplicationUser(
                login_identifier=login,
                display_name=login.title(),
                password_hash=hash_password(PASSWORD),
                status="active",
                role=role,
            )
            user.permissions.extend(
                UserPermission(permission=permission) for permission in permissions_for_role(role)
            )
            db.add(user)
            db.flush()
            if login == "supervisor.a":
                for index in range(3):
                    db.add(
                        Worker(
                            worker_code=f"E2E-{index + 1}",
                            full_name=f"E2E Worker {index + 1}",
                            status="active",
                            created_by=user.id,
                            updated_by=user.id,
                        )
                    )


if __name__ == "__main__":
    main()
