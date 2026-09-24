# MONDAY Planning Pipeline data contract

The engine writes schema version `3` JSON to `~/.codex/monday-planner/daily-plan.json`. The document is atomically replaced and contains a stable `planID`, freshness boundary, local-date plan, bounded Calendar titles and times, priorities, explicit source coverage, and a `brief` object for Command Center.

Activity records are append-only JSONL in `Monday Knowledge/100 Activity
Ledger`. MONDAY Operations Receipts are JSON in `Monday Knowledge/400 MONDAY
Operations/Receipts`. Neither record may contain secrets, raw private content,
or hidden reasoning.

Sources are labeled `available`, `partial`, `empty`, `stale`, `blocked`, `unavailable`, or `unknown`. An empty Personal Project Knowledge vault is `available` with zero active records, not unavailable. File existence alone never establishes source availability.

Calendar input is staged separately under `~/.codex/monday-sources` with a source manifest. Planner output is never recycled as Calendar evidence.

Microsoft evidence is represented by independent source manifests for `outlook-calendar`, `outlook-email`, `onedrive-files`, `teams`, and `sharepoint-files`. OneDrive and SharePoint stay separate even though the SharePoint plugin provides both routes. Connector authentication alone does not make a content lane available.

The native app acknowledges a displayed plan in `~/.codex/monday-planner/readback.json`. The `planID` and schema version must match before MONDAY describes Command Center as current.

Every applied planning run also writes:

- `planning-snapshot.json`: the collected evidence projection;
- `plan-source-manifest.json`: source IDs, exact scopes, denominators, artifacts, watermarks, and manifest identifiers for the plan;
- `planning-run.json`: the `collect`, `validate`, `analyze`, `challenge`, `quality`, `publish`, and `readback` stages with their status and evidence.

The plan's `brief` includes `analysis`, `validation`, and `challenges`. Analysis contains separate professional and personal posture, commitments, decisions, consequences, approved planning context, capacity, Operations reconciliation, Meeting Continuity, and evidence-linked pull-forwards. A failed quality gate cannot overwrite the last known-good plan. A conditional publication keeps its conditions visible.
