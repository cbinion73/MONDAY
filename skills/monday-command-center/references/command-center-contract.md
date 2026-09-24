# Command Center contract

Schema version `3` adds:

- `planID`: immutable publication identifier
- `validUntil`: freshness boundary
- `coverage`: overall state, sources, and unresolved gaps
- `brief`: professional projects, personal projects, meeting continuity, decisions, activity, and operations
- `publication`: producer and contract version

The native app writes `~/.codex/monday-planner/readback.json` after decoding and displaying a current plan. The receipt includes receipt `schemaVersion`, `planID`, `planSchemaVersion`, `consumer`, `consumedAt`, state, and app version. Run `scripts/monday_system.py reconcile-readback --apply` to validate the receipt against both the current plan and its run manifest. A mismatched, malformed, absent, or unreconciled receipt is not display verification.
