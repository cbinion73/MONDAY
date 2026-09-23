---
name: monday-source-health
description: Establish truthful availability, freshness, coverage, denominators, and unresolved state for MONDAY sources. Use before current planning, portfolio reporting, meeting continuity, or any claim that depends on connected evidence.
---

# MONDAY Source Health

Inspect the source itself or a current collection receipt. A file's existence is not proof that the underlying source is connected or current.

Classify every source as `available`, `partial`, `empty`, `stale`, `blocked`, `unavailable`, or `unknown`. `empty` requires a successful bounded query with zero results. Record attempted and successful collection times separately.

Use the plugin-root `scripts/monday_system.py stage-source` command to persist a normalized manifest, and `source-status` to inspect the registry. For Calendar, stage normalized titles and times in a separate source file, never in the planner output.

Route Microsoft evidence through its owning installed plugin. Do not use one connector as a vague substitute for another, and keep OneDrive and SharePoint coverage separate even though both are exposed through the SharePoint plugin.

Do not advance a watermark on partial, failed, or unreconciled collection. Preserve the retry path and unresolved denominator.

Read [the source manifest contract](references/source-manifest.md) before adding a source or changing source-health semantics.
Read [the connector routing contract](references/connector-routing.md) before collecting Microsoft evidence or changing a connector lane.
