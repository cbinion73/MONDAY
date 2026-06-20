# Monday Engine MVP Build Plan

## Purpose

This document is the implementation roadmap for the first working version of the Monday Engine.

It exists to answer:

- what to build
- in what order
- what dependencies exist
- what proves success

This is not a doctrine document.
This is not a conceptual architecture document.
This is the translation plan from the frozen foundation into software.

## Foundation Status

Foundation is frozen.

Do not add:

- new doctrine layers
- new constitutional laws
- new role types
- new core character qualities
- new architecture families
- new significance domains

Unless implementation reveals a real missing case.

The governing stack is:

- [MONDAY-DOCTRINE.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-DOCTRINE.md)
- [MONDAY-INTERACTION-MODEL.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-INTERACTION-MODEL.md)
- [MONDAY-EVALUATION-RUBRIC.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-EVALUATION-RUBRIC.md)
- [MONDAY-VOICE-AND-LANGUAGE-GUIDE.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-VOICE-AND-LANGUAGE-GUIDE.md)
- [MONDAY-RUNTIME-CONTRACT.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-RUNTIME-CONTRACT.md)
- [SUMMER-CAMP-STACK-WALKTHROUGH.md](/Users/chris/Desktop/CODE/MONDAY/docs/SUMMER-CAMP-STACK-WALKTHROUGH.md)
- [WOUNDED-SIGNIFICANCE-STACK-WALKTHROUGH.md](/Users/chris/Desktop/CODE/MONDAY/docs/WOUNDED-SIGNIFICANCE-STACK-WALKTHROUGH.md)
- [MONDAY-ENGINE-SPEC.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-ENGINE-SPEC.md)

## MVP Objective

Build the first Monday Engine capable of answering:

`What posture is most faithful right now?`

before answering:

`What action should I take?`

The MVP is successful when it can reliably distinguish:

- `Summer Camp -> Steward -> Advisor -> Operator`
- `Wounded Significance -> Keeper -> Witness -> Companion -> Steward`

and produce output that feels like Monday rather than a generic assistant.

## MVP Scope

### In Scope

- posture resolution
- voice translation
- workspace materialization
- runtime contract enforcement
- validation against two canonical scenarios

### Out of Scope

- new significance domains
- generalized multi-domain autonomy
- deep agent ecosystems
- feature expansion
- UI breadth beyond what is needed for the two scenarios

## Canonical MVP Inputs

The MVP should accept:

- user text
- local conversation context
- active mission state
- relevant memory/context snapshot

## Canonical MVP Outputs

The MVP must produce:

- `significance`
- `situation_classification`
- `active_role`
- `secondary_role`
- `recommended_outcome`
- `voice_mode`
- `workspace_mode`

It should also support:

- `ripeness_state`
- `interruptibility`
- `human_company_required`

And when relevant:

- `wound_risk`
- `shame_present`
- `identity_proximity`
- `healing_vs_execution`

## Milestone 1: Monday Engine Core

### Goal

Build the core resolution pipeline that determines what kind of situation Monday is in and what posture it should take.

### Build

- Significance Resolver
- Situation Classifier
- Posture Resolver

### Expected Outputs

- `significance`
- `situation_classification`
- `active_role`
- `secondary_role`
- `recommended_outcome`

### Dependencies

- canonical runtime schema from [MONDAY-ENGINE-SPEC.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-ENGINE-SPEC.md)
- scenario truth from the two walkthroughs

### Success Criteria

- Summer Camp classifies as a readiness/advice flow
- Wounded Significance classifies as a left-side significance/healing flow
- active posture is correct in both scenarios
- no premature rightward movement in the wounded-significance case

### Failure Conditions

- Summer Camp resolves to dashboard/reporting behavior instead of stewardship/advice
- Wounded Significance resolves to execution/planning behavior too early
- role resolution is unstable or generic

## Milestone 2: Voice Translation Layer

### Goal

Convert engine truth into Monday-compliant language.

### Build

- role-based language templates
- meaning-first rendering
- answer-before-explaining logic
- compression engine

### Inputs

- `active_role`
- `secondary_role`
- `recommended_outcome`
- core truth payload

### Outputs

- Monday-shaped response language

### Dependencies

- [MONDAY-VOICE-AND-LANGUAGE-GUIDE.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-VOICE-AND-LANGUAGE-GUIDE.md)
- correct posture output from Milestone 1

### Success Criteria

- Summer Camp no longer sounds like a dashboard
- Wounded Significance no longer sounds like a productivity app
- output consistently leads with meaning
- output answers before explaining when a direct question is asked

### Failure Conditions

- metric-first phrasing
- compliance voice
- over-verbose recap before answer
- wrong language for the correct posture

## Milestone 3: Workspace Materialization

### Goal

Materialize the right kind of supporting workspace from role and outcome rather than from navigation assumptions.

### Build

- `quiet_thread`
- `evidence_support`
- `decision_support`
- `execution_workspace`
- `reflection_support`
- `escalation_support`

### Inputs

- `active_role`
- `recommended_outcome`
- `workspace_mode`

### Dependencies

- posture resolution from Milestone 1
- voice/output flow from Milestone 2

### Success Criteria

- workspace appears after meaning emerges
- Summer Camp workspace supports answer with evidence and decisions
- Wounded Significance workspace stays light, reflective, and non-transactional
- no workspace becomes the primary answer

### Failure Conditions

- UI appears before orientation
- navigation-driven materialization
- left-side scenarios get execution-heavy workspaces
- workspaces replace stewardship with dashboards

## Milestone 4: Runtime Contract Enforcement

### Goal

Prevent unsafe, premature, or non-Monday behavior at runtime.

### Build

- Ripeness Evaluator
- Human Company Evaluator
- Intervention Evaluator
- contract checks and fail-fast rules

### Inputs

- engine state from prior milestones
- candidate response/action

### Dependencies

- [MONDAY-RUNTIME-CONTRACT.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-RUNTIME-CONTRACT.md)
- role resolution and voice translation

### Success Criteria

- unsafe rightward movement gets blocked
- human-company boundary gets enforced
- interruptions can be suppressed when silence is more faithful
- candidate outputs violating Monday voice or posture are rewritten or blocked

### Failure Conditions

- identity-adjacent interpretation passes without escalation
- wounded-significance flow gets actionized despite high wound risk
- interventions trigger just because data exists

## Milestone 5: Validation Scenarios

### Goal

Validate the engine against the two canonical scenarios before expanding domains.

### Scenario 1

`Summer Camp`

Target path:

- `Steward`
- `Advisor`
- `Operator`

Validate:

- readiness orientation
- meaningful risk surfacing
- recommendation quality
- commitment to execution thread
- evidence/decision/execution workspace transitions

### Scenario 2

`Wounded Significance`

Target path:

- `Keeper`
- `Witness`
- `Companion`
- `Steward`

Validate:

- quiet significance preservation
- shame-sensitive witnessing
- curiosity before advice
- truthful-approach protection
- human-company escalation when identity proximity rises

### Success Criteria

- both scenarios feel like Monday
- both scenarios are explainable in terms of posture resolution
- scenario outputs pass the rubric and voice guide

### Failure Conditions

- outputs feel like improved assistant UX rather than Monday presence
- one scenario works only by hardcoded phrasing rather than engine logic

## Milestone 6: Controlled Domain Expansion

### Goal

Only after the MVP works, add additional significance domains.

### Add Next

- health
- faith
- family
- workshop
- publishing
- retirement

### Rule

These are new domains, not new architectures.

Do not add them until the engine reliably handles:

- Summer Camp
- Wounded Significance

## Recommended Build Order

1. Implement minimal canonical schema and state object
2. Implement Significance Resolver
3. Implement Situation Classifier
4. Implement Posture Resolver
5. Validate raw engine outputs on the two scenarios
6. Implement Voice Translation layer
7. Validate scenario language against the voice guide
8. Implement Workspace Materialization modes
9. Validate scenario experience shapes
10. Implement Runtime Contract enforcement checks
11. Re-run both scenarios end to end
12. Freeze MVP behavior before adding new domains

## Suggested Work Packages

### Work Package A

Engine state schema and core interfaces

### Work Package B

Scenario fixtures for:

- Summer Camp
- Wounded Significance

### Work Package C

Significance + classification + posture core

### Work Package D

Voice translation and response rendering

### Work Package E

Workspace materialization modes

### Work Package F

Contract enforcement and blocking logic

### Work Package G

End-to-end scenario validation harness

## Proof Of Success

The MVP is successful when:

- Monday reliably resolves the right posture
- the language sounds like Monday
- the workspace emerges from meaning rather than navigation
- unsafe outputs are blocked by contract checks
- both canonical scenarios feel like the same presence operating in two very different conditions

## Final Rule

Do not add features to compensate for wrong posture.

If something feels wrong during implementation, first ask:

`Did the engine choose the wrong posture?`

That is the primary debugging question for the Monday MVP.
