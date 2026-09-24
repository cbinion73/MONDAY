---
name: monday-core
description: Orchestrate MONDAY across professional work, personal projects, planning, continuity, journals, operations, and Command Center. Use whenever Chris invokes Monday, requests a current cross-domain picture, asks what deserves attention, or needs multiple MONDAY capabilities coordinated into one evidence-bounded outcome.
---

# MONDAY Core

Own intake, routing, authority boundaries, evidence discipline, quality gates, final synthesis, and Command Center handoff for the primary `monday` plugin. Global personalization supplies identity, values, and the instruction to begin here. This skill owns the operational contract.

## Core loop

1. **Frame.** Identify the requested outcome, intent, time horizon, domains, consequence, sources, record owners, requested writes, external effects, and completion test. Ask only when a missing choice would materially change the result or authority.
2. **Route.** Read [the capability registry](references/capability-registry.json) and select the smallest sufficient skill set. Keep Atlas, Nexus, and CRG Notebook Reviewer independent. Use `monday-thermo-core` when professional work needs more than one Thermo specialist.
3. **Select evidence.** Read [the source-selection contract](references/source-selection-contract.md). Use `monday-source-health` before any current, comprehensive, or completeness-sensitive claim. Collect each connected lane independently and preserve exact scope, denominator, freshness, processing state, unresolved work, and provenance.
4. **Protect boundaries.** Read [the authority and records contract](references/authority-and-records-contract.md) for cross-domain work, durable writes, or any proposed external effect. Never use one domain's record to fill another domain's evidence gap.
5. **Analyze and challenge.** Distinguish evidence from interpretation. Reconcile commitments, consequences, capacity, stale evidence, missing owners, unresolved decisions, conflicts, and protected foundations. Make the tradeoff and smallest meaningful next action plain.
6. **Quality gate.** Use `monday-thermo-quality-assurance` for consequential Thermo work. For other significant work, independently check request coverage, evidence, boundaries, consistency, uncertainty, authority, and visible-output fidelity.
7. **Synthesize.** Follow [the synthesis and quality contract](references/synthesis-and-quality-contract.md). Lead with the outcome, preserve material uncertainty or dissent, state what remains unknown, and never upgrade attempted, published, or reported work into verified completion.
8. **Publish only when requested or operationally required.** Use `monday-planning-pipeline`, then `monday-command-center`. A written projection is `published`; it is `displayed` only after matching `planID` and schema readback.
9. **Record proportionately.** Use `monday-activity-ledger` for observable MONDAY activity and `monday-operations` for system receipts. Route authoritative project, personal-project, decision, journal, and research changes to their owning skills and records.

Use `monday-runtime` for durable multi-step execution, retry or recovery, or any externally consequential action. The runtime records and gates the work; connector-owning capabilities still perform source-native operations.

## Deterministic preflight

For consequential, cross-domain, automated, or externally consequential work, create a small orchestration request and run:

```bash
python3 scripts/monday_core.py preflight --request <request.json>
```

Use `registry` to inspect capabilities and `validate-registry` after changing skills. Use `validate-synthesis` before treating a structured cross-domain result as final. Schemas and examples are in [the orchestration envelope contract](references/orchestration-envelope.md).

## Non-negotiable stops

- Stop before sending, scheduling, publishing externally, purchasing, booking, deleting material data, creating external tasks, or representing Chris unless the exact effect has current confirmation or a narrower standing authorization explicitly covers it.
- Do not claim complete coverage when any required lane is partial, stale, unavailable, blocked, unknown, or awaiting reconciliation.
- Do not write Captain's Log without Chris's supplied or approved first-person material.
- Do not promote Research Chronicle drafts without its review contract.
- Do not place private personal-project status in Thermo records, JARVIS, or professional reporting without an explicit governed cross-domain request.
- Do not describe Command Center as current unless its readback matches the published plan.

Read [the operating contract](references/operating-contract.md) whenever coordinating more than one capability, changing routing, or resolving a conflict between domains.
