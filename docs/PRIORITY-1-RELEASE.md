# Priority 1 release, dependable daily system

Priority 1 implements master-roadmap items 11 through 17. Completion requires the plugin to collect bounded evidence honestly, run a full staged planning analysis, enforce meeting continuity, survive rollover and failure, and prove one unattended next-day run.

## Item 11: bounded Tier 1 collectors

- Connector-owning Codex plugins perform the actual bounded query.
- `monday-source-health` defines separate procedures for Outlook Calendar, Outlook Email, business OneDrive, Teams, and SharePoint.
- `scripts/monday_system.py stage-collection` validates canonical route, window, scope, privacy allowlist, denominators, idempotency, normalized artifact, and watermark transaction.
- Python does not impersonate Outlook, Teams, OneDrive, or SharePoint connector clients.

## Item 12: truthful collection state

- Manifests retain `latestAttempt` separately from `lastSuccess`.
- Partial, blocked, unavailable, and unknown attempts preserve the last successful artifact, timestamp, digest, and watermark.
- Available requires complete processing and zero unresolved items. Successful zero is empty.
- All five lanes retain exact window or scope, counts, artifact, error, freshness, and watermark evidence.

## Items 13 and 14: staged analysis

Every run records: collect, validate, analyze, challenge, quality, publish, and readback. Native app receipts are validated and reconciled into the matching run with `reconcile-readback --apply`; a receipt file alone does not complete the run.

Analysis covers professional and personal project posture, project history, evidence age, commitments, decisions, consequences, approved roles, goals, constraints, capacity, Calendar load, effort, Operations open loops, Meeting Continuity, and evidence-linked pull-forwards. Challenges expose source gaps, stale evidence, missing owners or next actions, missing consequences, overdue decisions, overcommitment, unknown effort, Operations failures, and continuity gaps.

The quality gate is identified as `monday-thermo-quality-assurance`. `FAIL` writes diagnostics but cannot replace the last known-good plan. `PASS WITH CONDITIONS` keeps every condition visible.

## Item 15: meeting-to-project continuity

- Every eligible governed occurrence retains an explicit lifecycle and routing disposition.
- Material project impact requires a controlled project update and receipt or recoverable governed marker.
- The planner reads back the target project marker. A false reconciliation claim without writeback or readback fails QA.
- Pending or blocked occurrences remain visible and prevent a clean verdict.

## Item 16: failure and rollover evaluation

Automated tests cover tomorrow rollover; empty versus unavailable Calendar; stale, partial, failed, recovered, and idempotently replayed collection; missing or corrupt replay artifacts; failure preservation, watermark compare-and-set, and known rollback rejection; privacy, metadata-type, connector-route, and exact-scope rejection; ordered in-window Calendar events; all five bounded lanes; connected-source influence on posture; Activity Ledger analysis; project history, commitment-specific age, decisions, consequences, roles, goals, constraints, daily capacity, and overcommitment; contradictions and current-state Operations reconciliation; excluded and eligible Meeting Continuity behavior; professional/personal and journal boundaries; publish-blocking QA; Meeting Continuity writeback/readback; versioned run/source manifests; and reconciled Command Center readback with bounded timestamps.

## Item 17: unattended next-day proof

This gate remains open until the installed release crosses local midnight and produces timestamped evidence of connector attempts, the exact new-day Calendar window, a current-day plan, non-FAIL quality verdict, publication, and matching native-app readback without manual repair. A simulated test does not close this gate.

## Release artifacts

- `~/.codex/monday-sources/<source>.json`
- `~/.codex/monday-sources/<source>.manifest.json`
- `~/.codex/monday-planner/planning-snapshot.json`
- `~/.codex/monday-planner/plan-source-manifest.json`
- `~/.codex/monday-planner/planning-run.json`
- `~/.codex/monday-planner/daily-plan.json`
- `~/.codex/monday-planner/readback.json`

## Release gates

1. All plugin, skill, pipeline, collector, continuity, and Project Intelligence tests pass.
2. All shipped scripts compile and every skill validates.
3. Plugin validation passes.
4. Authoritative source is committed and tagged with an immutable build.
5. The personal-marketplace build is reinstalled and source/cache parity passes.
6. A fresh Codex task discovers the installed MONDAY capabilities.
7. A live current-day run publishes a schema-3 plan and receives matching Command Center readback.
8. The unattended next-day proof in item 17 passes.
