# MONDAY Bridge Contract

Status: Core contract and MONDAY-side registry implemented

## Purpose

MONDAY Bridge lets a specialist app exchange narrowly scoped requests, observations,
and verified results without giving MONDAY direct access to that app's private
database. The specialist continues to own its records and domain logic. MONDAY owns
identity, connection policy, orchestration, approval, audit, and continuity.

## Contract

`BridgeEnvelope` is versioned and contains:

- a request, result, observation, or revocation kind;
- source, target, and declared capability;
- a correlation identifier and idempotency key;
- issue and expiry times;
- a typed payload and content type;
- an explicit action-approval requirement.
- a correlation-bound approval receipt for every execution capability.

The validator rejects expired envelopes, missing routing, unsupported versions,
unsafe retries, action requests that do not require approval, missing approval
receipts, and receipts attached to the wrong correlation identifier.

Specialists return `BridgeResultPayload`, which distinguishes accepted, verified,
failed, and unverified results and can include evidence plus a canonical specialist
record identifier and revision. Only the specialist may issue those identifiers.

`FileBridgeMailbox` provides atomic, protected file transfer suitable for an Apple
App Group container. A target reads only its inbox and acknowledges a handled
envelope by identifier.

## Connection states

- **Connected:** a working transport and verification method exist.
- **Needs permission:** the transport exists but Apple authorization is pending.
- **Adapter required:** the app is known, but no bridge transport is available.
- **Unavailable:** the capability cannot currently be used.

Installed does not mean connected.

## Current implementation

- Apple Calendar: native EventKit connection.
- Apple Reminders: native EventKit connection.
- Shortcuts and App Intents: `Ask MONDAY` accepts text and returns MONDAY's answer as
  a reusable Shortcuts value.
- NAV, VITALS, and Chronicle: declared manifests with truthful `adapter required`
  state. Their targets must import MONDAYCore, adopt the envelope contract, and join
  a registered App Group before local mailbox transfer can begin.

## Next target-side work

For each owned specialist app:

1. Add the shared App Group entitlement to MONDAY and the specialist target.
2. Resolve the App Group container URL and initialize `FileBridgeMailbox` there.
3. Publish the manifest and supported capability handlers.
4. Validate every envelope before handling it.
5. Require specialist read-back before returning a verified result.
6. Add App Intents and a universal-link route for foreground handoff.
7. Test revocation, expiry, duplicate delivery, app-not-running behavior, and schema
   migration.
