# MONDAY Maturity Scorecard

This document records Monday's current maturity relative to a `ChatGPT/Codex-class` benchmark and defines the next steps required to close the largest gaps.

It is not a marketing document.
It is an operational scorecard.

## Scoring frame

- `1-2`: early prototype behavior
- `3-4`: useful in narrow flows, not dependable broadly
- `5-6`: strong in some lanes, still uneven across the product
- `7-8`: dependable system with meaningful breadth
- `9-10`: near best-in-class in that category

## Current scorecard

| Category | Score | Current read |
|---|---:|---|
| Conversation quality | `4/10` | Monday can feel strong in shaped flows, but still drops in broad open-ended conversation. |
| Reasoning depth | `4/10` | Stronger in specialist lanes like Reed, weaker in general complex reasoning. |
| Coding / build execution | `2/10` | Not close to Codex-grade repo work, implementation, or debugging. |
| Tool use | `4/10` | Some routing and workflow capability exists, but it is not yet robust general tool competence. |
| Memory / continuity | `5/10` | Better than before on reset and topic handling, but not yet durable long-horizon memory. |
| Specialist routing | `6/10` | Baxter Building and Reed are real and useful. This is one of Monday's stronger layers. |
| Artifact surfacing | `6/10` | Travel and health surfacing work and feel distinct from plain chat. |
| Inbox / retrieval utility | `6/10` | Travel triage is now materially useful, but not yet broadly trustworthy across all mail tasks. |
| Reliability / runtime stability | `4/10` | The behavior has improved, but runtime/process posture is still not production-stable. |
| Speed / responsiveness | `7/10` | Fast on the optimized flows. Still not uniformly fast everywhere. |
| Autonomy | `3/10` | Some orchestration exists, but not yet dependable broad autonomous execution. |
| General assistant capability | `3/10` | Still far behind ChatGPT as a broad assistant. |
| Product identity / system shape | `7/10` | Monday increasingly feels like a distinct system rather than a generic assistant shell. |

## Summary reads

- `Monday as a shaped product system`: `6/10`
- `Monday as a general assistant`: `3/10`
- `Monday as a Codex-like build agent`: `2/10`

## Maturity band

- `Stage 1`: generic wrapper
- `Stage 2`: shaped assistant with real subsystems
- `Stage 3`: dependable cross-domain operator
- `Stage 4`: ChatGPT/Codex-class system

Monday is currently around `Stage 2.5`.

## What is already strong

- Distinct system identity
- Reed / Baxter science routing
- Conditional Thermo Fisher mode
- Artifact surfacing for health and travel
- Faster low-stakes everyday chat through deterministic fast lanes
- Better session reset and topic-shift behavior
- Travel-oriented inbox triage that is now decision-shaped rather than junk-driven

## What is still weak

- Broad open-ended conversation quality
- General-purpose reasoning across arbitrary prompts
- Coding and implementation capability
- Runtime stability and process posture
- Durable memory across time and context shifts
- General retrieval synthesis across email, calendar, documents, and web
- Agent coordination beyond a few hard-coded specialist lanes

## Gap plan: conversation

Conversation is the most important product gap because it is the main interface.
Monday does not need to become ChatGPT in every dimension first.
She does need to stop feeling brittle when the user brings something broad, ambiguous, or unstructured.

### Target

Move `conversation quality` from `4/10` to `6/10`.

Definition of done:

- Monday handles ordinary open-ended prompts without collapsing into generic witness language.
- Monday answers lightweight practical prompts quickly without paying for heavy reasoning paths.
- Monday escalates to deeper reasoning only when the turn actually warrants it.
- Monday sounds consistent across fast deterministic replies and model-refined replies.
- Monday carries thread momentum without clinging to stale topics.

### Workstream 1: fast-lane coverage

Goal:
Expand deterministic handling for common everyday prompts so Monday is fast and useful before invoking heavier model passes.

Needed work:

- Extend the fast everyday lane beyond groceries/dinner into:
  - errands
  - shopping lists
  - quick planning
  - simple comparisons
  - lightweight recommendations
- Add tests for each new fast-lane family.
- Keep fast-lane replies in Monday's voice, but short and practical.

Primary files:

- `src/engine/intelligence/fast-everyday-lane.js`
- `src/engine/intelligence/monday-intelligence.js`
- `src/engine/intelligence/classification-assist.js`

Expected result:

- More low-stakes prompts complete in sub-second to low-second time.
- Fewer unnecessary model calls.

### Workstream 2: better intent and posture resolution

Goal:
Reduce the number of turns that fall into vague `general_significance` handling when they are actually practical asks, casual questions, or direct requests.

Needed work:

- Expand deterministic classification rules for:
  - practical asks
  - light recommendations
  - direct informational questions
  - everyday logistics
- Reduce overuse of witness/companion posture for ordinary practical turns.
- Promote repeated fallback patterns into deterministic routing rules.

Primary files:

- `src/engine/runtime/run-turn.js`
- `src/engine/intelligence/classification-assist.js`
- `src/engine/llm/intent-classifier.js`
- resolver files under `src/engine/resolvers/`

Expected result:

- Monday chooses the right conversational posture earlier.
- Fewer turns need model rescue.

### Workstream 3: conversation-specific evaluation suite

Goal:
Measure conversation quality directly instead of inferring it from general product behavior.

Needed work:

- Create a focused conversation battery with cases for:
  - ordinary everyday prompts
  - broad questions
  - direct asks
  - emotional but not crisis-heavy prompts
  - ambiguous turns
  - topic shifts
- Score:
  - usefulness
  - speed
  - non-genericness
  - voice consistency
  - correct escalation depth

Primary files:

- `tests/`
- `src/engine/evals/`
- `docs/MONDAY-EVALUATION-RUBRIC.md`

Expected result:

- Conversation progress becomes measurable.
- Regressions become visible before live testing.

### Workstream 4: stronger voice unification

Goal:
Make deterministic fast-lane replies and model-refined replies sound like one Monday.

Needed work:

- Normalize deterministic reply patterns against the voice guide.
- Add a small voice-polish pass for deterministic responses where needed.
- Remove phrases that feel like product copy, coaching, or generic assistant filler.

Primary files:

- `src/engine/voice/`
- `src/engine/llm/monday-prompt-builder.js`
- `docs/MONDAY-VOICE-AND-LANGUAGE-GUIDE.md`

Expected result:

- Monday feels consistent even when different runtime paths produce the answer.

### Workstream 5: thread momentum without topic cling

Goal:
Preserve useful continuity while preventing old context from contaminating unrelated new turns.

Needed work:

- Keep improving reset/intent-shift rules.
- Add sharper detection for:
  - new practical asks
  - greeting resets
  - domain pivots
  - "fresh start" language
- Add evaluation cases for cross-topic contamination.

Primary files:

- `src/engine/gateway/session-reset.js`
- `src/engine/gateway/router.js`
- `tests/session-reset.test.js`

Expected result:

- Monday remembers what matters, but does not drag old context into unrelated turns.

## Recommended execution order

1. Expand deterministic fast-lane coverage
2. Improve deterministic intent/posture resolution
3. Add a dedicated conversation evaluation battery
4. Unify voice across deterministic and model paths
5. Continue tightening thread momentum and reset behavior

## Near-term target state

If these five workstreams are completed well, Monday should reach:

- `Conversation quality`: `6/10`
- `General assistant capability`: `4-5/10`
- `Speed / responsiveness`: `8/10` on common user-facing turns

That would move Monday from `Stage 2.5` to a more credible `Stage 3` entry posture in conversation, even while coding and autonomy still lag behind.
