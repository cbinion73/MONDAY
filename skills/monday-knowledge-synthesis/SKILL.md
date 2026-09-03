---
name: monday-knowledge-synthesis
description: Run the weekly MeGPT review — triage the oldest unreviewed items in Personal Knowledge Vault's MeGPT/Corpus, Inbox, and Review folders, and promote genuinely durable material to MeGPT/Synthesis with Chris's per-item approval. Use when Chris asks for a MeGPT review, a knowledge-corpus triage, or what's been sitting unreviewed.
---

# Monday Knowledge Synthesis

MeGPT's own policy already draws the line: material under `MeGPT/Corpus/`,
`MeGPT/Inbox/`, and `MeGPT/Review/` is `unreviewed` and carries no durable
memory authority until it is promoted to `MeGPT/Synthesis/`. This skill is the
missing promotion ritual — it does not change that policy, it runs it.

## Run the review

1. Call `list_stale_notes(vault="personal", folder="MeGPT/Corpus", older_than_days=7)`
   (and `MeGPT/Inbox`, `MeGPT/Review` as relevant) to find what has sat
   untouched the longest. Oldest first is deliberate: neglected material, not
   merely old material, is the point.
2. Read each candidate with `read_note` before proposing anything about it.
   Never promote from a search excerpt.
3. For each item, present Chris one clear disposition choice: promote to
   Synthesis (with a proposed one-paragraph synthesis draft), leave it in
   Corpus for now, or archive/delete it as no longer useful. Do not batch more
   than a handful into one sitting — this is meant to take a few minutes, not
   become a backlog-clearing project.
4. Only after Chris approves a specific item does Monday write it. Never
   promote material automatically, and never promote more than what Chris
   actually confirmed in the current turn.

## Write the promotion correctly

Use `write_memory` with `vault="personal"`. The written note's *path* is what
determines its `material_type` under the vault's own policy:

- A path under `MeGPT/Synthesis/` (or `Deliverables/`) is `synthesis` —
  durable, but explicitly a synthesis, not a raw fact.
- Only mark something `identity_or_preference`, `plan_or_decision`, or another
  `fact`-type capture if it is a clear, direct statement Chris made — not
  Monday's inference from the corpus material.

Write a genuine synthesis: what the corpus item establishes, why it earned
promotion, and a link back to its source path. Never invent a conclusion the
source material does not support, and never silently drop material that
contradicts material already in Synthesis — route that to
`monday-contradiction-audit` instead of quietly overwriting it.

## Keep the ritual honest

- This is triage, not judgment: leaving something in Corpus is a normal,
  acceptable outcome, not a failure.
- Report what was reviewed, what was promoted (with the new path), what was
  left, and what was archived or deleted — plainly, without treating volume as
  success.
- If Chris hasn't asked for a review in a while, it is fine to offer one when
  he brings up MeGPT or personal-knowledge work, but never run it silently in
  the background or promote anything without his turn-by-turn approval.
