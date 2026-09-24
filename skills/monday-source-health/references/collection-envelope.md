# Bounded collection envelope contract

Connected Microsoft collection is skill-orchestrated. The owning plugin performs the bounded query and emits a privacy-reduced JSON envelope. `scripts/monday_system.py stage-collection --input <file> --apply` is the transactional validator and committer; it is not a connector client.

## Required envelope

```json
{
  "schemaVersion": 1,
  "collectionID": "stable-idempotency-id",
  "sourceID": "outlook-calendar",
  "route": "outlook-calendar",
  "status": "available",
  "attemptedAt": "2026-09-24T05:00:00-04:00",
  "completedAt": "2026-09-24T05:00:10-04:00",
  "scope": {
    "windowStart": "2026-09-24T00:00:00-04:00",
    "windowEnd": "2026-09-25T00:00:00-04:00",
    "timezone": "America/New_York"
  },
  "counts": {"itemCount": 3, "processedCount": 3, "unresolvedCount": 0},
  "freshnessHours": 12,
  "normalizedItems": [],
  "error": null,
  "limitations": [],
  "priorWatermark": null,
  "proposedWatermark": null,
  "watermarkBasis": "daily bounded query"
}
```

## Transaction rules

- `available` requires complete enumeration, `processedCount == itemCount`, and zero unresolved items.
- `empty` requires a successful complete query and all counts equal to zero.
- `partial` requires explicit unresolved work or an incomplete denominator.
- A partial, blocked, unavailable, or unknown attempt records `latestAttempt` but preserves `lastSuccess`, its artifact, successful timestamp, and watermark.
- A successful artifact is validated, privacy-checked, written to an immutable content-addressed path, hashed, and only then referenced by the atomically replaced manifest. A crash can leave an unreferenced artifact, but cannot make a manifest point to a partial artifact.
- A watermark changes only on a successful transaction, only from the exact prior successful watermark, and only to the explicit proposed watermark. Reuse of a known older successful watermark is rejected as rollback. Connector cursors are otherwise opaque, so the connector remains responsible for proposing a forward cursor.
- Replaying the same collection ID and payload is idempotent. Reusing the ID with different content fails closed.

## Lane privacy allowlists

- Calendar: `title`, `start` or `time`, `end`, `isAllDay`.
- Email: `occurredAt`, `safeSummary`, `projectIDs`, `evidenceClass`, `signalType`, `sourceLocator`.
- OneDrive and SharePoint: `observedAt`, `modifiedAt`, `safeName` or `safeSummary`, `projectIDs`, `evidenceClass`, `sourceLocator`.
- Teams: `occurredAt`, `safeSummary`, `projectIDs`, `meetingOccurrenceID`, `evidenceClass`, `signalType`, `sourceLocator`, and optional owning `fileRoute`.

Raw bodies, HTML, addresses, attendee or participant lists, locations, transcripts, secret-bearing links, passcodes, credentials, tokens, and file bodies are rejected. OneDrive scope must identify the signed-in business drive. SharePoint scope must identify the exact site and library.
