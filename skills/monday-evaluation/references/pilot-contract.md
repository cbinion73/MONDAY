# Bounded pilot contract

The first governed pilot is Chris-only, one named Mac, `America/New_York`, five consecutive business days, and fifteen scheduled planning checkpoints at 06:01, 12:31, and 17:01. It uses the five Tier 1 lanes and only explicitly approved Tier 2 pilot connectors. Tier 3 is excluded.

The planned denominator is immutable. Each observation has an idempotency key, sequence, prior digest, observation digest, checkpoint ID, scheduled and observed times, source-attempt denominator, publication state, readback state, manual-repair flag, meeting denominator, meeting disposition count, project writeback/readback count, incidents, and evidence digests.

Acceptance requires:

- 15 of 15 checkpoints attempted;
- five of five morning rollovers completed without manual repair;
- matching readback for every successful publication;
- 75 of 75 Tier 1 attempts truthfully recorded;
- every eligible meeting dispositioned;
- every material meeting impact written back and read back;
- zero privacy, domain-boundary, unauthorized-action, false-verification, data-loss, blind-retry, or hidden-source-failure incident;
- every critical alert resolved with evidence;
- Chris records `accept`, `extend`, or `stop` against the final digest.

An external outage is not a MONDAY failure when it is truthfully classified and last-known-good state is preserved. A hidden outage is a failure. Acceptance supports only the tested local scope and never an enterprise-readiness claim.
