# MONDAY evaluation contract

`~/.codex/monday-evaluation` is the local private evaluation root unless `MONDAY_EVALUATION_ROOT` overrides it. Evaluation artifacts contain operational metadata and evidence digests only. They exclude source bodies, messages, file contents, destinations, credentials, secret links, and private personal content.

## Suite and run

The packaged suite is schema 1. It declares discovery roots, test runners, adversarial scenarios, evidence requirements, and release-blocking classes. `audit-contracts` proves that every packaged Python test and Command Center test is covered by a discovery rule and that every required adversarial class has a case.

A run manifest binds its run ID, suite ID and digest, plugin commit and version, optional app commit and version, start and completion times, discovered denominator, executed count, pass, fail, blocked, skipped, unresolved counts, runner receipts, and case results. Results are `pass`, `fail`, `blocked`, `skipped`, or `not-run`. A release-blocking result outside `pass` is a gate failure.

## Gates

Four decisions remain distinct:

1. `engineering-release`: every discovered blocking deterministic case passes; critical and high adversarial cases pass; validators, plugin parity, app tests, signing, and compatibility evidence pass.
2. `pilot-start`: engineering release passes, Priorities 0 through 3 pass, Priority 1 item 17 has unattended next-day evidence, the pilot plan is approved, all pilot connectors are admitted, and no critical alert is open.
3. `connector-activation`: named use case, owner, exact route, authority, bounded scope, privacy, failure semantics, acceptance tests, live canary, consumer list, and Chris approval all pass.
4. `enterprise-claim`: an accepted single-user pilot is necessary but not sufficient. Representative multi-user evidence and security, privacy, compliance, deployment, support, and recovery approvals are also required.

The verdicts are `PASS`, `PASS WITH CONDITIONS`, `FAIL`, and `BLOCKED`. A missing denominator or stale/mismatched evidence fails closed.

## Inspection projection

`inspection.json` uses schema 1 and exactly these fields:

`schemaVersion`, `projectionID`, `contentDigest`, `generatedAt`, `validUntil`, `producer`, `audience`, `releaseCandidate`, `suite`, `caseCoverage`, `gateResults`, `connectorDecisions`, `pilot`, `enterpriseClaim`, `evidence`, and `coverage`.

The producer is `monday-evaluation`; the audience is `Chris-private-local`; validity is fifteen minutes. The app writes `readback.json` only after rendering one recognized view: `evaluation-overview`, `evaluation-coverage`, `evaluation-release-gates`, `evaluation-connectors`, `evaluation-pilot`, or `evaluation-enterprise-claim`.
