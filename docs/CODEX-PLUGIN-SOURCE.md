# Authoritative Codex plugin source

The consolidated MONDAY Codex plugin is versioned in this GitHub repository on
the dedicated `monday-plugin` branch. The branch preserves the plugin's own
history and immutable release tags without rewriting the unrelated native Apple
application history on `main`.

## Current release

- Branch: `monday-plugin`
- Plugin version: `0.1.0+codex.20260924163918`
- Commit: `93c9eb8359af198971412dbca0183beb68aef255`
- Tag: `v0.1.0-codex.20260924163918`
- Compatible Command Center: `0.4.2 (17)`

The branch contains the plugin manifest, skills, scripts, schemas, tests, and
Priority 0 through Priority 4 release documentation. Its
`docs/IMPLEMENTATION-STATUS-2026-09-24.md` file is the consolidated change and
verification record.

## Repository boundary

- `main` is the native Apple application history.
- `monday-plugin` is the authoritative Codex plugin history.
- `cbinion73/monday-command-center` is the installed macOS Command Center
  application used for the current plugin projection and readback contracts.

The branch separation is deliberate. The plugin and applications have separate
build systems, release evidence, and rollback requirements. A future monorepo
migration should be performed as an explicit history-preserving change, not by
force-pushing or combining unrelated roots.

## Checkout

```bash
git clone --branch monday-plugin git@github.com:cbinion73/MONDAY.git monday-plugin
```

Follow the branch README for validation, immutable packaging, installation, and
source-to-installed parity checks.
