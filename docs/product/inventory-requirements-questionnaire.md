# Inventory requirements questionnaire

These questions need answers from an accountable Koranco stakeholder before the
Inventory domain is implemented. Every question states where things stand today,
the engineering team's proposed default, and why the answer matters. The
defaults are **proposals**, not decisions. Wording is intended to be
understandable to non-technical farm staff.

See also [inventory.md](inventory.md) for the full design.

## Items and units

### 1. What kinds of inputs does Koranco want to track?

- **Current proposal/system position:** The proposal says inventory and farm
  inputs matter but does not list specific item types. The system tracks none
  today.
- **Proposed default:** Start with a short category list — fertilizer,
  agrochemicals, planting materials, PPE, packaging, tools, fuel, other
  consumables — and only include categories Koranco actually stocks.
- **Koranco decision:** ☐ Use proposed list ☐ Other: \_\_\_\_\_\_\_\_
- **Why this matters:** Categories drive filtering and reports. We should not
  build tracking for inputs Koranco does not stock.

### 2. Does each input have a code or number already?

- **Current proposal/system position:** Existing codes (like worker and block
  codes) are preserved elsewhere in the system. No item codes exist today.
- **Proposed default:** Keep any existing Koranco item codes exactly as they
  are; only generate a code where none exists.
- **Koranco decision:** ☐ We have existing codes (sample: \_\_\_\_\_\_\_\_)
  ☐ Generate new codes
- **Why this matters:** Codes must match what staff already recognize on
  containers, stock books, and purchase records.

### 3. What unit is each input counted in?

- **Current proposal/system position:** The proposal gives no units. The system
  already treats different units (fruit vs kg) as strictly separate.
- **Proposed default:** Each item gets one fixed unit — e.g. kg, litres, bags,
  bottles, pieces, cartons. No automatic conversion between units.
- **Koranco decision:** Units used: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- **Why this matters:** Mixing or converting units (e.g. "1 bag = 50 kg") causes
  wrong stock totals unless Koranco defines an official conversion. We will not
  guess conversions.

### 4. If inputs are bought in one unit but used in another, how is that handled?

- **Current proposal/system position:** Not addressed by the proposal.
- **Proposed default:** Do not convert automatically. Treat repacking as a
  separate, recorded event if it happens.
- **Koranco decision:** ☐ This does not happen ☐ It does (explain): \_\_\_\_\_
- **Why this matters:** "Bag to kg" repacking affects stock accuracy and needs a
  clear rule.

## Storage and people

### 5. Is there one store, or more than one storage location?

- **Current proposal/system position:** The proposal does not mention multiple
  stores.
- **Proposed default:** Assume one store for now; do not build location
  hierarchy.
- **Koranco decision:** ☐ One store ☐ Multiple locations (list): \_\_\_\_\_\_\_
- **Why this matters:** Multiple stores add transfers, location selection, and
  per-location balances — significant complexity we should only build if real.

### 6. Who records stock coming in (receipts)?

- **Current proposal/system position:** The proposal does not say. Today this is
  manual.
- **Proposed default:** Managers and Supervisors can record receipts.
- **Koranco decision:** ☐ Managers only ☐ Managers and Supervisors
  ☐ Other: \_\_\_\_\_\_\_\_
- **Why this matters:** Sets who is trusted to increase stock and appears on the
  audit record.

### 7. Who records stock going out (issues/usage)?

- **Current proposal/system position:** The proposal notes input usage is
  recorded manually but not by whom.
- **Proposed default:** Managers and Supervisors record issues.
- **Koranco decision:** ☐ Managers only ☐ Managers and Supervisors
  ☐ Other: \_\_\_\_\_\_\_\_
- **Why this matters:** Sets who can reduce stock and is accountable for usage.

### 8. Does a Supervisor record input usage out in the field, or at the store?

- **Current proposal/system position:** The proposal mentions field activities
  but not where recording happens.
- **Proposed default:** Record at the store/office while online. No field or
  offline capture in the first version.
- **Koranco decision:** ☐ At the store/office (online) ☐ In the field
  (may need offline)
- **Why this matters:** Field recording with poor connectivity would require the
  offline synchronization machinery — a separate, larger phase.

### 9. Should each issue say which field/block received the input?

- **Current proposal/system position:** The proposal ties inputs to fields/
  activities, but the current system has no field-activities module.
- **Proposed default:** Make the field/block optional on an issue. Do not require
  it.
- **Koranco decision:** ☐ Required ☐ Optional ☐ Not needed
- **Why this matters:** Required attribution enables usage-by-field reports but
  adds work and can block recording when the field is unclear.

### 10. Does "issued from the store" mean "already applied to the field"?

- **Current proposal/system position:** The proposal mentions fertilizer
  schedules and application, but the system has no application record today.
- **Proposed default:** Record only stock leaving the store. Application to the
  field is a separate future activity, not part of this version.
- **Koranco decision:** ☐ Issue = already applied ☐ Issue only (application
  tracked separately/later)
- **Why this matters:** Stock can leave the store days before it is applied, or
  be partly returned. Treating them as one event hides real usage.

### 11. Does issuing or receiving stock require approval before it counts?

- **Current proposal/system position:** The proposal does not mention approvals.
- Attendance/Harvest use permission and audit rather than multi-step approval.
- **Proposed default:** No approval step. The permitted user's recorded action
  counts immediately and is audited.
- **Koranco decision:** ☐ No approval ☐ Approval needed (by whom): \_\_\_\_\_\_\_
- **Why this matters:** Approvals add states, queues, and notifications. Build
  them only if Koranco actually reviews movements before they take effect.

## Stock rules

### 12. What should happen if a user tries to issue more than is in stock?

- **Current proposal/system position:** No rule exists yet.
- **Proposed default:** Block it — stock cannot go below zero. Enter any
  late-arriving receipt first.
- **Koranco decision:** ☐ Block (recommend) ☐ Warn but allow ☐ Allow for
  certain staff: \_\_\_\_\_\_\_\_
- **Why this matters:** Negative stock usually means a missing receipt or a data
  error and makes balances untrustworthy. Offline capture makes this harder,
  which is another reason to start online-only.

### 13. Should the system warn when stock is running low?

- **Current proposal/system position:** Not mentioned.
- **Proposed default:** Do not add reorder levels now unless Koranco already
  uses them. If added later, use one simple minimum quantity per item.
- **Koranco decision:** ☐ Not now ☐ Yes — we use minimum levels (we will supply
  them)
- **Why this matters:** Reorder alerts are only useful if the thresholds are
  real and maintained; invented thresholds create false alarms.

## Traceability and suppliers

### 14. Do receipts need supplier and invoice/delivery-note details?

- **Current proposal/system position:** Not specified.
- **Proposed default:** Optional free-text supplier name and reference number on
  a receipt. Do not build a full supplier list yet.
- **Koranco decision:** ☐ Not needed ☐ Optional text ☐ Full supplier records
- **Why this matters:** A supplier list and purchase orders are a separate
  procurement feature; add only if Koranco manages suppliers in the system.

### 15. Do inputs need batch/lot numbers or expiry dates?

- **Current proposal/system position:** Relevant to fertilizer/agrochemicals but
  not explicitly required.
- **Proposed default:** Omit in the first version. Add only if Koranco must
  track batches or expiry (e.g. for agrochemicals).
- **Koranco decision:** ☐ No ☐ Batch numbers ☐ Expiry dates ☐ Both
- **Why this matters:** Batch and expiry tracking adds per-batch balances and
  expiry reporting. It should be driven by a real traceability or safety need.

### 16. Does Koranco need to track cost or stock value?

- **Current proposal/system position:** Not mentioned; the proposal is about
  operational records, not accounting.
- **Proposed default:** Track quantities only. No cost or valuation in this
  version.
- **Koranco decision:** ☐ Quantity only ☐ Also cost/value (explain): \_\_\_\_\_
- **Why this matters:** Adding cost turns the module toward accounting, with
  currency, valuation method, and correction rules that are out of scope unless
  genuinely needed.

## History and rollout

### 17. Are there existing stock books, spreadsheets, or opening balances to load?

- **Current proposal/system position:** Input usage is currently manual, so
  records likely exist, but their form is unknown.
- **Proposed default:** If Koranco has a current stock list with quantities, load
  it as opening balances. Do not build a generic import tool without real data.
- **Koranco decision:** ☐ No existing data ☐ Spreadsheets/stock book (we will
  provide)
- **Why this matters:** Migration is only worth doing with an authoritative
  source; otherwise start fresh from go-live.

### 18. Must Inventory work offline in the field?

- **Current proposal/system position:** Offline is already built for Attendance
  and Harvest. The proposal does not require offline inventory.
- **Proposed default:** Online-only for the first version. Add offline later, as
  a separate approved phase, only if Supervisors truly record usage in
  low-connectivity fields.
- **Koranco decision:** ☐ Online only ☐ Offline required
- **Why this matters:** Offline stock movements must handle stale/negative
  balances and duplicate-safe sync — substantial complexity already proven hard
  in other modules.

## Access

### 19. Should field Workers have any access to inventory?

- **Current proposal/system position:** Worker application accounts currently
  have only system-status access and no operational permissions.
- **Proposed default:** No. Workers get no inventory access unless Koranco
  confirms a worker self-service usage workflow.
- **Koranco decision:** ☐ No access ☐ Some access (describe): \_\_\_\_\_\_\_\_
- **Why this matters:** Least-privilege access; only add worker inventory rights
  for a confirmed task.

### 20. Who may correct stock mistakes?

- **Current proposal/system position:** Existing domains allow Managers and
  Supervisors to correct with a recorded reason; Inventory adjustments alter
  stock without a normal in/out event.
- **Proposed default:** Managers record adjustments and reversals; Supervisors
  receive and issue. Every correction requires a reason and is audited. Posted
  movements are never deleted.
- **Koranco decision:** ☐ Managers only ☐ Managers and Supervisors
- **Why this matters:** Adjustments can hide shortages or errors, so they need
  clear ownership and oversight while remaining traceable.
