# Monday Knowledge

Monday Knowledge is MONDAY's Apple-native personal knowledge capability for macOS, iPhone, and iPad. It owns cross-domain memory and continuity; specialist applications continue to own their operational records.

## What it provides

- Markdown authoring with automatic save and revision numbers
- Daily notes
- Tags, aliases, pinned notes, and full-text search
- Obsidian-style `[[wiki links]]`, forward links, and backlinks
- Soft deletion through synchronized tombstones
- A generated `knowledge-index-v1.json` for agents, automations, migration, and auditing
- Native iCloud Documents synchronization across the user's Apple devices

## Portable storage contract

The iCloud container identifier is `iCloud.com.chris.monday.knowledge`. Each note is a standard `.md` file whose YAML front matter contains a JSON value under the `monday` key. JSON is valid YAML, so the file remains compatible with Markdown tools while the metadata can be decoded without heuristic parsing.

The front matter records the stable UUID, title, tags, aliases, timestamps, revision, pin state, source, deletion tombstone, and schema identifier. The body remains ordinary Markdown. The generated index records the same identity and graph information without duplicating note bodies.

Reviewed Obsidian promotions also record their source path, wiki link, evidence tier, confidence, source modification time, SHA-256 revision hash, acceptance time, and revocation state. They are read-only in Monday Knowledge. Updates require a new Mac review; revocation synchronizes as a tombstone. Obsidian remains canonical for the promoted personal memory.

If the iCloud container is unavailable, MONDAY uses an Application Support fallback and labels the library `Local fallback`; it does not pretend that the device is synchronized. When iCloud becomes available, the Trust Center reports `iCloud synced`.

## Trust boundary

iCloud Documents is an Apple synchronization capability, not an external AI route. Note contents remain outside any external model request unless MONDAY creates a separate request preview disclosing the selected context, model, token ceilings, and maximum estimated cost, and Chris grants the single-use approval required by the external-model gate.

## Deployment requirement

The Apple Developer account must register `iCloud.com.chris.monday.knowledge` and associate it with both `com.chris.monday.mac` and `com.chris.monday.iphone`. The matching provisioning profiles must include iCloud Documents before physical-device synchronization can activate.
