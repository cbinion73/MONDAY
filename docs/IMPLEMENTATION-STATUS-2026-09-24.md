# MONDAY implementation status, 2026-09-24

This document records the implementation delivered across roadmap Priorities 0
through 4, the evidence used to verify it, and the gates that remain open. It
describes the authoritative `monday` Codex plugin. Command Center is a separate
read-only application that implements the plugin's projection contracts.

## Release identity

- Plugin version: `0.1.0+codex.20260924173012`
- Source identity: the commit referenced by the immutable release tag below
- Immutable source tag: `v0.1.0-codex.20260924173012`
- Published Git branch: `monday-plugin` in `cbinion73/MONDAY`
- Compatible Command Center: `0.4.2 (17)`
- Command Center source commit: `20e9aea500ca5b944439f4674ab3b3fe2412fbfe`

The plugin branch is intentionally separate from the `MONDAY` repository's
Apple-application `main` history. Publishing the plugin did not rewrite or
merge the two unrelated histories.

## System boundary

The plugin is MONDAY's operating intelligence. It owns orchestration, source
truth, planning, project and meeting continuity, Digital Twin governance,
durable workflow controls, evaluation, and projection publication. Command
Center validates and renders privacy-reduced projections and returns exact
readback receipts. Connected services are evidence sources, not authoritative
project memory.

The five Microsoft evidence lanes remain distinct:

1. Outlook Calendar for calendar events.
2. Outlook Email for email evidence.
3. SharePoint with the business OneDrive selected for OneDrive files.
4. Teams for chats, channels, meetings, and Teams artifact references.
5. SharePoint with explicit site and library selection for SharePoint files.

Authentication proves connection only. It does not prove content coverage.

## Priority 0, preserved working baseline

Status: implemented and verified.

- Moved installed-cache-only work into the authoritative plugin source.
- Added plugin-owned MONDAY core orchestration and connector routing contracts.
- Removed the prior Calendar self-reference and false-positive availability
  behavior from the planning contract.
- Added source validation, complete plugin validation, and automated tests.
- Put the source under Git with immutable cachebuster tags.
- Reinstalled from the immutable source and proved source-to-installed parity.
- Retired the legacy local planning-engine path from the active contract.
- Preserved prior plugin packages and Command Center `0.4.1 (16)` as rollback
  artifacts.

## Priority 1, dependable daily system

Status: implementation complete; operational acceptance remains pending one
clean unattended next-day run.

- Added bounded collection envelopes for the five Tier 1 Microsoft lanes.
- Added truthful scope, time windows, denominators, immutable artifacts,
  errors, limitations, freshness, and watermark controls.
- Replaced templated planning with the staged
  `collect -> validate -> analyze -> challenge -> quality -> publish -> readback`
  pipeline.
- Added analysis for commitments, decisions, goals, roles, daily capacity,
  consequences, project posture, and pull-forwards.
- Added transactional source staging that preserves the prior good artifact on
  partial, failed, or blocked collection and does not advance watermarks.
- Added meeting-to-project dispositions, target-project writeback evidence,
  and readback requirements.
- Added tomorrow-rollover, recovery, partial-coverage, stale-source, and
  failure tests.

Open gate: roadmap item 17 requires a real unattended morning rollover with
fresh connector attempts, the exact local-day Calendar window, a published
plan, quality verdict, matching native readback, and completed reconciliation.
Until that occurs without manual repair, Priority 1 is not called complete.
The gate is now machine-enforced through an immutable runtime receipt rather
than a hand-edited packaged roadmap status.

## Priority 2, governed Digital Twin

Status: implemented and verified.

- Added a Promise Traceability Matrix and Source Authority and Domain Boundary
  Matrix.
- Defined physically and logically separate professional and personal Twin
  schemas.
- Required purpose, consent, provenance, evidence class, confidence, domain,
  sensitivity, and review controls before a Twin claim can be created.
- Added correction, supersession, exact forgetting, deterministic redaction,
  and durable opt-out controls.
- Excluded journals, raw communications, operations traces, and conversation
  memory from automatic Twin evidence.
- Added schema-versioned inspection publication and digest-matched app
  readback.
- Added an approval-gated, privacy-reduced playbook publishing workflow.

## Priority 3, durable runtime

Status: implemented and verified.

- Added durable workflow state, idempotency keys, bounded retries, dead-letter
  records, and guarded replay.
- Added a universal external-action state machine that separates proposed,
  authorized, attempted, verified, failed, and reversed outcomes.
- Added Command Center contracts for runtime operations, alerts, recovery,
  compatibility, and migrations.
- Added safe schema negotiation and explicit rejection of unsupported app or
  plugin versions.
- Added operational alerts with recovery instructions and preserved retry
  state.

## Priority 4, evaluation before expansion

Status: engineering release gates pass; the bounded pilot is not complete.

- Added a complete, versioned behavioral and adversarial evaluation inventory.
- Added machine-readable engineering-release, pilot-start, connector-activation,
  and enterprise-claim gates.
- Bound engineering release to direct validator, parity, build, signature, and
  compatibility receipts by content digest instead of caller assertions.
- Added selective Tier 2 admission. Jira through TWG is `evaluating`, not
  active, and cannot cure a Tier 1 coverage gap.
- Added fail-closed Tier 3 admission. No Tier 3 integration is active.
- Defined a five-business-day, one-user local pilot with fifteen checkpoints,
  seventy-five Tier 1 attempts, five unattended rollovers, exact projection
  readback, meeting dispositions, and project readbacks.
- Bound every pilot checkpoint to the exact immutable schedule and direct
  verification of five named source manifests, Planner publication, native
  readback, planning-run completion, Meeting Continuity denominators, and the
  append-only digest chain. Caller-supplied pass claims cannot satisfy the
  pilot.
- Added a six-view Command Center Evaluation and Pilot projection with
  independent readback receipts.

Open gate: roadmap item 33 remains `not run`. The current denominator is zero
of fifteen checkpoints, zero of five unattended rollovers, and zero of
seventy-five Tier 1 attempts. Even an accepted single-user pilot supports only
the tested local configuration. It does not support an enterprise-readiness
claim.

## Verification evidence

The final release run passed 151 tests:

- 93 plugin tests
- 14 MONDAY core tests
- 3 meeting-continuity tests
- 5 project-intelligence tests
- 36 Command Center tests

All 15 blocking adversarial categories passed. The current evaluation report
is stored outside the repository at
`~/.codex/monday-evaluation/runs/priority4-pilot-hardening-final-20260924/evaluation-report.json`.
The digest-bound engineering evidence receipt is stored at
`~/.codex/monday-evaluation/release-evidence/release-20260924173012-app-0.4.2-17.json`.
These local receipts are intentionally not committed because they contain
machine-specific operational evidence.

The release was also checked for:

- plugin manifest and skill validity;
- source-to-installed parity;
- compatibility between the plugin and Command Center schemas;
- universal Command Center release build;
- local application signature validity;
- exact evaluation projection digest and view-specific readback.

## Current operational limits

- The native app is locally signed. External distribution still requires a
  Developer ID Application signature, notarization, stapling, and Gatekeeper
  acceptance of the distributed artifact.
- Command Center discovers plugin cache paths at launch. After replacing an
  installed plugin while the app is already open, restart the app so it pairs
  with the new immutable cache path.
- The first unattended next-day run and the five-day pilot remain evidence
  gates, not implementation tasks that can be declared complete in advance.
- Enterprise readiness remains blocked pending representative multi-user
  evidence and organizational security, privacy, compliance, deployment,
  support, recovery, and distribution approvals.

## Rollback

Previous immutable plugin builds remain under the local MONDAY rollback
directory. Command Center `0.4.1 (16)` is preserved as the pre-Priority-4 app
rollback. Rollback must preserve the authoritative vaults and governed records;
only the installed plugin or app binary should be changed.

## Reproduce the release checks

```bash
python3 scripts/monday_system.py status
python3 scripts/monday_twin.py audit-contracts
python3 scripts/monday_runtime.py status
python3 scripts/monday_evaluation.py audit-contracts
python3 -m unittest discover -s tests -v
python3 skills/monday-core/scripts/monday_core.py validate-registry
```

Command Center build and test instructions are maintained in its own repository
so the application and plugin can be versioned and verified independently.
