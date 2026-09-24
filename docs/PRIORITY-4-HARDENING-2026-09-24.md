# Priority 4 project-identity and portability hardening

Superseded release: `0.1.0+codex.20260924174602`

This immutable build closes two gaps found during the line-by-line audit of
the original MONDAY plan. It does not change the bounded pilot schedule or
claim that the pilot, Priority 1 item 17, or enterprise readiness is complete.

## Stable project identity

Connected evidence routes to the durable project `id`, not the Markdown file
name or display title. The new acceptance test creates a project, stages a
normalized external signal, renames both the project file and title, and proves
that the signal remains attached to exactly one project with the same stable
identifier.

`project-identity` is now a required release-blocking adversarial class. A
suite that does not discover and pass the renamed-project case cannot pass the
engineering gate.

## Per-machine Command Center source configuration

The evaluation runtime no longer packages Chris's local Command Center source
checkout path. Each installation must configure the repository explicitly:

```bash
python3 scripts/monday_evaluation.py configure \
  --app-repo <command-center-source> \
  --apply
```

An explicit `--app-repo` argument takes precedence, followed by the
`MONDAY_COMMAND_CENTER_REPO` environment variable, then the private local
configuration. If no valid repository is available, source-coupled evaluation
fails closed. It does not substitute a guessed location or fabricated app
metadata.

## Verification

That governed release suite discovered and passed 153 of 153 tests:

- 95 plugin tests
- 14 MONDAY core tests
- 3 Meeting Continuity tests
- 5 Project Intelligence tests
- 36 Command Center tests

All 16 required adversarial classes passed, including the new project-identity
case. There were zero failures, skips, blocked cases, or unresolved cases.

The suite digest is
`0458d16bc1095ad7122c1de139be68c19083a238769facfb020eb4f8fa66c56a`.

## Remaining gates

- Priority 1 item 17 still requires the real unattended next-day rollover.
- The five-business-day bounded pilot still requires 15 exact checkpoints,
  75 Tier 1 attempts, five unattended morning rollovers, exact native readback,
  complete meeting and project receipts, and Chris's final disposition.
- Enterprise readiness remains blocked.
