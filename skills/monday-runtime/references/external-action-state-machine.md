# Universal external-action state machine

External actions include sending messages, changing calendars, publishing, purchasing, booking, deleting material data, changing permissions, creating external tasks, or representing Chris.

## States

1. `confirmation-required`: a privacy-reduced immutable action specification was proposed. No attempt is authorized.
2. `confirmed`: an unexpired confirmation is bound to action ID, kind, target hash, outbound payload digest, actor, issue/expiry times, and one-time confirmation ID. It authorizes one attempt.
3. `attempting`: the runtime issued one attempt identifier to the connector-owning capability.
4. `attempted`: the connector reported an attempt. This is not completion.
5. `verified`: destination-native readback matched the action digest, destination system, and attempt identifier.
6. `failed-before-dispatch`: evidence shows the effect was not dispatched. Another attempt still requires a fresh confirmation and remaining attempt budget.
7. `indeterminate`: dispatch may have occurred but destination-native outcome is absent. It cannot retry. Source-native readback must resolve it to `verified` or `failed-before-dispatch` before any fresh confirmation.
8. `cancelled`: the proposal was cancelled before a verified effect.

Allowed transitions are deliberately narrow:

- `confirmation-required -> confirmed | cancelled`
- `confirmed -> attempting | cancelled`
- `attempting -> attempted | failed-before-dispatch | indeterminate`
- `attempted -> verified | indeterminate`
- `indeterminate -> verified | failed-before-dispatch`, only through matching destination-native readback
- `failed-before-dispatch -> confirmed | cancelled`, but only with a fresh one-time confirmation

`verified` and `cancelled` are terminal. An expired or already consumed confirmation cannot begin an attempt. Verification readback binds destination system, action digest, attempt ID, confirmation ID, observation time, outcome, and non-reversible destination receipt hash. The runtime stores the destination system and a one-way target hash, never a raw recipient, URL, address, message, credential, or secret.

The connector-owning capability performs the effect. The runtime only issues and reconciles receipts. If a process stops after `attempting`, treat the outcome as uncertain and require source-native investigation before any new confirmation.

## Narrow standing authorization

A standing authorization is a separate durable policy, not a broad confirmation substitute. It binds one action kind, destination system, one-way target hash, payload class, timezone, allowed weekdays, local time window, expiry, revocation state, and authority-evidence digest. An action must match every field and exact schedule before the runtime issues its one-time confirmation. A different recipient, channel, report class, date, time, expired policy, revoked policy, or retry is outside scope and fails closed.

The ordinary user-confirmation path remains separate. A standing-authorized action cannot accept an ad hoc confirmation event, and a user-confirmed proposal cannot attach standing-policy fields.
