---
name: monday-thermo-meeting-continuity
description: Govern completed Thermo work meetings through durable lifecycle review, project routing, controlled updates, delayed-artifact reconciliation, and visible blocked states.
---

# MONDAY Meeting Continuity

Use with Project Intelligence, Project Management, and Quality Assurance. Read
[the ledger contract](references/ledger-contract.md) before creating a
continuity run. The dedicated governed meeting-note vault is
`$MONDAY_MEETING_NOTES_VAULT`, separate from Project Knowledge. Use
`scripts/meeting_continuity.py` to bootstrap governed notes,
record review dispositions, record approved project-update receipts, and emit a
read-only reconciliation summary for Command Center.

For an authorized live collection pass, also read
[the connector collection contract](references/connector-collection.md). It
defines the minimum normalized observations that may cross from Outlook, Teams,
SharePoint, or a recap source into the ledger. Never persist raw invitation
bodies, attendees, meeting links, passcodes, transcript text, chat text, or
recording content in the ledger.

Every meeting occurrence has a stable identity and one visible state:
discovered, artifact check due, reviewed, impact classified, project updated,
or reconciliation verified. Blocked states remain visible, including
inaccessible chat, expired recording, delayed recap, and unresolved project
routing.

Every reviewed occurrence receives exactly one disposition: no project route,
reviewed no change, project updated, routing pending, or source blocked.
Update a project only for material, supported impact. Preserve source locator,
meeting date, evidence status, confidence, uncertainty, and continuity-run ID.

Independently assess transcript and chat. Do not advance a manifest or watermark
until governed notes, routing, project-update receipts, and reconciliation pass.
Coverage is complete only when meetings in scope equal reconciled plus explicit
blocked plus explicit pending. Revisit delayed and blocked artifacts.
