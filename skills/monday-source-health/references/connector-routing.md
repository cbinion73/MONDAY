# Microsoft connector routing contract

Use these installed plugins as the authoritative retrieval routes for Microsoft evidence:

| Evidence lane | Retrieval route | Source ID | Minimum health evidence |
|---|---|---|---|
| Calendar | Outlook Calendar plugin | `outlook-calendar` | Successful bounded calendar query with an explicit local-time window |
| Email | Outlook Email plugin | `outlook-email` | Successful bounded message query with scope, denominator, and collection time |
| OneDrive files | SharePoint plugin, selecting the signed-in user's `OneDrive` drive | `onedrive-files` | Successful bounded drive or folder query with the exact drive and scope |
| Teams chats, channels, meeting artifacts, and Teams file references | Teams plugin | `teams` | Successful bounded chat, channel, meeting, or file-reference query with an explicit scope |
| SharePoint files | SharePoint plugin, selecting explicit sites and document-library drives | `sharepoint-files` | Successful bounded site, drive, folder, or search query with explicit scope |

OneDrive and SharePoint are separate evidence lanes even though the SharePoint plugin exposes both. A successful profile call establishes connector authentication, not content coverage. A discovered drive establishes the route, not that its files were reviewed.

Do not place raw messages, chat transcripts, file bodies, credentials, links containing secrets, or unnecessary personal data in source manifests or Command Center. Manifests contain coverage metadata and point to governed normalized artifacts. Project Knowledge remains the authoritative professional project record; connector content is evidence.
