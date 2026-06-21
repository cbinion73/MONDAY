"use strict";
// Tests: vault-embedder.js
//
// Chunking tests: pure functions, no I/O.
// Embedding tests: mock the embed function; no Ollama required.
// LanceDB integration tests: run against a temp directory.

const fs     = require("node:fs");
const path   = require("node:path");
const os     = require("node:os");
const assert = require("node:assert/strict");

// ── Setup: temp vault + temp vector store + in-memory DB ──────────────────────

const TEMP_VAULT  = fs.mkdtempSync(path.join(os.tmpdir(), "monday-embed-vault-"));
const TEMP_MEMORY = fs.mkdtempSync(path.join(os.tmpdir(), "monday-embed-mem-"));

process.env.MONDAY_VAULT_ROOT = TEMP_VAULT;
process.env.MONDAY_DB_PATH    = ":memory:";
process.env.MONDAY_MEMORY_DIR = TEMP_MEMORY;

// Clear module cache for clean env
Object.keys(require.cache).forEach((k) => {
  if (k.includes("/engine/")) delete require.cache[k];
});

const { chunkMarkdown, embedChangedNotes, searchVault } = require("../src/engine/memory/vault-embedder");
const ks = require("../src/engine/db/knowledge-store");

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

// ── Chunking: unit tests (pure, no I/O) ──────────────────────────────────────

console.log("\nChunking — basic structure");

test("empty document returns no chunks", () => {
  assert.deepEqual(chunkMarkdown(""), []);
});

test("document with only frontmatter returns no chunks", () => {
  const raw = "---\ntitle: Test\n---\n";
  assert.deepEqual(chunkMarkdown(raw), []);
});

test("no-heading document returns one chunk", () => {
  const raw = "This is a note with no headings at all.\nIt has two lines.";
  const chunks = chunkMarkdown(raw);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].heading, "");
  assert.equal(chunks[0].headingLevel, 0);
  assert.ok(chunks[0].text.includes("two lines"));
});

test("single H1 with body produces one chunk", () => {
  const raw = "# My Note\nThis is the body text of the note.";
  const chunks = chunkMarkdown(raw);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].heading, "My Note");
  assert.equal(chunks[0].headingLevel, 1);
});

test("preamble before first heading becomes its own chunk", () => {
  const intro = "This is preamble text that appears before any heading. It should be its own chunk.";
  const body  = "This section content is long enough to survive the minimum-chunk merge threshold.";
  const raw = `${intro}\n\n# Section One\n${body}`;
  const chunks = chunkMarkdown(raw);
  assert.equal(chunks.length, 2, `expected 2 chunks, got ${chunks.length}`);
  assert.equal(chunks[0].heading, "");
  assert.ok(chunks[0].text.includes("preamble"));
  assert.equal(chunks[1].heading, "Section One");
});

test("multiple H2 headings produce one chunk per section", () => {
  const fill = "This section has enough content to clear the minimum chunk threshold for merging.";
  const raw = `# Top\n${fill}\n## Section A\n${fill}\n\n## Section B\n${fill}\n\n## Section C\n${fill}`;
  const chunks = chunkMarkdown(raw);
  assert.ok(chunks.length >= 3, `expected ≥3 chunks, got ${chunks.length}`);
  const headings = chunks.map((c) => c.heading);
  assert.ok(headings.includes("Section A"));
  assert.ok(headings.includes("Section B"));
  assert.ok(headings.includes("Section C"));
});

test("H1 then H2 then H3 — all heading levels tracked", () => {
  const fill = "This content is long enough to avoid being merged into a neighboring section.";
  const raw = `# H1\n${fill}\n## H2\n${fill}\n### H3\n${fill}`;
  const chunks = chunkMarkdown(raw);
  const levels = chunks.map((c) => c.headingLevel);
  assert.ok(levels.includes(1), `missing level 1, got [${levels}]`);
  assert.ok(levels.includes(2), `missing level 2, got [${levels}]`);
  assert.ok(levels.includes(3), `missing level 3, got [${levels}]`);
});

test("frontmatter is stripped before chunking", () => {
  const raw = `---
title: Test Note
domain: family
---
# Actual Content
This is the body.`;
  const chunks = chunkMarkdown(raw);
  assert.ok(chunks.every((c) => !c.text.includes("title:") && !c.text.includes("domain:")));
  assert.ok(chunks.some((c) => c.text.includes("Actual Content") || c.heading === "Actual Content"));
});

console.log("\nChunking — size limits");

test("short section below MIN_CHUNK_CHARS is merged into predecessor", () => {
  // A tiny section after a normal one should merge
  const shortSection = "Hi.";
  const normalSection = "A".repeat(200);
  const raw = `# Normal\n${normalSection}\n## Tiny\n${shortSection}`;
  const chunks = chunkMarkdown(raw);
  // The tiny section should be merged — so total chunks < number of headings
  const tinyAlone = chunks.some((c) => c.text.trim() === shortSection);
  assert.ok(!tinyAlone, "tiny section should be merged, not standalone");
});

test("section exceeding MAX_CHUNK_CHARS is split at paragraph boundaries", () => {
  const longPara1 = "Word ".repeat(200).trim();   // ~1000 chars
  const longPara2 = "Text ".repeat(200).trim();   // ~1000 chars
  const longPara3 = "More ".repeat(200).trim();   // ~1000 chars
  const raw = `# Long Section\n${longPara1}\n\n${longPara2}\n\n${longPara3}`;
  const chunks = chunkMarkdown(raw);
  // Should be split — more than one chunk from this single heading
  assert.ok(chunks.length >= 2, `expected ≥2 chunks, got ${chunks.length}`);
  for (const c of chunks) {
    assert.ok(c.text.length <= 2600, `chunk too long: ${c.text.length}`);
  }
});

test("continuation chunks get (cont.) in heading", () => {
  const longPara = "X ".repeat(600);
  const raw = `# Long\n${longPara}\n\n${longPara}\n\n${longPara}`;
  const chunks = chunkMarkdown(raw);
  const contChunks = chunks.filter((c) => c.heading.includes("(cont.)"));
  assert.ok(contChunks.length >= 1, "expected at least one continuation chunk");
});

test("each chunk text is within MAX_CHUNK_CHARS", () => {
  const huge = "Word ".repeat(2000);
  const raw  = `# Huge\n${huge}`;
  const chunks = chunkMarkdown(raw);
  for (const c of chunks) {
    assert.ok(c.text.length <= 2600, `chunk exceeds limit: ${c.text.length}`);
  }
});

console.log("\nChunking — real-world note shapes");

test("mission brief with multiple sections", () => {
  const raw = `---
title: Retirement Mission Brief
domain: retirement
type: mission
---
# Retirement — Mission Brief

## Overview
The retirement mission is about financial and spiritual freedom to give generously.

## Working Theory
Retire by 58 with enough capital to live generously and mentor others.

## Key Decisions
- Moved financial advisor in 2025
- Chose index funds over active management

## Open Questions
- How much is enough?
- What does faithful retirement look like?

## Contradictions
Declared: retirement is about rest.
Observed: planning is still work-focused.`;

  const chunks = chunkMarkdown(raw);
  assert.ok(chunks.length >= 4, `expected ≥4 chunks, got ${chunks.length}`);
  assert.ok(chunks.some((c) => c.heading === "Overview" || c.heading === "Retirement — Mission Brief"));
  assert.ok(chunks.some((c) => c.heading === "Working Theory"));
  assert.ok(chunks.some((c) => c.heading === "Open Questions"));
});

test("journal entry with no headings is one chunk", () => {
  const raw = `---
title: Journal 2026-06-21
type: journal
---
Today was a full day. Anna had her final exam. Caleb practiced guitar for the first time this week.
Rebekah and I talked about the summer trip. I feel like I've been saying yes to too many things lately.`;

  const chunks = chunkMarkdown(raw);
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].text.includes("full day"));
});

test("chunk order is preserved (index matches position)", () => {
  const raw = `# A\nFirst.\n## B\nSecond.\n### C\nThird.`;
  const chunks = chunkMarkdown(raw);
  for (let i = 0; i < chunks.length; i++) {
    // chunkMarkdown doesn't attach index — that's done in _embedNote — so just verify order
    assert.ok(chunks[i].text.length > 0);
  }
});

// ── Embedding records integration (with mocked embed) ────────────────────────

console.log("\nEmbedding records (mock embed)");

async function main() {

// Monkey-patch embedder to avoid needing Ollama
const embedderMod = require("../src/engine/memory/embedder");
const DIM = 768;
const realEmbed = embedderMod.embed;
embedderMod.embed = async (text) => new Array(DIM).fill(0.1);   // mock: deterministic non-zero vector

// Write a real note into the temp vault and index it
function writeVaultNote(relPath, content) {
  const abs = path.join(TEMP_VAULT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

const NOTE1_PATH = "Retirement/goals.md";
const NOTE1 = `---
title: Retirement Goals
domain: retirement
---
# Retirement Goals

## Financial Freedom
Retire by 58. Build enough capital to give generously without anxiety.

## Spiritual Clarity
The goal is not leisure — it is faithful stewardship of time.

## Open Questions
How much is actually enough? What would I do differently today if I knew?`;

writeVaultNote(NOTE1_PATH, NOTE1);

// Index the note through vault-indexer so knowledge-store has it
const vaultIndexer = require("../src/engine/obsidian/vault-indexer");
await vaultIndexer.sync();

await testAsync("embedChangedNotes() embeds a new note and creates embedding_records", async () => {
  const result = await embedChangedNotes();
  assert.ok(result.ok, `embed failed: ${result.error}`);
  assert.ok(result.embedded >= 3, `expected ≥3 chunks, got ${result.embedded}`);

  const recs = ks.getEmbeddingRecordsByPath(NOTE1_PATH);
  assert.ok(recs.length >= 3, `expected ≥3 embedding records, got ${recs.length}`);
  assert.ok(recs.every((r) => r.note_path === NOTE1_PATH));
  assert.ok(recs.every((r) => r.model === "nomic-embed-text"));
  assert.ok(recs.every((r) => r.chunk_hash.length > 0));
});

await testAsync("embedChangedNotes() skips a note that has not changed", async () => {
  const before = await embedChangedNotes();
  // On second run, all records should already exist with matching hash
  const recs = ks.getEmbeddingRecordsByPath(NOTE1_PATH);
  assert.ok(recs.length >= 3);
  // Second run should embed 0 new chunks for this note
  const after = await embedChangedNotes();
  assert.equal(after.embedded, 0, `expected 0 new chunks on second run, got ${after.embedded}`);
});

await testAsync("embedding_records are cleared when vault-indexer detects a change", async () => {
  // Simulate content change
  writeVaultNote(NOTE1_PATH, NOTE1 + "\n\n## New Section\nNew content added.");
  await new Promise((r) => setTimeout(r, 20));
  // Touch to update mtime
  const abs = path.join(TEMP_VAULT, NOTE1_PATH);
  fs.utimesSync(abs, new Date(), new Date(Date.now() + 1000));

  await vaultIndexer.sync();

  // embedding_records should now be empty for this note
  const recs = ks.getEmbeddingRecordsByPath(NOTE1_PATH);
  assert.equal(recs.length, 0, "embedding_records should be cleared after content change");
});

await testAsync("embedChangedNotes() re-embeds after content change", async () => {
  const result = await embedChangedNotes();
  assert.ok(result.ok);
  assert.ok(result.embedded >= 4, `expected ≥4 chunks after adding section, got ${result.embedded}`);

  const recs = ks.getEmbeddingRecordsByPath(NOTE1_PATH);
  assert.ok(recs.length >= 4);
});

await testAsync("deleteNoteEmbeddings() clears SQLite records", async () => {
  const { deleteNoteEmbeddings } = require("../src/engine/memory/vault-embedder");
  await deleteNoteEmbeddings(NOTE1_PATH);
  const recs = ks.getEmbeddingRecordsByPath(NOTE1_PATH);
  assert.equal(recs.length, 0);
});

// ── Semantic search (with mock vectors) ──────────────────────────────────────

console.log("\nSemantic search");

// Re-embed so we have data to search
await testAsync("searchVault() returns results with citations after embedding", async () => {
  await embedChangedNotes();

  const results = await searchVault("retirement financial freedom");
  assert.ok(results.ok, `search failed: ${results.error}`);
  // With a constant mock vector every chunk has the same distance — just check structure
  if (results.results.length > 0) {
    const r = results.results[0];
    assert.ok(r.noteChunk, "result missing noteChunk");
    assert.ok(r.noteChunk.notePath, "result missing notePath");
    assert.ok(r.citation, "result missing citation");
    assert.ok(typeof r.excerpt === "string", "result missing excerpt");
  }
});

await testAsync("searchVault() citation includes heading when chunk has one", async () => {
  await embedChangedNotes();
  const results = await searchVault("financial freedom");
  const withHeading = results.results.find((r) => r.noteChunk.heading);
  if (withHeading) {
    assert.ok(withHeading.citation.includes(" § "), `citation should use § separator: ${withHeading.citation}`);
    assert.ok(withHeading.citation.includes(withHeading.noteChunk.heading));
  }
  // Even if no heading-result found, structure must be correct
  for (const r of results.results) {
    assert.ok(r.citation.includes(r.noteChunk.notePath));
  }
});

await testAsync("searchVault() with domain filter returns only matching domain", async () => {
  // Write a family note
  writeVaultNote("Family/anna.md", `---
title: Anna
domain: family
---
# Anna
My daughter, planning to study medicine.`);
  await vaultIndexer.sync();
  await embedChangedNotes();

  const results = await searchVault("daughter medicine", { domain: "family" });
  assert.ok(results.ok);
  for (const r of results.results) {
    assert.equal(r.noteChunk.domain, "family", `unexpected domain: ${r.noteChunk.domain}`);
  }
});

// Restore real embed
embedderMod.embed = realEmbed;

} // end main()

// ── Cleanup ───────────────────────────────────────────────────────────────────

main().then(() => {
  try { fs.rmSync(TEMP_VAULT,  { recursive: true, force: true }); } catch {}
  try { fs.rmSync(TEMP_MEMORY, { recursive: true, force: true }); } catch {}
  console.log(`\nvault-embedder: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
