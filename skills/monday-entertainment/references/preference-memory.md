# Entertainment preference memory

Use this reference only when reading or writing entertainment preferences or
queues through an authorized MONDAY Knowledge Vault connection.

## Ownership

Keep two separate records:

| What changes | Vault | Canonical path |
|---|---|---|
| Chris's enduring taste, boundaries, and recurring patterns | `personal` | `Knowledge/Entertainment Preferences.md` |
| Current save-for-later, shared shortlist, and in-progress choices | `monday` | `Parking-Lot/Entertainment Queue.md` |

The personal record is about Chris, not a catch-all household profile. Keep
family, date-night, and friend preferences conversational unless Chris has
explicitly created and authorized a separate profile for them.

## Standing capture rule

Chris has authorized Star-Lord to preserve a **clear, durable user statement**
or an explicit queue action without asking again each time. Use
`source_basis: user_statement` and retain a concise reason that identifies the
statement or feedback being captured.

Capture examples include:

- direct taste feedback: loved, disliked, abandoned, or wants more/less of a
  recognizable pattern;
- clear content boundaries or recurring mood constraints;
- an explicit request to save, remove, resume, finish, or share a title;
- a correction to an existing preference.

Do not capture a one-off question, a tentative curiosity, an unverified
recommendation, a rating inferred from behavior, passive viewing history, or
another person's taste. Respect any request not to save something and remove or
correct an entry when Chris asks.

## Safe write sequence

1. Call `get_vault_policy` for the target vault and confirm writing is allowed.
2. Read or search the existing canonical note before changing it. Preserve
   established preferences and remove superseded entries rather than appending
   contradictory history.
3. Write only the updated canonical note using `write_memory`:
   - personal preferences: `vault: personal`, `path: Knowledge/Entertainment Preferences.md`,
     `memory_type: identity_or_preference`, `source_basis: user_statement`,
     `mode: replace`;
   - active queues: `vault: monday`, `path: Parking-Lot/Entertainment Queue.md`,
     `memory_type: parking_lot`, `source_basis: user_statement`,
     `mode: replace`.
4. Verify the write result. Report the vault-relative path and what changed;
   never claim persistence from a failed, unavailable, or unverified write.

If MONDAY Knowledge or its write capability is unavailable on the current
surface, do not attempt a substitute filesystem write. Keep the update in the
conversation and say that it was not persisted.

## Record shape

Keep the personal note compact and evidence-based:

```markdown
# Entertainment Preferences

## Strong fits
- [preference] — Chris stated this because [brief reason].

## Avoid or use carefully
- [boundary or pattern] — Chris stated this because [brief reason].

## Context-specific
- Date night / family / solo constraints only when Chris explicitly provides them.
```

Keep the queue note short, with sections for `Saved`, `In Progress`, `Shared
Shortlist`, and `Not for Us`. Remove entries after an explicit completion,
removal, or durable preference update; do not use it as a viewing-history log.
