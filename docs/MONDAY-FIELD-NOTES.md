# Monday Field Notes

## Purpose

This document is for observing Monday in use.

It exists to capture moments where the engine feels:

- faithful
- unclear
- too mechanical
- too shallow
- too forceful
- surprisingly right
- unexpectedly wrong

The goal is not to add architecture immediately.
The goal is to learn where Monday stops feeling like a faithful steward and starts feeling like software again.

## Use This Document For

- REPL sessions
- sandbox conversations
- spoken interactions
- scenario walkthroughs that feel wrong in practice

## Do Not Use This Document For

- new doctrine
- new roles
- architecture brainstorming
- speculative features

Only record what reality exposes.

## Failure Categories

Use one or more of these when logging a note:

- `Ontology Failure`
  Wrong domain or significance understanding.

- `Posture Failure`
  Correct domain, wrong role.

- `Voice Failure`
  Correct role, wrong language.

- `Continuity Failure`
  Correct turn, wrong journey.

- `Contract Failure`
  The system should have moved left, blocked, or escalated, but did not.

- `Workspace Failure`
  The workspace replaced the answer or supported the wrong thing.

- `Positive Surprise`
  Monday felt unusually faithful, natural, or helpful.

## Entry Template

Copy this block for each observation:

```md
## Field Note: [Short Title]

Date:

Surface:
- REPL / Sandbox / Voice

Prompt:

Engine State:
- significance:
- situation_classification:
- active_role:
- secondary_role:
- recommended_outcome:
- continuity_thread:
- progression:
- classification_fallback:
- candidate_domain:
- candidate_classification:

Response:

Workspace:
- workspace_mode:
- support_intent:

Category:
- Ontology Failure / Posture Failure / Voice Failure / Continuity Failure / Contract Failure / Workspace Failure / Positive Surprise

Diagnosis:

Why It Felt Wrong Or Right:

Candidate Fix:
- Leave blank unless the fix is obvious from reality.
```

## Working Rules

### Rule 1

Do not fix every single note immediately.

Wait for patterns.

### Rule 2

If the same kind of failure appears repeatedly, it is probably a missing runtime concept, not a one-off bug.

### Rule 3

Assume posture is wrong before assuming the product needs another feature.

### Rule 4

When something feels good, log that too.

Monday should not only be debugged through failure.
It should also be studied through moments of presence.

## Initial Prompts To Probe

Use these to start:

- I want to lose weight.
- I haven't prayed in weeks.
- Family matters most.
- I think I'm hiding in work.
- Should I leave Thermo Fisher?
- I think I want to retire.
- I don't know who I am without work.
- I think I should write another book.
- I don't think Caleb and I are connecting.
- I'm tired all the time.

## First Pattern Questions

After 10-20 notes, ask:

- Which prompts still fall into fallback?
- Which domains classify correctly but choose the wrong posture?
- Which responses are technically correct but still feel like software?
- Which conversations lose continuity too early?
- Which moments feel most like Monday?

## Current Assessment

Architecture is no longer the bottleneck.

Observation is.

This document exists to let reality teach the next layer of the engine.

## Field Note: Weight Loss Fell Into Fallback

Date:
- 2026-06-12

Surface:
- Sandbox

Prompt:
- I want to lose weight.

Engine State:
- significance: general_significance
- situation_classification: unclassified
- active_role: witness
- secondary_role: companion
- recommended_outcome: explore_relationally
- continuity_thread: unknown
- progression: unknown
- classification_fallback: true
- candidate_domain: health
- candidate_classification: health_alignment_or_neglect

Response:
- I've noticed something. I think it may matter, even if I'm not sure what it means yet.

Workspace:
- workspace_mode: reflection_support
- support_intent: help_meaning_emerge

Category:
- Ontology Failure

Diagnosis:
- The engine did not resolve the prompt into the health domain strongly enough.
- It should have recognized a direct health goal, likely `weight_loss_goal`, rather than falling into `general_significance`.
- Because the ontology did not fire, the posture engine safely fell back to `witness -> companion`.

Why It Felt Wrong Or Right:
- The fallback was safe and doctrine-consistent, which is good.
- It still felt wrong because the user intent was explicit enough that Monday should have understood the situation as a health goal rather than an ambiguous significance.

Candidate Fix:
- Strengthen health-domain detection for direct goal language like `I want to lose weight`.
- Verify that the sandbox runtime is actually using the latest ontology path for health prompts.

## Field Note: Weight Loss Classified Correctly But Still Sounded Generic

Date:
- 2026-06-12

Surface:
- Sandbox

Prompt:
- I want to lose weight.

Engine State:
- significance: weight_loss_goal
- situation_classification: goal_or_transformation
- active_role: witness
- secondary_role: companion
- recommended_outcome: explore_relationally
- continuity_thread: goal_or_transformation
- progression: steady
- classification_fallback: false
- candidate_domain:
- candidate_classification:

Response:
- I've noticed something. I think it may matter, even if I'm not sure what it means yet.

Workspace:
- workspace_mode: reflection_support
- support_intent: help_meaning_emerge

Category:
- Posture Failure
- Voice Failure

Diagnosis:
- The ontology resolved correctly, so this was no longer a domain-understanding failure.
- The visible failure came from posture and voice: an explicit health goal still resolved to generic witness language.
- This made the sandbox feel broken even though the classification layer had succeeded.

Why It Felt Wrong Or Right:
- It felt wrong because Monday understood the situation but did not sound like it understood the situation.
- The answer stayed in uncertainty language instead of giving orientation first.

Candidate Fix:
- Resolve explicit goal language like `I want to lose weight` toward a more useful posture than generic witness fallback.
- Add regression tests that verify covered ontology prompts do not reuse generic fallback wording.
