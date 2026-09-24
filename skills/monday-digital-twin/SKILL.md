---
name: monday-digital-twin
description: Govern Chris Binion's inspectable professional and personal Digital Twin records, including provenance, corrections, supersession, exact forgetting, learning opt-outs, redaction, and redacted playbook publication. Use when durable knowledge about Chris is captured, challenged, corrected, forgotten, inspected, or prepared for sharing.
---

# MONDAY Digital Twin

Maintain an evidence-bound model that Chris can inspect and control. The Twin is an index of governed claims about Chris, not a replacement for Project Knowledge, Personal Project Knowledge, source systems, journals, or conversation.

## Operating contract

1. Read [the governance contract](references/governance-contract.md) before any durable Twin write, correction, forgetting request, opt-out, or playbook workflow.
2. Use [the Source Authority and Domain Boundary Matrix](references/source-authority-domain-boundary-matrix.json) to select the owning record and prevent cross-domain leakage.
3. Validate professional records against [the professional schema](references/professional-twin.schema.json) and personal records against [the personal schema](references/personal-twin.schema.json).
4. Preserve stable record IDs, explicit purpose, evidence class, source references, confidence, sensitivity, capture consent, version, and correction ancestry.
5. Use `scripts/monday_twin.py`. Do not hand-edit the runtime store or Command Center projection.
6. Treat a correction as a new immutable version that explicitly supersedes the prior version. Never silently overwrite history.
7. Forget only the exact confirmed record. Remove its current content and version history, retain a content-free tombstone and governance receipt, and explain that source-system deletion is separate.
8. Enforce opt-outs before capture. An opt-out prevents future learning in its exact scope; retroactive forgetting requires an explicit exact-target request.
9. Redact before preparing a playbook. Personal Twin records can never enter a shareable playbook. A prepared package is not published, and publication is not verified until matching destination readback exists.
10. Publish only the privacy-reduced Twin projection to Command Center. A projection is displayed only after matching projection ID and schema readback.

The authoritative promises and their verification paths are in [the Promise Traceability Matrix](references/promise-traceability-matrix.json). Run `python3 scripts/monday_twin.py audit-contracts` after any contract change.

## Authority stops

- Ask for confirmation immediately before an exact forgetting operation.
- Ask for confirmation before any external playbook publication. Preparing or approving a local package does not authorize delivery.
- Never infer consent from source access, prior collection, an installed connector, or a professional relationship.
- Never promote personal, family, faith, health, or relationship material into professional records or shareable output.
- Never claim a source record was corrected or deleted because the Twin was corrected or forgotten.
