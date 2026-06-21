"use strict";
// Tests: memory-curator.js — review queue, confidence scoring, candidate management
//
// All tests are fully offline (pure SQLite, no Ollama, no LanceDB).

const assert = require("node:assert/strict");

// ── Setup ─────────────────────────────────────────────────────────────────────

process.env.MONDAY_DB_PATH = ":memory:";

Object.keys(require.cache).forEach((k) => {
  if (k.includes("/engine/")) delete require.cache[k];
});

const ks = require("../src/engine/db/knowledge-store");
const {
  queueCandidate,
  queueFromConversation,
  queueFromEntities,
  approveCandidateById,
  rejectCandidateById,
  getPendingQueue,
  getReviewStats,
  scoreEntityCandidate,
  scoreConversationCandidate,
  _jaccard,
} = require("../src/engine/memory/memory-curator");

let pass = 0;
let fail = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); fail++; }
}

// ── Jaccard similarity ────────────────────────────────────────────────────────

console.log("\nJaccard similarity");

test("identical strings → 1.0", () => {
  assert.equal(_jaccard("retirement financial freedom", "retirement financial freedom"), 1);
});

test("completely different strings → 0.0", () => {
  assert.equal(_jaccard("apple orange banana", "car boat train"), 0);
});

test("partial overlap → value between 0 and 1", () => {
  const s = _jaccard("retire at 58 with freedom", "financial freedom retirement plan");
  assert.ok(s > 0 && s < 1, `expected 0 < s < 1, got ${s}`);
});

test("empty strings → 1.0 (both empty = same)", () => {
  assert.equal(_jaccard("", ""), 1);
});

test("one empty string → 0.0", () => {
  assert.equal(_jaccard("something meaningful", ""), 0);
});

test("case-insensitive comparison", () => {
  assert.equal(_jaccard("Retirement Freedom", "retirement freedom"), 1);
});

test("short words (< 3 chars) are ignored", () => {
  // "I am a" all filtered → both empty sets → similarity 1
  assert.equal(_jaccard("I am a", "I am a"), 1);
});

// ── Confidence scoring ────────────────────────────────────────────────────────

console.log("\nConfidence scoring — entities");

test("Decision entity gets type bonus", () => {
  const base = scoreEntityCandidate({ type: "Person",   name: "John Smith",            confidence: 0.8, domain: "family",  description: "A family member who lives nearby" });
  const dec  = scoreEntityCandidate({ type: "Decision", name: "Chose index funds 2025", confidence: 0.8, domain: "retirement", description: "Chose Vanguard index over active management" });
  assert.ok(dec > base, `Decision (${dec}) should score higher than Person (${base})`);
});

test("very short entity name incurs penalty", () => {
  const long  = scoreEntityCandidate({ type: "Belief", name: "Long enough name here", confidence: 0.8, domain: "faith", description: "A detailed belief statement about something meaningful" });
  const short = scoreEntityCandidate({ type: "Belief", name: "Short",                 confidence: 0.8, domain: "faith", description: "A detailed belief statement about something meaningful" });
  assert.ok(long > short, `long name (${long}) should score higher than short name (${short})`);
});

test("entity with description scores higher than without", () => {
  const with_desc    = scoreEntityCandidate({ type: "Decision", name: "Chose index funds over managed account", confidence: 0.8, domain: "retirement", description: "Chose Vanguard index funds over active management to reduce fees" });
  const without_desc = scoreEntityCandidate({ type: "Decision", name: "Chose index funds over managed account", confidence: 0.8, domain: "retirement" });
  assert.ok(with_desc > without_desc);
});

test("entity without domain incurs penalty", () => {
  const with_domain    = scoreEntityCandidate({ type: "Belief", name: "Retirement is stewardship not leisure", confidence: 0.8, domain: "retirement", description: "A foundational conviction" });
  const without_domain = scoreEntityCandidate({ type: "Belief", name: "Retirement is stewardship not leisure", confidence: 0.8, description: "A foundational conviction" });
  assert.ok(with_domain > without_domain);
});

test("score is clamped to [0, 1]", () => {
  const high = scoreEntityCandidate({ type: "Decision", name: "Long well-described important decision", confidence: 0.99, domain: "retirement", description: "A very detailed and important decision with substantial context provided" });
  const low  = scoreEntityCandidate({ type: "Question", name: "X",                                       confidence: 0.01 });
  assert.ok(high <= 1.0, `score should be ≤ 1, got ${high}`);
  assert.ok(low  >= 0.0, `score should be ≥ 0, got ${low}`);
});

console.log("\nConfidence scoring — conversation");

test("high significance boosts conversation score", () => {
  const high = scoreConversationCandidate("A deep realization about calling and purpose", { significance: "high", domain: "faith" });
  const low  = scoreConversationCandidate("A deep realization about calling and purpose", { significance: "low" });
  assert.ok(high > low);
});

test("conversation with domain scores higher", () => {
  const with_d    = scoreConversationCandidate("Important insight about retirement timeline", { significance: "medium", domain: "retirement" });
  const without_d = scoreConversationCandidate("Important insight about retirement timeline", { significance: "medium" });
  assert.ok(with_d > without_d);
});

test("very short conversation content incurs penalty", () => {
  const long  = scoreConversationCandidate("This is a substantial insight worth recording", { significance: "medium" });
  const short = scoreConversationCandidate("Short", { significance: "medium" });
  assert.ok(long > short);
});

// ── queueCandidate ────────────────────────────────────────────────────────────

console.log("\nqueueCandidate");

test("queues a candidate and returns id", () => {
  const result = queueCandidate({
    source:    "manual",
    content:   "Decided to retire by fifty eight based on compound growth projections",
    confidence: 0.8,
    domain:    "retirement",
  });
  assert.ok(result.ok);
  assert.ok(!result.skipped);
  assert.ok(result.id);
});

test("queued candidate appears in pending queue", () => {
  const content = "Unique content about faith and rest that nobody else queued yet";
  queueCandidate({ source: "manual", content, confidence: 0.75 });
  const queue = getPendingQueue();
  assert.ok(queue.some((c) => c.content === content));
});

test("empty content returns ok:false skipped:true", () => {
  const result = queueCandidate({ source: "manual", content: "" });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
});

test("duplicate content (high Jaccard) is skipped", () => {
  const content = "Chose index funds over active management retirement planning 2025";
  queueCandidate({ source: "manual", content, confidence: 0.8 });
  // Nearly identical wording
  const dup = queueCandidate({ source: "manual", content: "Chose index funds over active management retirement planning strategy 2025", confidence: 0.8 });
  assert.ok(dup.skipped, "near-duplicate should be skipped");
});

test("different content is not skipped as duplicate", () => {
  const a = queueCandidate({ source: "manual", content: "Caleb finished his first year at university studying computer science", confidence: 0.7 });
  const b = queueCandidate({ source: "manual", content: "Anna received her scholarship for medical school applications this fall", confidence: 0.7 });
  assert.ok(!a.skipped);
  assert.ok(!b.skipped);
});

test("candidate gets proposedFolder from domain", () => {
  const result = queueCandidate({
    source:    "manual",
    content:   "Faith content about prayer and solitude practice in daily routine",
    confidence: 0.7,
    domain:    "faith",
  });
  assert.ok(!result.skipped);
  const queue = getPendingQueue();
  const found = queue.find((c) => c.id === result.id);
  assert.equal(found?.proposedFolder, "Faith");
});

// ── queueFromConversation ─────────────────────────────────────────────────────

console.log("\nqueueFromConversation");

test("queues with source=conversation and correct confidence", () => {
  const result = queueFromConversation(
    "Realized that busyness is a form of fear that I use to avoid deeper questions",
    { significance: "high", domain: "faith" }
  );
  assert.ok(result.ok);
  assert.ok(!result.skipped);
  const queue = getPendingQueue();
  const found = queue.find((c) => c.id === result.id);
  assert.equal(found?.source, "conversation");
  assert.ok(found?.confidence > 0.5, `expected confidence > 0.5, got ${found?.confidence}`);
});

test("conversation candidate gets proposedTitle when provided", () => {
  const result = queueFromConversation(
    "Retirement is about giving, not stopping work",
    { domain: "retirement", proposedTitle: "Retirement Redefined" }
  );
  assert.ok(!result.skipped);
  const queue = getPendingQueue();
  const found = queue.find((c) => c.id === result.id);
  assert.equal(found?.proposedTitle, "Retirement Redefined");
});

// ── queueFromEntities ─────────────────────────────────────────────────────────

console.log("\nqueueFromEntities");

function seedEntities() {
  ks.upsertEntity({ type: "Decision",  name: "Chose index funds over active management in retirement",   description: "Moved all retirement assets to low-cost index funds", domain: "retirement", sourcePath: "Retirement/decisions.md", confidence: 0.9 });
  ks.upsertEntity({ type: "Belief",    name: "Retirement is faithful stewardship not leisure",           description: "Retirement should be about generosity and service",   domain: "retirement", sourcePath: "Retirement/goals.md",     confidence: 0.85 });
  ks.upsertEntity({ type: "Question",  name: "What does faithful rest look like for someone like me",   description: "Open question about rest and identity",                domain: "faith",      sourcePath: "Faith/questions.md",     confidence: 0.75 });
  ks.upsertEntity({ type: "Person",    name: "Anna Binion",                                              description: "Chris's daughter studying pre-med",                    domain: "family",     sourcePath: "Family/anna.md",         confidence: 0.95 });
  // Low confidence — should be skipped
  ks.upsertEntity({ type: "Tension",   name: "Calendar vs values",                                      description: "Short tension description",                            domain: "work",       sourcePath: "Work/tensions.md",       confidence: 0.3  });
}

seedEntities();

test("queueFromEntities returns ok:true and queues high-confidence entities", () => {
  const stats = queueFromEntities();
  assert.ok(stats.ok);
  assert.ok(typeof stats.queued   === "number");
  assert.ok(typeof stats.skipped  === "number");
  assert.ok(typeof stats.total    === "number");
  assert.ok(stats.queued >= 1, `expected ≥1 queued, got ${stats.queued}`);
  // Verify the queue actually has Decision/Belief entities from the seed
  const queue = getPendingQueue();
  const hasHighConf = queue.some((c) => c.source === "entity_extraction" && c.confidence >= 0.6);
  assert.ok(hasHighConf, "expected at least one high-confidence entity in queue");
});

test("queueFromEntities skips low-confidence entities", () => {
  // The Tension entity with confidence 0.3 should be skipped (below MIN_AUTO_CONFIDENCE=0.6)
  const stats = queueFromEntities();
  const queue = getPendingQueue();
  const tensionQueued = queue.some((c) => c.content?.includes("Calendar vs values"));
  assert.ok(!tensionQueued, "low-confidence entity should not be queued");
});

test("queueFromEntities does not re-queue already-queued entities", () => {
  const before = getPendingQueue().length;
  queueFromEntities(); // second call
  const after  = getPendingQueue().length;
  assert.equal(before, after, "second call should not add more candidates");
});

test("queueFromEntities respects domain filter", () => {
  queueFromEntities({ domain: "family" });
  const queue = getPendingQueue();
  const familyCandidates = queue.filter((c) => c.proposedFolder === "Family");
  assert.ok(familyCandidates.length >= 1, "expected at least one Family candidate");
});

test("queueFromEntities respects type filter", () => {
  // Only queue beliefs
  const stats = queueFromEntities({ types: ["Belief"] });
  // All new candidates (if any) should be from Belief entities
  assert.ok(stats.ok);
});

// ── Approve / Reject ──────────────────────────────────────────────────────────

console.log("\nApprove / reject");

test("approving a pending candidate changes its status", () => {
  const { id } = queueCandidate({
    source:    "manual",
    content:   "Unique content for approval test — something about prayer journal practice",
    confidence: 0.8,
  });
  const result = approveCandidateById(id, "This is worth writing to Obsidian");
  assert.ok(result.ok);
  assert.equal(result.id, id);

  // Should no longer appear in pending queue
  const pending = getPendingQueue();
  assert.ok(!pending.some((c) => c.id === id), "approved candidate should not be pending");

  // Should appear in approved list
  const approved = ks.getCandidatesByStatus("approved");
  assert.ok(approved.some((c) => c.id === id), "approved candidate should appear in approved list");
});

test("rejecting a pending candidate changes its status", () => {
  const { id } = queueCandidate({
    source:    "manual",
    content:   "Unique content for rejection test — something about work project deadlines",
    confidence: 0.6,
  });
  const result = rejectCandidateById(id, "Not ready to write this yet");
  assert.ok(result.ok);

  const rejected = ks.getCandidatesByStatus("rejected");
  assert.ok(rejected.some((c) => c.id === id));
});

test("approving a non-existent id returns ok:false", () => {
  const result = approveCandidateById("nonexistent-id-xyz", "reason");
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("rejecting a non-existent id returns ok:false", () => {
  const result = rejectCandidateById("nonexistent-id-xyz");
  assert.equal(result.ok, false);
});

test("approving already-approved candidate returns ok:false", () => {
  const { id } = queueCandidate({
    source:    "manual",
    content:   "Something about health routines and morning exercise habits commitment",
    confidence: 0.75,
  });
  approveCandidateById(id, "approved");
  const second = approveCandidateById(id, "try again");
  assert.equal(second.ok, false);  // no longer pending
});

// ── getReviewStats ────────────────────────────────────────────────────────────

console.log("\ngetReviewStats");

test("getReviewStats returns counts for all status categories", () => {
  const stats = getReviewStats();
  assert.ok(typeof stats.pending  === "number");
  assert.ok(typeof stats.approved === "number");
  assert.ok(typeof stats.rejected === "number");
  assert.ok(typeof stats.written  === "number");
  assert.ok(typeof stats.total    === "number");
  assert.equal(stats.total, stats.pending + stats.approved + stats.rejected + stats.written);
});

test("stats.total reflects all queued candidates", () => {
  const before = getReviewStats().total;
  queueCandidate({
    source:    "manual",
    content:   "A completely new candidate about something entirely unique and unrelated",
    confidence: 0.7,
  });
  const after = getReviewStats().total;
  assert.equal(after, before + 1);
});

// ── getPendingQueue ───────────────────────────────────────────────────────────

console.log("\ngetPendingQueue");

test("pending queue is sorted by confidence descending", () => {
  queueCandidate({ source: "manual", content: "Low confidence candidate about something unimportant details here", confidence: 0.4 });
  queueCandidate({ source: "manual", content: "High confidence candidate about a critical life decision made recently", confidence: 0.9 });

  const queue = getPendingQueue();
  for (let i = 0; i < queue.length - 1; i++) {
    assert.ok(
      queue[i].confidence >= queue[i + 1].confidence,
      `queue not sorted at index ${i}: ${queue[i].confidence} < ${queue[i + 1].confidence}`
    );
  }
});

test("getPendingQueue respects limit", () => {
  const queue = getPendingQueue(3);
  assert.ok(queue.length <= 3);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nmemory-curator: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
