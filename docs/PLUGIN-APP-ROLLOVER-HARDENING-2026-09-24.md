# Plugin and Command Center rollover hardening

Release: `0.1.0+codex.20260924181124`

## Defect closed

An installed MONDAY plugin intentionally omits its source `.git` directory. The Evaluation projection previously tried to read the release commit only from `.git`, emitted `unknown`, and was correctly rejected by Command Center even though the immutable plugin version was paired.

Command Center could also remain paired to the prior immutable cache build after a new plugin release was installed.

## Resolution

- Evaluation now uses the matching governed evaluation report as the immutable commit authority when source Git metadata is unavailable.
- A report commit is accepted only when its plugin version exactly matches the installed manifest and the commit is a valid hexadecimal identifier.
- Command Center 0.4.3 orders managed plugin builds by version and `+codex.<timestamp>` metadata.
- Command Center automatically advances a managed-cache pairing to the newest valid release while preserving manually selected plugin folders outside the managed cache.
- Regression tests cover both installed-cache commit recovery and managed-plugin release ordering.
- Engineering release evidence accepts the registered Command Center range from 0.4.2 inclusive to 0.5.0 exclusive instead of hardcoding one exact app build.

Compatibility checks remain fail-closed. These changes supply missing release identity; they do not bypass schema, version, digest, readback, or source-health requirements.
