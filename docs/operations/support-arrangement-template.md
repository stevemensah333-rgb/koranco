# Support Arrangement Template

> **Template only.** This is not a signed agreement. Koranco and the support
> party must fill in the placeholders, agree on the terms, and have an
> authorized person approve before this becomes binding. Replace every
> `<placeholder>`.

## Parties

- **Koranco (client)**: <organization/contact>
- **Support party**: <company or engineer, contact, role>

## Scope and period

- **System covered**: the Koranco Farms Digital Farm Management System as it
  exists in the repository at handover (frontend, API, database, offline
  workflows, reporting, backups).
- **Support period**: from <start date> to <end date or "rolling with 30-day
  notice">.
- **Operating environment covered**: <staging/production URL(s), hosting
  accounts>.

## Channels and response times

| Channel | Use | Response target |
| --- | --- | --- |
| <support email / ticket system> | All requests | <e.g. 1 business day> |
| <on-call phone/SMS for critical only> | Critical incidents | <e.g. 1 hour> |
| <scheduled maintenance window> | Planned changes | by agreement |

## Severity definitions

- **Critical**: production is down, data is at risk, or users cannot work at
  all (e.g. API down, database unreachable, sync failures blocking all field
  work, failed backup with no recent good backup).
- **High**: a major function is broken for a subset of users or a workaround
  is required (e.g. one report broken, one user cannot sync, migration stuck).
- **Routine**: questions, small bugs, documentation, housekeeping, monitoring
  review, non-urgent improvements.

## What support includes

- Monitoring and responding to <critical/high> incidents using the runbooks
  in `docs/operations/` (troubleshooting, incident response, backup/restore).
- Database backups verification and restore drills on the agreed schedule.
- Applying **approved fixes and small maintenance changes** (bug fixes,
  dependency updates, configuration) with the normal
  [release procedure](technical-handover.md#11-release--update-procedure).
- Guidance for the Koranco technical owner on day-to-day operation.
- Availability: <hours / on-call rota, if any>.

## What requires separate development work

Any new product functionality or confirmed scope change (see
`docs/product/product-scope.md` for what is intentionally out of scope), for
example: new domains (inventory, payroll, traceability), new workflows, new
integrations, major UI redesigns, or changes that require a new ADR. These are
quoted and approved separately; they are not included in support.

## Infrastructure and billing ownership

- Koranco owns and pays for: Vercel, Render, PostgreSQL, DNS, and any other
  hosting. The support party must not incur charges on Koranco accounts
  without prior approval.
- The support party provides only the contracted labor unless agreed
  otherwise.

## Escalation

1. <first-level contact>
2. <second-level / supervisor>
3. <Koranco operational owner> for business decisions
4. Emergency Manager recovery procedure applies when no Manager can
   authenticate (`docs/operations/manager-recovery.md`).

## Handover / end-of-support

- On termination, the support party will: return all Koranco credentials and
  data, hand over current documentation and any pending fixes, and complete an
  agreed transition period during which the new party can take over.
- The handover checklist (`docs/operations/handover-checklist.md`) is the
  template for the transition.
- <Notice period and final payment terms>.

## Approvals

- Koranco authorized signatory: <name, role, date>
- Support party authorized signatory: <name, role, date>
