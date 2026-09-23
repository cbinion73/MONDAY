# Meeting Continuity Ledger Contract

The ledger is a durable control record under `04 Portfolio/Meeting Continuity`.
It is not an evidence source and must never be used to infer meeting content.

The governed meeting-note source is `$MONDAY_MEETING_NOTES_VAULT`.
It is deliberately separate from the Project Knowledge vault. The ledger stores
the full local path as a locator so a Command Center meeting can open its note.

Run `bootstrap` after governed meeting notes are collected. Unannotated legacy
notes enter as `artifact_check_due` with `routing_pending`. This is intentional:
the engine must fail closed rather than backfill a fictional review decision.

Use `classify` only after reviewing applicable calendar, transcript, chat,
recap, notes, and linked artifacts. Select exactly one routing disposition.
Use `record-project-update` only after a human-approved, supported project
change. The command refuses to run without `--approved`, verifies that the
target existing project record is in `03 Projects`, and appends a dated,
idempotence-marked update without rewriting existing project history.

Use `reconcile` to write a shareable JSON summary. The result reports the
denominator, lifecycle and routing counts, project-update receipts, and every
blocked or pending item. It is complete only when every scoped occurrence is
reconciliation-verified and no item remains blocked or pending.

Use `ingest-occurrences` for normalized calendar or artifact-collector output.
It accepts occurrence identity and coverage observations, never raw bodies, and
never advances a source watermark. Use `revisit-plan` to emit the explicit queue
for initial checks, delayed artifacts, and blocked-source retries. Scheduling a
collector remains a separate, authorized automation concern.

Example:

```bash
python3 scripts/meeting_continuity.py \
  --vault "$MONDAY_PROJECT_KNOWLEDGE_VAULT" \
  --meeting-notes-root "$MONDAY_MEETING_NOTES_VAULT" \
  bootstrap --start 2026-09-01 --end 2026-09-30 --write

python3 scripts/meeting_continuity.py \
  --vault "$MONDAY_PROJECT_KNOWLEDGE_VAULT" \
  --meeting-notes-root "$MONDAY_MEETING_NOTES_VAULT" \
  reconcile --start 2026-09-01 --end 2026-09-30 \
  --run-id 20260922T000000Z --output ~/.codex/monday-meeting-continuity/summary.json
```
