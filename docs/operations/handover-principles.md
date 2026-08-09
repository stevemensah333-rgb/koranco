# Handover principles

Koranco must be able to own and operate the production system without dependence on the original developers, their personal accounts, or an AI coding tool.

This document states the principles. The concrete artifacts are:

- [Technical handover](technical-handover.md) — the single entry point for an incoming engineer;
- [Engineer onboarding](engineer-onboarding.md) — Day-1/Day-2 checklist;
- [Handover checklist](handover-checklist.md) — organizational transfer checklist;
- [Support arrangement template](support-arrangement-template.md) — editable support contract;
- [Troubleshooting](troubleshooting.md) — symptom-to-action operator guide.

## Ownership

Production domains, DNS, hosting accounts, identity configuration, source repositories, databases, object storage, monitoring, secrets, backup destinations, and vendor contracts should be held in organization-controlled accounts. Access should use named users, least privilege, documented recovery, and an offboarding process rather than shared or personal credentials.

Koranco owns its operational data and must have a documented way to access and export it. External service choices must make ownership, portability, retention, deletion, support, and cost clear.

## Documentation and onboarding

Future engineers should be able to use the repository to understand:

- system purpose, boundaries, and unresolved requirements;
- local development and deployment procedures;
- architecture decisions and domain ownership;
- configuration and secret sources;
- migrations, monitoring, backups, restoration, and incident response; and
- known operational limitations.

Runbooks must name roles or teams rather than rely on undocumented personal knowledge. Changes to architecture or operations should update the relevant documentation.

## Backups and recovery

Automated, encrypted, access-controlled database backups are required in production. Retention, geographic/off-site placement, recovery-point objectives, and recovery-time objectives remain unresolved. Restoration must be tested on a defined schedule and the result recorded; successful backup jobs alone do not demonstrate recoverability.

Recovery documentation should cover data restoration, application/configuration restoration, credential recovery, responsibility, communication, and validation before service resumes.

## Independence

Build, test, deploy, migrate, monitor, restore, and transfer ownership using documented standard tools. Generated artifacts must be reproducible. The application architecture and operations must not depend on Codex, another AI agent, private prompts, or unavailable conversation history.

