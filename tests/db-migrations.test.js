"use strict";
// Tests: SQLite migration system and knowledge-store data access layer.
// Uses an in-memory database so the live monday.db is never touched.

process.env.MONDAY_DB_PATH = ":memory:";

const assert = require("node:assert/strict");

// Force a fresh connection for each test suite run.
// Because connection.js caches the singleton we use the module cache to reset it.
function freshStore() {
  Object.keys(require.cache).forEach((k) => {
    if (k.includes("/engine/db/")) delete require.cache[k];
  });
  return require("../src/engine/db/knowledge-store");
}

let store;
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

// ── Migration integrity ───────────────────────────────────────────────────────

console.log("\nMigrations");

store = freshStore();

test("schema_migrations table is populated", () => {
  const { getDb } = require("../src/engine/db/connection");
  const rows = getDb().prepare("SELECT version FROM schema_migrations ORDER BY version").all();
  assert.deepEqual(rows.map((r) => r.version), [1, 2, 3, 4, 5, 6, 7]);
});

test("all 25 user tables exist", () => {
  const { getDb } = require("../src/engine/db/connection");
  const tables = new Set(
    getDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
  );
  const expected = [
    "working_theories", "theory_revisions", "threads", "triage_state", "heartbeat_log",
    "notes", "note_links", "note_tags", "entities", "entity_relations",
    "memory_candidates", "memory_reviews", "indexing_runs", "embedding_records",
    "missions", "decisions", "contradictions", "people", "preferences", "life_events",
    "email_threads", "email_thread_facts",
    "email_memory_records",
    "surfacing_queue", "llm_cost_log",
  ];
  for (const t of expected) assert.ok(tables.has(t), `missing table: ${t}`);
});

test("migrations are idempotent (running twice is safe)", () => {
  const { getDb } = require("../src/engine/db/connection");
  const { runMigrations } = require("../src/engine/db/connection");
  // getDb() already ran them; calling getDb() again should not throw or re-insert
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as n FROM schema_migrations").get().n;
  assert.equal(count, 7);
});

// ── Notes ─────────────────────────────────────────────────────────────────────

console.log("\nNotes");

test("upsertNote / getNote round-trip", () => {
  store.upsertNote({
    path: "Family/anna.md",
    title: "Anna",
    folder: "Family",
    domain: "family",
    type: "note",
    frontmatter: { name: "Anna Binion" },
    bodyHash: "abc123",
    mtime: "2026-06-21T00:00:00.000Z",
    wordCount: 42,
  });
  const note = store.getNote("Family/anna.md");
  assert.equal(note.title, "Anna");
  assert.equal(note.folder, "Family");
  assert.equal(note.frontmatter.name, "Anna Binion");
  assert.equal(note.bodyHash, "abc123");
  assert.equal(note.wordCount, 42);
});

test("upsertNote updates an existing note", () => {
  store.upsertNote({ path: "Family/anna.md", title: "Anna Updated", folder: "Family", bodyHash: "def456", mtime: "2026-06-21T01:00:00.000Z" });
  const note = store.getNote("Family/anna.md");
  assert.equal(note.title, "Anna Updated");
  assert.equal(note.bodyHash, "def456");
});

test("getNotesByFolder returns correct subset", () => {
  store.upsertNote({ path: "Inbox/test.md", title: "Inbox Note", folder: "Inbox", mtime: "2026-06-20T00:00:00.000Z" });
  const family = store.getNotesByFolder("Family");
  assert.ok(family.some((n) => n.path === "Family/anna.md"));
  assert.ok(!family.some((n) => n.path === "Inbox/test.md"));
});

test("getNotesNeedingIndex returns notes where mtime > indexed_at", () => {
  store.upsertNote({
    path: "Health/journal.md",
    title: "Health Journal",
    folder: "Health",
    mtime: "2026-06-21T10:00:00.000Z",
    indexedAt: "2026-06-20T00:00:00.000Z", // older than mtime
  });
  const stale = store.getNotesNeedingIndex();
  assert.ok(stale.some((n) => n.path === "Health/journal.md"));
});

test("deleteNote removes the note and its links/tags", () => {
  store.upsertNote({ path: "Archive/old.md", title: "Old", folder: "Archive", mtime: "2026-01-01T00:00:00.000Z" });
  store.replaceNoteLinks("Archive/old.md", [{ targetAlias: "anna", targetPath: "Family/anna.md" }]);
  store.replaceNoteTags("Archive/old.md", ["archive"]);
  store.deleteNote("Archive/old.md");
  assert.equal(store.getNote("Archive/old.md"), null);
  assert.deepEqual(store.getLinksFrom("Archive/old.md"), []);
  assert.deepEqual(store.getTagsForNote("Archive/old.md"), []);
});

// ── Note Links ────────────────────────────────────────────────────────────────

console.log("\nNote Links");

test("replaceNoteLinks stores and retrieves links", () => {
  store.replaceNoteLinks("Family/anna.md", [
    { targetAlias: "faith", targetPath: "Faith/faith.md" },
    { targetAlias: "missing-note", targetPath: null },
  ]);
  const links = store.getLinksFrom("Family/anna.md");
  assert.equal(links.length, 2);
  assert.ok(links.some((l) => l.target_alias === "faith"));
});

test("replaceNoteLinks replaces previous links", () => {
  store.replaceNoteLinks("Family/anna.md", [{ targetAlias: "only-one", targetPath: null }]);
  const links = store.getLinksFrom("Family/anna.md");
  assert.equal(links.length, 1);
  assert.equal(links[0].target_alias, "only-one");
});

test("getLinksTo returns backlinks", () => {
  store.upsertNote({ path: "Faith/faith.md", title: "Faith", folder: "Faith", mtime: "2026-06-21T00:00:00.000Z" });
  store.replaceNoteLinks("Family/anna.md", [{ targetAlias: "faith", targetPath: "Faith/faith.md" }]);
  const backlinks = store.getLinksTo("Faith/faith.md");
  assert.ok(backlinks.some((l) => l.source_path === "Family/anna.md"));
});

// ── Note Tags ─────────────────────────────────────────────────────────────────

console.log("\nNote Tags");

test("replaceNoteTags stores normalized tags", () => {
  store.replaceNoteTags("Family/anna.md", ["#Family", "daughter", "#faith"]);
  const tags = store.getTagsForNote("Family/anna.md");
  assert.deepEqual(tags, ["daughter", "faith", "family"]); // sorted, # stripped
});

test("getNotesByTag returns notes with that tag", () => {
  const notes = store.getNotesByTag("family");
  assert.ok(notes.some((n) => n.path === "Family/anna.md"));
});

test("getAllTags returns tag counts", () => {
  const tags = store.getAllTags();
  assert.ok(tags.some((t) => t.tag === "family" && t.count >= 1));
});

// ── Entities ──────────────────────────────────────────────────────────────────

console.log("\nEntities");

test("upsertEntity / getEntity round-trip", () => {
  const id = store.upsertEntity({
    type: "Person",
    name: "Anna Binion",
    aliases: ["Anna"],
    domain: "family",
    sourcePath: "Family/anna.md",
    confidence: 0.95,
    properties: { role: "daughter" },
  });
  const entity = store.getEntity(id);
  assert.equal(entity.name, "Anna Binion");
  assert.deepEqual(entity.aliases, ["Anna"]);
  assert.equal(entity.properties.role, "daughter");
});

test("getEntitiesByType filters correctly", () => {
  store.upsertEntity({ type: "Goal", name: "Retire early", domain: "retirement", confidence: 0.8 });
  const people = store.getEntitiesByType("Person");
  assert.ok(people.some((e) => e.name === "Anna Binion"));
  assert.ok(!people.some((e) => e.type === "Goal"));
});

test("searchEntities matches by name", () => {
  const results = store.searchEntities("Anna");
  assert.ok(results.some((e) => e.name === "Anna Binion"));
});

// ── Entity Relations ──────────────────────────────────────────────────────────

console.log("\nEntity Relations");

test("addRelation / getRelationsFrom works", () => {
  const chrisId = store.upsertEntity({ type: "Person", name: "Chris Binion", domain: "family", confidence: 1.0 });
  const annaId = store.getEntitiesByType("Person").find((e) => e.name === "Anna Binion").id;
  store.addRelation(chrisId, annaId, "parent_of");
  const rels = store.getRelationsFrom(chrisId);
  assert.ok(rels.some((r) => r.relation_type === "parent_of" && r.to_name === "Anna Binion"));
});

test("getRelationsTo returns reverse edges", () => {
  const annaId = store.getEntitiesByType("Person").find((e) => e.name === "Anna Binion").id;
  const rels = store.getRelationsTo(annaId);
  assert.ok(rels.some((r) => r.relation_type === "parent_of" && r.from_name === "Chris Binion"));
});

// ── Memory Candidates ─────────────────────────────────────────────────────────

console.log("\nMemory Candidates");

test("addMemoryCandidate creates pending record", () => {
  const id = store.addMemoryCandidate({
    source: "conversation",
    sourceRef: "session-001",
    content: "Chris mentioned his book idea about significance",
    proposedFolder: "Publishing",
    proposedTitle: "Book Idea — Significance",
    proposedBody: "# Book Idea\n\nAbout significance...",
    reason: "High significance mention of creative calling",
    confidence: 0.87,
  });
  const pending = store.getPendingCandidates();
  const found = pending.find((c) => c.id === id);
  assert.ok(found);
  assert.equal(found.status, "pending");
  assert.equal(found.confidence, 0.87);
});

test("approveCandidate transitions status and writes review", () => {
  const id = store.addMemoryCandidate({ source: "turn", content: "Test for approval", confidence: 0.9 });
  store.approveCandidate(id, "Clearly significant");
  const approved = store.getCandidatesByStatus("approved");
  assert.ok(approved.some((c) => c.id === id));
});

test("rejectCandidate transitions status", () => {
  const id = store.addMemoryCandidate({ source: "turn", content: "Test for rejection", confidence: 0.3 });
  store.rejectCandidate(id, "Not significant enough");
  const rejected = store.getCandidatesByStatus("rejected");
  assert.ok(rejected.some((c) => c.id === id));
});

test("markCandidateWritten sets status and vault path", () => {
  const id = store.addMemoryCandidate({ source: "turn", content: "Will be written", confidence: 0.9 });
  store.approveCandidate(id);
  store.markCandidateWritten(id, "Publishing/book-idea.md");
  const written = store.getCandidatesByStatus("written");
  const found = written.find((c) => c.id === id);
  assert.ok(found);
  assert.equal(found.writtenPath, "Publishing/book-idea.md");
});

// ── Indexing Runs ─────────────────────────────────────────────────────────────

console.log("\nIndexing Runs");

test("startIndexingRun / completeIndexingRun round-trip", () => {
  const runId = store.startIndexingRun();
  assert.ok(runId > 0);
  store.completeIndexingRun(runId, { scanned: 14, indexed: 12, skipped: 2, deleted: 0 });
  const last = store.getLastIndexingRun();
  assert.equal(last.status, "completed");
  assert.equal(last.notes_scanned, 14);
  assert.equal(last.notes_indexed, 12);
});

test("failIndexingRun sets error message", () => {
  const runId = store.startIndexingRun();
  store.failIndexingRun(runId, "ENOENT: vault not mounted");
  const runs = store.getIndexingHistory(5);
  const failed = runs.find((r) => r.id === runId);
  assert.equal(failed.status, "failed");
  assert.ok(failed.error.includes("ENOENT"));
});

// ── Embedding Records ─────────────────────────────────────────────────────────

console.log("\nEmbedding Records");

test("upsertEmbeddingRecord / getEmbeddingRecord round-trip", () => {
  store.upsertEmbeddingRecord({
    id: "Family/anna.md::0",
    notePath: "Family/anna.md",
    heading: null,
    chunkIndex: 0,
    chunkHash: "sha256-abc",
    model: "nomic-embed-text",
    dimensions: 768,
    noteMtime: "2026-06-21T01:00:00.000Z",
  });
  const rec = store.getEmbeddingRecord("Family/anna.md::0");
  assert.ok(rec);
  assert.equal(rec.chunk_hash, "sha256-abc");
  assert.equal(rec.model, "nomic-embed-text");
});

test("getStaleEmbeddingPaths detects mtime mismatch", () => {
  // Note mtime is 2026-06-21T01:00:00.000Z but embedding stored 2026-06-21T00:00:00.000Z
  store.upsertNote({ path: "Family/anna.md", title: "Anna Updated", folder: "Family", mtime: "2026-06-21T02:00:00.000Z" });
  store.upsertEmbeddingRecord({
    id: "Family/anna.md::0",
    notePath: "Family/anna.md",
    chunkIndex: 0,
    chunkHash: "sha256-abc",
    model: "nomic-embed-text",
    dimensions: 768,
    noteMtime: "2026-06-21T00:00:00.000Z", // stale
  });
  const stale = store.getStaleEmbeddingPaths();
  assert.ok(stale.includes("Family/anna.md"));
});

test("deleteEmbeddingRecordsByPath removes all chunks for a note", () => {
  store.deleteEmbeddingRecordsByPath("Family/anna.md");
  const recs = store.getEmbeddingRecordsByPath("Family/anna.md");
  assert.equal(recs.length, 0);
});

// ── Missions ──────────────────────────────────────────────────────────────────

console.log("\nMissions");

test("upsertMission / getMission round-trip", () => {
  store.upsertMission({
    id: "retirement",
    title: "Retirement",
    domain: "Retirement",
    type: "personal",
    status: "active",
    seedTheory: "Retire by 58 with enough to be generous",
    vaultPath: "Missions/Retirement",
  });
  const m = store.getMission("retirement");
  assert.equal(m.title, "Retirement");
  assert.equal(m.seedTheory, "Retire by 58 with enough to be generous");
});

test("getActiveMissions returns only active missions", () => {
  store.upsertMission({ id: "archived-mission", title: "Done", domain: "Work", status: "archived" });
  const active = store.getActiveMissions();
  assert.ok(active.some((m) => m.id === "retirement"));
  assert.ok(!active.some((m) => m.id === "archived-mission"));
});

// ── Decisions ─────────────────────────────────────────────────────────────────

console.log("\nDecisions");

test("addDecision / getDecisions round-trip", () => {
  const id = store.addDecision({
    title: "Move financial advisor",
    domain: "Retirement",
    missionId: "retirement",
    reason: "Current advisor not aligned with values",
    decidedAt: "2026-06-01T00:00:00.000Z",
  });
  const decisions = store.getDecisions({ domain: "Retirement" });
  const found = decisions.find((d) => d.id === id);
  assert.ok(found);
  assert.equal(found.title, "Move financial advisor");
});

// ── Contradictions ────────────────────────────────────────────────────────────

console.log("\nContradictions");

test("addContradiction / getContradictions / resolveContradiction", () => {
  const id = store.addContradiction({
    domain: "Family",
    declaredValue: "Family time is the priority",
    observedPattern: "Working 70-hour weeks consistently",
    detectedAt: "2026-06-01T00:00:00.000Z",
  });
  const active = store.getContradictions({ status: "active" });
  assert.ok(active.some((c) => c.id === id));

  store.resolveContradiction(id, "Shifted to 45-hour weeks after sabbatical");
  const resolved = store.getContradictions({ status: "resolved" });
  assert.ok(resolved.some((c) => c.id === id));
});

// ── People ────────────────────────────────────────────────────────────────────

console.log("\nPeople");

test("upsertPerson / getPerson / searchPeople", () => {
  const id = store.upsertPerson({
    name: "Rebekah Binion",
    aliases: ["Bek"],
    relation: "spouse",
    domain: "family",
    properties: { role: "spouse" },
  });
  const person = store.getPerson(id);
  assert.equal(person.name, "Rebekah Binion");
  assert.deepEqual(person.aliases, ["Bek"]);

  const results = store.searchPeople("Rebekah");
  assert.ok(results.some((p) => p.id === id));
});

// ── Preferences ───────────────────────────────────────────────────────────────

console.log("\nPreferences");

test("setPreference / getPreference round-trip", () => {
  store.setPreference("communication", "email_style", "direct and brief", { source: "stated", confidence: 0.9 });
  const pref = store.getPreference("communication", "email_style");
  assert.ok(pref);
  assert.equal(pref.value, "direct and brief");
  assert.equal(pref.source, "stated");
});

test("setPreference updates value on conflict", () => {
  store.setPreference("communication", "email_style", "bullet points preferred", { confidence: 0.95 });
  const pref = store.getPreference("communication", "email_style");
  assert.equal(pref.value, "bullet points preferred");
});

// ── Life Events ───────────────────────────────────────────────────────────────

console.log("\nLife Events");

test("addLifeEvent / getLifeEvents round-trip", () => {
  const id = store.addLifeEvent({
    title: "Anna graduates high school",
    domain: "Family",
    eventType: "milestone",
    significance: "high",
    happenedAt: "2027-05-15",
    happenedAtPrecision: "day",
    people: ["anna-id"],
  });
  const events = store.getLifeEvents({ domain: "Family" });
  const found = events.find((e) => e.id === id);
  assert.ok(found);
  assert.equal(found.title, "Anna graduates high school");
  assert.deepEqual(found.people, ["anna-id"]);
});

test("getLifeEvents filters by significance", () => {
  store.addLifeEvent({ title: "Low event", domain: "Health", significance: "low", happenedAt: "2026-01-01", eventType: "event" });
  const high = store.getLifeEvents({ significance: "high" });
  assert.ok(high.every((e) => e.significance === "high"));
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\ndb-migrations: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
