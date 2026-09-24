---
name: monday-source-health
description: Establish truthful availability, freshness, coverage, denominators, and unresolved state for MONDAY sources. Use before current planning, portfolio reporting, meeting continuity, or any claim that depends on connected evidence.
---

# MONDAY Source Health

Inspect the source itself or a current collection receipt. A file's existence is not proof that the underlying source is connected or current.

Classify every source as `available`, `partial`, `empty`, `stale`, `blocked`, `unavailable`, or `unknown`. `empty` requires a successful bounded query with zero results. Record attempted and successful collection times separately.

For a connected Microsoft lane, use its owning plugin to run the bounded query, reduce the result to the allowlisted canonical collection envelope, and pass that envelope to plugin-root `scripts/monday_system.py stage-collection --input <file> --apply`. The runtime validates route, scope, denominators, privacy, idempotency, artifact shape, and watermark behavior before atomically committing the artifact and manifest. Python does not impersonate a connector client.

`stage-source` remains a compatibility interface for existing automations. New collection workflows use `stage-collection`. Use `source-status` to inspect all five canonical lanes, including lanes with no manifest. For Calendar, persist only normalized titles, local start/end, and all-day state in the separate Calendar artifact, never in planner output or a reused prior plan.

Route Microsoft evidence through its owning installed plugin. Do not use one connector as a vague substitute for another, and keep OneDrive and SharePoint coverage separate even though both are exposed through the SharePoint plugin.

Do not advance a watermark on partial, failed, blocked, or unreconciled collection. Preserve the last successful artifact, successful timestamp, and watermark while recording the newest attempt and its exact error. A recovery advances coverage only after a fully validated successful transaction. Replaying the same collection ID must be idempotent; a conflicting replay fails closed.

Read [the source manifest contract](references/source-manifest.md) before adding a source or changing source-health semantics.
Read [the connector routing contract](references/connector-routing.md) before collecting Microsoft evidence or changing a connector lane.
Read [the bounded collection envelope contract](references/collection-envelope.md) before normalizing connector output.
Follow [the five Tier 1 collector procedures](references/tier1-collectors.md) for Calendar, Email, OneDrive, Teams, and SharePoint.

For any non-Tier-1 connector, use `monday-evaluation` first. Do not stage an evaluating, unregistered, rejected, or retired connector as canonical evidence. A pilot connector remains optional and cannot repair a missing Tier 1 lane.
