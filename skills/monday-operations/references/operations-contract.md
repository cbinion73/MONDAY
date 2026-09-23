# MONDAY Operations contract

An operations receipt contains schema version, receipt identifier, operation type, started and completed times, status, source manifests, outputs, limitations, decisions, open questions, and retry path.

Statuses are `proposed`, `running`, `completed`, `partial`, `blocked`, or `failed`. Use `completed` only when every declared output passed its verification step. A successful file write is not proof that another application consumed it.
