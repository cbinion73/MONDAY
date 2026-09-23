# MONDAY orchestration envelopes

Use these envelopes when deterministic preflight or final validation is proportionate. They contain operational metadata only, never raw source bodies, credentials, private links, or hidden reasoning.

## Request envelope

```json
{
  "schemaVersion": 1,
  "requestID": "stable-local-id",
  "intent": "planning",
  "timeHorizon": "today",
  "domains": ["professional", "personal"],
  "capabilities": ["monday-planning-pipeline"],
  "sourceLanes": ["outlook-calendar", "teams"],
  "currentEvidenceRequired": true,
  "consequential": true,
  "publishToCommandCenter": true,
  "externalActions": [
    {"kind": "send-message", "target": "named recipient", "confirmation": "missing"}
  ]
}
```

Allowed domains are `professional`, `personal`, `operations`, `journal`, `research`, and `cross-domain`. Capabilities and source lanes must exist in the registry. Confirmation values are `missing`, `requested`, or `confirmed`.

The preflight output identifies routing, record owners, source lanes, quality gates, publication gates, and stops. A confirmed external effect is only allowed to be attempted; verification is still required.

## Synthesis envelope

```json
{
  "schemaVersion": 1,
  "requestID": "stable-local-id",
  "status": "complete",
  "currentEvidenceRequired": true,
  "sourceHealth": [
    {
      "sourceID": "outlook-calendar",
      "status": "available",
      "required": true,
      "scope": "primary calendar, current local day midnight to midnight",
      "attemptedAt": "2026-09-23T06:01:00-04:00",
      "succeededAt": "2026-09-23T06:01:02-04:00",
      "itemCount": 4,
      "processedCount": 4,
      "unresolvedCount": 0
    }
  ],
  "claims": [
    {"statement": "Four current-day events were collected.", "evidenceClass": "observed", "sourceIDs": ["outlook-calendar"]}
  ],
  "gaps": [],
  "qa": {"required": true, "verdict": "PASS"},
  "publication": {"requested": true, "state": "displayed", "planID": "plan-1", "displayedPlanID": "plan-1", "schemaVersion": 3},
  "externalActions": []
}
```

Allowed synthesis statuses are `draft`, `partial`, `blocked`, and `complete`. Each source declares whether it is required, its exact scope, collection timestamps for successful retrieval, and explicit processing counts. Sources default to required when the field is omitted. A complete current synthesis cannot have required sources in partial, stale, unavailable, blocked, or unknown state. Optional incomplete lanes remain visible without falsely blocking a bounded result. A displayed publication requires matching plan identifiers. A verified external action requires a non-empty readback locator.
