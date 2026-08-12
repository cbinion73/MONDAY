# Monday capability map

Use this map when choosing a surface. It describes authority, not a promise
that every integration is currently connected.

| Need | ChatGPT Work | Codex | Authority / rule |
| --- | --- | --- | --- |
| Conversation, judgment, planning, research | Primary | Available | Monday Core and the relevant specialist workflow |
| ChatGPT Skills | Unified `monday` skill | Monday plugin skills | Keep specialist behavior aligned from the canonical plugin |
| Google Calendar | Supported connected app | Supported connected app | Google is the consolidated viewing calendar; source systems remain authoritative |
| Outlook work calendar | Cloud-connected work source when authorized | Bridge/local execution when authorized | Outlook owns work-event truth |
| Cozi family calendar | Governed read-only access when authorized | Governed/local access when authorized | Cozi owns family-event truth; feed addresses are secret-only |
| Health connections and ChatGPT Health | Primary health conversation and supported health connections | Local health bridge when authorized | Health data stays in its health context; no secret or blanket export |
| Obsidian and local vaults | Only through explicitly connected/approved access | Primary local access | Vault source rules control background/history and operational state |
| Mac apps, Keychain, terminal, repositories | No assumed access | Primary | Codex executes only with local permission and confirmation where needed |
| Durable Monday knowledge | Connected knowledge/vault tools when authorized | Governed MCP/local knowledge tools when authorized | Promote concise durable facts, decisions, and commitments only |

Before a cross-surface action, verify the live connector or local permission on
the surface that will act. Never use the presence of a skill as proof of access.
