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

## Runtime Operations inspection

The durable runtime publishes `~/.codex/monday-runtime/operations.json` using schema version 2 and producer `monday-runtime`. Its exact privacy-reduced top level is `schemaVersion`, `projectionID`, `contentDigest`, `generatedAt`, `validUntil`, `producer`, `audience`, `runtimeVersion`, `workflows`, `retries`, `deadLetters`, `externalActions`, `commitments`, `decisions`, `sources`, `connections`, `compatibility`, `migrations`, `alerts`, `recoveryInstructions`, and `coverage`. It excludes raw payloads, destinations, locators, credentials, and private content.

Command Center writes `~/.codex/monday-runtime/readback.json` only after rendering a current compatible projection. The receipt must bind projection ID, projection schema, content digest, consumer, compatible app version, display time, `state: displayed`, and exactly one allowlisted rendered Operations tab ID. It proves only that tab, not every Operations view. Run `scripts/monday_runtime.py reconcile-readback --apply`; Planner or Digital Twin readback never proves an Operations view was displayed.
