# Command Center contract

Schema version `3` adds:

- `planID`: immutable publication identifier
- `validUntil`: freshness boundary
- `coverage`: overall state, sources, and unresolved gaps
- `brief`: professional projects, personal projects, meeting continuity, decisions, activity, and operations
- `publication`: producer and contract version

The native app writes `~/.codex/monday-planner/readback.json` after decoding and displaying a current plan. The receipt includes `planID`, `schemaVersion`, `consumer`, `consumedAt`, and app version. A mismatched or absent receipt is not display verification.
