# MONDAY durable runtime contract

## Storage and transaction boundary

`MONDAY_RUNTIME_ROOT` defaults to `~/.codex/monday-runtime`. `runtime.sqlite3` is the authoritative local runtime state. SQLite transactions cover workflow or action state, the corresponding event, idempotency receipt, dead-letter transition, and migration receipt. The JSON Operations view is a rebuildable privacy-reduced projection, never authoritative state.

The runtime rejects a database schema newer than it understands. Registered migrations advance one version at a time and record the migration identifier, source and target versions, digest, and application time.

## Workflow lifecycle

`queued -> running -> completed`

`running -> retry-wait -> running` is allowed only before the bounded attempt count is exhausted and after the declared retry time. Exhaustion changes `running -> dead-letter`. A terminal workflow is immutable.

Failure data is limited to a controlled error code and a short privacy-safe summary. Dead letters preserve enough state to diagnose and deliberately replay without copying raw source material.

Workflow events are append-only, globally sequenced, individually digested snapshots. Updates and deletion are database-blocked. `rebuild` replays that sequence and fails if a sequence gap, digest mismatch, version regression, or materialized-state mismatch exists.

Replay requires:

- a dead-letter workflow;
- its current version and dead-letter digest;
- `replaySafe: true`;
- a new workflow identifier and idempotency key;
- no externally consequential action type.

Replay creates a new `queued` workflow linked by `replayOf` and marks the dead letter with `replayedBy`. It never changes the original history.

## Idempotency and concurrency

Every mutation stores `(operation, idempotencyKey, requestDigest, response)`. Repeating the same operation and byte-equivalent normalized request returns its first response without another state change. Reusing the key with different content fails closed. Existing-record mutations also require `expectedVersion`; stale writers cannot win.

## Operations projection

The producer writes `~/.codex/monday-runtime/operations.json` with schema version 1 and exactly these top-level fields:

`schemaVersion`, `projectionID`, `contentDigest`, `generatedAt`, `validUntil`, `producer`, `audience`, `runtimeVersion`, `workflows`, `retries`, `deadLetters`, `externalActions`, `commitments`, `decisions`, `sources`, `connections`, `compatibility`, `migrations`, `alerts`, `recoveryInstructions`, and `coverage`.

`producer` is `monday-runtime`; `audience` is `Chris-private-local`. The digest is SHA-256 over canonical JSON before `projectionID` and `contentDigest` are added. The projection expires after fifteen minutes. Alerts contain controlled codes and references, not source content or destinations.

The packaged compatibility matrix carries the machine-readable retry and alert policy; the projection's exact compatibility object carries only app/schema compatibility fields. Immediate integrity, privacy, authorization, digest, or indeterminate-action signals are critical. Consequential dead letters, three failures in sixty minutes, a submitted missing 6:01 pipeline at or after 6:16 local, and a known-running app without readback for more than five minutes use the app's `error` severity. Partial or stale sources, a stalled submitted lease, a block older than thirty minutes, and nonconsequential dead letters are warnings. Alerts deduplicate by code plus entity; their safe summary includes the occurrence count, and the policy defines the cooldown. They disappear only after a verified authoritative state change. Connector, scheduler, app-process, corruption, and privacy monitors must submit signals they alone can observe through the bounded diagnostic interface; the runtime does not pretend to observe them autonomously.

The native app writes `~/.codex/monday-runtime/readback.json` only after rendering a compatible current projection. Reconciliation requires matching projection ID, projection schema, content digest, app version 0.4.x, `state: displayed`, and exactly one recognized rendered tab ID: `operations-overview`, `operations-workflows-dead-letters`, `operations-external-actions`, `operations-commitments-decisions`, `operations-source-health`, `operations-connections`, `operations-compatibility-migrations`, or `operations-alerts-recovery`. The receipt proves only that named view, not every Operations tab. Older app versions return `upgrade-required` and cannot provide runtime readback.
