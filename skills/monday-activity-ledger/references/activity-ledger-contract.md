# Activity Ledger contract

Receipts are append-only JSON Lines with schema version, stable identifier, occurrence time, recorded time, classification, source, summary, artifact locators, evidence class, limitations, and optional `supersedes` identifier.

Allowed evidence classes are `observed`, `reported`, `verified`, `inferred`, and `unknown`. An inference must remain labeled. A receipt may describe MONDAY or Codex activity, but never represent total daily coverage.
