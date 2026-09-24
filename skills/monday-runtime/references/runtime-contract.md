# MONDAY durable runtime contract

## Storage and transaction boundary

`MONDAY_RUNTIME_ROOT` defaults to `~/.codex/monday-runtime`. `runtime.sqlite3` is the authoritative local runtime state. SQLite transactions cover workflow or action state, the corresponding event, idempotency receipt, dead-letter transition, and migration receipt. The JSON Operations view is a rebuildable privacy-reduced projection, never authoritative state.

The runtime rejects a database schema newer than it understands. Database schema 2 is paired with capability 2.0.0. The registered 1 to 2 migration creates and integrity-checks a private SQLite backup before mutation, records its digest and path, and restores it atomically if migration fails.

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

The producer writes `~/.codex/monday-runtime/operations.json` with schema version 2 and exactly these top-level fields:

`schemaVersion`, `projectionID`, `contentDigest`, `generatedAt`, `validUntil`, `producer`, `audience`, `runtimeVersion`, `workflows`, `retries`, `deadLetters`, `externalActions`, `commitments`, `decisions`, `sources`, `connections`, `compatibility`, `migrations`, `alerts`, `recoveryInstructions`, and `coverage`.

`producer` is `monday-runtime`; `audience` is `Chris-private-local`. The digest is SHA-256 over canonical JSON before `projectionID` and `contentDigest` are added. The projection expires after fifteen minutes. Alerts contain controlled codes and references, not source content or destinations.

The compatibility object and packaged matrix bind plugin versions 0.1.x, capability 2.0.0, database 2, projection 2, readback 1, and app versions 0.4.1 through 0.4.x. Automatic downgrade is forbidden. Projection 1 to 2 migration is data preserving, creates and verifies a private backup, writes atomically, restores on failure, records a receipt, and supports an explicit digest-guarded restore.

External actions preserve their exact state: `confirmation-required`, `confirmed`, `attempting`, `attempted`, `verified`, `failed-before-dispatch`, `indeterminate`, or `cancelled`. `failed-before-dispatch` still requires fresh confirmation. Its readback is `matched` only when a destination-native no-effect receipt exists; a local pre-dispatch failure remains `missing`.

Immediate integrity, privacy, authorization, digest, or indeterminate-action signals are critical. Consequential dead letters, three runtime-observed workflow failures in sixty minutes, a submitted missing 6:01 pipeline at or after 6:16 local, and a known-running app without readback for more than five minutes use the app's `error` severity. Partial or stale sources, a stalled submitted lease, a block older than thirty minutes, and nonconsequential dead letters are warnings. Alerts are durable records with first and last seen time, count, cooldown, open or acknowledged or resolved status, append-only lifecycle events, and verified resolution evidence. A resolved alert reopens when new triggering evidence arrives. Runtime events derive signals the runtime can observe. Connector, scheduler, app-process, corruption, and privacy signals remain explicitly labeled `external-monitor`; they never masquerade as runtime-derived.

Recovery instructions are bounded numbered steps with explicit verification, rollback, and evidence identifiers. They do not authorize an external effect.

The native app writes `~/.codex/monday-runtime/readback.json` only after rendering a compatible current projection. Reconciliation requires matching projection ID, projection schema, content digest, app version 0.4.1 through 0.4.x, `state: displayed`, and exactly one recognized rendered tab ID: `operations-overview`, `operations-workflows-dead-letters`, `operations-external-actions`, `operations-commitments-decisions`, `operations-source-health`, `operations-connections`, `operations-compatibility-migrations`, or `operations-alerts-recovery`. The receipt proves only that named view, not every Operations tab. Older app versions return `upgrade-required` and cannot provide runtime readback.
