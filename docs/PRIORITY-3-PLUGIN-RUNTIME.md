# Priority 3 plugin runtime

This release adds the plugin-side durable runtime for roadmap items 24, 25, 27, and 28.

## Implemented controls

- transactional SQLite workflow state with optimistic concurrency and durable idempotency receipts;
- bounded retries, dead letters, and replay into a new linked workflow with digest guards;
- one universal external-action state machine with payload/target/destination-bound one-time confirmation, exact narrow standing-authorization policy, indeterminate dispatch protection, and destination-native readback;
- database and data-preserving Operations-projection migrations with verified pre-migration backups, atomic rollback, restore receipts, and explicit upgrade/downgrade policy;
- the exact schema-2 privacy-reduced Operations projection, capability 2.0.0 pairing, and matching schema-1 native-app readback reconciliation;
- durable controlled alerts with thresholds, first/last seen, counts, cooldown, acknowledgement, verified resolution, reopening, append-only lifecycle events, and provenance that distinguishes runtime-derived from external-monitor signals;
- append-only sequenced events and deterministic rebuild verification;
- real staged commitments, decisions, source-health, and connection diagnostics for the four matching Command Center views.

The runtime never invokes connectors. Connector-owning skills perform external reads or writes and submit only bounded receipts. Failed or uncertain consequential actions are not automatically retried.

## Verification

Run:

```bash
python3 -m unittest tests.test_priority3_runtime -v
python3 skills/monday-core/scripts/monday_core.py validate-registry
python3 /Users/chris.binion/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/monday-runtime
```

The test suite covers idempotent replay, conflicting key rejection, stale writers, bounded retries, dead letters, guarded workflow replay, exact external-action states, confirmation and native readback, fresh confirmation after failure, database migration and backup, upgrade and downgrade rejection, privacy reduction, projection migration and verified restore, durable alert acknowledgement/resolution/reopening, and exact readback reconciliation.
