# Online attendance

## Confirmed scope

This phase provides online, Supervisor-led roster attendance. A Manager or Supervisor creates a draft for an explicit calendar date, deliberately adds active Workers, marks each included Worker Present or Absent, optionally records arrival/departure times for Present Workers, reviews the roster, and explicitly submits it.

Attendance capture supports a prepared, owner-isolated offline workflow. Drafts and pending submissions are stored in IndexedDB and clearly distinguished from server-confirmed records. PostgreSQL remains authoritative; corrections and management functions remain online-only.

Attendance does not currently refer to a FarmUnit, crew, team, task, shift, payroll concept, biometric, location, QR code, or Worker application account.

## Lifecycle and rules

- A session is `draft` or `submitted`.
- Creating a draft never pre-marks a Worker. Active Workers must be deliberately added; “Mark all present” is a separate explicit action.
- Draft roster changes are sent as one batch. Browser navigation warns while the displayed roster has unsaved changes.
- Saving a draft **replaces the whole roster**: the server deletes and re-inserts
  every entry, so entry UUIDs, creation times, and versions churn across draft
  saves. Only the submitted state is stable (roster fingerprint + audit).
  Per-entry upserts would add diffing complexity without protecting submitted
  data; do not "optimize" the draft path into per-entry updates.
- Every included Worker must be marked before submission, and an empty roster cannot be submitted.
- Present entries may have optional `time_in` and `time_out`. Absent entries cannot have times. When both times exist, time out cannot precede time in.
- Times are local wall-clock values for the explicit attendance date. Audit, creation, update, submission, and correction timestamps are authoritative server-recorded UTC instants.
- A Worker must be active when newly added and still active at submission. If a Worker becomes inactive after a historical submission, that submission remains readable.
- Submitted sessions cannot be edited or discarded through normal APIs. A Manager or Supervisor may make a deliberate entry correction with a required free-text reason; the actor, server time, and before/after values are appended to operational audit history.

The roster displays the Worker register's current code, name, and active status. It deliberately does not snapshot Worker identity fields. Changes to a Worker therefore affect how older attendance is labelled, while the stable Worker identifier and attendance fact remain unchanged.

## Duplicate and concurrency handling

Session and entry versions provide optimistic concurrency checks for draft replacement and submitted-entry correction. Submission locks the session row. Repeating submission for the same already-submitted session returns that session without creating a second fact or audit event.

PostgreSQL prevents two submitted sessions for the same date with the identical sorted Worker population. This is a conservative duplicate guard, not a claim that Koranco permits only one session per day. Whether distinct attendance rosters may validly exist on one date remains unresolved.

## Access

Managers and Supervisors receive `attendance.read`, `attendance.record`, and `attendance.correct`. Worker application accounts receive none of these permissions. The API enforces all decisions; the frontend only presents capabilities already granted by the API session.

## Offline capture

An authenticated Manager or Supervisor explicitly prepares cached active-Worker references. A non-secret 12-hour lease permits temporary same-user attendance capture without storing credentials or tokens. Local submission creates one durable complete-roster operation and is labelled waiting until the API accepts it. Retry, replay, ownership, conflict, cache, and recovery behavior is documented in [offline attendance synchronization](../architecture/offline-sync.md).
