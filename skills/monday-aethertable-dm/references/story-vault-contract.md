# AetherTable Story Vault Contract

## Purpose

The **AetherTable Story Vault** preserves a private campaign's playable history
and its best narrative material. It belongs to the campaign, not to MONDAY's
personal knowledge vault. Its purpose is continuity while playing, a readable
memory after the campaign, and a trustworthy source packet for a later short
story, novel, scrapbook, or family keepsake.

The vault is a record first and a creative asset second. A beautiful scene that
was never committed is a draft, not history.

## Canonical source hierarchy

1. AetherTable's committed `CampaignState` and validated `CampaignEvent` receipt
   establish game history.
2. The selected Rules Pack and World Pack establish mechanics and setting canon.
3. Story Vault entries preserve and organize those sources.
4. A later story adaptation may add structure, dialogue, transitions, or scenes,
   but labels any material not grounded in the vault as an adaptation choice.

The Story Vault never becomes a second rules engine or a competing campaign save.

## Records to retain

Each committed scene or material turn may create a source-linked record with:

- `campaignID`, World Pack identifier, source revision, and committed receipt or
  event identifiers;
- scene location, in-world time when known, participating characters, and a
  concise player-safe scene summary;
- player declarations worth preserving verbatim, with speaker attribution;
- the resolved consequence and material changes to facts, relationships,
  conditions, resources, quests, and threat clocks;
- character-arc beats, revealed lore, discovered artifacts, and open threads;
- visibility: `player-safe` or `gm-private`.

Keep a brief recap for play and a fuller scene record only when the moment earns
it. Do not turn a campaign into an unsearchable transcript. Keep GM-only motives,
unrevealed secrets, and future plot material private even within player-facing
exports.

## Write rule

The AetherTable bridge writes Story Vault records only after it has committed the
validated turn to the campaign store. A record must point to the receipt(s) that
support it. If a turn is rejected, abandoned, or superseded, mark its material
`proposed` or `discarded`; never present it later as campaign canon.

In the current pre-bridge implementation, MONDAY may prepare a Story Vault entry
beside a proposed turn, but it must remain visibly uncommitted until AetherTable
confirms the save.

## End-of-campaign Story Packet

On request, build a private Story Packet containing:

1. campaign premise, World Pack, rules family, and selected protagonists;
2. chronological campaign spine with source links;
3. curated scenes, decisive choices, pivotal rolls, and player lines;
4. character arcs, relationship changes, major discoveries, and unresolved
   threads;
5. a canon ledger separating committed facts, GM-private facts, and later
   adaptation opportunities.

The packet can seed a Ghostwritr story project. It is evidence for what happened
at the table, not an automatic manuscript or a license to fabricate the players'
choices. Any prose adaptation should retain provenance, protect private material,
and be clearly described as an adaptation when it adds invented connective tissue.

## Privacy and lifecycle

Story Vault data remains private to the selected campaign unless Chris explicitly
approves an export or share. A campaign may be archived, but its records should
remain readable and source-linked. Deleting a campaign or vault requires an
explicit, target-specific request; do not confuse archival with deletion.
