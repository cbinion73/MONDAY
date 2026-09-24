# Tier 1 bounded collector procedures

These collectors run through installed connector plugins. They never call Microsoft Graph directly from Python. For every lane, the agent performs the query, reduces results to the canonical envelope, writes the envelope to a temporary local file, and invokes `stage-collection`. Invalid or privacy-unsafe envelopes fail before durable state changes.

## Outlook Calendar

1. Select the signed-in primary Calendar through the Outlook Calendar plugin.
2. Query one explicit local midnight-to-midnight window in `America/New_York`.
3. Exclude cancelled events.
4. Normalize only title, local start, local end, and all-day state.
5. Use source ID and route `outlook-calendar`. A successful zero-result query is `empty`. Daily bounded Calendar collection normally has no incremental watermark; state that in `watermarkBasis`.

## Outlook Email

1. Select the Outlook Email plugin and declare mailbox/query/window scope.
2. Complete supported pagination or mark the result `partial` with the unresolved denominator.
3. Normalize only evidence signals: occurrence time, safe summary, project candidates, evidence class, signal type, and opaque source locator.
4. Use source ID and route `outlook-email`. Never retain message bodies, HTML, addresses, recipient lists, or attachment contents in the envelope.

## Business OneDrive

1. Select the SharePoint plugin and explicitly select Chris's signed-in business OneDrive drive.
2. Declare drive and bounded folder or query scope. Set `businessOneDrive: true`.
3. Distinguish discovery from content review. Normalize only reviewed file signals and opaque locators.
4. Use source ID `onedrive-files` and route `sharepoint-business-onedrive`.

## Microsoft Teams

1. Select the Teams plugin and declare the exact chat, channel, meeting, or time-window scope.
2. Complete supported pagination or remain `partial`.
3. Normalize only evidence signals and meeting occurrence IDs. Preserve Teams provenance for file references; use `fileRoute` to identify the owning OneDrive or SharePoint content route.
4. Use source ID and route `teams`. Never retain chat or transcript bodies, participant lists, meeting links, or recap text in the envelope.

## SharePoint

1. Select the SharePoint plugin and identify the exact site and document-library drive.
2. Declare bounded folder or query scope. Discovery alone is not content review.
3. Normalize only reviewed file signals and opaque source locators.
4. Use source ID `sharepoint-files` and route `sharepoint`.

## Completion and recovery

For complete enumeration, `itemCount = processedCount + unresolvedCount`; `available` additionally requires `unresolvedCount = 0`. If pagination or source enumeration is incomplete and the denominator is unknown, use `partial` and state the limitation rather than inventing a count. A non-successful attempt preserves the last successful artifact and watermark. Incremental lanes must compare-and-set from the manifest's exact last successful watermark; known older watermarks are rejected. Retry with a new collection ID; never reuse an ID for changed content.
