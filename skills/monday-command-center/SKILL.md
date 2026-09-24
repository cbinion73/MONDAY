---
name: monday-command-center
description: Publish and verify MONDAY's versioned Command Center projection across daily planning, projects, personal projects, meeting continuity, activity, operations, and source health. Use when refreshing, diagnosing, or validating the native cockpit.
---

# MONDAY Command Center

Command Center is a read-only projection, never the authoritative record. Publish only evidence already governed by its owning vault or ledger.

Use the plugin-root `scripts/monday_system.py publish` command for a validated plan. After the native app writes its display receipt, run `scripts/monday_system.py reconcile-readback --apply`, then use `status` to verify freshness and the completed planning run. A successful plan file write is `published`, not `displayed`. Represent the cockpit as current only when the app acknowledges the same `planID` and schema version and that receipt reconciles to the matching run.

Reject stale plans, unsupported schema versions, missing source coverage, or readback for a different plan. Never let Command Center create commitments or convert uncertain evidence into a decision.

Read [the Command Center contract](references/command-center-contract.md) when changing the payload or native app.
