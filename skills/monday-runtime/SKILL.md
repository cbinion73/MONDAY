---
name: monday-runtime
description: Govern MONDAY's durable local workflow execution, bounded retry and dead-letter handling, guarded replay, externally consequential action state, runtime compatibility, migrations, and privacy-reduced operational recovery projections. Use when running, recovering, inspecting, or validating multi-step MONDAY operations or any action that affects an external system.
---

# MONDAY Runtime

Provide a durable local control plane for MONDAY operations. This skill records workflow state and receipts; it does not perform connector calls or grant authority to act.

Use the plugin-root `scripts/monday_runtime.py` command. Read [the runtime contract](references/runtime-contract.md) before changing workflow persistence, retries, replay, compatibility, or the Operations projection. Read [the external-action state machine](references/external-action-state-machine.md) before an action can send, schedule, publish, purchase, book, delete, change permissions, create an external task, or represent Chris.

## Invariants

- Every mutating command requires an idempotency key and optimistic version check where an existing record changes.
- Retry counts are bounded. Exhausted workflows enter a durable dead letter and never restart automatically.
- Replay creates a new linked workflow. It never rewinds history, reuses a consequential action, or bypasses a failed safety guard.
- An external action remains `confirmation-required` until confirmation is bound to its immutable action digest. Confirmation authorizes one attempt only.
- `attempted` is not `verified`. Only destination-native readback matching the action, destination system, and attempt can produce `verified`.
- Failed or uncertain external effects are never retried automatically. A new attempt requires a new confirmation.
- Runtime projections contain identifiers, states, counts, bounded error codes, and recovery instructions only. They exclude raw messages, file bodies, destinations, source locators, credentials, and private personal content.
- Unknown or unsupported database, projection, plugin, or app versions fail closed. Apply only registered forward migrations and keep their receipts.

Command Center may display `~/.codex/monday-runtime/operations.json`, but it remains a read-only projection. Display is proven only by a matching `~/.codex/monday-runtime/readback.json` receipt reconciled through this runtime.
