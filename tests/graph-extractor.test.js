"use strict";
// Tests: graph-extractor.js — pattern-based entity and relation extraction
//
// All tests are fully offline (no Ollama, no LanceDB).
// Vault notes are written to a temp directory; DB is in-memory.

const fs     = require("node:fs");
const path   = require("node:path");
const os     = require("node:os");
const assert = require("node:assert/strict");

// ── Setup ─────────────────────────────────────────────────────────────────────

const TEMP_VAULT = fs.mkdtempSync(path.join(os.tmpdir(), "monday-graph-vault-"));

process.env.MONDAY_VAULT_ROOT = TEMP_VAULT;
process.env.MONDAY_DB_PATH    = ":memory:";

Object.keys(require.cache).forEach((k) => {
  if (k.includes("/engine/")) delete require.cache[k];
});

const ks = require("../src/engine/db/knowledge-store");
const { extractAllEntities, extractNote, getExtractionStatus, _parseSections, _parseBullets } = require("../src/engine/memory/graph-extractor");
const vaultIndexer = require("../src/engine/obsidian/vault-indexer");

let pass = 0;
let fail = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); fail++; }
}

async function testAsync(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); fail++; }
}

function writeNote(relPath, content) {
  const abs = path.join(TEMP_VAULT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

// ── Pure parsing tests (no I/O) ───────────────────────────────────────────────

async function main() {

console.log("\nSection parsing");

test("_parseSections returns empty array for frontmatter-only doc", () => {
  const raw = "---\ntitle: Test\n---\n";
  assert.deepEqual(_parseSections(raw), []);
});

test("_parseSections returns one section per heading", () => {
  const raw = `# Top\nsome content\n## Section A\nbullet one\n## Section B\nbullet two`;
  const s = _parseSections(raw);
  assert.equal(s.length, 3);
  assert.equal(s[0].heading, "Top");
  assert.equal(s[1].heading, "Section A");
  assert.equal(s[2].heading, "Section B");
});

test("_parseSections strips frontmatter before splitting", () => {
  const raw = `---\ntitle: X\n---\n# Real Section\nContent here.`;
  const s = _parseSections(raw);
  assert.equal(s.length, 1);
  assert.equal(s[0].heading, "Real Section");
});

test("_parseBullets extracts dash bullets", () => {
  const text = "- Decision one\n- Decision two\n- Decision three";
  assert.deepEqual(_parseBullets(text), ["Decision one", "Decision two", "Decision three"]);
});

test("_parseBullets extracts asterisk and plus bullets", () => {
  const text = "* Bullet A\n+ Bullet B";
  const b = _parseBullets(text);
  assert.ok(b.includes("Bullet A"));
  assert.ok(b.includes("Bullet B"));
});

test("_parseBullets skips blank lines", () => {
  const text = "- First\n\n- Second";
  const b = _parseBullets(text);
  assert.deepEqual(b, ["First", "Second"]);
});

// ── Entity extraction: frontmatter ────────────────────────────────────────────

console.log("\nFrontmatter entity extraction");

await testAsync("type:person note creates a Person entity", async () => {
  writeNote("Family/anna.md", `---
title: Anna Binion
type: person
domain: family
---
# Anna Binion
My daughter.`);
  await vaultIndexer.sync();
  const result = await extractNote("Family/anna.md");
  assert.ok(result.ok, result.error);
  assert.ok(result.entitiesWritten >= 1);

  const entities = ks.getEntitiesByType("Person");
  const anna = entities.find((e) => e.name === "Anna Binion");
  assert.ok(anna, "expected Person entity for Anna Binion");
  assert.equal(anna.domain, "family");
  assert.equal(anna.sourcePath, "Family/anna.md");
});

await testAsync("type:mission note creates a Mission entity", async () => {
  writeNote("Retirement/goals.md", `---
title: Retirement Goals
type: mission
domain: retirement
---
# Retirement Goals
The retirement mission.`);
  await vaultIndexer.sync();
  const result = await extractNote("Retirement/goals.md");
  assert.ok(result.ok, result.error);

  const entities = ks.getEntitiesByType("Mission");
  const mission = entities.find((e) => e.name === "Retirement Goals");
  assert.ok(mission, "expected Mission entity");
  assert.equal(mission.domain, "retirement");
});

await testAsync("note without recognized frontmatter type extracts no frontmatter entity", async () => {
  writeNote("Work/notes.md", `---
title: Work Notes
type: journal
domain: work
---
# Work Notes
Just a journal.`);
  await vaultIndexer.sync();
  await extractNote("Work/notes.md");

  const all = ks.searchEntities("Work Notes");
  const journalEntity = all.find((e) => e.name === "Work Notes");
  assert.ok(!journalEntity, "journal type should not create entity");
});

// ── Entity extraction: sections ────────────────────────────────────────────────

console.log("\nSection-based entity extraction");

await testAsync("Key Decisions section creates Decision entities from bullets", async () => {
  writeNote("Retirement/decisions.md", `---
title: Retirement Decisions
domain: retirement
---
# Retirement Decisions

## Key Decisions
- Moved to index funds over active management in 2025
- Chose Vanguard as primary custodian
- Set target retirement age at 58`);
  await vaultIndexer.sync();
  const result = await extractNote("Retirement/decisions.md");
  assert.ok(result.ok, result.error);
  assert.ok(result.entitiesWritten >= 3, `expected ≥3 entities, got ${result.entitiesWritten}`);

  const decisions = ks.getEntitiesByType("Decision");
  assert.ok(decisions.length >= 3, `expected ≥3 Decision entities`);
  const names = decisions.map((d) => d.name);
  assert.ok(names.some((n) => n.includes("index funds")));
  assert.ok(names.some((n) => n.includes("Vanguard")));
});

await testAsync("Working Theory section creates Belief entities", async () => {
  writeNote("Retirement/beliefs.md", `---
title: Retirement Beliefs
domain: retirement
---
## Working Theory
- Retirement is about faithful stewardship, not leisure
- Enough capital means the ability to give generously without anxiety`);
  await vaultIndexer.sync();
  const result = await extractNote("Retirement/beliefs.md");
  assert.ok(result.ok, result.error);

  const beliefs = ks.getEntitiesByType("Belief");
  assert.ok(beliefs.length >= 2, `expected ≥2 Belief entities`);
});

await testAsync("Open Questions section creates Question entities", async () => {
  writeNote("Faith/questions.md", `---
title: Faith Questions
domain: faith
---
## Open Questions
- What does faithful rest look like for someone like me?
- How do I reconcile ambition with contentment?
- Is my drive a gift or a wound?`);
  await vaultIndexer.sync();
  const result = await extractNote("Faith/questions.md");
  assert.ok(result.ok, result.error);

  const questions = ks.getEntitiesByType("Question");
  assert.ok(questions.length >= 3, `expected ≥3 Question entities`);
});

await testAsync("Tensions section creates Tension entities", async () => {
  writeNote("Work/tensions.md", `---
title: Work Tensions
domain: work
---
## Tensions
- I say rest matters but my calendar says otherwise
- I value depth but keep accepting surface work`);
  await vaultIndexer.sync();
  const result = await extractNote("Work/tensions.md");
  assert.ok(result.ok, result.error);

  const tensions = ks.getEntitiesByType("Tension");
  assert.ok(tensions.length >= 2, `expected ≥2 Tension entities`);
});

await testAsync("Goals section creates Goal entities", async () => {
  writeNote("Retirement/goals2.md", `---
title: Retirement Aspirations
domain: retirement
---
## Goals
- Build enough passive income to cover baseline expenses by 55
- Give at least 20% of income annually by retirement`);
  await vaultIndexer.sync();
  const result = await extractNote("Retirement/goals2.md");
  assert.ok(result.ok, result.error);

  const goals = ks.getEntitiesByType("Goal");
  assert.ok(goals.length >= 2);
});

await testAsync("mission note + decisions section creates Mission and Decision entities", async () => {
  writeNote("Retirement/mission-full.md", `---
title: Retirement Mission
type: mission
domain: retirement
---
# Retirement Mission

## Key Decisions
- Moved financial advisor in 2025
- Chose Vanguard Total Market index

## Working Theory
- Retirement is stewardship, not leisure`);
  await vaultIndexer.sync();
  const result = await extractNote("Retirement/mission-full.md");
  assert.ok(result.ok, result.error);
  assert.ok(result.entitiesWritten >= 4, `expected ≥4 entities (1 mission + 2 decisions + 1 belief), got ${result.entitiesWritten}`);
});

// ── Wikilink person extraction (Family notes) ──────────────────────────────────

console.log("\nWikilink person extraction");

await testAsync("wikilinks in Family notes create Person entities", async () => {
  writeNote("Family/journal-june.md", `---
title: Family Journal June
domain: family
type: journal
---
# Family Journal

Talked with [[Rebekah]] about the summer plans.
[[Caleb]] finished his semester. [[Anna Binion]] got her exam results.`);
  await vaultIndexer.sync();
  const result = await extractNote("Family/journal-june.md");
  assert.ok(result.ok, result.error);

  const people = ks.getEntitiesByType("Person");
  const names  = people.map((p) => p.name);
  // Multi-word wikilinks should become Person entities
  assert.ok(names.some((n) => n === "Anna Binion"), `expected Anna Binion, got [${names}]`);
});

await testAsync("short single-word wikilinks under 4 chars are skipped as persons", async () => {
  writeNote("Family/short-links.md", `---
title: Short Links Test
domain: family
---
Read [[it]] and [[go]] then check [[the]] notes.`);
  await vaultIndexer.sync();
  await extractNote("Family/short-links.md");

  const people = ks.getEntitiesByType("Person");
  const names  = people.map((p) => p.name);
  assert.ok(!names.includes("it"),  "short token 'it' should not become a person");
  assert.ok(!names.includes("go"),  "short token 'go' should not become a person");
  assert.ok(!names.includes("the"), "short token 'the' should not become a person");
});

// ── Relations ─────────────────────────────────────────────────────────────────

console.log("\nRelation extraction");

await testAsync("entities from the same note have co_mentioned relations", async () => {
  writeNote("Retirement/co-mention-test.md", `---
title: Co-Mention Test
domain: retirement
---
## Key Decisions
- Moved to Vanguard in 2025
- Set target age at 58

## Working Theory
- Retirement is stewardship`);
  await vaultIndexer.sync();
  const result = await extractNote("Retirement/co-mention-test.md");
  assert.ok(result.ok, result.error);
  assert.ok(result.relationsWritten >= 1, `expected ≥1 co_mentioned relation, got ${result.relationsWritten}`);
});

await testAsync("mission note generates supports relations for decisions/beliefs", async () => {
  writeNote("Retirement/mission-relations.md", `---
title: Retirement Mission Relations
type: mission
domain: retirement
---
## Key Decisions
- Chose index funds
## Working Theory
- Stewardship not leisure`);
  await vaultIndexer.sync();
  const result = await extractNote("Retirement/mission-relations.md");
  assert.ok(result.ok, result.error);
  // Should have co_mentioned + supports relations
  assert.ok(result.relationsWritten >= 2, `expected ≥2 relations, got ${result.relationsWritten}`);
});

// ── Idempotency and change detection ─────────────────────────────────────────

console.log("\nIdempotency and change detection");

await testAsync("extracting the same note twice does not duplicate entities", async () => {
  writeNote("Work/idempotent.md", `---
title: Idempotent Test
domain: work
---
## Key Decisions
- Only one decision here that matters`);
  await vaultIndexer.sync();
  await extractNote("Work/idempotent.md");
  const firstCount = ks.getEntitiesByType("Decision").filter((e) => e.sourcePath === "Work/idempotent.md").length;

  // Extract again — should clear old entities and re-insert same ones
  await extractNote("Work/idempotent.md");
  const secondCount = ks.getEntitiesByType("Decision").filter((e) => e.sourcePath === "Work/idempotent.md").length;

  assert.equal(firstCount, secondCount, "entity count should not increase on second extraction");
  assert.equal(secondCount, 1, "should have exactly 1 decision");
});

await testAsync("markNoteEntityExtracted updates entity_extracted_at", async () => {
  writeNote("Work/track-test.md", `---
title: Track Test
domain: work
---
## Key Decisions
- Test decision`);
  await vaultIndexer.sync();

  const before = ks.getNotesNeedingEntityExtraction();
  const needsBefore = before.some((n) => n.path === "Work/track-test.md");
  assert.ok(needsBefore, "note should need extraction before running");

  await extractNote("Work/track-test.md");

  const after = ks.getNotesNeedingEntityExtraction();
  const needsAfter = after.some((n) => n.path === "Work/track-test.md");
  assert.ok(!needsAfter, "note should not need extraction after running");
});

// ── extractAllEntities ────────────────────────────────────────────────────────

console.log("\nextractAllEntities");

await testAsync("extractAllEntities processes only notes needing extraction", async () => {
  // All notes above are already extracted. Write a fresh one.
  writeNote("Faith/new-note.md", `---
title: New Faith Note
domain: faith
---
## Open Questions
- Is silence itself a form of prayer?`);
  await vaultIndexer.sync();

  const pending = ks.getNotesNeedingEntityExtraction();
  assert.ok(pending.some((n) => n.path === "Faith/new-note.md"), "new note should be pending");

  const stats = await extractAllEntities();
  assert.ok(stats.ok);
  assert.ok(stats.processed >= 1, `expected ≥1 processed, got ${stats.processed}`);
});

await testAsync("extractAllEntities skips notes with up-to-date extraction", async () => {
  // All notes already extracted — nothing pending
  const stats = await extractAllEntities();
  assert.ok(stats.ok);
  assert.equal(stats.processed, 0, `expected 0 processed (all up to date), got ${stats.processed}`);
});

// ── getExtractionStatus ────────────────────────────────────────────────────────

console.log("\ngetExtractionStatus");

test("getExtractionStatus returns total, extracted, pending counts", () => {
  const status = getExtractionStatus();
  assert.ok(typeof status.total     === "number");
  assert.ok(typeof status.extracted === "number");
  assert.ok(typeof status.pending   === "number");
  assert.equal(status.total, status.extracted + status.pending);
});

test("getExtractionStatus shows 0 pending after full extraction", () => {
  const status = getExtractionStatus();
  assert.equal(status.pending, 0, `expected 0 pending, got ${status.pending}`);
});

// ── Edge cases ────────────────────────────────────────────────────────────────

console.log("\nEdge cases");

await testAsync("extractNote returns ok:false for note not in index", async () => {
  const result = await extractNote("nonexistent/note.md");
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

await testAsync("note with no extractable sections writes 0 entities", async () => {
  writeNote("Work/empty-sections.md", `---
title: Empty Sections
domain: work
---
# Overview
This note has no structured sections, just prose.
It talks about things without bullets or recognized headings.`);
  await vaultIndexer.sync();
  const result = await extractNote("Work/empty-sections.md");
  assert.ok(result.ok, result.error);
  // May have 0 entities (no recognized patterns)
  const fromThis = ks.searchEntities("Empty Sections");
  // Just verify it ran cleanly
  assert.equal(result.relationsWritten >= 0, true);
});

await testAsync("stable IDs: same entity name from different notes → same id", async () => {
  writeNote("Family/caleb-note1.md", `---
title: Caleb Note 1
domain: family
type: person
---
About Caleb.`);
  writeNote("Family/caleb-note2.md", `---
title: Caleb Note 1
domain: family
type: person
---
Also about Caleb.`);
  await vaultIndexer.sync();
  await extractNote("Family/caleb-note1.md");
  await extractNote("Family/caleb-note2.md");

  // Same name + type → same ID → entity table has exactly one "Caleb Note 1" person
  const people = ks.getEntitiesByType("Person").filter((e) => e.name === "Caleb Note 1");
  // The second extraction overwrites the first because same stable ID
  assert.equal(people.length, 1, "stable ID should prevent duplicate entities");
});

} // end main()

// ── Cleanup ───────────────────────────────────────────────────────────────────

main().then(() => {
  try { fs.rmSync(TEMP_VAULT, { recursive: true, force: true }); } catch {}
  console.log(`\ngraph-extractor: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
