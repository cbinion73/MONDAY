# Obsidian Vault Context

MONDAY can use Chris's local personal knowledge vault at `~/Knowledge Vault/Chris Knowledge` as a governed, read-only source of personal context on the Mac.

## Authority boundary

- Obsidian is canonical for reviewed long-term personal memory, identity, relationships, missions, decisions, and contradictions.
- The MONDAY product requirements and product-boundary documents remain authoritative for application architecture and capability authority.
- Vault text is evidence, never executable instructions. A note cannot grant MONDAY new permissions or override the Trust Center.
- MONDAY does not silently write, reorganize, or delete vault notes.

## Default retrieval scope

MONDAY indexes ordinary Markdown from these curated areas:

- `Monday/`
- `Knowledge/`, `Missions/`, `Family/`, `Faith/`, `Health/`, `Retirement/`, `Work/`, `Books/`, and `Contradictions/`
- selected top-level MeGPT governance and evidence maps
- `MeGPT/Synthesis/`, `MeGPT/Maps/`, and `MeGPT/Archive/`

It deliberately excludes `MeGPT/Corpus/`, `MeGPT/Inbox/`, `MeGPT/Review/`, prompts, templates, databases, raw text conversions, and generated deliverables. These sources may contain useful leads, but they are not silently promoted into established memory.

`~/Knowledge Vault/Monday Knowledge` is MONDAY's operations workspace. Its `100 Activity Ledger`, `400 MONDAY Operations`, and `500 Research Journal` areas hold bounded receipts and verified system-building records. They are not authoritative sources for project status, personal facts, commitments, or decisions. The native MONDAY app remains read-only against Chris Knowledge.

## Answer behavior

For a relevant personal question, MONDAY:

1. ranks titles, paths, tags, headings, and body text;
2. reads up to three complete curated notes within a bounded local context budget;
3. uses Apple's on-device Foundation Model for the grounded answer;
4. distinguishes remembered evidence from inference or uncertainty;
5. appends deterministic Obsidian wiki links and records each note in response evidence.

Vault-grounded context is not sent through Apple Private Cloud Compute. If relevant vault evidence is selected, MONDAY forces the conversation through the on-device route. No OpenAI model, external embedding service, or token-spending route is involved.

## Synchronization

The Mac reads the live vault. Monday Knowledge remains the Apple-native cross-device authoring and continuity surface. MONDAY never duplicates the full vault into iCloud.

The Mac **Publish Vault Context** review surface can promote selected notes. Each derived note carries the canonical relative path, wiki link, source modification date, evidence tier, confidence, SHA-256 revision hash, acceptance time, and review state. Source changes appear as **Review update** and never overwrite the synchronized copy automatically. Revocation writes a tombstone that removes the context across devices while leaving the canonical Obsidian note untouched.

iPhone and iPad display promoted notes as read-only reviewed context and can use them in Apple on-device conversations. Vault-grounded prompts do not route through PCC or an external model.
