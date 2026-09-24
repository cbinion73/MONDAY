---
name: monday-planning-pipeline
description: Build or refresh MONDAY's local daily Command Brief from authorized activity, operations, work projects, Personal Project Knowledge, journals, and calendar records. Use for daily planning, pull-forwards, source health, and Command Center output, not external actions or human-journal writing.
---

# MONDAY Planning Pipeline

Use this skill when Chris asks for a current integrated plan, daily command
brief, pull-forwards, source health, or a refresh of Command Center.

## Boundaries

- Captain's Log is Chris's human journal. Do not write it here.
- Research Chronicle is a source-bound build record. Draft and review it before a durable write.
- Personal Project Knowledge is private and local-only. Never report it to JARVIS.
- Project Knowledge remains the work-project record. The plan includes only minimum-necessary project status.
- Do not create calendar events, external tasks, messages, bookings, purchases, or commitments.
- Never include credentials, calendar bodies, attendees, raw private communications, or hidden reasoning in a receipt or plan.

## Governed staged workflow

1. **Collect.** Use `monday-source-health` and each owning connector plugin to collect the run-scoped Tier 1 lanes. Calendar, Outlook Email, OneDrive, Teams, and SharePoint remain distinct. Normalize them through `stage-collection`. Collect Project Knowledge, Personal Project Knowledge, Decision Ledger, Meeting Continuity, Activity Ledger, MONDAY Operations, and the approved planning-context record. Calendar input is never a prior plan.
2. **Validate.** Run the plugin-root `scripts/monday_system.py snapshot` command or the complete `publish` dry run. Inspect source availability, freshness, bounded windows, item/processed/unresolved denominators, artifacts, watermarks, contradictions, domain collisions, meeting dispositions, and writeback receipts.
3. **Analyze.** The runtime calculates professional and personal project posture, evidence age, project history, open commitments, overdue decisions, consequences, roles, goals, constraints, Calendar load, recorded effort, available capacity, Operations open loops, and evidence-linked pull-forwards. Unknown inputs remain unknown.
4. **Challenge.** Preserve explicit challenges for stale evidence, missing owners, missing next actions, missing consequences, unresolved decisions, overcommitment, incomplete effort, source gaps, Operations failures, and Meeting Continuity gaps.
5. **Quality gate.** Apply `monday-thermo-quality-assurance` and cross-domain boundary checks. `FAIL` writes a diagnostic run manifest but cannot replace the last published plan. `PASS WITH CONDITIONS` may publish only with every condition visible.
6. **Publish.** Run `scripts/monday_system.py publish --analysis <file>` without `--apply` for review, then with `--apply` when suitable. Publication atomically writes the schema-3 Command Brief, evidence snapshot, source manifest, planning-run manifest, Activity Ledger receipt, and Operations receipt.
7. **Read back.** Use `monday-command-center` to require the native app's matching `planID` and schema acknowledgement. The run remains `published-awaiting-readback` until `ack --apply` updates the readback stage to completed. Published is not displayed.

Treat `empty`, `unavailable`, `partial`, `stale`, `blocked`, and `unknown` as distinct source states. Do not infer personal priorities from historical artifacts.

For future-day planning, accept Calendar evidence only when its artifact date and exact local midnight window match the plan date. Never reuse today's schedule tomorrow. Captain's Log and Research Chronicle are outside the pipeline write set.

Read [the data contract](references/data-contract.md) before changing the schema or adding a source lane.
Read [the approved planning-context contract](references/planning-context.md) when configuring roles, goals, constraints, or capacity.
