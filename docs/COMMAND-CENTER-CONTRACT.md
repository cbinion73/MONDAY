# Command Center contract

The consolidated `monday` plugin publishes a read-only daily projection to:

`~/.codex/monday-planner/daily-plan.json`

The native Mac app validates and displays that projection. Vaults, ledgers, Calendar,
and governed records remain authoritative.

## Plan schema

Schema version `3` requires:

- `planID`: immutable publication identifier
- `date`, `generatedAt`, and `validUntil`
- `timezone`
- `sources` and `coverage`
- `primaryFocus`, `schedule`, `priorities`, `notes`, and `compass`
- `brief`: work projects, personal projects, decisions, meeting continuity, Activity
  Ledger, MONDAY Operations, pull-forwards, risks, and source health
- `publication`: producer, contract version, and publication state

The app rejects a version 3 plan when it is for another date, expired, missing its
identifier, or newer than the app's supported schema.

## Source manifest

Each external source publishes a schema version `1` manifest under
`~/.codex/monday-sources` with:

- `sourceID`, `name`, and `kind`
- `status`: `available`, `partial`, `empty`, `stale`, `blocked`, `unavailable`, or `unknown`
- `attemptedAt` and optional `succeededAt`
- bounded window, counts, freshness threshold, detail, error, and artifact path

`available` and `empty` require a successful collection timestamp. A count of zero is
not evidence of an empty source unless the bounded read succeeded.

The macOS Calendar specialist publishes only event title and start/end time. It does
not publish event bodies, attendees, or credentials.

## Readback verification

After the Mac app successfully validates and displays a current version 3 plan, it
writes:

`~/.codex/monday-planner/readback.json`

The receipt includes the plan identifier, plan schema, consumer, app version,
consumption time, and `displayed` state. A published plan without a matching readback
receipt has not been verified as visible in the native app.
