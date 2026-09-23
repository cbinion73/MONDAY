# Meeting Continuity Connector Collection Contract

This procedure brings authorized source observations into the Meeting
Continuity ledger. It is deliberately a collector protocol, not a claim that
the local Python engine can impersonate Outlook, Teams, or SharePoint.

## Boundary

Use connected sources only for Chris's authorized Thermo work. Collect the
smallest bounded date window needed for an incremental pass or a due revisit.
Raw invitations, attendee lists, meeting URLs, access codes, transcript/chat
content, and recording content remain in their governed source. Do not put
them in the ledger, Command Center summary, shell history, or MONDAY Knowledge.

The collector emits only normalized observations such as:

```json
{
  "stable_meeting_key": "source-scoped-stable-token",
  "meeting_date": "2026-09-14",
  "meeting_title": "Redacted or concise meeting label",
  "source_system": "outlook",
  "governed_note_locator": "02 Evidence/Meeting Notes/2026-09-14 Example.md",
  "calendar_status": "reviewed",
  "transcript_status": "not_found",
  "meeting_chat_status": "inaccessible",
  "recap_status": "awaiting_delayed_recap",
  "project_candidates": ["Example Project"]
}
```

Use a stable opaque source token or a deterministic source-scoped digest for
`stable_meeting_key`. Do not use a title-only key. Do not include source IDs
that expose private service URLs or join credentials.

## Incremental collection pass

1. Read the existing Project Intelligence source manifest, crawl state, and
   Meeting Continuity ledger. Determine the bounded unprocessed interval and
   any due revisit items. A partial source query never permits a watermark
   advance.
2. Enumerate completed work-calendar occurrences for that interval. Retain
   only the minimal metadata needed to establish an occurrence and source
   coverage. Create or locate the governed meeting note before treating the
   occurrence as reviewed.
3. Resolve each eligible online meeting independently through the authorized
   Teams route. Check transcript, meeting chat, recap, and recording separately.
   A 403, expiration, retention gap, delayed recap, or unavailable connector is
   a visible status and retry candidate, not evidence of no impact.
4. Search linked work artifacts only when needed to assess a supported impact.
   Stage the actual governed source evidence through Project Intelligence's
   transactional manifest process. Keep source locators and evidence class on
   the governed note.
5. Write the normalized observations to a temporary JSON file outside the
   vault, then call `ingest-occurrences`. This operation sets no watermark and
   writes no project update.
6. Review and classify each occurrence. Route only material, supported changes
   to an existing project. A human-approved `record-project-update --write`
   creates the dated project receipt. The project write and its validation are
   separate gates.
7. Reconcile and produce the Command Center summary. Advance a manifest or
   watermark only after the source manifest, governed notes, routing,
   project-update validation, and reconciliation all pass.

## Delayed artifact policy

- Initial review: calendar occurrence and currently available artifacts.
- Delayed review: transcript, recap, chat, recording, or linked source that is
  expected later.
- Blocked retry: access-denied, expired, or unavailable artifacts only when a
  reasonable retry path exists.
- Final reconciliation: the occurrence is either reconciled or explicitly
  pending or blocked. Never omit it from the denominator.

## Safety checks

- Do not create a project from a candidate. Keep the candidate as a proposal.
- Do not convert a discussion into a decision without supporting evidence.
- Do not write a project update based solely on a calendar title or metadata.
- Do not store secret-only fields in a durable record.
- Do not report a source as reviewed if only another source was reviewed.
