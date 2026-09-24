# Priority 3 plugin runtime

This release adds the plugin-side durable runtime for roadmap items 24, 25, 27, and 28.

## Implemented controls

- transactional SQLite workflow state with optimistic concurrency and durable idempotency receipts;
- bounded retries, dead letters, and replay into a new linked workflow with digest guards;
- one universal external-action state machine with payload/target/destination-bound one-time confirmation, exact narrow standing-authorization policy, indeterminate dispatch protection, and destination-native readback;
- database and Operations-projection migrations, plus explicit app/projection compatibility checks;
- the exact schema-1 privacy-reduced Operations projection and matching native-app readback reconciliation;
- controlled alerts with thresholds, deduplication, counts, cooldown and verified resolution, plus concrete non-sensitive recovery instructions;
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

The test suite covers idempotent replay, conflicting key rejection, stale writers, bounded retries, dead letters, guarded workflow replay, external-action confirmation and native readback, fresh confirmation after failure, database migration, version rejection, privacy reduction, projection migration, and exact readback reconciliation.
