# Unresolved requirements

These questions require confirmation from accountable Koranco stakeholders. They intentionally have no inferred answers.

## Organization and farm structure

- Is the system for one farm/site or multiple farms, locations, or legal entities?
- What are the official terms, identifiers, and relationships for farms, fields, blocks, and any sub-blocks?
- Can boundaries, names, areas, ownership, or operational status change over time?
- What historical paper or spreadsheet records must be migrated?
- What volumes of users, workers, blocks, daily records, and retained history are expected?

## Users and permissions

- What may each confirmed user category view, create, correct, approve, export, and administer?
- Must access be scoped by farm, field, team, department, or another boundary?
- Are devices or user accounts shared today?
- How should seasonal, inactive, and departing users be handled?
- Which future operational permissions should Manager and Supervisor receive for each approved domain?
- Who performs the documented emergency operator recovery procedure and approves its use?

## Worker register

- Are there existing authoritative worker identifiers?
- Which worker categories are recognized?
- How are duplicates identified and resolved?
- Which personal data is necessary, who may access it, and how long is it retained?
- Must duplicate worker records ever be merged, and under whose authority?

## Fields and blocks

- Are “field” and “block” distinct concepts at Koranco?
- Which identifiers, statuses, areas, units, varieties, and tenure details are required?
- Is map geometry or GPS required, or is register data sufficient?

## Attendance

- The initial confirmed workflow is an online Supervisor-led roster for an explicit date. Managers and Supervisors may record and correct it; statuses are Present and Absent, with optional time-in/time-out for Present entries. No FarmUnit or biometric/location evidence is included.
- Can distinct Worker rosters validly produce multiple attendance sessions on one operational date, and what business boundary distinguishes them?
- Is future attendance associated with a crew, team, shift, supervisor, field/block, or activity?
- What defines an operational day and timezone boundary?
- Are additional statuses or exception reasons required later?
- Does Koranco require immutable Worker name/code snapshots on historical attendance, or is displaying current Worker-register identity correct?

## Harvest

- The first record is one quantity from one active FarmUnit on one operational date. It has no Worker, team, crop-cycle, batch, destination, inventory, or quality relationship.
- What are Koranco's official harvest units? `fruit_count` and `kilograms` are provisional configuration; no conversion is approved.
- Is grade or quality/rejection recording required, and what are its controlled definitions?
- Is crop, variety, or planting-cycle context required for operational harvest records?
- Is team or crew attribution required, and what is the authoritative Team domain?
- Are load or batch identifiers required before deferred full export traceability?
- Must harvest identify a destination or export relationship?
- What existing identifiers and forms must be preserved?
- Is the current Manager/Supervisor record-and-correct authority final, and is later verification required?
- Which unit conversions, if any, are official?
- What traceability is required in the initial scope without entering deferred full batch/export traceability?

## Inventory

Inventory is in design only (see [inventory.md](inventory.md) and the
[questionnaire](inventory-requirements-questionnaire.md)); no code is
implemented. The following are open Koranco decisions and are not inferred:

- Which input categories does Koranco actually stock and track (fertilizer,
  agrochemicals, planting materials, PPE, packaging, tools, fuel, consumables,
  other)?
- Are there existing item codes, and what format do they use?
- What is the official unit of each item, and are any authoritative unit
  conversions defined (e.g. bag to kg)? Conversions are not assumed.
- One store or multiple stock locations?
- Who records receipts and who records issues — Managers only, or Managers and
  Supervisors?
- Do Supervisors record input usage in the field (possible offline need) or at
  the store/office online?
- Is FarmUnit attribution on issues required, optional, or unnecessary?
- Does "issued from store" mean "already applied to the field," or are issue and
  actual application separate events?
- Are approvals required before a receipt/issue takes effect?
- What is the negative-stock policy (hard-prevent is the proposed default)?
- Are item-specific reorder thresholds used, or should low-stock alerts be
  deferred?
- Are batch/lot numbers and/or expiry dates required (likely relevant only to
  some agrochemicals)?
- Are supplier records and invoice/delivery references required, or is optional
  free text sufficient? Are purchase orders/procurement in scope?
- Is cost or stock valuation required, or quantity/control only?
- Are there existing stock books/spreadsheets and current opening balances to
  migrate?
- Is offline Inventory capture required, or online-only?
- Should Worker application accounts have any inventory access (proposed: none)?
- Who may perform stock adjustments/reversals (proposed: Managers only)?

## Corrections

- Which record types can be corrected, by whom, and within what time window?
- Which corrections require approval, and who may approve them?
- Are corrections represented as replacement, reversal, adjustment, or annotation?
- Are reason codes or explanations required?
- Can finalized periods be reopened?
- Who may view audit history, and what is its retention period?

## Offline operation

- Attendance capture is an implemented offline workflow. Offline Harvest capture (draft + first submission) is **also implemented** under [ADR-009](../decisions/ADR-009-harvest-offline-synchronization.md); submitted-record correction, Farm Structure administration, account administration, reporting, and audit browsing remain online-only.
- The open questions ADR-009 lists (is offline Harvest required and for which roles/blocks; unit-set confirmation; lease duration; processed-operation retention; stranded-queue reconciliation authority; per-domain lease permission flags) remain open for accountable Koranco confirmation and are not inferred as answered.
- The initial offline authorization lease is 12 hours. Is that suitable after field testing?
- Which devices, operating systems, and browser versions must be supported?
- Are devices assigned or shared, and how is loss or theft handled?
- Can multiple devices work on the same workers or blocks concurrently?
- Which reference data is required offline, and how current must it be?
- Can records be edited while offline after initial capture?
- Who may reconcile preserved work when its owner is disabled or permanently unavailable?
- Which local operational data must be purged on logout or account change?
- What physical custody, screen-lock, privacy, and managed-device practices apply to shared phones?
- What retention periods apply to processed server operation IDs and confirmed local copies?

## Reporting and exports

A restrained reporting and management overview phase has begun (see
[reporting](reporting.md) and [ADR-010](../decisions/ADR-010-management-reporting.md)).
The following questions remain open and are not inferred as answered:
- What are the approved definitions for each metric?
- Which groupings, filters, comparisons, and reconciliation paths are required?
- Must any current paper or spreadsheet reports be reproduced?
- Which export formats are required, and who may export personal or operational data?

## Deployment and governance

- Where will development, staging, training, and production run, and who will operate them?
- Will authentication use an existing Koranco identity provider or system-managed credentials?
- What domains, DNS, certificate, and email facilities are available?
- What availability, recovery-time, and recovery-point objectives apply?
- What backup retention, restore-testing, and incident-response policies apply?
- Which Ghanaian data-protection, employment, exporter, or contractual obligations have been assessed?
- Who owns product decisions and approves workflow definitions?
