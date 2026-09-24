# Command Center contract

Schema version `3` adds:

- `planID`: immutable publication identifier
- `validUntil`: freshness boundary
- `coverage`: overall state, sources, and unresolved gaps
- `brief`: professional projects, personal projects, meeting continuity, decisions, activity, and operations
- `publication`: producer and contract version

The native app writes `~/.codex/monday-planner/readback.json` after decoding and displaying a current plan. The receipt includes receipt `schemaVersion`, `planID`, `planSchemaVersion`, `consumer`, `consumedAt`, state, and app version. Run `scripts/monday_system.py reconcile-readback --apply` to validate the receipt against both the current plan and its run manifest. A mismatched, malformed, absent, or unreconciled receipt is not display verification.

## Digital Twin inspection

The governed Twin uses a separate exact schema at `~/.codex/monday-twin/inspection.json`. It contains privacy-reduced professional and personal summaries, promise traceability, source authority, boundary controls, lifecycle receipts, opt-outs, playbook states, coverage counts, `projectionID`, and `contentDigest`. It never contains raw source bodies, source locators, credentials, forgotten content, or projected personal statements.

Command Center writes `~/.codex/monday-twin/readback.json` only after the Digital Twin room renders a current valid projection. The receipt binds projection ID, schema, content digest, consumer, app version, display time, state, and rendered view ID. Run `scripts/monday_twin.py reconcile-readback --apply`. Planner readback never proves Twin inspection display.
