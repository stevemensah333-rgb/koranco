# Offline Harvest physical-device field test

## Purpose

Run this checklist on every supported phone/browser combination before the
production pilot and after material PWA, IndexedDB, service-worker, or browser
support changes. Desktop automation cannot establish behavior under OS process
termination, storage pressure, shared-device custody, or real field conditions.
Use synthetic test records and a disposable test environment, never production
data.

Record the device model, OS/browser versions, application commit, operator,
date, network conditions, and result. A failed or ambiguous step blocks claiming
that device/browser combination as supported.

## Preconditions

- [ ] Test environment is isolated and migrations are current.
- [ ] A Manager/Supervisor test account has `harvest.read` and `harvest.record`.
- [ ] A second test account exists for owner-isolation checks.
- [ ] An active standalone Block (or valid Field without active child Blocks)
      exists; a second FarmUnit can be deactivated for conflict testing.
- [ ] The device has a screen lock and is not using private/incognito mode.
- [ ] Browser storage has enough space and the operator knows how to inspect
      installed-site storage without clearing it.

## A. Preparation and storage boundary

1. Sign in as User A and open Harvest.
2. Select **Prepare FarmUnits for offline use** and record the displayed refresh
   time.
3. Confirm IndexedDB contains `koranco-attendance-offline` at schema version 2
   with `harvestFarmUnits`, `harvestDrafts`, and `harvestOutbox` stores.
4. Confirm no API response appears in Cache Storage. The field shell/static
   assets may be cached.
5. Confirm browser storage contains no session cookie, password, password hash,
   CSRF secret, or reusable authentication token in Harvest records/stores.

Expected: active FarmUnits are available to User A, preparation is explicit,
and only the minimum non-secret reference data is stored.

## B. Offline capture, reload, and synchronization

1. Start a new Harvest draft while connected.
2. Disable connectivity using device controls.
3. Select a prepared FarmUnit, enter a valid quantity/unit and recognizable
   synthetic note, then save.
4. Force-close the browser from the OS task switcher; reopen the installed app
   or browser and return to Harvest.
5. Confirm the draft and exact decimal text/note survive and are labelled as
   saved on this device—not server-confirmed.
6. Review and submit while still offline.
7. Confirm the UI says **Waiting to sync**, keeps the values, and offers
   **Sync now**.
8. Restore connectivity, reauthenticate as User A if requested, and synchronize.
9. Confirm one submitted server HarvestRecord exists with the same UUID/values
   and one submission audit event. Confirm the local item says server confirmed.

## C. Retry after response loss

1. Prepare another unique synthetic record.
2. During synchronization, interrupt connectivity immediately after the server
   receives the request (use a controlled proxy/network tool where available).
3. Confirm the device retains the pending operation.
4. Restore connectivity and retry.
5. Verify exactly one HarvestRecord and one submission audit event exist.

A duplicate record or duplicate submission event is a release blocker.

## D. Owner isolation and logout

1. As User A, queue a Harvest while offline.
2. Restore connectivity but prevent synchronization, then sign out.
3. Confirm the application warns that unsynchronized Attendance or Harvest will
   remain owner-bound on this device.
4. Sign in as User B.
5. Confirm User B cannot list, open, alter, or synchronize User A's draft.
6. Sign out and reauthenticate as User A; confirm User A can resume it.

## E. Conflict and permission handling

For each case, confirm values remain visible and the result is **Needs
attention**, never silent overwrite or deletion:

- [ ] FarmUnit was deactivated after preparation.
- [ ] A Field became ambiguous because an active child Block was added.
- [ ] An existing server draft changed from the device's base version.
- [ ] `harvest.record` was revoked before synchronization.
- [ ] The account was disabled or its session expired.
- [ ] An unsupported payload version was queued in a controlled test.

Authentication expiry should request same-user sign-in and remain pending;
revoked authorization and semantic conflicts should require attention.

## F. Combined queue and update gate

1. Queue one Attendance submission and one Harvest submission.
2. Confirm the shared status reports both domain counts.
3. Make a new service-worker version available.
4. Confirm activation is held while either outbox still contains work, including
   needs-attention work.
5. Synchronize both; confirm the update can activate only after both queues are
   clear.

## G. Adverse device conditions

Repeat a saved draft and queued submission through:

- [ ] screen lock/unlock;
- [ ] OS backgrounding for at least 30 minutes;
- [ ] browser force-close and device restart;
- [ ] intermittent 2G/3G or packet-loss simulation;
- [ ] low-battery mode;
- [ ] storage-pressure warning where safely reproducible.

Document browser/OS eviction behavior. Clearing site data, uninstalling, private
mode, device loss, and some OS eviction can destroy unsynchronized work; the
system does not claim otherwise.

## Evidence and release decision

Attach screenshots or logs for preparation time, waiting state, conflict state,
combined queue, server record/audit counts, and final synchronization. Record
failures in the release/incident tracker with device details and reproduction
steps. Do not enable field use on a device/browser combination until sections A
through F pass and section G's observed limits are accepted operationally.
