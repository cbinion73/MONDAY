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

An available or empty source must have a successful collection time. A source is stale when its successful collection is older than its configured freshness threshold. `itemCount: 0` is not empty unless the bounded collection succeeded.
