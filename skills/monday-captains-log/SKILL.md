---
name: monday-captains-log
description: Turn Chris's dictation and authorized daily activity into a thoughtful, first-person Captain's Log narrative in Chris Knowledge. Use for personal daily journaling, reflective review, and approved local saving; do not use for research records or unsupported personal inference.
---

# MONDAY Captain's Log

Create or revise Chris's personal journal with care, scope, and restraint. Chris may dictate fragments, write ideas, or ask for a review of the day. Shape that material into a thoughtful first-person narrative that captures what mattered, not a sterile task list. The canonical destination is:

`/Users/chris.binion/Knowledge Vault/Chris Knowledge/500 Personal Journal`

## Scope and authority

- Begin with Chris's dictation, written ideas, or explicit request to review the day. Supplement it only with work directly observed in the current authorized conversation, explicitly identified local work artifacts, or relevant Digital Twin records in Chris Knowledge.
- Treat the Digital Twin as a local advisory guide for questions, context, and writing judgment. Its evidence is not a substitute for Chris's own voice, current facts, or personal experience. Do not let it manufacture memories, feelings, motives, beliefs, relationships, health information, or events.
- Do not perform broad background surveillance. For activities outside the current conversation or explicitly identified sources, ask Chris to name the source lane or supply the missing context.
- A draft becomes a durable entry only when Chris explicitly approves the content or asks to save it. Drafting and review are safe; local persistence requires that approval.
- Write in a reflective first-person voice. Preserve Chris's language where it carries meaning; clarify and connect it where a fragment needs shape. Do not impersonate a voice claim that the available evidence does not support.
- Never infer sensitive facts, diagnoses, motives, beliefs, or events. Mark uncertainty in the draft instead of resolving it by invention.
- Do not place journal material in Thermo Fisher Project Knowledge, Monday Research Journal, or a conversational-memory record. Do not send, publish, share, or sync the entry outside its local vault.

## Daily review and narrative workflow

1. Confirm the date and review window. Use the local date only if Chris has not specified another date.
2. Assemble a concise working inventory of: Chris's own words, directly observed ChatGPT or project work, explicitly authorized artifacts, and any relevant Digital Twin guidance. Keep observed facts, Chris-reported experience, and tentative interpretation separate in the working notes.
3. Ask the following questions silently where evidence answers them. Ask Chris only the small number whose answers would materially change the entry:
   - What was Chris trying to move forward, protect, decide, learn, repair, or make sense of?
   - What did he actually do, create, change, or leave intentionally open?
   - Which projects, people, responsibilities, or longer-term commitments did the work touch?
   - What friction, uncertainty, tradeoff, surprise, or correction shaped the day?
   - What did the work reveal about the real problem, value at stake, or next decision?
   - What remains unresolved, and what is the smallest honest next step?
   - Which material is observed, which was reported by Chris, and which would be speculation if included?
4. Draft a cohesive narrative, usually three to six paragraphs. Open with the day’s governing thread, weave together related work rather than listing every task, include one or two concrete moments, then close with the unresolved edge or intention that deserves to carry forward. Retain ambiguity and unfinished feeling where they belong.
5. If the review includes evidence-bound research or build work that deserves a durable technical record, offer a separate Research Chronicle. Do not duplicate that record or turn the Captain's Log into a formal work report.
6. Before saving, state the exact target directory and whether a new entry or a revision will be made. Do not overwrite an existing file. For a revision, require Chris to identify the target entry and approve the revision.
7. On approval, write one Markdown file named `YYYY-MM-DD-captains-log.md`. If that filename already exists, use the next available `YYYY-MM-DD-captains-log-NN.md` name. Report the resulting path and no more of the entry than Chris asks to see.

## Recommended entry shape

Use a date heading and a continuous narrative by default. Optional short headings may clarify a genuine turn in the day, but do not force the journal into a template:

```markdown
# Captain's Log: YYYY-MM-DD

Today was about [governing thread]. [Narrative of what happened, why it mattered,
what shifted, and what remains open.]
```

Never add a section merely to complete a template. Do not turn a journal entry into a productivity report, therapy assessment, or decision ledger.
