# Priority 2 release, governed Digital Twin

Priority 2 implements roadmap items 18 through 23. Completion requires machine-readable promise and authority contracts, separate governed Twin stores, lifecycle and privacy controls, a read-only native inspection view with exact readback, and an approval-gated redacted playbook workflow.

## Item 18: Promise Traceability Matrix

`skills/monday-digital-twin/references/promise-traceability-matrix.json` gives each material Priority 2 and boundary promise a stable ID, owner, control, implementation artifacts, verification, and status. `monday_twin.py audit-contracts` rejects duplicate or missing required promises, missing implemented artifacts, invalid statuses, and missing verification.

## Item 19: Source Authority and Domain Boundary Matrix

`source-authority-domain-boundary-matrix.json` covers all five Microsoft evidence lanes, every existing governed record, user-supplied evidence, conversation memory, the professional and personal Twin stores, governance receipts, Command Center projection, and redacted playbooks. Unknown sources fail closed. Activity, Operations, journals, and conversation cannot be silently promoted into the Twin. Personal evidence cannot enter professional storage or playbooks.

## Item 20: Twin schemas

Professional and personal records use separate draft-2020-12 JSON schemas and physical roots. Both require stable IDs, explicit purpose, evidence class, confidence, sensitivity, lifecycle state, version, timezone-aware dates, consent, learning permission, minimum-necessary source references, and projection controls. Personal records accept only explicit or user-supplied consent and cannot project their statements.

The Twin is a derived claim index. It does not replace Project Knowledge, Personal Project Knowledge, the Decision Ledger, source systems, or journals.

## Item 21: lifecycle and privacy controls

- Capture is idempotent and rejects changed duplicates.
- Correction requires the exact current version, creates a new immutable version, and marks the prior version superseded.
- Forgetting provides a dry-run impact inventory, requires exact record-ID confirmation, transactionally removes the current record, history, affected projections, and affected local playbook content, then writes a content-free tombstone and invalidation receipt.
- Opt-outs cover global learning, one domain, one source, or one record type. They block future persistence and survive process restart. They do not silently delete existing records.
- Redaction recursively removes secret-bearing fields, emails, URLs, paths, credentials, and source locators, then fails closed if a prohibited class remains.

## Item 22: Command Center inspection

The app consumes `~/.codex/monday-twin/inspection.json` through an exact schema independent of Planner schema 3. The Digital Twin room contains Overview, Promises, Claims and Evidence, Authority and Boundaries, Privacy and Lifecycle, and Playbooks views. It is read-only.

The app rejects unsupported, expired, duplicate, denominator-inconsistent, wrong-domain, personal-statement-bearing, or secret-bearing projections. It writes a separate readback binding projection ID, schema, content digest, app version, and rendered view ID. Plugin reconciliation is required before display is verified.

## Item 23: redacted playbooks

Only active, shareable professional Twin records with supported, validated, or decided evidence may enter a draft. Personal and opted-out records are rejected. Draft approval binds the exact digest. Any source correction, supersession, forgetting, or opt-out invalidates preparation. A prepared package is local and `not-attempted`; an external attempt requires the exact confirmation ID, and only matching destination readback establishes `verified`.

## Release gates

1. Contract audit passes with the full Priority 2 denominator.
2. All existing plugin and Priority 2 tests pass.
3. Every skill, script, registry, and plugin validator passes.
4. Cross-domain, raw-source, secret, opt-out, stale-version, and digest-mismatch negative tests fail closed without replacing valid state.
5. A forgetting canary is absent from all declared Twin, projection, and local playbook roots after exact forgetting.
6. Command Center unit tests and signed Release build pass.
7. A live privacy-reduced projection is rendered in `/Applications/Command Center.app`, and its matching Twin readback reconciles.
8. The authoritative plugin source is committed, tagged, installed from an immutable build, byte-parity checked, and discovered by a fresh Codex process.
9. Independent QA returns PASS with no condition inside items 18 through 23.
