# MONDAY source selection and evidence contract

## Selection rule

Use the least sensitive authoritative source that can answer the question at the required freshness and consequence. Select sources by claim, not convenience. Record the lanes searched and the lanes that were required but inaccessible.

## Canonical connected lanes

| Source ID | Route | Suitable evidence | Not proof of |
|---|---|---|---|
| `outlook-calendar` | Installed Outlook Calendar plugin | Current event title, local start/end, all-day state, bounded denominator | Attendance, meeting outcome, approval, or project status |
| `outlook-email` | Installed Outlook Email plugin | Authenticated messages and attachments within an explicit mailbox/window | Acceptance, truth of a sender's claim, or complete communications coverage |
| `onedrive-files` | Installed SharePoint plugin with Chris's signed-in business OneDrive explicitly selected | Files in the selected drive and bounded folder/query scope | SharePoint-site coverage or review of file content from discovery alone |
| `teams` | Installed Teams plugin | Chats, channels, meeting artifacts, transcripts, recaps, and Teams provenance | Approval or outcome merely because an AI recap says so |
| `sharepoint-files` | Installed SharePoint plugin with explicit site and document-library drive | Files from the selected site/library and bounded folder/query scope | OneDrive coverage or content review from a discovered file alone |

Never substitute one connector for another. Authentication proves connection only. Discovery proves route only. A file existing proves neither review nor relevance.

## Durable local sources

- Project Knowledge is authoritative for Thermo project state.
- Personal Project Knowledge is authoritative for private personal-project state.
- Meeting Continuity is a control record, not evidence of meeting content.
- The Decision Ledger owns durable work decisions and commitments.
- Activity Ledger and MONDAY Operations describe MONDAY activity and system health, not project truth or a complete day.
- Captain's Log and Research Chronicle have separate authorship and approval contracts.

## Health requirements

Before a current or completeness-sensitive claim, each required lane records:

- connection state;
- attempted and successful collection times;
- exact window, folder, site, library, chat, or query scope;
- item denominator and processed count;
- unresolved count;
- freshness rule;
- artifact locator;
- error or blocked reason;
- watermark or explicit reason no watermark advanced;
- manifest identifier when durable processing occurred.

Use distinct states: `available`, `empty`, `partial`, `stale`, `unavailable`, `blocked`, and `unknown`. Successful zero is `empty`. Partial or failed collection does not advance successful coverage beyond its proven boundary.

## Evidence labels

- `observed`: directly visible in an inspected source.
- `reported`: stated by a person or source but not independently reconciled.
- `inferred`: interpretation derived from identified evidence.
- `supported`: material claim backed by traceable evidence but not necessarily settled.
- `validated`: reconciled against the defined method, scope, denominator, and authoritative evidence.
- `proposed`: recommendation or candidate, not a decision.
- `decided`: authoritative decision is recorded.
- `attempted`: an action was tried; outcome not verified.
- `verified`: the appropriate readback or authoritative result confirms completion.
- `unknown`, `blocked`, `unresolved`: evidence is insufficient or collection/reconciliation remains open.

Preserve source identity, timestamp, locator, scope, evidence class, confidence, contradiction, and residual uncertainty. Do not store raw private communications or unnecessary sensitive data in source manifests or Command Center projections.
