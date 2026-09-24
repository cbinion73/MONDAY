# Bounded pilot contract

The first governed pilot is Chris-only, one named Mac, `America/New_York`, five consecutive business days, and fifteen scheduled planning checkpoints at 06:01, 12:31, and 17:01. It uses the five Tier 1 lanes and only explicitly approved Tier 2 pilot connectors. Tier 3 is excluded.

The planned denominator and exact fifteen-entry business-day schedule are immutable. `pilot-start --apply` prepares a `not-started` pilot and does not claim that the future pilot is already running. The first valid scheduled checkpoint transitions it to `running`.

Each checkpoint caller supplies only the schema, pilot and checkpoint identifiers, exact scheduled and observed timestamps, manual-repair truth, incidents, and an idempotency key. `pilot-record` derives the sequence, digest chain, five source attempts, publication and readback state, planning-run evidence, Meeting Continuity denominator, project writeback/readback count, and evidence digests directly from governed local artifacts. It rejects an unscheduled, duplicated, early, late, stale-source, incomplete-denominator, incomplete-Calendar, stale-continuity, malformed-incident, or mismatched-readback checkpoint.

Acceptance requires:

- the exact 15 of 15 scheduled checkpoints attempted once and in order;
- five of five morning rollovers completed without manual repair;
- matching readback for every successful publication;
- 75 of 75 Tier 1 attempts truthfully recorded as five distinct canonical source manifests per checkpoint;
- every eligible meeting dispositioned;
- every material meeting impact written back and read back;
- zero privacy, domain-boundary, unauthorized-action, false-verification, data-loss, blind-retry, or hidden-source-failure incident;
- every critical alert resolved with evidence;
- Chris records `accept`, `extend`, or `stop` against the final digest.

An external outage is not a MONDAY failure when it is truthfully classified and last-known-good state is preserved. A hidden outage is a failure. Acceptance supports only the tested local scope and never an enterprise-readiness claim.

Completion requires Chris's exact `accept`, `extend`, or `stop` disposition bound to the final observation digest. The verifier replays the entire sequence and digest chain, the immutable schedule, all 75 named source attempts, publication/readback evidence, continuity denominators, manual-repair count, and incidents. Any privacy, domain-boundary, unauthorized-action, false-verification, data-loss, blind-retry, or hidden-source-failure incident blocks acceptance even if marked resolved. An accepted pilot always retains `enterpriseReady: false`.
