# MONDAY plugin

This directory is the authoritative source for Chris Binion's primary MONDAY
plugin. The installed Codex cache is a generated copy and must never be edited
as the sole source of a fix.

## Release sequence

1. Update and test this source directory.
2. Validate every skill and the complete plugin.
3. Update the Codex cachebuster with the plugin-creator helper.
4. Commit and tag the immutable source version.
5. Reinstall with `codex plugin add monday@personal`.
6. Compare this source byte-for-byte with the installed version, excluding only
   the source repository's `.git` metadata.
7. Verify a schema-3 plan and Command Center readback using the same `planID`.

Command Center is the read-only presentation runtime. It does not own Calendar
collection or planning. Outlook Calendar, Outlook Email, OneDrive, Teams, and
SharePoint remain separate evidence lanes under the source-health contract.

## Core orchestration

`monday-core` is the plugin-owned cross-domain operating layer. It owns intake,
capability routing, source selection, evidence labels, record and approval
boundaries, quality gates, final synthesis, and verified Command Center
handoff. Global personalization supplies MONDAY's identity, values, and the
instruction to begin with this skill; it is not the implementation contract.

Validate the core registry and deterministic controls with:

```bash
python3 skills/monday-core/scripts/monday_core.py validate-registry
python3 -m unittest discover -s skills/monday-core/tests -v
```

## Dependable daily system

The planning runtime now records `collect → validate → analyze → challenge → quality → publish → readback`. Connector-owning skills perform bounded Microsoft queries and submit privacy-reduced envelopes through `stage-collection`; the Python runtime validates and transactionally commits artifacts and manifests without pretending to be a connector client.

Useful local checks:

```bash
python3 scripts/monday_system.py source-status
python3 scripts/monday_system.py publish --date YYYY-MM-DD
python3 scripts/monday_system.py status
python3 -m unittest discover -s tests -v
```

See `docs/PRIORITY-1-RELEASE.md` for the release requirements and unattended next-day gate.
