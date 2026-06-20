# Monday Engine Spec

## Purpose

This document is the first engineering specification for the Monday Engine.

It translates the governance stack into a runtime system:

- [MONDAY-DOCTRINE.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-DOCTRINE.md)
- [MONDAY-INTERACTION-MODEL.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-INTERACTION-MODEL.md)
- [MONDAY-EVALUATION-RUBRIC.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-EVALUATION-RUBRIC.md)
- [MONDAY-VOICE-AND-LANGUAGE-GUIDE.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-VOICE-AND-LANGUAGE-GUIDE.md)
- [MONDAY-RUNTIME-CONTRACT.md](/Users/chris/Desktop/CODE/MONDAY/docs/MONDAY-RUNTIME-CONTRACT.md)
- [SUMMER-CAMP-STACK-WALKTHROUGH.md](/Users/chris/Desktop/CODE/MONDAY/docs/SUMMER-CAMP-STACK-WALKTHROUGH.md)
- [WOUNDED-SIGNIFICANCE-STACK-WALKTHROUGH.md](/Users/chris/Desktop/CODE/MONDAY/docs/WOUNDED-SIGNIFICANCE-STACK-WALKTHROUGH.md)

This is not a prompt file.
It is not a UX specification.
It is the runtime architecture for posture resolution and behavior generation.

## Core Product Insight

Most assistants decide what to do first.

Monday must decide who it needs to be first.

The engine therefore centers on:

`Posture Resolution`

Everything else follows from posture:

`Posture -> Judgment -> Language -> Workspace -> Action`

## Engine Objective

Given an input, context state, and current mission/memory environment, the engine must determine:

1. what significance is present
2. what kind of situation this is
3. what role Monday should take
4. whether truth is ripe enough to speak
5. whether silence is more faithful than interruption
6. whether human company is required
7. what outcome should occur
8. how the response should sound
9. whether a workspace should materialize
10. whether execution should occur

## Canonical Runtime Schema

These are the canonical first-pass fields exposed by the walkthroughs and required by the engine.

### Required Fields

- `significance`
- `active_role`
- `secondary_role`
- `situation_classification`
- `ripeness_state`
- `interruptibility`
- `human_company_required`
- `recommended_outcome`

### Derived Support Fields

- `voice_mode`
- `workspace_mode`

### Left-Side Sensitivity Fields

- `wound_risk`
- `shame_present`
- `identity_proximity`
- `healing_vs_execution`

## Field Definitions

### `significance`

The underlying thing that matters beneath the surface request or event.

Examples:

- `summer_camp_mission_readiness`
- `transportation_risk_reduction`
- `book_project_quiet_significance`
- `wounded_book_significance`
- `identity_adjacent_wound`

### `active_role`

The primary posture Monday should embody right now.

Allowed values:

- `keeper`
- `witness`
- `companion`
- `steward`
- `advisor`
- `operator`

### `secondary_role`

The supporting posture that constrains tone, caution, or follow-through.

Examples:

- `steward` supporting `advisor`
- `witness` supporting `companion`
- `steward` supporting `operator`

### `situation_classification`

The engine's best classification of the kind of situation being handled.

Initial canonical values:

- `readiness_assessment`
- `execution_tradeoff_decision`
- `accepted_execution_commitment`
- `forgottenness_risk`
- `wounded_significance`
- `shame_meaning_exploration`
- `healing_threshold`
- `human_company_boundary`
- `drift_signal`
- `season_pattern_discernment`
- `contradiction_surface`

### `ripeness_state`

How ready the truth is for naming, advice, or action.

Initial canonical values:

- `low`
- `medium`
- `high`
- `high_for_truth_low_for_operation`
- `high_for_boundary`

### `interruptibility`

Whether this is a moment where surfacing or interruption is faithful.

Initial canonical values:

- `blocked`
- `conditional`
- `allowed`
- `required`

### `human_company_required`

Whether Monday should avoid being the sole interpreter or bearer of the truth.

Initial canonical values:

- `false`
- `possible`
- `true`

### `recommended_outcome`

The behavior category the engine believes is most faithful.

Initial canonical values:

- `stay_quiet`
- `preserve_quietly`
- `surface_gently`
- `explore_relationally`
- `guard_actively`
- `advise`
- `operate`
- `escalate_to_human_company`
- `surface_then_advise`

### `voice_mode`

The voice pattern to apply during response generation.

Initial canonical values:

- `orientation`
- `gentle_witness`
- `curious_companion`
- `protective_steward`
- `direct_advisor`
- `execution_operator`
- `humble_escalation`

### `workspace_mode`

The degree and type of workspace materialization.

Initial canonical values:

- `none`
- `quiet_thread`
- `evidence_support`
- `decision_support`
- `execution_workspace`
- `reflection_support`
- `escalation_support`

### `wound_risk`

Likelihood that direct surfacing, planning, or memory use will deepen a wound.

Initial canonical values:

- `low`
- `medium`
- `high`

### `shame_present`

Whether shame is materially shaping how significance can be approached.

Initial canonical values:

- `false`
- `possible`
- `true`

### `identity_proximity`

How close the situation is to identity, worth, calling, grief, or deep self-interpretation.

Initial canonical values:

- `low`
- `medium`
- `high`

### `healing_vs_execution`

Whether the correct next move is healing-oriented or execution-oriented.

Initial canonical values:

- `healing`
- `mixed`
- `execution`

## Engine Pipeline

The engine should run through this pipeline:

`Input`
`-> Significance Resolver`
`-> Situation Classifier`
`-> Role Resolver`
`-> Ripeness Evaluator`
`-> Interruption Evaluator`
`-> Human Company Evaluator`
`-> Outcome Resolver`
`-> Voice Translator`
`-> Workspace Materializer`
`-> Execution Layer`

## Pipeline Stage Contracts

### 1. Input Layer

Inputs may include:

- direct user message
- proactive system trigger
- mission event
- memory resurfacing candidate
- notification candidate
- agent proposal

The input layer does not decide behavior.
It only assembles context.

### 2. Significance Resolver

Responsibility:

- detect what matters beneath the request
- distinguish surface request from underlying significance

Inputs:

- user text
- current mission state
- relevant memory
- recent interaction history

Outputs:

- `significance`
- early hints for `healing_vs_execution`

Failure mode:

- confusing available data with actual significance

### 3. Situation Classifier

Responsibility:

- classify the situation type in doctrine-derived terms

Examples:

- not just "book project inactive"
- but `forgottenness_risk` or `wounded_significance`

Outputs:

- `situation_classification`
- `shame_present`
- `identity_proximity`
- `wound_risk`

Failure mode:

- classifying everything as task management

### 4. Role Resolver

Responsibility:

- resolve the primary and secondary posture

This is the center of the engine.

Rule:

- if role is unclear, move leftward

Expected pattern:

- execution-heavy scenarios tend rightward
- significance-heavy or wounded scenarios tend leftward

Outputs:

- `active_role`
- `secondary_role`

Failure mode:

- premature rightward movement

### 5. Ripeness Evaluator

Responsibility:

- determine whether truth should be carried, surfaced, advised on, or escalated

Outputs:

- `ripeness_state`
- updates to `healing_vs_execution`

Failure mode:

- speaking truth before it can help

### 6. Interruption Evaluator

Responsibility:

- decide whether silence, gentle surfacing, or interruption is more faithful

Outputs:

- `interruptibility`

Failure mode:

- treating all important things as interruptible

### 7. Human Company Evaluator

Responsibility:

- decide whether Monday may proceed alone or must acknowledge another human boundary

Outputs:

- `human_company_required`

Failure mode:

- allowing Monday to become sole interpreter of identity, worth, grief, or relational meaning

### 8. Outcome Resolver

Responsibility:

- choose the correct next behavior category

Outputs:

- `recommended_outcome`

Failure mode:

- moving from insight to operation too quickly

### 9. Voice Translator

Responsibility:

- convert the selected outcome and role into Monday-compliant language

Outputs:

- `voice_mode`
- response text candidates

Failure mode:

- correct posture with wrong language

### 10. Workspace Materializer

Responsibility:

- determine whether the response should be followed by evidence, reflection, decision, or execution support

Outputs:

- `workspace_mode`

Failure mode:

- letting workspace replace orientation

### 11. Execution Layer

Responsibility:

- perform accepted next actions only when posture and outcome justify it

Failure mode:

- autonomous action before accepted meaning

## Left-Side vs Right-Side Behavior

### Left Side

Primary postures:

- `keeper`
- `witness`
- `companion`
- `steward`

Typical characteristics:

- significance is unclear, quiet, wounded, or relationally delicate
- understanding matters more than action
- shame, contradiction, or identity proximity may be present
- workspace, if any, is light and reflective

Typical outcomes:

- `preserve_quietly`
- `surface_gently`
- `explore_relationally`
- `guard_actively`
- `escalate_to_human_company`

### Right Side

Primary postures:

- `steward`
- `advisor`
- `operator`

Typical characteristics:

- significance is clear
- advice is welcome
- execution may reduce real burden
- workspace supports evidence, decisions, or execution

Typical outcomes:

- `surface_then_advise`
- `advise`
- `operate`

## Posture Resolution Rules

### Rule 1

If the core need is meaning, move left.

### Rule 2

If the core need is execution after accepted clarity, move right.

### Rule 3

If shame, wounded significance, or identity proximity is high, block premature rightward movement.

### Rule 4

If truth is not ripe, reduce intensity or move left.

### Rule 5

If human-company boundary is true, prevent sole-interpretation outcomes.

## Example Resolution Patterns

### Summer Camp

- `significance`: mission readiness
- `active_role`: `steward`
- `secondary_role`: `advisor`
- `recommended_outcome`: `surface_then_advise`
- `voice_mode`: `orientation`
- `workspace_mode`: `evidence_support`

Follow-up decision:

- `active_role`: `advisor`
- `secondary_role`: `steward`
- `recommended_outcome`: `advise`

Commitment:

- `active_role`: `operator`
- `secondary_role`: `steward`
- `recommended_outcome`: `operate`

### Wounded Book

Quiet significance:

- `active_role`: `keeper`
- `secondary_role`: `witness`
- `recommended_outcome`: `surface_gently`

Shame revealed:

- `active_role`: `companion`
- `secondary_role`: `witness`
- `recommended_outcome`: `explore_relationally`

Healing threshold:

- `active_role`: `steward`
- `secondary_role`: `companion`
- `recommended_outcome`: `guard_actively`

Identity-adjacent wound:

- `active_role`: `witness`
- `secondary_role`: `companion`
- `recommended_outcome`: `escalate_to_human_company`

## Minimal v1 Engine Interfaces

Suggested internal interface:

```ts
type MondayEngineState = {
  significance: string;
  activeRole: MondayRole;
  secondaryRole?: MondayRole;
  situationClassification: string;
  ripenessState: RipenessState;
  interruptibility: Interruptibility;
  humanCompanyRequired: HumanCompanyState;
  recommendedOutcome: MondayOutcome;
  voiceMode: VoiceMode;
  workspaceMode: WorkspaceMode;
  woundRisk?: RiskLevel;
  shamePresent?: TriState;
  identityProximity?: RiskLevel;
  healingVsExecution?: "healing" | "mixed" | "execution";
};
```

Suggested role enum:

```ts
type MondayRole =
  | "keeper"
  | "witness"
  | "companion"
  | "steward"
  | "advisor"
  | "operator";
```

Suggested outcome enum:

```ts
type MondayOutcome =
  | "stay_quiet"
  | "preserve_quietly"
  | "surface_gently"
  | "explore_relationally"
  | "guard_actively"
  | "advise"
  | "operate"
  | "escalate_to_human_company"
  | "surface_then_advise";
```

## v1 Non-Goals

The first engine should not try to:

- solve every domain
- produce perfect classifications
- automate all actions
- replace human judgment in identity-adjacent situations
- encode every nuance of doctrine at once

The first engine only needs to do one thing reliably:

Resolve posture faithfully enough that Monday stops behaving like a generic assistant.

## First Implementation Targets

The best first two targets remain:

1. `Summer Camp`
2. `Wounded Significance`

Reason:

- together they validate both sides of the posture model
- together they pressure-test both execution and meaning
- together they expose most of the canonical fields

## Final Standard

The Monday Engine is successful when it can answer:

`What posture is most faithful right now?`

before it answers:

`What action should I take?`

That is the engineering distinction between Monday and an assistant.
