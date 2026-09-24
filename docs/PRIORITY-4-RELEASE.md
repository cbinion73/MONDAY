# Priority 4 release, evaluate before expanding

Priority 4 implements roadmap items 29 through 33 as a governed evaluation and pilot capability. Implementation does not silently claim pilot completion or enterprise readiness.

## Item 29: behavioral and adversarial evaluation

`monday-evaluation` discovers every packaged Python test and Command Center contract test, executes versioned runners, records exact denominators and privacy-reduced receipts, and fails when a blocking case is skipped, blocked, unresolved, or not run. The adversarial inventory covers source truth, authority, domain boundaries, privacy, data loss, schemas and digests, migration rollback, external actions, temporal rollover, idempotency and replay, connector admission, untrusted instructions, path safety, readback forgery, and pilot-evidence forgery.

## Item 30: measurable release gates

Engineering release, pilot start, connector activation, and enterprise claims are separate machine-readable gates. Critical controls have zero tolerance. A partial test denominator cannot pass. Engineering release consumes a digest-bound local receipt produced by direct validator, parity, build, signature, and compatibility checks, not caller assertions. Pilot start inherits Priorities 0 through 3 and remains blocked while Priority 1 item 17 is unresolved.

## Item 31: selective Tier 2 connectors

The connector registry owns status, route, authority, bounded scope, privacy fields, non-proof statements, consumers, live canary, and Chris approval. Jira through TWG is `evaluating`. It is not active and cannot affect authoritative project state or cure a Tier 1 gap until its live canary and digest-bound approval pass.

## Item 32: Tier 3 admission

No Tier 3 integration is active. Unknown and speculative integrations fail closed. Admission requires a specific use case, owner, authority, data and retention contract, read/write boundary, external-action mapping for writes, acceptance and adversarial tests, pilot design, and Chris approval.

## Item 33: bounded pilot

The first pilot is one participant, one Mac, five business days, fifteen immutable scheduled checkpoints, seventy-five Tier 1 attempts, and zero Tier 2 or Tier 3 integrations. Observations are append-only and digest chained. `pilot-record` directly verifies the five canonical manifests, Planner publication, planning-run and native readback, and Meeting Continuity summary for the checkpoint window rather than accepting caller-supplied pass claims. Acceptance requires the exact schedule and denominators, five unattended morning rollovers, exact publication readback, complete meeting dispositions and project readbacks, no critical control incident, and Chris's final disposition.

Priority 1 item 17 is promoted only by `verify-unattended-rollover`. The verifier reads all five canonical source manifests and the live plan, planning-run, and native-readback artifacts, rejects manual repair or mismatched dates and denominators, and writes an immutable digest-bound receipt before creating the runtime roadmap override. The packaged roadmap remains blocked by default, so a reinstall cannot silently inherit a machine-specific operational PASS.

An accepted pilot supports only the tested single-user local configuration. Enterprise readiness remains blocked pending representative multi-user evidence and organizational security, privacy, compliance, deployment, support, recovery, and distribution approvals.

## Verification

```bash
python3 scripts/monday_evaluation.py audit-contracts
python3 -m unittest tests.test_priority4_evaluation -v
python3 scripts/monday_evaluation.py collect-release-evidence --evidence-id <id> --installed-plugin <path> --apply
python3 skills/monday-core/scripts/monday_core.py validate-registry
python3 /Users/chris.binion/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/monday-evaluation
```
