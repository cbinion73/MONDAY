# Priority 0 release baseline

Release: `0.1.0+codex.20260923210935`

This release establishes `/Users/chris.binion/plugins/monday` as the
version-controlled authoritative MONDAY plugin source. The Codex cache is an
installed copy and is never the sole home of a repair.

## Included integrity repairs

- The Calendar lane defaults to the installed Outlook Calendar plugin and
  source ID `outlook-calendar`.
- Outlook Calendar, Outlook Email, OneDrive, Teams, and SharePoint remain
  separate source-health lanes.
- The Microsoft connector-routing contract is packaged with the plugin.
- Planning instructions use the shipped `monday_system.py publish` interface.
- Source tests assert truthful missing-Calendar behavior.

## Command Center compatibility baseline

- Application: `/Applications/Command Center.app`
- Version: `0.2.0` build `8`
- Contract: schema `3` with matching `planID` readback
- Source commit: `440ede7`
- Rollback tag: `priority0-command-center-v0.2.0-build8`

Command Center is a read-only consumer. The legacy Command Center launch agent,
copied planning engine, and `calendar-feed.json` workflow are retired.

## Rollback

The pre-release application and installed-plugin archives are stored under:

`/Users/chris.binion/Backups/MONDAY/Priority-0-2026-09-23T1638`

Rollback requires an explicit reinstall from one of those archives. Do not
reactivate the retired 5:00 AM Command Center planner.

## Release gates

1. Validate the plugin and every skill.
2. Run all MONDAY Python tests and compile the shipped scripts.
3. Reinstall `monday@personal`.
4. Compare authoritative source and installed cache byte-for-byte, excluding
   only `.git` metadata.
5. Publish a schema-3 plan and require matching native-app readback.
6. Confirm the legacy planner launch label and runtime are absent.
