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

## Workflow

1. Use `monday-source-health` to collect or verify current manifests. Calendar, Outlook Email, OneDrive, Teams, and SharePoint remain distinct evidence lanes. Calendar input must come from a separate normalized Calendar artifact, never the previous planner output.
2. Run the plugin-root `scripts/monday_system.py snapshot` command and inspect coverage, commitments, projects, personal projects, decisions, meeting continuity, activity, and operations.
3. Use the relevant MONDAY skills to analyze the snapshot. Challenge stale evidence, missing owners, capacity conflicts, and unsupported certainty. Save any model-produced recommendations as a bounded analysis JSON containing only focus, priorities, notes, compass, pull-forwards, and risks.
4. Run `scripts/monday_system.py publish --analysis <file>` without `--apply` and review the full versioned payload.
5. Run the same command with `--apply` only when the evidence and recommendations are suitable. This publishes the plan and creates Activity Ledger and Operations receipts.
6. Use `monday-command-center` to verify that the native app acknowledged the same `planID`. Published is not displayed.

Treat `empty`, `unavailable`, `partial`, `stale`, `blocked`, and `unknown` as distinct source states. Do not infer personal priorities from historical artifacts.

Read [the data contract](references/data-contract.md) before changing the schema or adding a source lane.
