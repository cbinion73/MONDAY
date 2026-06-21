"use strict";
// Tests: personal-context.js — vault enrichment for intelligence turns.
//
// All tests mock retrieval.retrievePersonalContext so no vault, Ollama, or
// LanceDB is required. DB is in-memory (retrieval may open it incidentally).

const assert = require("node:assert/strict");

process.env.MONDAY_DB_PATH    = ":memory:";
process.env.MONDAY_VAULT_ROOT = "/tmp/monday-pc-test-vault";

Object.keys(require.cache).forEach((k) => {
  if (k.includes("/engine/")) delete require.cache[k];
});

// ── Mock retrieval ────────────────────────────────────────────────────────────

const retrievalMod = require("../src/engine/memory/retrieval");

const SAMPLE_RESULTS = [
  {
    source:   "semantic",
    notePath: "Retirement/2025-01-15-retirement-thoughts.md",
    heading:  "Financial Independence",
    domain:   "retirement",
    snippet:  "Index funds chosen as primary retirement vehicle.",
    citation: "Retirement/2025-01-15-retirement-thoughts.md",
    score:    0.87,
    metadata: {},
  },
  {
    source:   "keyword",
    notePath: "Work/work-identity.md",
    heading:  null,
    domain:   "work",
    snippet:  "Work provides identity, structure, and purpose beyond income.",
    citation: "Work/work-identity.md",
    score:    null,
    metadata: {},
  },
  {
    source:   "graph",
    notePath: "Faith/prayer-journal.md",
    heading:  null,
    domain:   "faith",
    snippet:  "[Decision] Return to morning prayer",
    citation: "Faith/prayer-journal.md",
    score:    null,
    metadata: { entityType: "Decision", entityName: "Return to morning prayer" },
  },
];

function mockRetrieval(results = SAMPLE_RESULTS, ok = true) {
  retrievalMod.retrievePersonalContext = async () => ({ ok, results, query: "test", deduped: true, channels: {} });
}

function mockRetrievalError() {
  retrievalMod.retrievePersonalContext = async () => { throw new Error("DB unavailable"); };
}

function mockRetrievalTimeout(delayMs = 5000) {
  retrievalMod.retrievePersonalContext = () => new Promise((resolve) =>
    setTimeout(() => resolve({ ok: true, results: SAMPLE_RESULTS, query: "test", deduped: true, channels: {} }), delayMs)
  );
}

// Reload personal-context after mocking retrieval
function loadSubject() {
  Object.keys(require.cache).forEach((k) => {
    if (k.includes("/engine/memory/personal-context")) delete require.cache[k];
  });
  return require("../src/engine/memory/personal-context");
}

let pass = 0;
let fail = 0;

function test(name, fn) {
  try   { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); fail++; }
}

async function testAsync(name, fn) {
  try   { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); fail++; }
}

async function main() {

// ── enrichPersonalContext — skip conditions ───────────────────────────────────

console.log("\nenrichPersonalContext — skip conditions");

await testAsync("returns unchanged personalContext when query is empty string", async () => {
  mockRetrieval();
  const { enrichPersonalContext } = loadSubject();
  const pc = { captureIntent: false };
  const result = await enrichPersonalContext("", pc);
  assert.equal(result, pc, "should return same reference");
  assert.equal(result.memoryRecall, undefined);
});

await testAsync("returns unchanged personalContext when query is whitespace only", async () => {
  mockRetrieval();
  const { enrichPersonalContext } = loadSubject();
  const pc = {};
  const result = await enrichPersonalContext("   ", pc);
  assert.equal(result, pc);
});

await testAsync("skips enrichment when captureIntent is true", async () => {
  mockRetrieval();
  const { enrichPersonalContext } = loadSubject();
  const pc = { captureIntent: true };
  const result = await enrichPersonalContext("I want to retire", pc);
  assert.equal(result, pc, "should return same reference");
  assert.equal(result.memoryRecall, undefined);
});

await testAsync("skips enrichment when memoryRecall is already populated", async () => {
  mockRetrieval();
  const { enrichPersonalContext } = loadSubject();
  const existingRecall = [{ table: "vault", title: "Prior note", excerpt: "Already here" }];
  const pc = { memoryRecall: existingRecall };
  const result = await enrichPersonalContext("retirement", pc);
  assert.equal(result, pc);
  assert.strictEqual(result.memoryRecall, existingRecall);
});

// ── enrichPersonalContext — success path ──────────────────────────────────────

console.log("\nenrichPersonalContext — success path");

await testAsync("returns new personalContext with memoryRecall populated", async () => {
  mockRetrieval();
  const { enrichPersonalContext } = loadSubject();
  const pc = { priorWorkingTheory: { statement: "theory" } };
  const result = await enrichPersonalContext("I want to retire", pc);
  assert.notEqual(result, pc, "should be a new object");
  assert.ok(Array.isArray(result.memoryRecall), "memoryRecall should be array");
  assert.ok(result.memoryRecall.length > 0, "should have results");
});

await testAsync("preserves all existing personalContext fields", async () => {
  mockRetrieval();
  const { enrichPersonalContext } = loadSubject();
  const pc = {
    priorWorkingTheory: { statement: "test theory" },
    relevantThread:     { missionId: "work" },
    missionThreads:     [{ id: "work", name: "Work", significanceThreads: [] }],
    recentCaptures:     [{ content: "captured thing" }],
  };
  const result = await enrichPersonalContext("I want to retire", pc);
  assert.deepEqual(result.priorWorkingTheory,  pc.priorWorkingTheory);
  assert.deepEqual(result.relevantThread,       pc.relevantThread);
  assert.deepEqual(result.missionThreads,       pc.missionThreads);
  assert.deepEqual(result.recentCaptures,       pc.recentCaptures);
});

await testAsync("each memoryRecall entry has table, title, and excerpt fields", async () => {
  mockRetrieval();
  const { enrichPersonalContext } = loadSubject();
  const result = await enrichPersonalContext("retirement", {});
  for (const entry of result.memoryRecall) {
    assert.ok(typeof entry.table   === "string" && entry.table,   "table must be non-empty string");
    assert.ok(typeof entry.title   === "string" && entry.title,   "title must be non-empty string");
    assert.ok(typeof entry.excerpt === "string",                   "excerpt must be string");
  }
});

await testAsync("uses result domain as table when available", async () => {
  mockRetrieval([SAMPLE_RESULTS[0]]); // has domain: "retirement"
  const { enrichPersonalContext } = loadSubject();
  const result = await enrichPersonalContext("retirement", {});
  assert.equal(result.memoryRecall[0].table, "retirement");
});

await testAsync("falls back to 'vault' as table when domain is null", async () => {
  const nodomainResult = { ...SAMPLE_RESULTS[1], domain: null };
  mockRetrieval([nodomainResult]);
  const { enrichPersonalContext } = loadSubject();
  const result = await enrichPersonalContext("work identity", {});
  assert.equal(result.memoryRecall[0].table, "vault");
});

await testAsync("uses heading as title when heading is present", async () => {
  mockRetrieval([SAMPLE_RESULTS[0]]); // heading: "Financial Independence"
  const { enrichPersonalContext } = loadSubject();
  const result = await enrichPersonalContext("retirement", {});
  assert.equal(result.memoryRecall[0].title, "Financial Independence");
});

await testAsync("uses note filename (without date prefix) as title when heading is null", async () => {
  mockRetrieval([SAMPLE_RESULTS[1]]); // heading: null, notePath: "Work/work-identity.md"
  const { enrichPersonalContext } = loadSubject();
  const result = await enrichPersonalContext("work identity", {});
  assert.equal(result.memoryRecall[0].title, "work-identity");
});

await testAsync("strips YYYY-MM-DD- prefix from note filename in title", async () => {
  const datedResult = {
    ...SAMPLE_RESULTS[0],
    heading: null,
    notePath: "Retirement/2025-01-15-retirement-thoughts.md",
  };
  mockRetrieval([datedResult]);
  const { enrichPersonalContext } = loadSubject();
  const result = await enrichPersonalContext("retirement", {});
  assert.equal(result.memoryRecall[0].title, "retirement-thoughts");
});

await testAsync("excerpt is truncated at 200 characters", async () => {
  const longSnippet = "A".repeat(300);
  const longResult  = { ...SAMPLE_RESULTS[0], snippet: longSnippet };
  mockRetrieval([longResult]);
  const { enrichPersonalContext } = loadSubject();
  const result = await enrichPersonalContext("retirement", {});
  assert.ok(result.memoryRecall[0].excerpt.length <= 200);
});

await testAsync("respects limit option — returns at most limit entries", async () => {
  const manyResults = Array.from({ length: 10 }, (_, i) => ({
    ...SAMPLE_RESULTS[0],
    notePath: `Retirement/note-${i}.md`,
    heading:  `Section ${i}`,
    domain:   "retirement",
    snippet:  `Content ${i}`,
  }));
  mockRetrieval(manyResults);
  const { enrichPersonalContext } = loadSubject();
  const result = await enrichPersonalContext("retirement", {}, { limit: 3 });
  assert.ok(result.memoryRecall.length <= 3, `got ${result.memoryRecall.length}`);
});

// ── enrichPersonalContext — domain inference ──────────────────────────────────

console.log("\nenrichPersonalContext — domain inference");

await testAsync("infers domain from relevantThread.missionId", async () => {
  let capturedDomain = "NOT_SET";
  retrievalMod.retrievePersonalContext = async (q, opts) => {
    capturedDomain = opts.domain;
    return { ok: true, results: SAMPLE_RESULTS, query: q, deduped: true, channels: {} };
  };
  const { enrichPersonalContext } = loadSubject();
  await enrichPersonalContext("retirement", {
    relevantThread: { missionId: "retirement" },
  });
  assert.equal(capturedDomain, "retirement");
});

await testAsync("infers domain from live missionThread", async () => {
  let capturedDomain = "NOT_SET";
  retrievalMod.retrievePersonalContext = async (q, opts) => {
    capturedDomain = opts.domain;
    return { ok: true, results: SAMPLE_RESULTS, query: q, deduped: true, channels: {} };
  };
  const { enrichPersonalContext } = loadSubject();
  await enrichPersonalContext("faith", {
    missionThreads: [
      { id: "work",  name: "Work",  significanceThreads: [] },
      { id: "faith", name: "Faith", significanceThreads: ["prayer_concern"] },
    ],
  });
  assert.equal(capturedDomain, "faith");
});

await testAsync("uses explicit domain opt over inferred", async () => {
  let capturedDomain = "NOT_SET";
  retrievalMod.retrievePersonalContext = async (q, opts) => {
    capturedDomain = opts.domain;
    return { ok: true, results: SAMPLE_RESULTS, query: q, deduped: true, channels: {} };
  };
  const { enrichPersonalContext } = loadSubject();
  await enrichPersonalContext("retirement", {
    relevantThread: { missionId: "work" },
  }, { domain: "retirement" });
  assert.equal(capturedDomain, "retirement");
});

// ── enrichPersonalContext — graceful failure ──────────────────────────────────

console.log("\nenrichPersonalContext — graceful failure");

await testAsync("returns unchanged personalContext when retrieval throws", async () => {
  mockRetrievalError();
  const { enrichPersonalContext } = loadSubject();
  const pc = { priorWorkingTheory: { statement: "test" } };
  const result = await enrichPersonalContext("retirement", pc);
  assert.equal(result, pc, "should return original reference on error");
  assert.equal(result.memoryRecall, undefined);
});

await testAsync("returns unchanged personalContext when retrieval returns ok:false", async () => {
  mockRetrieval([], false); // ok: false
  const { enrichPersonalContext } = loadSubject();
  const pc = {};
  const result = await enrichPersonalContext("retirement", pc);
  assert.equal(result, pc);
});

await testAsync("returns unchanged personalContext when retrieval returns empty results", async () => {
  mockRetrieval([], true); // ok: true, results: []
  const { enrichPersonalContext } = loadSubject();
  const pc = { someField: 42 };
  const result = await enrichPersonalContext("retirement", pc);
  assert.equal(result, pc);
});

await testAsync("returns unchanged personalContext on timeout", async () => {
  mockRetrievalTimeout(5000); // much longer than 3s timeout
  const { enrichPersonalContext } = loadSubject();
  const pc = { priorWorkingTheory: null };
  const result = await enrichPersonalContext("retirement", pc);
  assert.equal(result, pc, "should return original reference on timeout");
  assert.equal(result.memoryRecall, undefined);
});

} // end main

main().then(() => {
  console.log(`\npersonal-context: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
