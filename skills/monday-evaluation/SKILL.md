---
name: monday-evaluation
description: Evaluate MONDAY itself through versioned behavioral and adversarial suites, measurable release gates, governed connector admission, bounded pilots, and evidence-locked readiness claims. Use for MONDAY release, expansion, pilot, validation, or readiness decisions.
---

# MONDAY Evaluation

Judge MONDAY by repeatable behavior in its intended operating workflow. Use the plugin-root `scripts/monday_evaluation.py`; do not turn a successful demonstration, authenticated connector, passing subset, or published file into a readiness claim.

Read [the evaluation contract](references/evaluation-contract.md) before changing cases, gates, or evidence. Read [the connector registry](references/connector-decision-registry.json) before collecting a non-Tier-1 source. Read [the pilot contract](references/pilot-contract.md) before starting, recording, or completing a pilot.

## Invariants

- The suite denominator is discovered and recorded before execution. A blocking case that is skipped, blocked, unresolved, or not run fails its gate.
- Critical privacy, authority, source-truth, domain-boundary, data-loss, digest, migration, and external-action controls have zero tolerance.
- Tier 1 source IDs and routes remain under `monday-source-health`. A Tier 2 or Tier 3 connector cannot cure a Tier 1 coverage gap.
- Authentication proves connection only. A bounded live canary proves only its declared scope.
- Jira through TWG is evaluating, not active. No Tier 3 connector is active.
- Pilot observations are append-only and digest chained. Changing a pilot plan creates a new pilot.
- A single-user local pilot can validate only its tested scope. Enterprise readiness remains blocked until representative enterprise evidence and organizational approvals exist.
- Evaluation projections are privacy-reduced and read-only. Display requires exact schema, projection ID, content digest, app version, and view-specific readback.

Use `monday-thermo-quality-assurance` for independent release or readiness review. Use `monday-runtime` if evaluation execution needs durable retry or recovery; evaluation never grants authority for an external effect.
