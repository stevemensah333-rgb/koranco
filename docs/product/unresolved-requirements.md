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

- Is attendance daily presence, check-in/out, a shift, crew roll call, task assignment, or something else?
- Who records, verifies, and corrects attendance?
- Can a worker have multiple valid attendance records in one operational day?
- Which statuses and exceptions exist?
- Is attendance associated with a crew, supervisor, field/block, or activity?
- What defines an operational day and timezone boundary?
- Is any biometric, location, or other evidence genuinely required?

## Harvest

- What is the unit of a harvest record: worker, crew, block, load, day, batch, or another entity?
- Which quantities, units, grades, varieties, containers, destinations, or rejections are recorded?
- What existing identifiers and forms must be preserved?
- Who records, verifies, finalizes, and corrects a harvest record?
- Which unit conversions are official?
- What traceability is required in the initial scope without entering deferred full batch/export traceability?

## Corrections

- Which record types can be corrected, by whom, and within what time window?
- Which corrections require approval, and who may approve them?
- Are corrections represented as replacement, reversal, adjustment, or annotation?
- Are reason codes or explanations required?
- Can finalized periods be reopened?
- Who may view audit history, and what is its retention period?

## Offline operation

- Which exact workflows and actions must work offline?
- How long might a device remain disconnected?
- Which devices, operating systems, and browser versions must be supported?
- Are devices assigned or shared, and how is loss or theft handled?
- Can multiple devices work on the same workers or blocks concurrently?
- Which reference data is required offline, and how current must it be?
- Can records be edited while offline after initial capture?
- What happens when a user's access changes while their device is offline?
- How long may a previously authenticated Supervisor field session continue offline?
- Which local operational data must be purged on logout or account change?
- How should queued offline mutations retain their responsible application-user identity?

## Reporting and exports

- Which operational decisions and management questions must reports answer?
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
