# Source manifest contract

Each source manifest is JSON with:

- `schemaVersion`: `1`
- `sourceID`, `name`, and `kind`
- `status`: `available`, `partial`, `empty`, `stale`, `blocked`, `unavailable`, or `unknown`
- `attemptedAt` and optional `succeededAt`
- `windowStart` and `windowEnd`
- `itemCount`, `processedCount`, and `unresolvedCount`
- optional `watermark`
- `detail`, `error`, and `artifact`
- `latestAttempt`: newest bounded attempt, including its exact scope, counts, status, artifact candidate, and error
- `lastSuccess`: last fully successful scope, counts, artifact digest, successful timestamp, and watermark
- `collectionHistory`: bounded idempotency history containing collection IDs, envelope digests, attempt status, timestamps, and successful watermarks used to reject conflicting replay and known rollback

An available or empty source must have a successful collection time. A source is stale when its successful collection is older than its configured freshness threshold. `itemCount: 0` is not empty unless the bounded collection succeeded.

The top-level `status` describes the latest attempt. After a partial, blocked, unavailable, or unknown attempt, the top-level `succeededAt`, `artifact`, and `watermark` continue to point to `lastSuccess`; this preserves historical evidence without representing it as current coverage. The latest failed attempt never overwrites the last successful artifact and never changes its watermark. Daily Calendar has no incremental watermark.

For complete enumeration, `itemCount` is the eligible denominator, `processedCount` is the number fully normalized and reconciled, and `unresolvedCount` records eligible items still unresolved. `available` requires every item processed and zero unresolved. An incomplete or unknown denominator is `partial`, never `available`.
