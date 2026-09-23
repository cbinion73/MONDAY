---
name: monday-sprint-planning
description: "Prepare, facilitate, or assess evidence-backed sprint planning: a feasible, outcome-oriented sprint goal, selected work, capacity posture, risks, and a clear planning record. Use for product or delivery-team sprint planning, not for silently creating commitments or changing backlog systems."
---

# MONDAY Sprint Planning

Turn the team’s current priorities into a credible sprint commitment. The result is a decision-ready plan, not a transcript of backlog refinement or an optimistic list of tickets.

## Establish the planning scope

Confirm or explicitly label as unknown:

- Sprint dates, team, cadence, and the planning decision owner.
- The product or business outcome the sprint should advance, including any fixed-date commitments.
- The source of truth for backlog status, dependencies, incidents, and prior-sprint carryover.
- Available capacity: people, planned absence, allocation to support or interrupts, and any known constraints.
- The team’s sizing method and historical throughput, if a reliable history exists.

Do not manufacture velocity, capacity, estimates, priorities, acceptance criteria, or stakeholder agreement. A prior sprint’s completed work is evidence, not a promise that the same amount is feasible now.

If current company context, Jira, or connected work sources would materially improve the plan, use the authorized company-context route and record which sources were actually read. Treat inaccessible sources as unknown, not empty.

## Build the plan

1. State a single, outcome-oriented sprint goal. It should explain why the selected work belongs together and be testable at sprint end.
2. Sort candidate work into: essential for the goal, valuable but optional, unready, blocked, and out of scope. Preserve the rationale for material exclusions.
3. Test each essential item for an owner or responsible team, enough definition to begin, acceptance evidence, estimate or other effort signal, dependencies, and risk. Flag gaps; do not conceal them by calling the item committed.
4. Compare selected effort with usable capacity. Reserve explicit room for operational work, defects, uncertainty, and carryover when the evidence warrants it. Prefer a smaller coherent goal to a full-capacity plan that assumes everything goes perfectly.
5. Identify the few dependencies, decisions, and risks that could defeat the goal. Give each a named owner and a next checkpoint when that information is available.
6. Finish with a planning record in the format in [the planning record guide](references/planning-record.md). Clearly separate committed work from stretch work and hypotheses.

When estimates or historical delivery data are weak, make a confidence-bounded plan: propose a conservative committed slice, a ranked pull-in queue, and the missing evidence needed to improve the next plan. Do not disguise this as a throughput forecast.

## Facilitation and decision quality

Keep the conversation centered on the sprint goal, readiness, capacity, tradeoffs, and decision rights. Challenge vague work, hidden dependencies, and scope additions that do not advance the goal.

When a priority conflict cannot be resolved from supplied evidence, name the decision and its owner rather than selecting on the owner’s behalf. If the team is asked to accept a commitment, capture who accepted it and any reservations.

The plan may be drafted or updated locally. Creating or changing external tickets, assignments, dates, sprint membership, or stakeholder messages requires Chris’s confirmation immediately before that external action.

## Completion check

Call the plan ready only when it has a goal, a bounded selection of work, an explicit capacity basis, a committed-versus-stretch distinction, clear material dependencies and risks, and a record of unresolved decisions. Otherwise report it as a draft or partial plan, state the gaps, and give the smallest next action.
