"use strict";
// Tests: vault-writer.js — approved candidate write-back to Obsidian vault.
//
// All tests use a temp vault directory; DB is in-memory.
// No Ollama, no LanceDB needed.

const fs     = require("node:fs");
const path   = require("node:path");
const os     = require("node:os");
const assert = require("node:assert/strict");

// ── Setup ─────────────────────────────────────────────────────────────────────

const TEMP_VAULT = fs.mkdtempSync(path.join(os.tmpdir(), "monday-writer-vault-"));

process.env.MONDAY_VAULT_ROOT = TEMP_VAULT;
process.env.MONDAY_DB_PATH    = ":memory:";

Object.keys(require.cache).forEach((k) => {
  if (k.includes("/engine/")) delete require.cache[k];
});

const ks = require("../src/engine/db/knowledge-store");
const {
  writeBackApproved,
  writeBackCandidate,
  appendWithTimestamp,
  mergeFrontmatter,
} = require("../src/engine/obsidian/vault-writer");

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

function readVaultFile(relPath) {
  return fs.readFileSync(path.join(TEMP_VAULT, relPath), "utf8");
}

function vaultFileExists(relPath) {
  return fs.existsSync(path.join(TEMP_VAULT, relPath));
}

function writeVaultFile(relPath, content) {
  const abs = path.join(TEMP_VAULT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

// Helper: create a candidate and return its id
function seedCandidate(overrides = {}) {
  return ks.addMemoryCandidate({
    source:         "manual",
    content:        "A memory candidate content string about something meaningful",
    proposedFolder: "Retirement",
    proposedTitle:  "Test Memory Note",
    proposedBody:   "## Test\n\nThis is the full body of the memory.",
    reason:         "This seems worth keeping",
    confidence:     0.8,
    ...overrides,
  });
}

async function main() {

// ── appendWithTimestamp ───────────────────────────────────────────────────────

console.log("\nappendWithTimestamp");

test("creates a new note when path does not exist", () => {
  const relPath = "Retirement/new-append-test.md";
  const result  = appendWithTimestamp(relPath, "First written content here.", {
    source: "manual", confidence: 0.75,
  });
  assert.ok(result.ok, result.error);
  assert.ok(vaultFileExists(relPath));
  const raw = readVaultFile(relPath);
  assert.ok(raw.includes("First written content here."));
});

test("appends to an existing note without overwriting", () => {
  const relPath = "Faith/existing-note.md";
  writeVaultFile(relPath, "---\ntitle: Existing Note\n---\n# Existing Note\n\nOriginal content that must survive.");
  const result = appendWithTimestamp(relPath, "New appended section content here.", { source: "test" });
  assert.ok(result.ok, result.error);
  const raw = readVaultFile(relPath);
  assert.ok(raw.includes("Original content that must survive."), "original content must be preserved");
  assert.ok(raw.includes("New appended section content here."), "new content must be present");
});

test("appended section includes a Monday date heading", () => {
  const relPath = "Work/date-heading-test.md";
  appendWithTimestamp(relPath, "Some content about work decisions.");
  const raw = readVaultFile(relPath);
  assert.ok(/## Monday — \d{4}-\d{2}-\d{2}/.test(raw), `expected date heading, got:\n${raw}`);
});

test("appended section includes source and confidence metadata", () => {
  const relPath = "Family/metadata-test.md";
  appendWithTimestamp(relPath, "Family insight content.", { source: "entity_extraction", confidence: 0.85 });
  const raw = readVaultFile(relPath);
  assert.ok(raw.includes("entity_extraction"), "should include source");
  assert.ok(raw.includes("85%"), "should include confidence as percentage");
});

test("appended reason appears in a blockquote", () => {
  const relPath = "Faith/reason-test.md";
  appendWithTimestamp(relPath, "Insight content.", { reason: "Recurring pattern across notes" });
  const raw = readVaultFile(relPath);
  assert.ok(raw.includes("> Recurring pattern across notes"), "reason should appear as blockquote");
});

test("multiple appends accumulate in sequence", () => {
  const relPath = "Work/multi-append.md";
  appendWithTimestamp(relPath, "First appended block.");
  appendWithTimestamp(relPath, "Second appended block.");
  appendWithTimestamp(relPath, "Third appended block.");
  const raw = readVaultFile(relPath);
  assert.ok(raw.includes("First appended block."));
  assert.ok(raw.includes("Second appended block."));
  assert.ok(raw.includes("Third appended block."));
  // Verify order
  assert.ok(raw.indexOf("First") < raw.indexOf("Second"));
  assert.ok(raw.indexOf("Second") < raw.indexOf("Third"));
});

// ── mergeFrontmatter ──────────────────────────────────────────────────────────

console.log("\nmergeFrontmatter");

test("adds new fields to existing frontmatter", () => {
  const relPath = "Retirement/fm-add-test.md";
  writeVaultFile(relPath, "---\ntitle: FM Test\ndomain: retirement\n---\n# FM Test\n\nBody content.");
  const result = mergeFrontmatter(relPath, { status: "active", confidence: "0.9" });
  assert.ok(result.ok, result.error);
  const raw = readVaultFile(relPath);
  assert.ok(raw.includes("status: active"), "new field 'status' should be present");
  assert.ok(raw.includes("confidence: 0.9"), "new field 'confidence' should be present");
  assert.ok(raw.includes("title: FM Test"), "existing title should be preserved");
  assert.ok(raw.includes("domain: retirement"), "existing domain should be preserved");
});

test("updates existing frontmatter fields", () => {
  const relPath = "Faith/fm-update-test.md";
  writeVaultFile(relPath, "---\ntitle: Faith Note\nstatus: draft\n---\n# Faith Note\n\nContent.");
  mergeFrontmatter(relPath, { status: "final" });
  const raw = readVaultFile(relPath);
  assert.ok(raw.includes("status: final"), "field should be updated");
  assert.ok(!raw.includes("status: draft"), "old value should be gone");
});

test("preserves body content after frontmatter merge", () => {
  const relPath = "Family/fm-body-test.md";
  writeVaultFile(relPath, "---\ntitle: Body Test\n---\n# Body Test\n\nThis body must survive the merge.");
  mergeFrontmatter(relPath, { reviewed: "true" });
  const raw = readVaultFile(relPath);
  assert.ok(raw.includes("This body must survive the merge."), "body should be preserved");
});

test("handles note with no frontmatter (empty block case)", () => {
  const relPath = "Work/no-fm-test.md";
  writeVaultFile(relPath, "# No Frontmatter\n\nJust a plain note with no YAML header.");
  const result = mergeFrontmatter(relPath, { title: "No Frontmatter" });
  // Should succeed without crashing — may or may not produce valid FM
  assert.ok(result.ok !== undefined);
});

test("returns ok:false when file does not exist", () => {
  const result = mergeFrontmatter("Nonexistent/missing.md", { key: "value" });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("no-op when updates is empty", () => {
  const relPath = "Family/no-op-test.md";
  writeVaultFile(relPath, "---\ntitle: No-Op\n---\n# No-Op\n\nContent.");
  const result = mergeFrontmatter(relPath, {});
  assert.ok(result.ok);
});

// ── writeBackCandidate ────────────────────────────────────────────────────────

console.log("\nwriteBackCandidate");

await testAsync("approval gate: pending candidate cannot be written", async () => {
  const id     = seedCandidate({ proposedTitle: "Pending Gate Test" });
  // candidate is still 'pending' (not approved)
  const result = await writeBackCandidate(id);
  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("not approved") || result.error?.includes("not found"), `unexpected error: ${result.error}`);
});

await testAsync("approved candidate is written and marked 'written'", async () => {
  const id = seedCandidate({ proposedTitle: "Approved Write Test" });
  ks.approveCandidate(id, "Looks good");
  const result = await writeBackCandidate(id);
  assert.ok(result.ok, result.error);
  assert.ok(result.vaultPath, "should return vault path");
  assert.equal(result.mode, "new", "should be a new note");

  // File should exist in vault
  assert.ok(vaultFileExists(result.vaultPath), `file not found: ${result.vaultPath}`);

  // Candidate should be marked written
  const written = ks.getCandidatesByStatus("written");
  assert.ok(written.some((c) => c.id === id), "candidate should be marked written");
});

await testAsync("written note contains the proposed body", async () => {
  const id = seedCandidate({
    proposedTitle: "Body Content Test",
    proposedBody:  "## Background\n\nThis is the real body content for the written note.",
    proposedFolder: "Faith",
  });
  ks.approveCandidate(id, "approved");
  const result = await writeBackCandidate(id);
  assert.ok(result.ok, result.error);
  const raw = readVaultFile(result.vaultPath);
  assert.ok(raw.includes("This is the real body content"), "body should appear in written note");
});

await testAsync("written note has frontmatter with source=monday_memory", async () => {
  const id = seedCandidate({ proposedTitle: "Frontmatter Check" });
  ks.approveCandidate(id, "approved");
  const result = await writeBackCandidate(id);
  assert.ok(result.ok, result.error);
  const raw = readVaultFile(result.vaultPath);
  assert.ok(raw.startsWith("---"), "should start with frontmatter");
  assert.ok(raw.includes("source: monday_memory"), "should have source field");
  assert.ok(raw.includes("title: Frontmatter Check"), "should have title field");
});

await testAsync("already-written candidate returns ok:false on second call", async () => {
  const id = seedCandidate({ proposedTitle: "Already Written Test" });
  ks.approveCandidate(id, "approved");
  await writeBackCandidate(id);       // first write
  const second = await writeBackCandidate(id); // second attempt
  assert.equal(second.ok, false);
  assert.ok(second.error?.includes("already written"), `unexpected: ${second.error}`);
});

await testAsync("candidate matching an existing note title → appends instead of creating new", async () => {
  // Create a vault note and index it
  const existingRelPath = "Retirement/existing-retirement-note.md";
  writeVaultFile(existingRelPath, `---\ntitle: Existing Retirement Note\ndomain: retirement\n---\n# Existing Retirement Note\n\nOriginal content.`);
  await (require("../src/engine/obsidian/vault-indexer").sync());

  const id = seedCandidate({
    proposedTitle:  "Existing Retirement Note",  // matches existing note title
    proposedFolder: "Retirement",
    content:        "New insight about existing retirement planning note.",
  });
  ks.approveCandidate(id, "approved");
  const result = await writeBackCandidate(id);
  assert.ok(result.ok, result.error);
  assert.equal(result.mode, "append", "should append to existing note");

  const raw = readVaultFile(existingRelPath);
  assert.ok(raw.includes("Original content."), "original must survive");
  assert.ok(raw.includes("New insight about existing retirement"), "new content must appear");
});

await testAsync("candidate with no proposedTitle uses first words of content as filename slug", async () => {
  const id = ks.addMemoryCandidate({
    source:         "manual",
    content:        "Index funds chosen as primary investment vehicle retirement portfolio 2025",
    proposedFolder: "Retirement",
    confidence:     0.8,
  });
  ks.approveCandidate(id, "approved");
  const result = await writeBackCandidate(id);
  assert.ok(result.ok, result.error);
  assert.ok(result.vaultPath.startsWith("Retirement/"), "should be in Retirement folder");
  assert.ok(vaultFileExists(result.vaultPath));
});

await testAsync("non-existent candidate id returns ok:false", async () => {
  const result = await writeBackCandidate("non-existent-id-xyz");
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

// ── writeBackApproved ─────────────────────────────────────────────────────────

console.log("\nwriteBackApproved");

await testAsync("processes all approved-and-unwritten candidates", async () => {
  const id1 = seedCandidate({ proposedTitle: "Bulk Write Test One", proposedFolder: "Work" });
  const id2 = seedCandidate({ proposedTitle: "Bulk Write Test Two", proposedFolder: "Work" });
  ks.approveCandidate(id1, "ok");
  ks.approveCandidate(id2, "ok");

  const result = await writeBackApproved();
  assert.ok(result.ok, result.error);
  assert.ok(result.written >= 2, `expected ≥2 written, got ${result.written}`);
});

await testAsync("second call to writeBackApproved writes nothing new (all already written)", async () => {
  const before = await writeBackApproved();
  const after  = await writeBackApproved();
  assert.equal(after.written, 0, "no new candidates should be written on second pass");
});

await testAsync("pending candidates are not written by writeBackApproved", async () => {
  const pendingId = seedCandidate({ proposedTitle: "Should Stay Pending" });
  // Not approved — still pending
  const beforeWritten = ks.getCandidatesByStatus("written").length;
  await writeBackApproved();
  const afterWritten  = ks.getCandidatesByStatus("written").length;
  // Written count should not increase due to the pending candidate
  const pendingStillPending = ks.getCandidatesByStatus("pending").some((c) => c.id === pendingId);
  assert.ok(pendingStillPending, "pending candidate should remain pending");
});

} // end main()

// ── Cleanup ───────────────────────────────────────────────────────────────────

main().then(() => {
  try { fs.rmSync(TEMP_VAULT, { recursive: true, force: true }); } catch {}
  console.log(`\nvault-writer: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
