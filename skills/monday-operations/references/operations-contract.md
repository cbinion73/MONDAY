# MONDAY Operations contract

An operations receipt contains schema version, receipt identifier, operation type, started and completed times, status, source manifests, outputs, limitations, decisions, open questions, and retry path.

Statuses are `proposed`, `running`, `completed`, `partial`, `blocked`, or `failed`. Use `completed` only when every declared output passed its verification step. A successful file write is not proof that another application consumed it.

Durable workflow execution is owned by `monday-runtime` in `~/.codex/monday-runtime/runtime.sqlite3`. Operations receipts may link its workflow, action, dead-letter, migration, or projection identifiers, but must not duplicate private payloads or claim that `attempted` means `verified`.
