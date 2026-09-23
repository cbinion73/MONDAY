# Codex–ChatGPT Bridge Protocol

## Purpose

Use one plugin package and one evidence model across Codex and ChatGPT while recognizing that each surface has separate installation, authentication, local-file access, and conversation state.

## Authoritative records

- Thermo Project Knowledge vault: `$MONDAY_PROJECT_KNOWLEDGE_VAULT`
- Approved work handoff area: `$MONDAY_BRIDGE_DIR`
- Plugin source: `$MONDAY_PLUGIN_ROOT`
- Personal marketplace: `$MONDAY_MARKETPLACE_PATH`

Run `$MONDAY_PLUGIN_ROOT/scripts/bridge_status.py` to check package version, Codex cache, vault access, and bridge-folder readiness. Verify ChatGPT installation and connector authentication in ChatGPT because those states are surface-specific.

The Project Knowledge vault is the durable source of truth for curated Thermo project intelligence. Connected Outlook, Teams, SharePoint, OneDrive, calendars, and local folders are evidence sources. Conversation history is not a durable source of truth.

## Bridge rules

1. Keep the plugin Thermo-work-only. Never pull personal Monday records into the Thermo plugin or work vault.
2. Allow personal Monday to consume only a deliberately produced, minimum-necessary Thermo workload summary. That outward summary may include capacity demand, immovable work commitments, travel, and major deadlines; exclude confidential project detail unless Chris explicitly authorizes it.

### Workload weather summary

A small, dated packet that lets personal-side planning see the shape of the work week without seeing its content:

- Packet date and covering period
- Capacity read: light, normal, heavy, or at-risk, in one line
- Immovable commitments: count and time blocks only, no subject or attendee detail
- Travel, if any
- Major deadlines landing in the period, named only if Chris has authorized naming them outward
- Nothing else: no project names, no decision content, no stakeholder names, unless explicitly authorized for that packet

Produce it only when it is genuinely useful for personal planning, not on an assumed fixed cadence. It follows the same minimum handoff packet discipline below and does not advance any watermark.
3. Use the same plugin version on both surfaces. Treat a version mismatch as a visible bridge warning.
4. When local files are accessible, read and write the authoritative vault directly under the applicable skill's rules.
5. When a surface cannot access local files, use an approved connected work source or create a dated handoff packet in the approved bridge area. Do not pretend that automatic synchronization occurred.
6. Include provenance, source dates, plugin version, generated-at time, and unresolved conflicts in every material handoff.
7. Do not advance Project Intelligence watermarks based on a handoff alone; advance them only after successful evidence collection, reconciliation, durable writes, and validation.

## Minimum handoff packet

- Packet ID and generated-at timestamp with time zone
- Plugin version and producing surface
- Requested outcome and scope
- New facts with source references and source dates
- Decisions and commitments, each with owner and review date
- Project changes and proposed new-project candidates
- Value stage and evidence status for benefit claims
- Open questions, conflicts, and missing sources
- Recommended receiving skill, mode, and next action

Write a packet only when it prevents meaningful loss or enables the other surface to continue. Prefer updating the authoritative work record when available.
