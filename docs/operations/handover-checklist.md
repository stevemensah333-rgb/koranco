# Handover Checklist

Use this when transferring ownership of the Koranco system from one party
(original team, contractor, or vendor) to another. Every item should be
confirmed by a named owner, not left implicit. Items are checkboxes so the
document can be copied into the handover record.

## Repository

- [ ] Source repository transferred to an organization-controlled account
      (not a personal account).
- [ ] Branch protection on `main`: reviews required, CI must pass, no direct
      pushes.
- [ ] Write access confirmed for the incoming technical owner; former
      contributors removed or downgraded to read.
- [ ] `README.md` and this checklist's links resolve for the incoming engineer
      (see [technical-handover.md](technical-handover.md)).

## Hosting

- [ ] **Vercel** project owned by the organization; team membership updated.
- [ ] **Render** web service and database owned by the organization; access
      for the incoming owner only.
- [ ] Domain/DNS records (if any) in an organization-controlled registrar;
      DNS provider access documented.
- [ ] **Billing ownership** confirmed for Vercel, Render, and any DNS/email
      services; billing contacts named.

## Secrets

- [ ] Production credentials (API database URL, backup passwords, gpg keys,
      Vercel/Render tokens) transferred via a secure channel (password manager /
      encrypted handover document), never chat or email.
- [ ] Personal credentials of former team members removed/rotated (Vercel,
      Render, GitHub, database, backup encryption).
- [ ] Recovery access tested: the incoming owner can sign in to every service
      and the emergency Manager recovery command
      (`docs/operations/manager-recovery.md`) has been rehearsed.

## Database

- [ ] Automated backups enabled (provider-native or scheduled script) with the
      documented retention.
- [ ] Restore tested: `make drill` (or `scripts/backup-restore-drill.sh`)
      passes and a restore into a scratch database was verified.
- [ ] Retention period confirmed by Koranco (provisional default: 30 days
      rolling) and documented in the operational record.
- [ ] Database access is least-privilege; application credentials are not
      shared personal accounts.

## Documentation

- [ ] `docs/` reflects the deployed reality: environment variables,
      migration head, staging/production architecture, incident runbooks.
- [ ] Deployment is reproducible from the repository alone (fresh
      staging deploy succeeds without tribal knowledge).
- [ ] Incident procedures available to the on-call owner
      (`docs/operations/incident-response.md`, `troubleshooting.md`).
- [ ] ADRs read and understood by the incoming technical owner (at minimum
      ADR-001, ADR-004, ADR-005, ADR-007, ADR-008, ADR-009, ADR-010/012).

## People

- [ ] **Technical owner** identified (name, role, contact).
- [ ] **Koranco operational owner** identified (the person who approves
      product/business decisions and incident authority).
- [ ] **Support arrangement** documented and signed
      (see [support-arrangement-template.md](support-arrangement-template.md)).
- [ ] Escalation path written down: who to call for critical incidents, in
      what order.
- [ ] End-of-support / handover-back procedure agreed (what happens if the
      support party leaves or the arrangement ends).
