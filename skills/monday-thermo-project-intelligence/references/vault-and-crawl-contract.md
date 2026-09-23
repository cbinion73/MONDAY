# Project Knowledge Vault and Crawl Contract

## Authoritative location

Maintain `$MONDAY_PROJECT_KNOWLEDGE_VAULT` as the curated Thermo work record. Expected primary areas include the project queue, project records under `03 Projects`, evidence/source records, proposed project candidates, portfolio summaries, and crawl state/logs. Inspect the actual vault before assuming folder names or schemas; preserve established conventions unless a migration is approved.

Maintain `.source-manifest.jsonl` at the vault root as the compact operational index of source objects successfully processed by completed crawl transactions. It is coverage and deduplication metadata, not project evidence or a copy of source content.

## Source manifest contract

Record one JSON object per durable source ID and version. Require schema version, source, bounded scope, source ID, version or modified-time token, source timestamp with time zone, source locator, processing status, first-seen time, last-seen time, and crawl run ID. Project IDs, evidence-record IDs, and a non-reversible content fingerprint are optional. Do not store message bodies, document contents, meeting links, attendee lists, secrets, or unnecessary personal data.

Use `scripts/source_manifest.py` to stage records in a run-specific JSONL file. Validate the stage before committing. Merge it into `.source-manifest.jsonl` only after the crawl's collection, reconciliation, durable writes, and validation gates pass. A failed or partial run may retain its stage for audit, but its records do not prove completed coverage and must not enter the authoritative manifest.

Use `(source, scope, source_id, version)` as the manifest identity. A new version of the same source object is a distinct observation. Preserve `first_seen`, update `last_seen`, and link any curated evidence records. Treat missing durable identifiers as a source limitation; never invent an authoritative ID.

## Evidence contract

For each material artifact retain, where available:

- stable evidence ID;
- source system and source type;
- source URL, item ID, file path, message/thread locator, or equivalent;
- author/sender and participants;
- source-created and source-modified timestamps with time zone;
- collection timestamp with time zone;
- project candidates and match rationale;
- concise extracted claim, decision, commitment, requirement, risk, deliverable, or outcome;
- confidence and evidence status;
- access limitations, conflicts, and supersession links.

Do not copy more confidential content than needed for durable understanding. Prefer a concise evidence record plus source locator over duplicating an entire message or document.

## Meeting-chat contract

For every discovered completed Thermo work meeting or identifiable work call, perform an independent read of the authorized meeting chat whether or not a transcript is available. Retrieve the complete bounded chat history with pagination when supported, then inspect meeting-specific messages, pinned or shared notes, recaps, Loop or collaborative-note content, and chat-linked SharePoint or OneDrive artifacts. Pull only supported facts into the governed meeting note and preserve material author, timing, source identity, and uncertainty.

Stage each materially used chat thread, message, note, recap, and linked artifact as a separate durable source ID and version in `.source-manifest.jsonl`; never store chat bodies or note contents there. Record meeting-chat coverage and access limitations separately from transcript status. A transcript does not satisfy the chat-read obligation, and a chat statement is not automatically an approved decision, accepted commitment, completed action, or validated outcome.

## First crawl

There is no historical watermark until a successful run establishes one. Begin with:

1. the existing project queue and project folders;
2. the most recent 12 months across each authorized connected source;
3. staged historical passes prioritized by active/high-value projects, named stakeholders, known repositories, and gaps surfaced in the first pass.

The 12-month window is an initial discovery boundary, not a claim that earlier information is irrelevant.

## Scoped watermarks

Maintain watermarks separately by source, account/site/team/library, query or folder scope, and crawl stream when needed. Each state record should include:

- last successful inclusive source cutoff;
- run ID and run start/end;
- query/scope definition;
- item count and intended write count;
- high-water source timestamp/item key;
- validation result;
- failure state and retry boundary;
- plugin/schema version.

Use overlap at the lower boundary when a connector's ordering or update semantics can miss late-arriving/modified items. Deduplicate by durable source ID plus version/modified time, not timestamp alone.

## Transaction rule

Start a pending run without changing the successful watermark. Collect, normalize, stage manifest metadata, deduplicate, reconcile, write, and validate. Commit the manifest stage, then commit the watermark with the explicit manifest gate. On partial failure, record the failed run, preserve its stage for audit, and keep the previous successful watermark unchanged. If manifest merge succeeds but watermark commit fails, rerunning the idempotent manifest merge is safe; do not infer successful coverage until the watermark transaction also commits. Never use the current time as proof that all source items through that time were collected.

## Evidence status

- `lead`: relevant signal not yet sufficient for a project fact.
- `supported claim`: directly supported by at least one traceable source but not yet durable/settled.
- `durable fact`: stable, material, sufficiently corroborated or authoritative for the project record.
- `reported value`: stakeholder-stated outcome not independently reconciled.
- `modeled value`: calculated target or forecast with explicit assumptions.
- `validated outcome`: observed and reconciled to defined sources, period, scope, and method.

Preserve contradictions. Prefer the most authoritative, direct, recent, and corroborated source, but do not silently erase a consequential older claim or decision.
