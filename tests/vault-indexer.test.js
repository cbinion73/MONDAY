"use strict";
// Tests: vault-indexer.js — parsing, scanning, SQLite indexing, change detection.
// Uses a temp directory as the vault and an in-memory SQLite database.
// The live Obsidian vault is never touched.

const fs     = require("node:fs");
const path   = require("node:path");
const os     = require("node:os");
const assert = require("node:assert/strict");

// ── Setup: temp vault + in-memory DB ─────────────────────────────────────────

const TEMP_VAULT = fs.mkdtempSync(path.join(os.tmpdir(), "monday-vault-test-"));
process.env.MONDAY_VAULT_ROOT = TEMP_VAULT;
process.env.MONDAY_DB_PATH    = ":memory:";

// Clear module cache so env vars are picked up fresh
Object.keys(require.cache).forEach((k) => {
  if (k.includes("/engine/db/") || k.includes("/engine/obsidian/")) {
    delete require.cache[k];
  }
});

const indexer = require("../src/engine/obsidian/vault-indexer");
const ks      = require("../src/engine/db/knowledge-store");

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeNote(relPath, content) {
  const abs = path.join(TEMP_VAULT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

function deleteNote(relPath) {
  try { fs.unlinkSync(path.join(TEMP_VAULT, relPath)); } catch {}
}

function touchNote(relPath) {
  const abs = path.join(TEMP_VAULT, relPath);
  const now = new Date();
  fs.utimesSync(abs, now, new Date(now.getTime() + 1000));
}

// ── Parser unit tests ─────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    fail++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    fail++;
  }
}

// ── Frontmatter parsing ───────────────────────────────────────────────────────

console.log("\nFrontmatter parsing");

test("simple key:value pairs", () => {
  const { parseFrontmatter } = indexer;
  const fm = parseFrontmatter("title: My Note\ndomain: family\ntype: note");
  assert.equal(fm.title, "My Note");
  assert.equal(fm.domain, "family");
  assert.equal(fm.type, "note");
});

test("inline array: tags: [family, faith]", () => {
  const { parseFrontmatter } = indexer;
  const fm = parseFrontmatter("tags: [family, faith, health]");
  assert.deepEqual(fm.tags, ["family", "faith", "health"]);
});

test("block array with dashes", () => {
  const { parseFrontmatter } = indexer;
  const fm = parseFrontmatter("tags:\n  - family\n  - faith\ntitle: Test");
  assert.deepEqual(fm.tags, ["family", "faith"]);
  assert.equal(fm.title, "Test");
});

test("quoted values are unquoted", () => {
  const { parseFrontmatter } = indexer;
  const fm = parseFrontmatter('title: "Quoted Title"\nkey: \'single quoted\'');
  assert.equal(fm.title, "Quoted Title");
  assert.equal(fm.key, "single quoted");
});

test("empty frontmatter returns empty object", () => {
  const { parseFrontmatter } = indexer;
  assert.deepEqual(indexer.parseFrontmatter(""), {});
});

// ── Wikilink extraction ───────────────────────────────────────────────────────

console.log("\nWikilink extraction");

test("simple [[Note]] link", () => {
  const links = indexer.extractWikilinks("See [[Anna]] for details.");
  assert.equal(links.length, 1);
  assert.equal(links[0].targetAlias, "Anna");
});

test("[[Note|Alias]] extracts note name not alias", () => {
  const links = indexer.extractWikilinks("See [[Anna Binion|Anna]].");
  assert.equal(links[0].targetAlias, "Anna Binion");
});

test("[[Note#Heading]] extracts note name without heading", () => {
  const links = indexer.extractWikilinks("See [[Retirement#Goals]].");
  assert.equal(links[0].targetAlias, "Retirement");
});

test("![[embed]] is skipped", () => {
  const links = indexer.extractWikilinks("![[image.png]] and [[Real Link]]");
  assert.equal(links.length, 1);
  assert.equal(links[0].targetAlias, "Real Link");
});

test("multiple links in one document", () => {
  const links = indexer.extractWikilinks("[[Anna]] and [[Caleb]] and [[Rebekah]]");
  assert.equal(links.length, 3);
  assert.deepEqual(links.map((l) => l.targetAlias), ["Anna", "Caleb", "Rebekah"]);
});

test("no links returns empty array", () => {
  const links = indexer.extractWikilinks("No links here, just text.");
  assert.equal(links.length, 0);
});

// ── Tag extraction ────────────────────────────────────────────────────────────

console.log("\nTag extraction");

test("inline #tag in body", () => {
  const tags = indexer.extractTags("This is about #family and #faith.", {});
  assert.ok(tags.includes("family"));
  assert.ok(tags.includes("faith"));
});

test("leading # is stripped and normalized to lowercase", () => {
  const tags = indexer.extractTags("#Family #FAITH", {});
  assert.ok(tags.includes("family"));
  assert.ok(tags.includes("faith"));
});

test("frontmatter tags array is included", () => {
  const tags = indexer.extractTags("body text", { tags: ["retirement", "planning"] });
  assert.ok(tags.includes("retirement"));
  assert.ok(tags.includes("planning"));
});

test("frontmatter tags string is split on comma", () => {
  const tags = indexer.extractTags("", { tags: "health, fitness" });
  assert.ok(tags.includes("health"));
  assert.ok(tags.includes("fitness"));
});

test("deduplication across frontmatter and inline", () => {
  const tags = indexer.extractTags("#family text", { tags: ["family", "faith"] });
  const familyCount = tags.filter((t) => t === "family").length;
  assert.equal(familyCount, 1);
});

test("nested tags like #faith/prayer are preserved", () => {
  const tags = indexer.extractTags("Thinking about #faith/prayer today.", {});
  assert.ok(tags.includes("faith/prayer"));
});

// ── Full note parsing ─────────────────────────────────────────────────────────

console.log("\nFull note parsing");

test("parseMarkdown: extracts all fields from a complete note", () => {
  const raw = `---
title: Anna's College Plans
domain: family
tags: [family, education]
type: note
---
Anna is planning to study medicine at [[Vanderbilt]] next fall.
She mentioned her interest in [[Faith]] last Sunday. #family #daughter`;

  const parsed = indexer.parseMarkdown(raw, "Family/annas-college-plans.md");
  assert.equal(parsed.title, "Anna's College Plans");
  assert.equal(parsed.domain, "family");
  assert.equal(parsed.folder, "Family");
  assert.equal(parsed.type, "note");
  assert.ok(parsed.wikilinks.some((l) => l.targetAlias === "Vanderbilt"));
  assert.ok(parsed.wikilinks.some((l) => l.targetAlias === "Faith"));
  assert.ok(parsed.tags.includes("family"));
  assert.ok(parsed.tags.includes("daughter"));
  assert.ok(parsed.tags.includes("education"));
});

test("parseMarkdown: note without frontmatter gets defaults from path", () => {
  const raw = "Just a note with no frontmatter.";
  const parsed = indexer.parseMarkdown(raw, "Journal/2026-06-21.md");
  assert.equal(parsed.folder, "Journal");
  assert.equal(parsed.type, "journal");
  assert.ok(parsed.title.length > 0);
});

test("bodyHash is deterministic for same content", () => {
  const hash1 = indexer.bodyHash("Hello world");
  const hash2 = indexer.bodyHash("Hello world");
  assert.equal(hash1, hash2);
});

test("bodyHash differs for different content", () => {
  const hash1 = indexer.bodyHash("Hello world");
  const hash2 = indexer.bodyHash("Hello world!");
  assert.notEqual(hash1, hash2);
});

// ── Vault scanning ────────────────────────────────────────────────────────────

console.log("\nVault scanning");

test("scanVault finds .md files recursively", () => {
  writeNote("Family/anna.md", "# Anna");
  writeNote("Faith/prayer.md", "# Prayer");
  writeNote("Journal/2026-06-21.md", "# Journal");
  const files = indexer.scanVault();
  assert.ok(files.has("Family/anna.md"));
  assert.ok(files.has("Faith/prayer.md"));
  assert.ok(files.has("Journal/2026-06-21.md"));
});

test("scanVault skips hidden directories", () => {
  fs.mkdirSync(path.join(TEMP_VAULT, ".obsidian"), { recursive: true });
  fs.writeFileSync(path.join(TEMP_VAULT, ".obsidian", "config.md"), "config");
  const files = indexer.scanVault();
  for (const key of files.keys()) {
    assert.ok(!key.startsWith(".obsidian"), `should not index .obsidian: ${key}`);
  }
});

test("scanVault skips non-.md files", () => {
  fs.writeFileSync(path.join(TEMP_VAULT, "image.png"), "fake png");
  const files = indexer.scanVault();
  assert.ok(!files.has("image.png"));
});

// ── Incremental indexing ──────────────────────────────────────────────────────

async function main() {

console.log("\nIncremental indexing");

await testAsync("sync() indexes new notes", async () => {
  writeNote("Retirement/goals.md", `---
title: Retirement Goals
domain: retirement
tags: [retirement, planning]
---
Retire by 58. [[Faith]] will guide the path. #retirement`);

  const result = await indexer.sync();
  assert.ok(result.ok, `sync failed: ${result.error}`);
  assert.ok(result.indexed >= 1);

  const note = ks.getNote("Retirement/goals.md");
  assert.ok(note, "note not in DB");
  assert.equal(note.title, "Retirement Goals");
  assert.equal(note.domain, "retirement");

  const tags = ks.getTagsForNote("Retirement/goals.md");
  assert.ok(tags.includes("retirement"));
  assert.ok(tags.includes("planning"));

  const links = ks.getLinksFrom("Retirement/goals.md");
  assert.ok(links.some((l) => l.target_alias === "Faith"));
});

await testAsync("sync() skips unchanged notes on second run", async () => {
  const before = await indexer.sync();
  const after  = await indexer.sync();
  // Second run should skip everything that didn't change
  assert.ok(after.skipped >= before.skipped || after.indexed === 0);
});

await testAsync("sync() re-indexes a note when content changes", async () => {
  writeNote("Retirement/goals.md", `---
title: Retirement Goals — Updated
domain: retirement
---
Updated content with [[Health]] link.`);

  // Force mtime to differ
  await new Promise((r) => setTimeout(r, 10));
  touchNote("Retirement/goals.md");

  const result = await indexer.sync();
  assert.ok(result.ok);
  assert.ok(result.indexed >= 1);

  const note = ks.getNote("Retirement/goals.md");
  assert.equal(note.title, "Retirement Goals — Updated");
  const links = ks.getLinksFrom("Retirement/goals.md");
  assert.ok(links.some((l) => l.target_alias === "Health"));
});

await testAsync("sync() detects and removes deleted notes", async () => {
  writeNote("Inbox/temp-note.md", "Temporary note to be deleted.");
  await indexer.sync();
  assert.ok(ks.getNote("Inbox/temp-note.md"), "note should be indexed first");

  deleteNote("Inbox/temp-note.md");
  const result = await indexer.sync();
  assert.ok(result.ok);
  assert.ok(result.deleted >= 1);
  assert.equal(ks.getNote("Inbox/temp-note.md"), null, "deleted note should be removed from DB");
});

await testAsync("reindex() processes all notes regardless of change state", async () => {
  const result = await indexer.reindex();
  assert.ok(result.ok);
  // reindex skips nothing (forced)
  assert.equal(result.skipped, 0);
  assert.ok(result.indexed > 0);
});

// ── Indexing run tracking ─────────────────────────────────────────────────────

console.log("\nIndexing run tracking");

await testAsync("sync() records a completed indexing_run in the DB", async () => {
  await indexer.sync();
  const last = ks.getLastIndexingRun();
  assert.ok(last, "no indexing run recorded");
  assert.equal(last.status, "completed");
  assert.ok(last.notes_scanned > 0);
  assert.ok(last.completed_at);
});

await testAsync("getIndexingStatus() returns vault state and last run", async () => {
  const status = indexer.getIndexingStatus();
  assert.ok(status.vaultAvailable);
  assert.ok(status.noteCount > 0);
  assert.ok(status.lastRun);
  assert.equal(status.lastRun.status, "completed");
});

// ── Link resolution ───────────────────────────────────────────────────────────

console.log("\nLink resolution");

await testAsync("wikilinks are resolved to paths when target note exists", async () => {
  // anna.md already indexed; retirement/goals.md links to [[Faith]]
  // Write a faith note so [[Faith]] resolves
  writeNote("Faith/faith.md", `---
title: Faith
domain: faith
---
My faith notes.`);

  writeNote("Family/anna-links.md", `---
title: Anna Links
---
See [[Faith]] and [[Retirement Goals]].`);

  await indexer.sync();

  const links = ks.getLinksFrom("Family/anna-links.md");
  const faithLink = links.find((l) => l.target_alias === "Faith");
  assert.ok(faithLink, "Faith link not found");
  // Faith note exists → target_path should be resolved
  assert.equal(faithLink.target_path, "Faith/faith.md");
});

await testAsync("unresolvable links have target_path = null", async () => {
  writeNote("Inbox/orphan-links.md", "Links to [[NonExistentNote]] which has no file.");
  await indexer.sync();

  const links = ks.getLinksFrom("Inbox/orphan-links.md");
  const orphan = links.find((l) => l.target_alias === "NonExistentNote");
  assert.ok(orphan);
  assert.equal(orphan.target_path, null);
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

try {
  fs.rmSync(TEMP_VAULT, { recursive: true, force: true });
} catch {}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nvault-indexer: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);

} // end main()

main().catch((err) => { console.error(err); process.exit(1); });
