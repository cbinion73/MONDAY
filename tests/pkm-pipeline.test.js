"use strict";
// pkm-pipeline.test.js — Integration tests for the full PKM pipeline.
//
// Covers the end-to-end path from vault indexing through hybrid retrieval,
// through memory-curator scoring, through the intelligence recall hook.
//
// All offline — no Ollama, no LanceDB embedding (mocked), no external network.
// Uses an in-memory SQLite DB and a temp vault directory.

const fs     = require("node:fs");
const path   = require("node:path");
const os     = require("node:os");
const assert = require("node:assert/strict");

// ── Environment ───────────────────────────────────────────────────────────────

const TEMP_VAULT  = fs.mkdtempSync(path.join(os.tmpdir(), "monday-pkm-vault-"));
const TEMP_MEMORY = fs.mkdtempSync(path.join(os.tmpdir(), "monday-pkm-mem-"));

process.env.MONDAY_VAULT_ROOT = TEMP_VAULT;
process.env.MONDAY_DB_PATH    = ":memory:";
process.env.MONDAY_MEMORY_DIR = TEMP_MEMORY;

// Clear module cache so env vars take effect
Object.keys(require.cache).forEach((k) => {
  if (k.includes("/engine/")) delete require.cache[k];
});

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeVaultNote(relPath, content) {
  const full = path.join(TEMP_VAULT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {

// ── 1. Vault indexer → knowledge-store ───────────────────────────────────────

console.log("\nPKM Pipeline — vault indexing");

{
  const indexer = require("../src/engine/obsidian/vault-indexer");

  writeVaultNote("Retirement/goals.md", `---
title: Retirement Goals
domain: retirement
tags: [retirement, goals, financial, freedom]
---
# Retirement Goals

The golden line: $15,000/month passive income sustained for 6 months.
Target date: age 58. Primary vehicle: index funds.
`);

  writeVaultNote("Family/kids.md", `---
title: Family Kids
domain: family
tags: [family, kids, presence]
---
# Being Present with the Kids

Summer camp planning, weekly check-ins, Sunday dinners.
`);

  writeVaultNote("Work/current-project.md", `---
title: Current Project
domain: work
tags: [work, leadership, project]
---
# Current Project

Q3 deliverable: ship the agent dispatch layer.
`);

  await testAsync("vault indexer syncs notes into knowledge-store", async () => {
    await indexer.sync();
    const notes = ks.getAllNotes();
    assert.ok(notes.length >= 3, `expected ≥ 3 notes, got ${notes.length}`);
  });

  await testAsync("retirement note is stored with correct domain", async () => {
    const notes = ks.getAllNotes();
    const note = notes.find((n) => n.path === "Retirement/goals.md");
    assert.ok(note, "Retirement note not found");
    assert.equal(note.domain, "retirement");
  });

  await testAsync("tags are indexed for a note", async () => {
    const tags = ks.getTagsForNote("Retirement/goals.md");
    assert.ok(Array.isArray(tags), "expected tags array");
    const tagNames = tags.map((t) => (typeof t === "string" ? t : t.tag));
    assert.ok(tagNames.includes("retirement"), `retirement tag missing; got: ${tagNames.join(", ")}`);
  });
}

// ── 2. Hybrid retrieval — keyword + graph channels ────────────────────────────

console.log("\nPKM Pipeline — hybrid retrieval");

{
  const { retrievePersonalContext } = require("../src/engine/memory/retrieval");

  // Add entity and link data for graph channel
  ks.upsertEntity({ name: "Golden Line", type: "Goal", domain: "retirement", description: "15k/month passive income for 6 months", confidence: 0.95 });
  ks.upsertEntity({ name: "Summer Camp", type: "Event", domain: "family", description: "Annual family summer camp trip", confidence: 0.85 });

  ks.replaceNoteLinks("Family/kids.md", [
    { targetPath: "Retirement/goals.md", targetAlias: "Retirement Goals", linkType: "wikilink" },
  ]);

  await testAsync("keyword channel finds retirement note by title keyword", async () => {
    const result = await retrievePersonalContext("retirement goals", { channels: ["keyword"], limit: 5 });
    assert.ok(result.ok, "retrieval failed");
    assert.ok(result.results.length > 0, "no results returned");
    const found = result.results.find((r) => (r.notePath || "").includes("Retirement") || (r.title || "").toLowerCase().includes("retirement"));
    assert.ok(found, "retirement note not in keyword results");
  });

  await testAsync("graph channel returns array result (no throw)", async () => {
    const result = await retrievePersonalContext("summer camp family kids", { channels: ["graph"], limit: 5 });
    assert.ok(result.ok, "retrieval failed");
    assert.ok(Array.isArray(result.results), "graph channel results not an array");
  });

  await testAsync("multi-channel deduplication removes duplicate hits", async () => {
    const result = await retrievePersonalContext("retirement financial freedom", {
      channels: ["keyword", "graph"],
      limit: 10,
    });
    assert.ok(result.ok);
    const paths = result.results.map((r) => r.notePath || r.path || r.title).filter(Boolean);
    const unique = new Set(paths);
    assert.equal(unique.size, paths.length, "duplicate results found after dedup");
  });

  await testAsync("domain filter restricts results to family domain", async () => {
    const result = await retrievePersonalContext("goals project", {
      channels: ["keyword"],
      domain: "family",
      limit: 10,
    });
    assert.ok(result.ok);
    const nonFamily = result.results.filter((r) => r.domain && r.domain !== "family");
    assert.equal(nonFamily.length, 0, `got non-family results: ${JSON.stringify(nonFamily.map((r) => r.domain))}`);
  });
}

// ── 3. Memory Curator — scoring and queue management ─────────────────────────

console.log("\nPKM Pipeline — memory curator");

{
  const curator = require("../src/engine/memory/memory-curator");

  test("queue a candidate with high confidence", () => {
    const result = curator.queueCandidate({
      content: "Chris wants to retire at 58 with the golden line: $15k/month passive income.",
      type: "Belief",
      domain: "retirement",
      confidence: 0.92,
      source: "conversation",
    });
    assert.ok(result.ok, `queue failed: ${result.error}`);
    assert.ok(result.id, "no id returned");
  });

  test("pending queue returns the queued candidate", () => {
    const queue = curator.getPendingQueue(10);
    assert.ok(Array.isArray(queue), "expected array");
    assert.ok(queue.length >= 1, "queue is empty");
  });

  test("stats reflect pending count", () => {
    const stats = curator.getReviewStats();
    assert.ok(stats.pending >= 1, `expected pending ≥ 1, got ${stats.pending}`);
  });

  test("approve candidate by id", () => {
    const queue = curator.getPendingQueue(1);
    const id = queue[0]?.id;
    assert.ok(id, "no candidate to approve");
    const result = curator.approveCandidateById(id, "high confidence belief about retirement");
    assert.ok(result.ok, `approve failed: ${result.error}`);
  });

  test("approved candidate no longer appears in pending queue", () => {
    const queue = curator.getPendingQueue(100);
    const allPending = queue.every((c) => c.status === "pending");
    assert.ok(allPending, "non-pending candidates found in pending queue");
  });

  test("reject a second queued candidate", () => {
    curator.queueCandidate({
      content: "Temporary low-confidence note that should be rejected.",
      type: "Note",
      domain: "work",
      confidence: 0.31,
      source: "auto",
    });
    const queue = curator.getPendingQueue(5);
    const id = queue[0]?.id;
    assert.ok(id, "no candidate to reject");
    const result = curator.rejectCandidateById(id, "low confidence");
    assert.ok(result.ok, `reject failed: ${result.error}`);
  });

  test("stats reflect approved + rejected counts", () => {
    const stats = curator.getReviewStats();
    assert.ok(stats.approved >= 1, `expected approved ≥ 1, got ${stats.approved}`);
    assert.ok(stats.rejected >= 1, `expected rejected ≥ 1, got ${stats.rejected}`);
  });

  test("entity scoring gives Decision type a bonus over Person", () => {
    const personScore   = curator.scoreEntityCandidate({ type: "Person",   name: "Test person",   confidence: 0.7, domain: "family",     description: "A family member who lives nearby." });
    const decisionScore = curator.scoreEntityCandidate({ type: "Decision", name: "Chose Vanguard", confidence: 0.7, domain: "retirement", description: "Chose Vanguard index over active mgmt." });
    assert.ok(decisionScore >= personScore, `Decision (${decisionScore}) should score ≥ Person (${personScore})`);
  });

  test("queueFromEntities populates queue from knowledge-store entities", () => {
    const result = curator.queueFromEntities({ limit: 20 });
    assert.ok(result.ok, `queueFromEntities failed: ${result.error || JSON.stringify(result)}`);
    assert.ok(typeof result.queued === "number", "expected queued count");
  });
}

// ── 4. Memory recall API surface ──────────────────────────────────────────────

console.log("\nPKM Pipeline — memory recall interface");

{
  const memory = require("../src/engine/memory/memory-index");

  await testAsync("recall() returns an array (even with empty vector store)", async () => {
    const results = await memory.recall("retirement planning goals", { limit: 4 });
    assert.ok(Array.isArray(results), "expected array from recall()");
  });

  await testAsync("search() returns ok + results shape", async () => {
    const result = await memory.search("family summer camp");
    assert.ok(typeof result === "object", "expected object");
    assert.ok("results" in result, "expected results field");
    assert.ok(Array.isArray(result.results), "expected results to be array");
  });
}

// ── 5. Write-back pipeline ────────────────────────────────────────────────────

console.log("\nPKM Pipeline — write-back");

{
  const vaultWriter = require("../src/engine/obsidian/vault-writer");

  const NOTE_PATH = "Retirement/goals.md";
  const NOTE_FULL = path.join(TEMP_VAULT, NOTE_PATH);

  test("vault note file exists from indexer phase", () => {
    assert.ok(fs.existsSync(NOTE_FULL), `expected vault note at ${NOTE_FULL}`);
  });

  test("appendWithTimestamp adds content to an existing note", () => {
    const result = vaultWriter.appendWithTimestamp(NOTE_PATH, "## Curator Update\nApproved note appended by test.");
    assert.ok(result.ok, `appendWithTimestamp failed: ${result.error}`);
    const content = fs.readFileSync(NOTE_FULL, "utf8");
    assert.ok(content.includes("Curator Update"), "appended content not found in file");
  });
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

try { fs.rmSync(TEMP_VAULT,  { recursive: true, force: true }); } catch {}
try { fs.rmSync(TEMP_MEMORY, { recursive: true, force: true }); } catch {}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\npkm-pipeline: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);

} // end main()

main().catch((err) => { console.error(err); process.exit(1); });
