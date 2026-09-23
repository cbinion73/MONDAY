---
name: monday-thermo-skill-evolution
description: Identify recurring professional-work needs that may justify a MONDAY skill, and design, validate, register, and document a requested new skill. Use for skill-gap review, skill proposals, or when a user asks MONDAY to create or extend a skill.
---

# Skill Evolution & Builder

Treat a new skill as a maintained operating capability, not a clever prompt saved in a drawer.

## Detect and recommend, but do not silently expand

When recurring patterns appear across authorized work, identify a potential skill only when at least two concrete examples show the same durable need, decision rule, or fragile workflow. State the instances, the affected outcome, the proposed scope, overlap with existing skills, and why a prompt or reference note is insufficient. Label the recommendation `proposed`.

Do not infer sensitive traits from private communications, mine personal material, create a skill solely from a single frustration, or silently write to the plugin because a pattern was noticed.

## Build on an explicit request

When the user asks to create or change a skill, first establish only the information needed to build it well:

1. Outcome, intended users, trigger phrases, and exclusions.
2. Authoritative sources, local records, permitted tools, data class, and action boundary.
3. The smallest repeatable method, required references or scripts, and interfaces with existing MONDAY skills.
4. Success criteria, refusal/escalation cases, owner, versioning, and validation cases.

Ask concise questions only for material unknowns. If the request itself provides enough detail, proceed without manufacturing a questionnaire.

## Create, register, and validate

1. Inspect the current plugin, operating contract, relevant existing skills, and current repository status before editing.
2. Use the installed Skill Creator method to create a focused `skills/<skill-name>/SKILL.md`; add references or deterministic scripts only when they are genuinely needed.
3. Preserve the evidence, authorization, privacy, and external-action boundaries of MONDAY. New skills may draft and locally create package files within an explicit request; sending, publishing, changing connected systems, or pushing to a shared remote still requires the applicable authority.
4. Add `agents/openai.yaml` so the skill is discoverable. Update the MONDAY operating contract, skill count, architecture/documentation, marketplace-facing guide, changelog, and evaluation inventory.
5. Validate the new skill with the Skill Creator validator, validate the plugin package, run any added scripts against safe representative data, and test one normal case plus one boundary or refusal case.
6. Report the source changes, validation evidence, remaining uncertainty, and the exact route by which the recipient can install or roll back the new version.

Use Knowledge Architecture for taxonomy and durable-record design, Project Intelligence for evidence-grounded pattern analysis, Forge for scripts or technical integration, AI Governance for consequential data or automation, and Quality Assurance before a shared release is represented as ready.
