from enum import StrEnum


class Role(StrEnum):
    MANAGER = "manager"
    SUPERVISOR = "supervisor"
    WORKER = "worker"


class Permission(StrEnum):
    SYSTEM_STATUS_READ = "system.status.read"
    USERS_READ = "users.read"
    USERS_CREATE = "users.create"
    USERS_UPDATE = "users.update"
    USERS_DISABLE = "users.disable"
    USERS_REACTIVATE = "users.reactivate"
    ROLES_ASSIGN = "roles.assign"
    SESSIONS_READ = "sessions.read"
    SESSIONS_REVOKE = "sessions.revoke"
    SECURITY_EVENTS_READ = "security_events.read"
    WORKERS_READ = "workers.read"
    WORKERS_CREATE = "workers.create"
    WORKERS_UPDATE = "workers.update"
    WORKERS_DEACTIVATE = "workers.deactivate"
    FARM_STRUCTURE_READ = "farm_structure.read"
    FARM_STRUCTURE_CREATE = "farm_structure.create"
    FARM_STRUCTURE_UPDATE = "farm_structure.update"
    FARM_STRUCTURE_DEACTIVATE = "farm_structure.deactivate"
    OPERATIONAL_AUDIT_READ = "operational_audit.read"
    ATTENDANCE_READ = "attendance.read"
    ATTENDANCE_RECORD = "attendance.record"
    ATTENDANCE_CORRECT = "attendance.correct"
    HARVEST_READ = "harvest.read"
    HARVEST_RECORD = "harvest.record"
    HARVEST_CORRECT = "harvest.correct"
    REPORTS_READ = "reports.read"
    EXPORTS_CREATE = "exports.create"


ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.MANAGER: frozenset(Permission),
    # MANAGER already receives all permissions via frozenset(Permission)
    Role.SUPERVISOR: frozenset(
        {
            Permission.SYSTEM_STATUS_READ,
            Permission.WORKERS_READ,
            Permission.FARM_STRUCTURE_READ,
            Permission.ATTENDANCE_READ,
            Permission.ATTENDANCE_RECORD,
            Permission.ATTENDANCE_CORRECT,
            Permission.HARVEST_READ,
            Permission.HARVEST_RECORD,
            Permission.HARVEST_CORRECT,
            Permission.REPORTS_READ,
        }
    ),
    Role.WORKER: frozenset({Permission.SYSTEM_STATUS_READ}),
}


def permissions_for_role(role: Role) -> frozenset[Permission]:
    return ROLE_PERMISSIONS[role]
