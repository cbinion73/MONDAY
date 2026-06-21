"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Monday Full Battery Test
// Covers: model routing · LLM router · cost tracker · deliverable store ·
//         DB migrations · surfacing store · working theories ·
//         live OpenAI conversation turn
// ─────────────────────────────────────────────────────────────────────────────

const assert = require("node:assert/strict");
const fs     = require("node:fs");
const path   = require("node:path");
const os     = require("node:os");

// ── Load real .env so live tests have the API key ────────────────────────────
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// ── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      return r.then(() => {
        console.log(`  ✓ ${name}`);
        passed++;
      }).catch(err => {
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.message}`);
        failed++;
        failures.push({ name, err });
      });
    }
    console.log(`  ✓ ${name}`);
    passed++;
    return Promise.resolve();
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
    failures.push({ name, err });
    return Promise.resolve();
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log("─".repeat(title.length));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function freshDb(extra = {}) {
  // Clear DB module cache and use in-memory DB for each test section
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/engine/db/")) delete require.cache[k];
  }
  Object.assign(process.env, { MONDAY_DB_PATH: ":memory:", ...extra });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. MODEL ROUTER — 5-tier routing
// ═════════════════════════════════════════════════════════════════════════════

section("1. Model Router — 5-tier routing");

// Clear env overrides so defaults are tested
for (const k of ["MONDAY_MODEL_UTILITY","MONDAY_MODEL_CONVERSATION","MONDAY_MODEL_THINKING",
                  "MONDAY_MODEL_STRATEGIC","MONDAY_MODEL_EXECUTIVE","MONDAY_MODEL_BACKGROUND"]) {
  delete process.env[k];
}
// Remove cached module to get clean defaults
delete require.cache[require.resolve("../src/engine/llm/model-router")];
const { routeModel, routeInternalTask, routeEmbedding, routeBackgroundTask, TASK_TYPES, CLOUD_MODELS } =
  require("../src/engine/llm/model-router");

test("Standard question → conversation tier (gpt-5.4-mini)", () => {
  const d = routeModel({ input: "How is the market looking?" });
  assert.equal(d.tier, "conversation");
  assert.equal(d.model, "gpt-5.4-mini");
  assert.equal(d.taskType, TASK_TYPES.CONVERSATION);
});

test("'meaning' keyword → thinking tier (gpt-5.4)", () => {
  const d = routeModel({ input: "What is the meaning of my work?" });
  assert.equal(d.tier, "thinking");
  assert.equal(d.model, "gpt-5.4");
});

test("'purpose' keyword → thinking tier", () => {
  const d = routeModel({ input: "What is my purpose in life?" });
  assert.equal(d.tier, "thinking");
});

test("'faith' keyword → thinking tier", () => {
  const d = routeModel({ input: "My faith feels distant lately." });
  assert.equal(d.tier, "thinking");
});

test("Significance 'family_time_tension' → thinking tier", () => {
  const d = routeModel({ significance: "family_time_tension", input: "I missed dinner again." });
  assert.equal(d.tier, "thinking");
});

test("Significance 'retirement_strategy' (non-critical) → thinking tier", () => {
  const d = routeModel({ significance: "retirement_strategy", input: "Thinking about retirement." });
  assert.equal(d.tier, "thinking");
});

test("Significance 'retirement_strategy' + critical identity → strategic tier (o3)", () => {
  const d = routeModel({
    significance: "retirement_strategy",
    identityProximity: "critical",
    input: "Should I retire now?",
  });
  assert.equal(d.tier, "strategic");
  assert.equal(d.model, "o3");
});

test("Strategic pattern 'when should I retire' → strategic tier", () => {
  const d = routeModel({ input: "When should I retire from this job?" });
  assert.equal(d.tier, "strategic");
});

test("Strategic pattern 'life plan' → strategic tier", () => {
  const d = routeModel({ input: "Let's work on my life plan." });
  assert.equal(d.tier, "strategic");
});

test("identityProximity=critical → thinking tier (no significance)", () => {
  const d = routeModel({ identityProximity: "critical", input: "I feel lost." });
  assert.equal(d.tier, "thinking");
});

test("woundRisk=high → thinking tier", () => {
  const d = routeModel({ woundRisk: "high", input: "Something happened." });
  assert.equal(d.tier, "thinking");
});

test("Depth domain + long message → thinking tier", () => {
  const d = routeModel({
    domain: "Retirement",
    input: "I have been thinking a lot about what the next chapter looks like for me and my family.",
  });
  assert.equal(d.tier, "thinking");
});

test("Depth domain + short message → conversation tier", () => {
  const d = routeModel({ domain: "Retirement", input: "OK." });
  assert.equal(d.tier, "conversation");
});

test("TASK_TYPES.EMBEDDING override → embedding tier", () => {
  const d = routeModel({ taskType: TASK_TYPES.EMBEDDING });
  assert.equal(d.tier, "embedding");
});

test("TASK_TYPES.BACKGROUND override → background tier", () => {
  const d = routeModel({ taskType: TASK_TYPES.BACKGROUND });
  assert.equal(d.tier, "background");
  assert.equal(d.model, "qwen3:14b");
});

test("TASK_TYPES.STRATEGIC override → strategic tier", () => {
  const d = routeModel({ taskType: TASK_TYPES.STRATEGIC });
  assert.equal(d.tier, "strategic");
  assert.equal(d.model, "o3");
});

test("routeInternalTask → utility tier (gpt-5.4-nano)", () => {
  const d = routeInternalTask("classify intent");
  assert.equal(d.tier, "utility");
  assert.equal(d.model, "gpt-5.4-nano");
});

test("routeBackgroundTask → background tier (qwen3:14b)", () => {
  const d = routeBackgroundTask("synthesis run");
  assert.equal(d.tier, "background");
  assert.equal(d.model, "qwen3:14b");
});

test("routeEmbedding → embedding tier (nomic-embed-text)", () => {
  const d = routeEmbedding();
  assert.equal(d.tier, "embedding");
  assert.equal(d.model, "nomic-embed-text");
});

test("paidBlocked is always false (cloud is wired)", () => {
  const d = routeModel({ input: "hello" });
  assert.equal(d.paidBlocked, false);
});

test("decision includes matchedPattern for keyword routes", () => {
  const d = routeModel({ input: "What is the meaning of life?" });
  assert.ok(d.matchedPattern, "matchedPattern should be set");
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. LLM ROUTER — tier resolution (no API calls)
// ═════════════════════════════════════════════════════════════════════════════

section("2. LLM Router — tier resolution");

delete require.cache[require.resolve("../src/engine/llm/llm-router")];
const { TIER_MODELS, activeProvider } = require("../src/engine/llm/llm-router");

test("TIER_MODELS has all 5 cloud tiers", () => {
  for (const tier of ["utility","conversation","thinking","strategic","executive"]) {
    assert.ok(TIER_MODELS[tier], `TIER_MODELS.${tier} should be defined`);
  }
});

test("TIER_MODELS.utility → gpt-5.4-nano", () => {
  assert.equal(TIER_MODELS.utility, "gpt-5.4-nano");
});

test("TIER_MODELS.conversation → gpt-5.4-mini", () => {
  assert.equal(TIER_MODELS.conversation, "gpt-5.4-mini");
});

test("TIER_MODELS.thinking → gpt-5.4", () => {
  assert.equal(TIER_MODELS.thinking, "gpt-5.4");
});

test("TIER_MODELS.strategic → o3", () => {
  assert.equal(TIER_MODELS.strategic, "o3");
});

test("TIER_MODELS.executive → gpt-5.5", () => {
  assert.equal(TIER_MODELS.executive, "gpt-5.5");
});

test("activeProvider returns 'openai' when OPENAI_API_KEY is set", () => {
  const prev = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test";
  assert.equal(activeProvider(), "openai");
  if (prev) process.env.OPENAI_API_KEY = prev;
  else delete process.env.OPENAI_API_KEY;
});

test("activeProvider returns 'ollama' when no keys are set", () => {
  const prevOAI = process.env.OPENAI_API_KEY;
  const prevANT = process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(activeProvider(), "ollama");
  if (prevOAI) process.env.OPENAI_API_KEY = prevOAI;
  if (prevANT) process.env.ANTHROPIC_API_KEY = prevANT;
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. COST TRACKER
// ═════════════════════════════════════════════════════════════════════════════

section("3. Cost Tracker");

freshDb();
const ct = require("../src/engine/db/cost-tracker");

test("BASE_RATES has entries for all 5 cloud tiers", () => {
  const models = Object.keys(ct.BASE_RATES);
  assert.ok(models.includes("gpt-5.4-nano"));
  assert.ok(models.includes("gpt-5.4-mini"));
  assert.ok(models.includes("gpt-5.4"));
  assert.ok(models.includes("o3"));
  assert.ok(models.includes("gpt-5.5"));
});

test("trackCall writes to DB without throwing", () => {
  ct.trackCall({ model: "gpt-5.4-mini", tier: "conversation", purpose: "conversation", inputTokens: 500, outputTokens: 200 });
});

test("getDailyCost returns expected totals", () => {
  ct.trackCall({ model: "gpt-5.4", tier: "thinking", purpose: "theory", inputTokens: 1000, outputTokens: 400 });
  const daily = ct.getDailyCost();
  assert.ok(daily.calls >= 2, "should have at least 2 calls");
  assert.ok(daily.total_usd > 0, "total cost should be > 0");
  assert.ok(daily.input_tokens >= 1500, "input tokens should accumulate");
});

test("getCostByTier groups by tier correctly", () => {
  const rows = ct.getCostByTier();
  const tiers = rows.map(r => r.tier);
  assert.ok(tiers.includes("conversation"), "conversation tier should appear");
  assert.ok(tiers.includes("thinking"), "thinking tier should appear");
});

test("getCostByModel groups by model correctly", () => {
  const rows = ct.getCostByModel();
  const models = rows.map(r => r.model);
  assert.ok(models.includes("gpt-5.4-mini"));
  assert.ok(models.includes("gpt-5.4"));
});

test("getDailyTotals returns array with today", () => {
  const rows = ct.getDailyTotals({ days: 1 });
  assert.ok(Array.isArray(rows));
  assert.ok(rows.length > 0, "should have today's data");
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(rows[0].date, today);
});

test("getRecentCalls returns records in descending order", () => {
  const rows = ct.getRecentCalls({ limit: 5 });
  assert.ok(rows.length >= 2);
  assert.ok(rows[0].id > rows[1].id, "most recent first");
});

test("getCostSummary returns complete shape", () => {
  const s = ct.getCostSummary();
  assert.ok(s.today);
  assert.ok(s.thisMonth);
  assert.ok(Array.isArray(s.byTier));
  assert.ok(Array.isArray(s.byModel));
  assert.ok(Array.isArray(s.daily30));
  assert.ok(s.rates);
});

test("gpt-5.4-nano cost calculation is correct", () => {
  // $0.20/M in, $1.25/M out → 1M in + 1M out = $1.45
  freshDb();
  const ct2 = require("../src/engine/db/cost-tracker");
  ct2.trackCall({ model: "gpt-5.4-nano", tier: "utility", inputTokens: 1_000_000, outputTokens: 1_000_000 });
  const d = ct2.getDailyCost();
  assert.ok(Math.abs(d.total_usd - 1.45) < 0.001, `Expected ~$1.45, got $${d.total_usd}`);
});

test("o3 cost calculation is correct", () => {
  // $10/M in, $40/M out → 100k in + 50k out = $1.00 + $2.00 = $3.00
  freshDb();
  const ct3 = require("../src/engine/db/cost-tracker");
  ct3.trackCall({ model: "o3", tier: "strategic", inputTokens: 100_000, outputTokens: 50_000 });
  const d = ct3.getDailyCost();
  assert.ok(Math.abs(d.total_usd - 3.00) < 0.001, `Expected ~$3.00, got $${d.total_usd}`);
});

test("unknown model warns and uses fallback rates without throwing", () => {
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(" "));
  ct.trackCall({ model: "gpt-99-unknown", inputTokens: 1000, outputTokens: 500 });
  console.warn = origWarn;
  assert.ok(warns.some(w => w.includes("unknown model")), "should warn about unknown model");
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. DELIVERABLE STORE
// ═════════════════════════════════════════════════════════════════════════════

section("4. Deliverable Store");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "monday-test-deliverables-"));
process.env.MONDAY_VAULT_ROOT = "";  // disable vault so we use MONDAY_DATA_DIR
process.env.MONDAY_DATA_DIR   = tempDir;

delete require.cache[require.resolve("../src/engine/db/deliverable-store")];
const ds = require("../src/engine/db/deliverable-store");

let testFilePath;

test("writeDeliverable creates .md file with frontmatter", () => {
  const { id, filePath } = ds.writeDeliverable({
    source:     "synthesis",
    domain:     "Retirement",
    title:      "Test Synthesis",
    content:    "## Observations\n\nRetirement tension is rising.\n",
    confidence: 0.75,
  });
  testFilePath = filePath;
  assert.ok(fs.existsSync(filePath), "file should exist");
  const raw = fs.readFileSync(filePath, "utf8");
  assert.ok(raw.includes('source: "synthesis"'), "frontmatter: source");
  assert.ok(raw.includes('domain: "Retirement"'), "frontmatter: domain");
  assert.ok(raw.includes("reviewed: false"),      "frontmatter: reviewed=false");
  assert.ok(raw.includes("Retirement tension"),   "content present");
});

test("readDeliverable parses frontmatter and content", () => {
  const result = ds.readDeliverable(testFilePath);
  assert.ok(result, "should return object");
  assert.equal(result.metadata.source,  "synthesis");
  assert.equal(result.metadata.domain,  "Retirement");
  assert.equal(result.metadata.reviewed, "false");
  assert.ok(result.content.includes("Retirement tension"), "content should be present");
});

test("listPendingDeliverables returns unreviewed files", () => {
  const list = ds.listPendingDeliverables();
  assert.equal(list.length, 1, "should have one pending deliverable");
  assert.ok(list[0].filePath.endsWith(".md"));
});

test("markDeliverableReviewed updates frontmatter", () => {
  ds.markDeliverableReviewed(testFilePath);
  const raw = fs.readFileSync(testFilePath, "utf8");
  assert.ok(raw.includes("reviewed: true"), "should be marked reviewed");
  assert.ok(raw.includes("reviewed_at:"),   "should have reviewed_at timestamp");
  assert.ok(!raw.includes("reviewed: false"), "false should be gone");
});

test("listPendingDeliverables excludes reviewed files", () => {
  const list = ds.listPendingDeliverables();
  assert.equal(list.length, 0, "no pending after review");
});

test("markDeliverableReviewed is idempotent (no duplicate fields)", () => {
  // Call three times — should not corrupt frontmatter
  ds.markDeliverableReviewed(testFilePath);
  ds.markDeliverableReviewed(testFilePath);
  ds.markDeliverableReviewed(testFilePath);
  const raw = fs.readFileSync(testFilePath, "utf8");
  const trueCount = (raw.match(/reviewed: true/g) || []).length;
  const atCount   = (raw.match(/reviewed_at:/g) || []).length;
  assert.equal(trueCount, 1, "exactly one 'reviewed: true'");
  assert.equal(atCount,   1, "exactly one 'reviewed_at:'");
});

test("writeDeliverable handles missing domain gracefully", () => {
  const { filePath } = ds.writeDeliverable({
    source:  "monitor",
    content: "## Quiet\n\nNo activity.",
  });
  const result = ds.readDeliverable(filePath);
  assert.equal(result.metadata.domain, "general");
});

test("readDeliverable returns null for missing file", () => {
  const result = ds.readDeliverable("/tmp/does-not-exist-xyz.md");
  assert.equal(result, null);
});

// Cleanup
fs.rmSync(tempDir, { recursive: true, force: true });

// ═════════════════════════════════════════════════════════════════════════════
// 5. DB MIGRATIONS — all 5 migrations applied
// ═════════════════════════════════════════════════════════════════════════════

section("5. DB Migrations");

freshDb();
const { getDb } = require("../src/engine/db/connection");
const db = getDb();

test("All 5 migrations applied", () => {
  const rows = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
  const versions = rows.map(r => r.version);
  assert.deepEqual(versions, [1, 2, 3, 4, 5], "migrations 1-5 all present");
});

test("working_theories table exists", () => {
  const r = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='working_theories'").get();
  assert.ok(r, "working_theories table");
});

test("surfacing_queue table exists", () => {
  const r = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='surfacing_queue'").get();
  assert.ok(r, "surfacing_queue table");
});

test("llm_cost_log table exists with correct columns", () => {
  const r = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='llm_cost_log'").get();
  assert.ok(r, "llm_cost_log table");
  const cols = db.prepare("PRAGMA table_info(llm_cost_log)").all().map(c => c.name);
  for (const col of ["model","tier","purpose","input_tokens","output_tokens","input_cost_usd","output_cost_usd","total_cost_usd","created_at"]) {
    assert.ok(cols.includes(col), `column ${col} missing`);
  }
});

test("idx_cost_log indexes exist", () => {
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='llm_cost_log'").all().map(r => r.name);
  assert.ok(indexes.includes("idx_cost_log_created"), "idx_cost_log_created");
  assert.ok(indexes.includes("idx_cost_log_model"),   "idx_cost_log_model");
  assert.ok(indexes.includes("idx_cost_log_tier"),    "idx_cost_log_tier");
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. SURFACING STORE
// ═════════════════════════════════════════════════════════════════════════════

section("6. Surfacing Store");

freshDb();
const surf = require("../src/engine/db/surfacing-store");

test("enqueueSurfacing writes an item", () => {
  surf.enqueueSurfacing({ source: "synthesis", domain: "Retirement", payload: "Test finding.", confidence: 0.8, priority: 2, ttlHours: 24 });
  const item = surf.nextSurfacingItem();
  assert.ok(item, "should return an item");
  assert.equal(item.source, "synthesis");
  assert.equal(item.payload, "Test finding.");
});

test("nextSurfacingItem respects priority (lowest number first)", () => {
  surf.enqueueSurfacing({ source: "monitor", payload: "Low priority.", confidence: 0.5, priority: 5, ttlHours: 24 });
  surf.enqueueSurfacing({ source: "morning-digest", payload: "High priority.", confidence: 0.9, priority: 1, ttlHours: 24 });
  const item = surf.nextSurfacingItem();
  assert.equal(item.priority, 1, "priority 1 should come first");
  assert.ok(item.payload.includes("High priority"));
});

test("markSurfaced removes item from queue", () => {
  const item = surf.nextSurfacingItem();
  surf.markSurfaced(item.id);
  // After marking, the item should not appear again (or appears with surfaced=1)
  const items = surf.getPendingItems();
  assert.ok(!items.find(i => i.id === item.id), "marked item should not be in pending");
});

test("pruneExpired removes expired items", () => {
  // Write an already-expired item by injecting a past expiry
  const dbLocal = require("../src/engine/db/connection").getDb();
  const past = new Date(Date.now() - 1000).toISOString();
  dbLocal.prepare(`INSERT INTO surfacing_queue (id, source, payload, created_at, expires_at, surfaced) VALUES (?,?,?,?,?,0)`)
    .run("expired-test", "test", "expired payload", new Date().toISOString(), past);
  surf.pruneExpired();
  const items = surf.getPendingItems();
  assert.ok(!items.find(i => i.id === "expired-test"), "expired item should be pruned");
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. WORKING THEORIES (state-store)
// ═════════════════════════════════════════════════════════════════════════════

section("7. Working Theories");

freshDb();
const state = require("../src/engine/db/state-store");

test("setWorkingTheory writes and getWorkingTheory reads back", () => {
  state.setWorkingTheory("Retirement", "Chris is actively planning retirement for 2027.", 0.72);
  const t = state.getWorkingTheory("Retirement");
  assert.ok(t, "theory should exist");
  assert.equal(t.domain, "Retirement");
  assert.ok(t.text.includes("2027"));
  assert.ok(Math.abs(t.confidence - 0.72) < 0.001);
});

test("getWorkingTheories returns all domains", () => {
  state.setWorkingTheory("Faith",     "Chris's faith is grounding his identity.", 0.65);
  state.setWorkingTheory("Work",      "Chris feels tension between work hours and meaning.", 0.8);
  const all = state.getWorkingTheories();
  assert.ok(all["Retirement"], "Retirement theory");
  assert.ok(all["Faith"],      "Faith theory");
  assert.ok(all["Work"],       "Work theory");
});

test("setWorkingTheory overwrites existing theory", () => {
  state.setWorkingTheory("Retirement", "Revised: Chris wants to retire in 2026.", 0.85);
  const t = state.getWorkingTheory("Retirement");
  assert.ok(t.text.includes("2026"), "text should be updated");
  assert.ok(Math.abs(t.confidence - 0.85) < 0.001, "confidence should update");
});

test("getWorkingTheory returns null for unknown domain", () => {
  const t = state.getWorkingTheory("Hobbies");
  assert.equal(t, null);
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. LIVE OPENAI CALL — end-to-end conversation turn
// ═════════════════════════════════════════════════════════════════════════════

section("8. Live OpenAI — end-to-end turn");

async function runLiveTests() {
  if (!process.env.OPENAI_API_KEY) {
    console.log("  ⚠  OPENAI_API_KEY not set — skipping live tests");
    return;
  }

  // Re-load llm-router with real key
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/engine/llm/") || k.includes("/engine/db/cost-tracker")) {
      delete require.cache[k];
    }
  }
  freshDb({ MONDAY_DB_PATH: ":memory:" });
  const { chatWithLLM } = require("../src/engine/llm/llm-router");
  const ct2 = require("../src/engine/db/cost-tracker");

  await test("chatWithLLM(conversation) returns valid JSON response", async () => {
    const messages = [
      { role: "system", content: "You are Monday, a personal AI. Always reply in valid JSON with a 'reply' field." },
      { role: "user",   content: "Say hello in JSON." },
    ];
    const response = await chatWithLLM({ messages, tier: "conversation", purpose: "test" });
    assert.ok(response.model, "response.model should be set");
    assert.ok(response.content, "response.content should be non-empty");
    assert.equal(response.model, "gpt-5.4-mini", "should use conversation model");
    console.log(`    model: ${response.model}, tokens: ${response.raw?.usage?.prompt_tokens}in/${response.raw?.usage?.completion_tokens}out`);
  });

  await test("cost is recorded after live call", async () => {
    const daily = ct2.getDailyCost();
    assert.ok(daily.calls >= 1, "at least 1 call recorded");
    assert.ok(daily.total_usd > 0, "cost should be > 0");
    assert.ok(daily.input_tokens > 0, "input tokens recorded");
    console.log(`    recorded: ${daily.calls} call(s), $${daily.total_usd.toFixed(6)}`);
  });

  await test("chatWithLLM(utility) uses gpt-5.4-nano", async () => {
    const messages = [
      { role: "system", content: "Classify the domain. Reply in JSON: {\"domain\": \"Work\"|\"Retirement\"|\"Family\"|\"Faith\"|\"Health\"|\"Publishing\"}" },
      { role: "user",   content: "I need to plan for retirement." },
    ];
    const response = await chatWithLLM({ messages, tier: "utility", purpose: "test-classification" });
    assert.equal(response.model, "gpt-5.4-nano");
    assert.ok(response.json, "should parse JSON response");
    console.log(`    domain classified as: ${response.json?.domain}`);
  });

  await test("chatWithLLM(thinking) uses gpt-5.4", async () => {
    const messages = [
      { role: "system", content: "You are Monday. Think deeply. Reply in JSON with field 'insight'." },
      { role: "user",   content: "What does it mean to find meaning in work?" },
    ];
    const response = await chatWithLLM({ messages, tier: "thinking", purpose: "test-thinking" });
    assert.equal(response.model, "gpt-5.4");
    assert.ok(response.content.length > 10, "thinking response should be substantive");
    console.log(`    thinking response length: ${response.content.length} chars`);
  });

  await test("full intelligence turn processes and returns valid structure", async () => {
    // Set up a minimal context and run a real turn through applyMondayIntelligence
    for (const k of Object.keys(require.cache)) {
      if (k.includes("/engine/")) delete require.cache[k];
    }
    freshDb({ MONDAY_DB_PATH: ":memory:" });

    // Stub connectors to avoid live calendar/email calls
    const { applyMondayIntelligence } = require("../src/engine/intelligence/monday-intelligence");

    const result = await applyMondayIntelligence({
      input:   "How should I be thinking about my retirement planning right now?",
      history: [],
      personalContext: {
        missionSummary: "Chris Binion — life in six domains: Health, Publishing, Retirement, Family, Faith, Work.",
        captures:       [],
        workingTheories: {},
        recentDecisions: [],
        surfacingItem:   null,
      },
      result: {
        truth: { domain: "Retirement" },
        finalState: {
          significance:      "retirement_strategy",
          identityProximity: "high",
          woundRisk:         "low",
          candidateDomain:   "Retirement",
        },
        threadId: "test-thread-001",
      },
    });

    assert.ok(result, "result should be defined");
    assert.ok(result.reply || result.finalState, "should have reply or finalState");
    assert.ok(result.modelDecision, "modelDecision should be present");
    // With retirement_strategy + high identity → should route to thinking tier
    assert.equal(result.modelDecision.tier, "thinking",
      `Expected thinking tier, got: ${result.modelDecision.tier}`);
    console.log(`    tier: ${result.modelDecision.tier}, model: ${result.modelDecision.model}`);
    if (result.reply) {
      console.log(`    reply preview: "${String(result.reply).slice(0, 80)}..."`);
    }
  });

  await test("purpose field is populated in cost log after live calls", async () => {
    const rows = ct2.getRecentCalls({ limit: 10 });
    const withPurpose = rows.filter(r => r.purpose !== null);
    assert.ok(withPurpose.length > 0, "at least one call should have purpose set");
    console.log(`    purposes recorded: ${[...new Set(rows.map(r => r.purpose))].join(", ")}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Run all tests
// ─────────────────────────────────────────────────────────────────────────────

runLiveTests().then(() => {
  console.log("\n" + "═".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const { name, err } of failures) {
      console.log(`  ✗ ${name}`);
      console.log(`    ${err.message}`);
    }
  }
  console.log("═".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
});
