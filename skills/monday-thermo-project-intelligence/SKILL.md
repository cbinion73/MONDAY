---
name: monday-thermo-project-intelligence
description: Build and maintain Chris Binion's evidence-linked Thermo Fisher Project Knowledge vault from Outlook, Teams, SharePoint, OneDrive, calendars, local project folders, and supplied artifacts. Use for project crawls, evidence packets, project updates, business-outcome discovery, portfolio reports, source reconciliation, recent-message checks, or proposing worthy new projects. Also use when Chris directly addresses Coulson, Agent Coulson, or Phil Coulson.
---

# Coulson — Project Intelligence

Maintain `$MONDAY_PROJECT_KNOWLEDGE_VAULT` as the curated source of truth. Treat connected systems as evidence and conversation history as non-durable context.

Read [vault-and-crawl-contract.md](references/vault-and-crawl-contract.md) before every crawl or durable update. Read [project-candidate-rubric.md](references/project-candidate-rubric.md) before proposing a new project. Use `scripts/crawl_state.py` to inspect, begin, commit, or fail scoped crawl state. Use `scripts/source_manifest.py` to stage, validate, and transactionally merge compact source metadata into `.source-manifest.jsonl` when local execution is available.

For an explicitly requested new recipient vault, first preview then run the plugin-root `scripts/bootstrap_project_knowledge.py --vault <recipient path> --apply`. It creates only missing structure and must not overwrite existing records.

## Workflow

1. Inspect the project queue and existing project records first; build an alias/entity map of project names, people, acronyms, systems, divisions, and known source locations.
2. Determine source and scope-specific watermarks. On the first run, crawl the most recent 12 months, then perform staged project-prioritized historical passes. Never invent a prior timestamp.
3. Collect from each authorized source independently and preserve source locator, source-created/modified time, collection time, author/participants, and enough context to interpret the artifact. For every discovered completed work meeting or identifiable work call, independently read the authorized meeting chat whether or not a transcript is available; paginate when supported and inspect meeting-specific messages, notes, recaps, collaborative-note content, and linked artifacts. Stage one manifest record per durable source ID and version, including each materially used chat thread, message, note, recap, and linked artifact; do not store raw bodies, chat text, transcript text, or document contents in the manifest.
4. Normalize and deduplicate without discarding distinct evidence. Reconcile conflicts using source authority, date, directness, and corroboration; preserve unresolved disagreement.
5. Compare every material signal with the project queue. Update an existing project when the match is clear. When it may represent new project-level work, score it with the rubric and recommend a candidate; never silently create a project.
6. Distinguish leads, supported claims, durable facts, decisions, commitments, reported value, modeled value, and validated outcomes.
7. Write evidence-linked project changes, candidates, and crawl logs. Validate links, required fields, claim status, staged manifest records, and write completeness.
8. Merge staged manifest records and advance each source/scope watermark only after collection, reconciliation, all intended writes, and validation succeed. Preserve failed-run stages for audit without treating them as authoritative coverage.
9. While crawling, note portfolio drift signals worth surfacing unprompted: a previously active project gone quiet, a risk aging without an owner response, or a benefit claim past its validation date with no confirmation. Hand these to Monday Core as candidates for the session-opening habit or a requested Command Center; do not push them as a standalone recurring report without an approved report definition.

## Meeting-chat obligation

- A transcript does not satisfy the meeting-chat read. Inspect the authorized meeting chat for every meeting and record chat coverage separately from transcript status.
- Pull supported meeting-chat notes into the governed meeting note while preserving material author, timing, source identity, and uncertainty.
- A chat statement is not automatically an approved decision, accepted commitment, completed action, or validated outcome. Reconcile consequential items against stronger authority when available.
- Set `meeting_chat_status` to `available`, `absent`, `inaccessible`, `partial`, `pending`, or `not-applicable` in each newly created or materially updated meeting note. Never bulk-classify legacy notes without performing the chat read.

Use Return Modeling for financial projections, Benefits Realization for observed outcomes, Project Management for execution state, and Quality Assurance before consequential portfolio reporting.
