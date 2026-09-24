---
name: monday-evaluation
description: Evaluate MONDAY itself through versioned behavioral and adversarial suites, measurable release gates, governed connector admission, bounded pilots, and evidence-locked readiness claims. Use for MONDAY release, expansion, pilot, validation, or readiness decisions.
---

# MONDAY Evaluation

Judge MONDAY by repeatable behavior in its intended operating workflow. Use the plugin-root `scripts/monday_evaluation.py`; do not turn a successful demonstration, authenticated connector, passing subset, or published file into a readiness claim.

Read [the evaluation contract](references/evaluation-contract.md) before changing cases, gates, or evidence. Read [the connector registry](references/connector-decision-registry.json) before collecting a non-Tier-1 source. Read [the pilot contract](references/pilot-contract.md), [pilot plan schema](references/pilot-plan.schema.json), [checkpoint input schema](references/pilot-checkpoint-input.schema.json), and [completion input schema](references/pilot-completion-input.schema.json) before starting, recording, or completing a pilot.

Priority 1 item 17 is never changed by narrative judgment or a hand-edited packaged roadmap. After a genuinely unattended next-day run has staged all five canonical source attempts, published the current-day schema-3 plan, and received matching native readback without manual repair, submit the bounded evidence envelope to `scripts/monday_evaluation.py verify-unattended-rollover --input <file> --apply`. The verifier reads the source manifests, plan, planning run, and app receipt directly, writes an immutable evidence receipt, and only then promotes the runtime roadmap gate.

Configure the Command Center source repository explicitly on each machine before running source-coupled evaluation:

```bash
python3 scripts/monday_evaluation.py configure --app-repo <command-center-source> --apply
```

The plugin never packages a creator-specific source checkout path. Explicit `--app-repo` and `MONDAY_COMMAND_CENTER_REPO` override the persisted local configuration.

## Invariants

- The suite denominator is discovered and recorded before execution. A blocking case that is skipped, blocked, unresolved, or not run fails its gate.
- Critical privacy, authority, source-truth, domain-boundary, data-loss, digest, migration, and external-action controls have zero tolerance.
- Tier 1 source IDs and routes remain under `monday-source-health`. A Tier 2 or Tier 3 connector cannot cure a Tier 1 coverage gap.
- Authentication proves connection only. A bounded live canary proves only its declared scope.
- Jira through TWG is evaluating, not active. No Tier 3 connector is active.
- Pilot observations are append-only and digest chained. Changing a pilot plan creates a new pilot.
- A single-user local pilot can validate only its tested scope. Enterprise readiness remains blocked until representative enterprise evidence and organizational approvals exist.
- Evaluation projections are privacy-reduced and read-only. Display requires exact schema, projection ID, content digest, app version, and view-specific readback.
- Engineering release requires a locally generated, digest-bound receipt that independently runs plugin validation, source-to-installed parity, app version/build verification, strict code-signature verification, and compatibility checks. Caller-supplied pass booleans are not release evidence.

Use `monday-thermo-quality-assurance` for independent release or readiness review. Use `monday-runtime` if evaluation execution needs durable retry or recovery; evaluation never grants authority for an external effect.
