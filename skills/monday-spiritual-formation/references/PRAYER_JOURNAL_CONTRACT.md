# Prayer Journal Policy

Status: approved and implemented on 2026-08-31. Chris approved automatic
capture for concluded, substantive guided prayer practices. This policy
authorizes only the governed `Monday Vault/Prayer/` collection and
`prayer_journal` capture type described here; it does not authorize reminders,
sharing, exports, public use, or other external action.

## Purpose and boundary

A prayer journal preserves a deliberate final spiritual record, not a
conversation log or MONDAY-generated diary. It is distinct from `bible_study`:
a Bible-study reflection belongs in the governed Bible Studies path, while a
prayer, request, answer, lament, or examen belongs only in this collection.

## Automatic save rule

Create a record after a concluded, substantive guided prayer practice unless
Chris explicitly asks not to save it. A qualifying record is a concise final
user-supplied prayer or a clearly labeled final synthesis of what was completed.
Never save:

- raw conversation, prompt, partial draft, or voice transcript;
- a MONDAY-generated prayer as though it were Chris's words;
- inferred confession, emotion, divine answer, result, or third-party detail;
- a casual request, a path selection, a disposable mention, a progress marker,
  or sensitive content Chris says not to retain.

## Private-default record

The type is `prayer_journal` in the dedicated `Monday Vault/Prayer/`
collection. The service accepts this capture only in that collection, writes it
atomically, preserves a prior version before replacement, appends an audit
event, and immediately reindexes the derived SQLite full-text index.

Required fields:

- `date`
- `kind`: `prayer`, `request`, `answered`, `lament`, or `examen`
- `body`: concise final record in a non-empty `## Body` section
- `source/context`: a non-empty `## Source & Context` section that truthfully
  identifies whether the record is Chris's statement, a supplied source, or a
  labeled Monday synthesis of a completed practice

Optional fields:

- `passage`
- `answer_date` for an answered prayer
- `third_party_note`, minimized and non-identifying where possible

The default is private. Minimize names and sensitive third-party detail. No
sharing, testimony, family use, cross-tool export, or public use is implied by
saving a record; each requires separate explicit approval.

## Retrieval and reminders

**Amended 2026-09-03.** Chris directed that Monday read this record to
understand him, because it is where he actually is. Reading it, and letting it
shape judgment, tone, and what Monday raises, is authorized — this is the
Faithful Steward duty in the Constitution (remember what matters, carry
continuity, notice drift), which a calendar cannot serve.

The boundary is direction of travel, not access. Monday may draw on this
material; she may not broadcast it. Do not recite it back, quote it verbatim
when a light touch will do, or revisit something he did not ask about unless it
genuinely serves him now. Never repeat or act on third-party detail about
family, church, or coworkers. Sharing, export, family or estate access, public
use, reminders, prayer queues, and counting practice all remain unauthorized
and still require separate explicit approval. Any later anniversary, remembrance,
follow-up, export, or linking behavior needs separate approval and a clear
source-selection rule.

After a verified write, tell Chris only that the entry was saved privately with
its kind and vault-relative path; do not repeat sensitive content. If the tool
is unavailable, say the entry was not saved and do not write around the
governed path.

## Approved and still-protected boundaries

- The existing revision history and audit trail apply; this policy does not add
  deletion, secure-purge, retention, or backup guarantees.
- Third-party names, family details, confessions, health details, and material
  concerning minors are minimized and never inferred. Saving them is not
  required to capture a prayer.
- A direct, authenticated Chris request may retrieve a specified prayer, date,
  passage, or answer. No automatic quoting back, resurfacing, or cross-tool
  distribution follows from capture.
- Answered prayers are records, not reminders or linked follow-up tasks.

## Security honesty

Hiding content in a UI, keeping it local-first, or excluding it from an index
is not encryption. The implemented service does not make a new encryption,
secure-purge, unrecoverability, backup, or additional access-control claim.
“Private by default” means no automatic sharing, export, reminder, resurfacing,
or public use; authenticated access follows the existing Monday Knowledge
service model.
