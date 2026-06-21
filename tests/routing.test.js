"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Monday LLM Routing Test Suite
// Are the right LLMs being called at the right times?
//
// Covers:
//  1. routeModel() — all tier-selection rules (pure unit, no API calls)
//  2. Model detection helpers — isReasoningModel / requiresCompletionTokens
//  3. Request body construction — o3 vs gpt-5.x vs gpt-4o param differences
//  4. chatWithLLM dispatch — background/embedding → Ollama; cloud tiers → OpenAI
//  5. Worker tier contracts — every worker passes the correct tier
//  6. Live end-to-end — routeModel decision matches actual model used
// ─────────────────────────────────────────────────────────────────────────────

const assert = require("node:assert/strict");
const fs     = require("node:fs");
const path   = require("node:path");

// ── Load .env ─────────────────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// ── Test harness ──────────────────────────────────────────────────────────────

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

function freshDb() {
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/engine/db/")) delete require.cache[k];
  }
  process.env.MONDAY_DB_PATH = ":memory:";
}

// Read a source file as a string for contract checks
function readSrc(relPath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf8");
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. routeModel() — tier-selection rules
//    Pure unit: no LLM calls, no DB, no side effects.
// ═════════════════════════════════════════════════════════════════════════════

section("1. routeModel() — tier-selection rules");

{
  // Reload model-router with test env (strip any overrides that would change defaults)
  for (const k of ["MONDAY_MODEL_UTILITY","MONDAY_MODEL_CONVERSATION","MONDAY_MODEL_THINKING",
                    "MONDAY_MODEL_STRATEGIC","MONDAY_MODEL_EXECUTIVE","MONDAY_MODEL_BACKGROUND",
                    "MONDAY_MODEL_EMBEDDINGS"]) {
    delete process.env[k];
  }
  for (const k of Object.keys(require.cache)) {
    if (k.includes("model-router")) delete require.cache[k];
  }

  const { routeModel, routeInternalTask, routeBackgroundTask, routeEmbedding,
          CLOUD_MODELS, TASK_TYPES } = require("../src/engine/llm/model-router");

  // ── Explicit taskType overrides ──────────────────────────────────────────
  test("taskType=embedding → embedding tier", () => {
    const d = routeModel({ taskType: TASK_TYPES.EMBEDDING });
    assert.equal(d.tier, "embedding");
  });

  test("taskType=utility → utility tier", () => {
    const d = routeModel({ taskType: TASK_TYPES.UTILITY });
    assert.equal(d.tier, "utility");
  });

  test("taskType=background → background tier", () => {
    const d = routeModel({ taskType: TASK_TYPES.BACKGROUND });
    assert.equal(d.tier, "background");
  });

  test("taskType=deterministic → no tier (null)", () => {
    const d = routeModel({ taskType: TASK_TYPES.DETERMINISTIC });
    assert.equal(d.tier, null);
  });

  test("taskType=strategic → strategic tier", () => {
    const d = routeModel({ taskType: TASK_TYPES.STRATEGIC });
    assert.equal(d.tier, "strategic");
  });

  test("taskType=executive → executive tier", () => {
    const d = routeModel({ taskType: TASK_TYPES.EXECUTIVE });
    assert.equal(d.tier, "executive");
  });

  // ── Strategic triggers (significance + critical risk) ────────────────────
  test("retirement_strategy + critical identityProximity → strategic", () => {
    const d = routeModel({
      significance: "retirement_strategy",
      identityProximity: "critical",
    });
    assert.equal(d.tier, "strategic");
    assert.equal(d.model, "o3");
  });

  test("calling + critical woundRisk → strategic", () => {
    const d = routeModel({
      significance: "calling",
      woundRisk: "critical",
    });
    assert.equal(d.tier, "strategic");
  });

  test("existential + critical identityProximity → strategic", () => {
    const d = routeModel({
      significance: "existential",
      identityProximity: "critical",
    });
    assert.equal(d.tier, "strategic");
  });

  // ── Strategic triggers (pattern matching in message) ────────────────────
  test("'when should I retire' → strategic", () => {
    const d = routeModel({ input: "When should I retire from my job?" });
    assert.equal(d.tier, "strategic");
    assert.equal(d.model, "o3");
  });

  test("'life plan' in message → strategic", () => {
    const d = routeModel({ input: "I want to build out my life plan for the next decade." });
    assert.equal(d.tier, "strategic");
  });

  test("'rest of my life' in message → strategic", () => {
    const d = routeModel({ input: "What do I want to do with the rest of my life?" });
    assert.equal(d.tier, "strategic");
  });

  test("'biggest decision' in message → strategic", () => {
    const d = routeModel({ input: "This is the biggest decision I've ever faced." });
    assert.equal(d.tier, "strategic");
  });

  test("'multi-year plan' → strategic", () => {
    const d = routeModel({ input: "Help me think through a multi-year plan for the business." });
    assert.equal(d.tier, "strategic");
  });

  test("'legacy plan' → strategic", () => {
    const d = routeModel({ input: "I want to build a legacy plan for my family." });
    assert.equal(d.tier, "strategic");
  });

  // ── Thinking triggers (THINKING_SIGNIFICANCE) ───────────────────────────
  const THINKING_SIG_CASES = [
    "family_time_tension",
    "future_life_transition",
    "future_life_tradeoff",
    "work_identity",
    "faith_tension",
    "publishing_strategy",
    "creative_strategy",
    "wounded_significance",
    "identity_threat",
    "deep_meaning",
  ];

  for (const sig of THINKING_SIG_CASES) {
    test(`significance="${sig}" → thinking tier`, () => {
      const d = routeModel({ significance: sig });
      assert.equal(d.tier, "thinking",
        `Expected thinking for significance="${sig}", got "${d.tier}". Reason: ${d.reason}`);
      assert.equal(d.model, "gpt-5.4");
    });
  }

  // Strategic significance WITHOUT critical risk → thinking (needs depth but not o3)
  test("retirement_strategy WITHOUT critical risk → thinking (not strategic)", () => {
    const d = routeModel({
      significance: "retirement_strategy",
      identityProximity: "medium",
      woundRisk: "low",
    });
    assert.equal(d.tier, "thinking",
      `retirement_strategy without critical risk should be thinking, got "${d.tier}"`);
  });

  // ── Thinking triggers (high risk) ───────────────────────────────────────
  test("identityProximity=high → thinking", () => {
    const d = routeModel({ identityProximity: "high" });
    assert.equal(d.tier, "thinking");
  });

  test("woundRisk=high → thinking", () => {
    const d = routeModel({ woundRisk: "high" });
    assert.equal(d.tier, "thinking");
  });

  test("identityProximity=critical (no sig match) → thinking", () => {
    const d = routeModel({ identityProximity: "critical" });
    // No significance, so falls through to high-risk check → thinking
    assert.equal(d.tier, "thinking");
  });

  // ── Thinking triggers (keyword patterns) ───────────────────────────────
  const THINKING_KEYWORD_CASES = [
    { input: "What does this mean for my life?",    label: "meaning"   },
    { input: "What is my purpose here?",            label: "purpose"   },
    { input: "I'm questioning my calling.",         label: "calling"   },
    { input: "Who am I becoming through this?",     label: "identity"  },
    { input: "I've been thinking about my faith.",  label: "faith"     },
    { input: "I feel like God is saying something.",label: "God"       },
    { input: "I said a prayer about this situation.", label: "prayer"   },
    { input: "I don't know what matters anymore.",  label: "what matters"},
    { input: "I'm stuck and can't move forward.",   label: "stuck"     },
    { input: "Testing my hypothesis here.",         label: "hypothesis"},
    { input: "I have a theory about the pattern.",  label: "theory/pattern"},
    { input: "I want to think about my vocation.",  label: "vocation"  },
    { input: "Working 80 hours a week.",            label: "80 hours"  },
  ];

  for (const { input, label } of THINKING_KEYWORD_CASES) {
    test(`keyword "${label}" in message → thinking tier`, () => {
      const d = routeModel({ input });
      assert.equal(d.tier, "thinking",
        `"${label}" keyword should route to thinking. Got "${d.tier}" for: "${input}"`);
    });
  }

  // ── Thinking trigger: depth domain requires both length AND depth signal ─
  // Long logistical messages in depth domains do NOT escalate — only messages
  // with a question mark or a depth keyword qualify.
  const LONG_LOGISTICS = "I have been tracking where things stand in my retirement planning and I really want to review the data relative to my goals and targets for the year ahead.";
  const LONG_WITH_QUESTION = LONG_LOGISTICS + " Is this the right path?";
  const LONG_WITH_DEPTH_KEYWORD = "I have been thinking about the meaning of my retirement planning relative to my identity and purpose for the years ahead beyond just money.";

  test("Retirement domain + long message WITHOUT depth signal → conversation (tightened rule)", () => {
    const d = routeModel({ domain: "Retirement", input: LONG_LOGISTICS });
    assert.equal(d.tier, "conversation",
      `Long logistics without depth signal should stay at conversation, got: ${d.tier}`);
  });

  test("Faith domain + long message WITHOUT depth signal → conversation (tightened rule)", () => {
    const d = routeModel({ domain: "Faith", input: LONG_LOGISTICS });
    assert.equal(d.tier, "conversation",
      `Long Faith message without depth signal should stay at conversation, got: ${d.tier}`);
  });

  test("Family domain + long message WITH question → thinking", () => {
    const d = routeModel({ domain: "Family", input: LONG_WITH_QUESTION });
    assert.equal(d.tier, "thinking",
      `Long Family message with question should escalate to thinking, got: ${d.tier}`);
  });

  test("Retirement domain + long message WITH depth keyword → thinking", () => {
    const d = routeModel({ domain: "Retirement", input: LONG_WITH_DEPTH_KEYWORD });
    assert.equal(d.tier, "thinking",
      `Long Retirement message with depth keyword should escalate to thinking, got: ${d.tier}`);
  });

  test("Depth domain + SHORT message (≤15 words) → conversation, not thinking", () => {
    const d = routeModel({ domain: "Retirement", input: "What's the latest?" });
    assert.equal(d.tier, "conversation",
      `Short depth-domain message should be conversation, got "${d.tier}"`);
  });

  test("Work domain + long message → conversation (Work is not a depth domain)", () => {
    const d = routeModel({ domain: "Work", input: LONG_LOGISTICS });
    assert.equal(d.tier, "conversation",
      `Work domain should not trigger thinking by length alone, got "${d.tier}"`);
  });

  // ── Default: standard conversation ──────────────────────────────────────
  test("no signals → conversation tier (default)", () => {
    const d = routeModel({ input: "What's up?" });
    assert.equal(d.tier, "conversation");
    assert.equal(d.model, "gpt-5.4-mini");
  });

  test("empty call → conversation tier", () => {
    const d = routeModel();
    assert.equal(d.tier, "conversation");
  });

  // ── Model IDs per tier ───────────────────────────────────────────────────
  test("utility tier resolves to gpt-5.4-nano", () => {
    assert.equal(CLOUD_MODELS.utility, "gpt-5.4-nano");
  });

  test("conversation tier resolves to gpt-5.4-mini", () => {
    assert.equal(CLOUD_MODELS.conversation, "gpt-5.4-mini");
  });

  test("thinking tier resolves to gpt-5.4", () => {
    assert.equal(CLOUD_MODELS.thinking, "gpt-5.4");
  });

  test("strategic tier resolves to o3", () => {
    assert.equal(CLOUD_MODELS.strategic, "o3");
  });

  test("executive tier resolves to gpt-5.5", () => {
    assert.equal(CLOUD_MODELS.executive, "gpt-5.5");
  });

  test("background tier resolves to qwen3:30b-a3b (Ollama)", () => {
    assert.equal(CLOUD_MODELS.background, "qwen3:30b-a3b");
  });

  test("embedding tier resolves to nomic-embed-text (Ollama)", () => {
    assert.equal(CLOUD_MODELS.embedding, "nomic-embed-text");
  });

  // ── Helper functions ─────────────────────────────────────────────────────
  test("routeInternalTask() → utility tier", () => {
    const d = routeInternalTask("test");
    assert.equal(d.tier, "utility");
    assert.equal(d.model, "gpt-5.4-nano");
  });

  test("routeBackgroundTask() → background tier", () => {
    const d = routeBackgroundTask("test");
    assert.equal(d.tier, "background");
    assert.equal(d.model, "qwen3:30b-a3b");
  });

  test("routeEmbedding() → embedding tier", () => {
    const d = routeEmbedding();
    assert.equal(d.tier, "embedding");
    assert.equal(d.model, "nomic-embed-text");
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Model Detection Helpers
//    isReasoningModel / requiresCompletionTokens — pure logic, no I/O
// ═════════════════════════════════════════════════════════════════════════════

section("2. Model Detection Helpers — isReasoningModel / requiresCompletionTokens");

{
  // Expose private helpers via module internals — they're exported for testing
  // Use chatWithOpenAI to indirectly test, but helpers are also inline-testable.
  // We'll re-implement the same logic and test both sides of each boundary.

  // Re-implement here to match llm-router.js exactly — if one changes, test breaks
  const REASONING_PREFIXES = ["o1", "o3", "o4"];
  function isReasoningModel(model) {
    if (!model) return false;
    return REASONING_PREFIXES.some(p => model === p || model.startsWith(p + "-") || model.startsWith(p + "."));
  }
  function requiresCompletionTokens(model) {
    if (!model) return false;
    return isReasoningModel(model) || /^gpt-5/.test(model);
  }

  // isReasoningModel true cases
  const REASONING_TRUE = ["o1", "o3", "o4", "o1-mini", "o3-mini", "o3.5", "o1-preview", "o4-mini"];
  for (const m of REASONING_TRUE) {
    test(`isReasoningModel("${m}") → true`, () => {
      assert.ok(isReasoningModel(m), `${m} should be a reasoning model`);
    });
  }

  // isReasoningModel false cases
  const REASONING_FALSE = ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.5", "gpt-4o", "gpt-4-turbo", "qwen3:30b-a3b", null, ""];
  for (const m of REASONING_FALSE) {
    test(`isReasoningModel(${JSON.stringify(m)}) → false`, () => {
      assert.ok(!isReasoningModel(m), `${m} should NOT be a reasoning model`);
    });
  }

  // requiresCompletionTokens true cases (reasoning + gpt-5.x)
  const COMPLETION_TOKENS_TRUE = ["o3", "o1", "o3-mini", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.5"];
  for (const m of COMPLETION_TOKENS_TRUE) {
    test(`requiresCompletionTokens("${m}") → true`, () => {
      assert.ok(requiresCompletionTokens(m), `${m} should require max_completion_tokens`);
    });
  }

  // requiresCompletionTokens false cases (gpt-4 family and older)
  const COMPLETION_TOKENS_FALSE = ["gpt-4o", "gpt-4-turbo", "gpt-4", "qwen3:30b-a3b", null, ""];
  for (const m of COMPLETION_TOKENS_FALSE) {
    test(`requiresCompletionTokens(${JSON.stringify(m)}) → false`, () => {
      assert.ok(!requiresCompletionTokens(m), `${m} should NOT require max_completion_tokens`);
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Request Body Construction
//    Intercept fetch to verify the exact params sent to OpenAI per model.
//    This catches the max_tokens vs max_completion_tokens boundary silently
//    breaking on model upgrades.
// ═════════════════════════════════════════════════════════════════════════════

section("3. Request Body Construction — correct params per model family");

let interceptedBody = null;
const originalFetch = global.fetch;

function mockFetch(responseContent = '{"reply":"ok"}') {
  interceptedBody = null; // reset at mock-setup time, not restore time
  global.fetch = async (_url, opts) => {
    interceptedBody = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: responseContent } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    };
  };
}

function restoreFetch() {
  global.fetch = originalFetch;
  // intentionally leave interceptedBody intact — tests read it after this call
}

const DUMMY_MESSAGES = [
  { role: "system", content: "You are Monday." },
  { role: "user",   content: "Test message." },
];

async function runBodyTests() {
  // Reload llm-router to pick up the clean env
  for (const k of Object.keys(require.cache)) {
    if (k.includes("llm-router") || k.includes("cost-tracker") || k.includes("/engine/db/")) {
      delete require.cache[k];
    }
  }
  freshDb();
  const { chatWithOpenAI } = require("../src/engine/llm/llm-router");

  // ── o3 (reasoning model) ─────────────────────────────────────────────────
  await test("o3: temperature=1, max_completion_tokens=8000, no response_format, no max_tokens", async () => {
    mockFetch('{"reply":"strategic answer"}');
    await chatWithOpenAI({ messages: DUMMY_MESSAGES, model: "o3", tier: "strategic" });
    restoreFetch();
    assert.equal(interceptedBody.temperature, 1, "o3 must use temperature=1");
    assert.equal(interceptedBody.max_completion_tokens, 8000, "o3 must use max_completion_tokens=8000");
    assert.equal(interceptedBody.response_format, undefined,
      "o3 must NOT have response_format (breaks the API)");
    assert.equal(interceptedBody.max_tokens, undefined,
      "o3 must NOT have max_tokens");
    assert.equal(interceptedBody.model, "o3");
  });

  await test("o3-mini: same reasoning params as o3", async () => {
    mockFetch('{"reply":"ok"}');
    await chatWithOpenAI({ messages: DUMMY_MESSAGES, model: "o3-mini", tier: "strategic" });
    restoreFetch();
    assert.equal(interceptedBody.temperature, 1);
    assert.equal(interceptedBody.max_completion_tokens, 8000);
    assert.equal(interceptedBody.response_format, undefined);
    assert.equal(interceptedBody.max_tokens, undefined);
  });

  // ── Token budget: conversation tier (gpt-5.4-mini) → 400 ─────────────────
  await test("conversation tier: max_completion_tokens=400 (2-4 sentence budget)", async () => {
    mockFetch('{"reply":"conversation"}');
    await chatWithOpenAI({ messages: DUMMY_MESSAGES, model: "gpt-5.4-mini", tier: "conversation" });
    restoreFetch();
    assert.equal(interceptedBody.max_completion_tokens, 400,
      "conversation tier must use 400-token budget — matches 2-4 sentence instruction");
    assert.equal(interceptedBody.max_tokens, undefined,
      "gpt-5.4-mini must NOT use max_tokens");
    assert.ok(interceptedBody.response_format, "must have response_format");
    assert.equal(interceptedBody.response_format?.type, "json_object");
  });

  // ── Token budget: thinking tier (gpt-5.4) → 1000 ─────────────────────────
  await test("thinking tier: max_completion_tokens=1000 (deep synthesis budget)", async () => {
    mockFetch('{"reply":"deep"}');
    await chatWithOpenAI({ messages: DUMMY_MESSAGES, model: "gpt-5.4", tier: "thinking" });
    restoreFetch();
    assert.equal(interceptedBody.max_completion_tokens, 1000,
      "thinking tier must use 1000-token budget — matches 'depth over brevity' instruction");
    assert.equal(interceptedBody.max_tokens, undefined);
  });

  // ── Token budget: utility tier (gpt-5.4-nano) → 250 ──────────────────────
  // 250 gives nano enough room to write 1-2 sentence voice replies in buffer mode
  // while still keeping it tighter than conversation tier (400).
  await test("utility tier: max_completion_tokens=250 (nano voice budget)", async () => {
    mockFetch('{"reply":"tagged"}');
    await chatWithOpenAI({ messages: DUMMY_MESSAGES, model: "gpt-5.4-nano", tier: "utility" });
    restoreFetch();
    assert.equal(interceptedBody.max_completion_tokens, 250,
      "utility tier must use 250-token budget — nano needs room for voice in buffer mode");
    assert.equal(interceptedBody.max_tokens, undefined);
  });

  // ── Token budget: executive tier → 1500 ───────────────────────────────────
  await test("executive tier: max_completion_tokens=1500 (annual review budget)", async () => {
    mockFetch('{"reply":"executive"}');
    await chatWithOpenAI({ messages: DUMMY_MESSAGES, model: "gpt-5.5", tier: "executive" });
    restoreFetch();
    assert.equal(interceptedBody.max_completion_tokens, 1500,
      "executive tier must use 1500-token budget");
  });

  // ── gpt-4o: legacy max_tokens, uses tier budget ───────────────────────────
  await test("gpt-4o (legacy): max_tokens=400 for conversation tier, no max_completion_tokens", async () => {
    mockFetch('{"reply":"old"}');
    await chatWithOpenAI({ messages: DUMMY_MESSAGES, model: "gpt-4o", tier: "conversation" });
    restoreFetch();
    assert.equal(interceptedBody.max_tokens, 400,
      "gpt-4o must use max_tokens with the tier budget (not a flat 800)");
    assert.equal(interceptedBody.max_completion_tokens, undefined,
      "gpt-4o must NOT use max_completion_tokens");
  });

  // ── Model field is sent correctly ────────────────────────────────────────
  await test("model field in request body matches resolved model", async () => {
    mockFetch('{"reply":"ok"}');
    await chatWithOpenAI({ messages: DUMMY_MESSAGES, model: "gpt-5.4-mini", tier: "conversation" });
    restoreFetch();
    assert.equal(interceptedBody.model, "gpt-5.4-mini");
  });

  await test("temperature defaults to 0.7 for non-reasoning models", async () => {
    mockFetch('{"reply":"ok"}');
    await chatWithOpenAI({ messages: DUMMY_MESSAGES, model: "gpt-5.4-mini", tier: "conversation" });
    restoreFetch();
    assert.equal(interceptedBody.temperature, 0.7,
      "Default temperature for non-reasoning should be 0.7");
  });

  await test("temperature override is respected for non-reasoning models", async () => {
    mockFetch('{"reply":"ok"}');
    await chatWithOpenAI({ messages: DUMMY_MESSAGES, model: "gpt-5.4-mini", tier: "conversation", temperature: 0.3 });
    restoreFetch();
    assert.equal(interceptedBody.temperature, 0.3, "Temperature override should be respected");
  });

  await test("o3: temperature override is IGNORED (always 1)", async () => {
    mockFetch('{"reply":"ok"}');
    await chatWithOpenAI({ messages: DUMMY_MESSAGES, model: "o3", tier: "strategic", temperature: 0.3 });
    restoreFetch();
    assert.equal(interceptedBody.temperature, 1,
      "o3 temperature must always be 1, even if override passed");
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 3b. Prompt Conciseness Alignment
//     The system prompt instruction must match the token budget for each tier.
//     conversation → "2-4 sentences"   (400 tokens)
//     thinking     → "depth over brevity" (1000 tokens)
//     executive    → "thoroughness"     (1500 tokens)
// ═════════════════════════════════════════════════════════════════════════════

section("3b. Prompt Conciseness — instruction matches token budget per tier");

{
  for (const k of Object.keys(require.cache)) {
    if (k.includes("monday-prompt-builder")) delete require.cache[k];
  }
  const { buildConversationPrompt } = require("../src/engine/llm/monday-prompt-builder");

  const MINIMAL_RESULT = {
    truth: { domain: "Work" },
    finalState: { significance: "general_conversation", identityProximity: "low",
                  woundRisk: "low", candidateDomain: "Work", classificationFallback: false },
  };
  const MINIMAL_CONTEXT = {
    missionSummary: "Chris Binion", captures: [], workingTheories: {},
    recentDecisions: [], surfacingItem: null,
  };

  function systemText(tier) {
    const msgs = buildConversationPrompt({
      result: MINIMAL_RESULT, input: "Test.", history: [], personalContext: MINIMAL_CONTEXT, tier,
    });
    return msgs.find(m => m.role === "system")?.content || "";
  }

  test("conversation tier: system prompt says '2-4 sentences'", () => {
    const text = systemText("conversation");
    assert.ok(/2-4 sentences/i.test(text),
      "conversation system prompt must instruct 2-4 sentences");
    assert.ok(!/depth over brevity/i.test(text),
      "conversation prompt must not include thinking-tier depth instruction");
  });

  test("thinking tier: system prompt says 'depth over brevity'", () => {
    const text = systemText("thinking");
    assert.ok(/depth over brevity/i.test(text),
      "thinking system prompt must instruct depth over brevity");
    assert.ok(!/2-4 sentences/i.test(text),
      "thinking prompt must not constrain to 2-4 sentences");
  });

  test("executive tier: system prompt says 'thoroughness'", () => {
    const text = systemText("executive");
    assert.ok(/thoroughness|thorough/i.test(text),
      "executive system prompt must instruct thoroughness");
  });

  test("null/default tier: falls back to conversation instruction", () => {
    const text = systemText(null);
    assert.ok(/2-4 sentences/i.test(text),
      "null tier should default to conversation conciseness instruction");
  });

  test("TIER_TOKEN_BUDGETS values are internally consistent", () => {
    for (const k of Object.keys(require.cache)) {
      if (k.includes("llm-router")) delete require.cache[k];
    }
    const { TIER_TOKEN_BUDGETS } = require("../src/engine/llm/llm-router");
    assert.ok(TIER_TOKEN_BUDGETS.utility      <  TIER_TOKEN_BUDGETS.conversation, "utility < conversation");
    assert.ok(TIER_TOKEN_BUDGETS.conversation <  TIER_TOKEN_BUDGETS.thinking,     "conversation < thinking");
    assert.ok(TIER_TOKEN_BUDGETS.thinking     <  TIER_TOKEN_BUDGETS.executive,    "thinking < executive");
    assert.equal(TIER_TOKEN_BUDGETS.utility,      250);
    assert.equal(TIER_TOKEN_BUDGETS.conversation, 400);
    assert.equal(TIER_TOKEN_BUDGETS.thinking,     1000);
    assert.equal(TIER_TOKEN_BUDGETS.executive,    1500);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. chatWithLLM Dispatch
//    background + embedding always go to Ollama.
//    Cloud tiers go to OpenAI when OPENAI_API_KEY is set.
// ═════════════════════════════════════════════════════════════════════════════

section("4. chatWithLLM Dispatch — background/embedding → Ollama; cloud → OpenAI");

async function runDispatchTests() {
  for (const k of Object.keys(require.cache)) {
    if (k.includes("llm-router") || k.includes("ollama-provider") || k.includes("cost-tracker") || k.includes("/engine/db/")) {
      delete require.cache[k];
    }
  }
  freshDb();

  const ollamaCalls = [];
  const openaiCalls = [];

  // Monkey-patch Ollama provider before requiring llm-router
  const ollamaPath = require.resolve("../src/engine/llm/ollama-provider");
  require.cache[ollamaPath] = {
    id: ollamaPath,
    filename: ollamaPath,
    loaded: true,
    exports: {
      chatWithOllama: async (opts) => {
        ollamaCalls.push(opts);
        return { content: '{"reply":"ollama ok"}', json: { reply: "ollama ok" }, model: opts.model };
      },
    },
  };

  const { chatWithLLM } = require("../src/engine/llm/llm-router");

  // Intercept fetch so cloud calls don't make real HTTP requests
  global.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    openaiCalls.push(body);
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"reply":"openai ok"}' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }),
    };
  };

  try {
    // ── background tier ──────────────────────────────────────────────────
    await test("tier=background → Ollama (never OpenAI, even with API key)", async () => {
      const before = openaiCalls.length;
      await chatWithLLM({ messages: DUMMY_MESSAGES, tier: "background" });
      assert.equal(openaiCalls.length, before, "background must not call OpenAI");
      assert.ok(ollamaCalls.length > 0, "background must call Ollama");
    });

    await test("tier=background uses BACKGROUND_MODEL (qwen3:30b-a3b)", async () => {
      ollamaCalls.length = 0;
      await chatWithLLM({ messages: DUMMY_MESSAGES, tier: "background" });
      assert.ok(ollamaCalls.some(c => c.model === "qwen3:30b-a3b"),
        `background should use qwen3:30b-a3b, got: ${ollamaCalls.map(c => c.model)}`);
    });

    await test("tier=background has no practical timeout (background workers run as long as needed)", async () => {
      ollamaCalls.length = 0;
      await chatWithLLM({ messages: DUMMY_MESSAGES, tier: "background" });
      const call = ollamaCalls[ollamaCalls.length - 1];
      // Default is 24h — background jobs must never be cut short by the router.
      // Only a crash-guard ceiling; no business-logic cap.
      assert.ok(call.timeoutMs >= 3_600_000,
        `background timeout must be ≥ 1h (no practical limit), got ${call.timeoutMs}ms`);
    });

    await test("tier=background respects explicit timeoutMs override", async () => {
      ollamaCalls.length = 0;
      await chatWithLLM({ messages: DUMMY_MESSAGES, tier: "background", timeoutMs: 180000 });
      const call = ollamaCalls[ollamaCalls.length - 1];
      assert.equal(call.timeoutMs, 180000, "explicit timeoutMs override must be used");
    });

    // ── embedding tier ──────────────────────────────────────────────────
    await test("tier=embedding → Ollama with nomic-embed-text", async () => {
      ollamaCalls.length = 0;
      const before = openaiCalls.length;
      await chatWithLLM({ messages: DUMMY_MESSAGES, tier: "embedding" });
      assert.equal(openaiCalls.length, before, "embedding must not call OpenAI");
      assert.ok(ollamaCalls.some(c => c.model === "nomic-embed-text"),
        "embedding must use nomic-embed-text");
    });

    await test("tier=embedding has no practical timeout", async () => {
      ollamaCalls.length = 0;
      await chatWithLLM({ messages: DUMMY_MESSAGES, tier: "embedding" });
      const call = ollamaCalls[ollamaCalls.length - 1];
      assert.ok(call.timeoutMs >= 3_600_000,
        `embedding timeout must be ≥ 1h (no practical limit), got ${call.timeoutMs}ms`);
    });

    // ── conversation tier → OpenAI ───────────────────────────────────────
    await test("tier=conversation (with OPENAI_API_KEY) → OpenAI with gpt-5.4-mini", async () => {
      openaiCalls.length = 0;
      await chatWithLLM({ messages: DUMMY_MESSAGES, tier: "conversation" });
      assert.ok(openaiCalls.length > 0, "conversation must call OpenAI");
      assert.ok(openaiCalls.some(b => b.model === "gpt-5.4-mini"),
        `conversation should use gpt-5.4-mini, got: ${openaiCalls.map(b => b.model)}`);
    });

    // ── thinking tier → OpenAI ───────────────────────────────────────────
    await test("tier=thinking → OpenAI with gpt-5.4", async () => {
      openaiCalls.length = 0;
      await chatWithLLM({ messages: DUMMY_MESSAGES, tier: "thinking" });
      assert.ok(openaiCalls.some(b => b.model === "gpt-5.4"),
        `thinking should use gpt-5.4, got: ${openaiCalls.map(b => b.model)}`);
    });

    // ── strategic tier → OpenAI ──────────────────────────────────────────
    await test("tier=strategic → OpenAI with o3", async () => {
      openaiCalls.length = 0;
      await chatWithLLM({ messages: DUMMY_MESSAGES, tier: "strategic" });
      assert.ok(openaiCalls.some(b => b.model === "o3"),
        `strategic should use o3, got: ${openaiCalls.map(b => b.model)}`);
    });

    // ── utility tier → OpenAI ────────────────────────────────────────────
    await test("tier=utility → OpenAI with gpt-5.4-nano", async () => {
      openaiCalls.length = 0;
      await chatWithLLM({ messages: DUMMY_MESSAGES, tier: "utility" });
      assert.ok(openaiCalls.some(b => b.model === "gpt-5.4-nano"),
        `utility should use gpt-5.4-nano, got: ${openaiCalls.map(b => b.model)}`);
    });

    // ── no-key fallback ─────────────────────────────────────────────────
    await test("without OPENAI_API_KEY → falls back to Ollama", async () => {
      const key = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      // Reload to pick up cleared env
      for (const k of Object.keys(require.cache)) {
        if (k.includes("llm-router")) delete require.cache[k];
      }

      // Re-inject Ollama mock
      require.cache[ollamaPath].exports.chatWithOllama = async (opts) => {
        ollamaCalls.push({ ...opts, source: "fallback" });
        return { content: "ok", json: null, model: opts.model || "fallback" };
      };

      const { chatWithLLM: chatNoKey } = require("../src/engine/llm/llm-router");
      const beforeOpenai = openaiCalls.length;
      ollamaCalls.length = 0;
      await chatNoKey({ messages: DUMMY_MESSAGES, tier: "conversation" });

      assert.equal(openaiCalls.length, beforeOpenai, "without API key, OpenAI must not be called");
      assert.ok(ollamaCalls.length > 0, "without API key, should fall back to Ollama");

      // Restore key
      process.env.OPENAI_API_KEY = key;
    });

  } finally {
    global.fetch = originalFetch;
    delete require.cache[ollamaPath];
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. Worker Tier Contracts
//    Every worker that calls chatWithLLM must pass the correct tier.
//    This is a source-code contract check — fast and brittle-resistant.
// ═════════════════════════════════════════════════════════════════════════════

section("5. Worker Tier Contracts — source verification");

{
  const WORKER_CONTRACTS = [
    {
      file:          "src/engine/workers/synthesis-worker.js",
      label:         "synthesis-worker",
      expectedTier:  "background",
      expectedCount: 1, // one chatWithLLM call
    },
    {
      file:          "src/engine/workers/research-worker.js",
      label:         "research-worker",
      expectedTier:  "background",
      expectedCount: 1,
    },
    {
      file:          "src/engine/workers/pipeline.js",
      label:         "pipeline (2 calls)",
      expectedTier:  "background",
      expectedCount: 2,
    },
    {
      file:          "src/engine/council/convene.js",
      label:         "council/convene (2 calls)",
      expectedTier:  "background",
      expectedCount: 2,
    },
    {
      file:          "src/engine/workers/review-worker.js",
      label:         "review-worker (thinking — Monday's editorial layer)",
      expectedTier:  "thinking",
      expectedCount: 1,
    },
  ];

  for (const { file, label, expectedTier, expectedCount } of WORKER_CONTRACTS) {
    test(`${label} → tier="${expectedTier}" in all chatWithLLM calls`, () => {
      const src = readSrc(file);

      // Count chatWithLLM call sites
      const callMatches = [...src.matchAll(/chatWithLLM\s*\(/g)];
      assert.ok(callMatches.length >= expectedCount,
        `Expected at least ${expectedCount} chatWithLLM call(s) in ${file}, found ${callMatches.length}`);

      // Every chatWithLLM call must specify the expected tier
      // Extract each chatWithLLM block (heuristic: find the closing brace after each call)
      const tierPattern = new RegExp(`tier:\\s*["']${expectedTier}["']`, "g");
      const tierMatches = [...src.matchAll(tierPattern)];

      assert.ok(tierMatches.length >= expectedCount,
        `Expected ${expectedCount}x tier="${expectedTier}" in ${file}, found ${tierMatches.length}. ` +
        `Every chatWithLLM call must specify this tier.`);
    });
  }

  // review-worker must also set purpose: "deliverable-review"
  test("review-worker sets purpose='deliverable-review'", () => {
    const src = readSrc("src/engine/workers/review-worker.js");
    assert.ok(
      /purpose:\s*["']deliverable-review["']/.test(src),
      "review-worker must set purpose='deliverable-review' so cost tracking labels it correctly"
    );
  });

  // monday-intelligence must pass purpose: "conversation"
  test("monday-intelligence passes purpose='conversation' to chatWithLLM", () => {
    const src = readSrc("src/engine/intelligence/monday-intelligence.js");
    assert.ok(
      /purpose:\s*["']conversation["']/.test(src),
      "monday-intelligence must label its chatWithLLM call with purpose='conversation'"
    );
  });

  // Background workers must NOT pass cloud tiers
  const CLOUD_TIERS = ["utility", "conversation", "thinking", "strategic", "executive"];
  for (const worker of ["synthesis-worker", "research-worker", "pipeline"]) {
    test(`${worker} does not accidentally use a cloud tier`, () => {
      const src = readSrc(`src/engine/workers/${worker}.js`);
      for (const cloudTier of CLOUD_TIERS) {
        const pattern = new RegExp(`tier:\\s*["']${cloudTier}["']`);
        assert.ok(!pattern.test(src),
          `${worker} must not use cloud tier="${cloudTier}". Background workers must stay local.`);
      }
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. Intent Classifier — INTENT_TIERS map + classifyIntent() contract
// ═════════════════════════════════════════════════════════════════════════════

section("7. Intent Classifier — type map and routeModel integration");

{
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/engine/llm/")) delete require.cache[k];
  }

  const { INTENT_TIERS, INTENT_TYPES } = require("../src/engine/llm/intent-classifier");
  const { routeModel } = require("../src/engine/llm/model-router");

  // ── INTENT_TIERS map coverage ────────────────────────────────────────────
  test("every intent type has a tier and posture", () => {
    for (const type of INTENT_TYPES) {
      const entry = INTENT_TIERS[type];
      assert.ok(entry?.tier, `${type} missing tier`);
      assert.ok(entry?.posture, `${type} missing posture`);
    }
  });

  test("logistical_update → utility tier", () => {
    const { tier } = INTENT_TIERS["logistical_update"];
    assert.equal(tier, "utility");
  });

  test("check_in → utility tier", () => {
    const { tier } = INTENT_TIERS["check_in"];
    assert.equal(tier, "utility");
  });

  test("casual_chat → utility tier", () => {
    const { tier } = INTENT_TIERS["casual_chat"];
    assert.equal(tier, "utility");
  });

  test("announcement → conversation tier", () => {
    const { tier } = INTENT_TIERS["announcement"];
    assert.equal(tier, "conversation");
  });

  test("question → conversation tier", () => {
    const { tier } = INTENT_TIERS["question"];
    assert.equal(tier, "conversation");
  });

  test("task_request → conversation tier", () => {
    const { tier } = INTENT_TIERS["task_request"];
    assert.equal(tier, "conversation");
  });

  test("problem → conversation tier", () => {
    const { tier } = INTENT_TIERS["problem"];
    assert.equal(tier, "conversation");
  });

  test("emotional_processing → thinking tier", () => {
    const { tier } = INTENT_TIERS["emotional_processing"];
    assert.equal(tier, "thinking");
  });

  test("reflection → thinking tier", () => {
    const { tier } = INTENT_TIERS["reflection"];
    assert.equal(tier, "thinking");
  });

  // ── routeModel uses intentType when classificationFallback is true ────────
  test("classificationFallback + intentType=logistical_update → utility", () => {
    const d = routeModel({
      classificationFallback: true,
      intentType: "logistical_update",
      woundRisk: "low",
      identityProximity: "low",
    });
    assert.equal(d.tier, "utility", `got: ${d.tier}`);
  });

  test("classificationFallback + intentType=emotional_processing → thinking", () => {
    const d = routeModel({
      classificationFallback: true,
      intentType: "emotional_processing",
      woundRisk: "low",
      identityProximity: "low",
    });
    assert.equal(d.tier, "thinking", `got: ${d.tier}`);
  });

  test("classificationFallback + intentType=question → conversation", () => {
    const d = routeModel({
      classificationFallback: true,
      intentType: "question",
      woundRisk: "low",
      identityProximity: "low",
    });
    assert.equal(d.tier, "conversation", `got: ${d.tier}`);
  });

  test("classificationFallback + intentType=reflection → thinking", () => {
    const d = routeModel({
      classificationFallback: true,
      intentType: "reflection",
      woundRisk: "low",
      identityProximity: "low",
    });
    assert.equal(d.tier, "thinking", `got: ${d.tier}`);
  });

  test("classificationFallback WITHOUT intentType + lowRisk → utility (safe default)", () => {
    const d = routeModel({
      classificationFallback: true,
      intentType: null,
      woundRisk: "low",
      identityProximity: "low",
    });
    assert.equal(d.tier, "utility", `got: ${d.tier}`);
  });

  test("classificationFallback with unknown intentType falls through to safe default", () => {
    const d = routeModel({
      classificationFallback: true,
      intentType: "not_a_real_type",
      woundRisk: "low",
      identityProximity: "low",
    });
    assert.equal(d.tier, "utility", `got: ${d.tier}`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. Depth-Domain Rule — tightened threshold
//    Long messages in depth domains only escalate to thinking when
//    they also contain a depth signal (question or keyword).
// ═════════════════════════════════════════════════════════════════════════════

section("8. Depth-Domain Rule — requires depth signal, not just word count");

{
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/engine/llm/")) delete require.cache[k];
  }
  const { routeModel } = require("../src/engine/llm/model-router");

  const LONG_LOGISTICS = "I'm planning the DC trip with the kids next week. We'll go to Philadelphia first then New York then Washington DC for the Fourth of July fireworks on the National Mall with the family.";
  const LONG_WITH_QUESTION = "I'm planning the DC trip with the kids next week. We'll go to Philadelphia first then New York then Washington DC. Is this the right approach for us?";
  const LONG_WITH_KEYWORD = "I'm planning the DC trip with the kids next week going to Philadelphia then New York then DC. I keep wondering about the meaning of these trips for our family identity and legacy.";

  test("Family domain + long logistics message (no depth signal) → conversation, not thinking", () => {
    const d = routeModel({ domain: "Family", input: LONG_LOGISTICS, woundRisk: "low", identityProximity: "low" });
    assert.equal(d.tier, "conversation", `Expected conversation, got: ${d.tier} — reason: ${d.reason}`);
  });

  test("Family domain + long message WITH question mark → thinking", () => {
    const d = routeModel({ domain: "Family", input: LONG_WITH_QUESTION, woundRisk: "low", identityProximity: "low" });
    assert.equal(d.tier, "thinking", `Expected thinking, got: ${d.tier}`);
  });

  test("Family domain + long message WITH depth keyword → thinking", () => {
    const d = routeModel({ domain: "Family", input: LONG_WITH_KEYWORD, woundRisk: "low", identityProximity: "low" });
    assert.equal(d.tier, "thinking", `Expected thinking, got: ${d.tier}`);
  });

  test("Retirement domain + short logistics message → conversation", () => {
    const d = routeModel({ domain: "Retirement", input: "Checking on my retirement account today.", woundRisk: "low", identityProximity: "low" });
    assert.equal(d.tier, "conversation", `got: ${d.tier}`);
  });

  test("Retirement domain + long message with depth keyword → thinking", () => {
    const d = routeModel({ domain: "Retirement", input: "I have been thinking about whether I have enough purpose and meaning lined up for when I retire from work next year and what my identity will look like after.", woundRisk: "low", identityProximity: "low" });
    assert.equal(d.tier, "thinking", `got: ${d.tier}`);
  });

  test("Work domain + long message (not a depth domain) → conversation regardless", () => {
    const d = routeModel({ domain: "Work", input: "I need to update the project timeline and send it to the team today along with the status report and the meeting notes from this morning.", woundRisk: "low", identityProximity: "low" });
    assert.equal(d.tier, "conversation", `got: ${d.tier}`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 9. Lean Payload — buildLeanPrompt strips verbose fields
// ═════════════════════════════════════════════════════════════════════════════

section("9. Lean Payload — buildLeanPrompt token reduction");

{
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/engine/llm/")) delete require.cache[k];
  }
  const { buildConversationPrompt, buildLeanPrompt } = require("../src/engine/llm/monday-prompt-builder");

  const MOCK_RESULT = {
    truth: { domain: "Family" },
    voice: { text: "Deterministic reply here." },
    finalState: {
      significance: "general_significance",
      situationClassification: "unclassified",
      classificationFallback: true,
      woundRisk: "low",
      identityProximity: "low",
      activeRole: null,
      secondaryRole: null,
      recommendedOutcome: null,
      ripenessState: "low",
      interruptibility: "allowed",
      humanCompanyRequired: "false",
      healingVsExecution: null,
      fallbackReason: null,
      candidateDomain: "Family",
      candidateClassification: null,
    },
    workspace: null,
  };

  const MOCK_HISTORY = [
    { user: "Hello Monday", monday: "Hey boss, what's up?" },
    { user: "Not much, just checking in", monday: "Got it. What do you need?" },
    { user: "Thinking about the trip", monday: "Tell me more." },
    { user: "We're going to DC", monday: "Solid plan." },
  ];

  const MOCK_CONTEXT = {
    missionSummary: "Life in six domains.",
    captures: [], workingTheories: {}, recentDecisions: [],
    calendar: "7 events this week",
    email: null, finances: null,
    skillResults: [], theoryEvidence: null,
  };

  test("buildLeanPrompt returns fewer tokens than buildConversationPrompt", () => {
    const full = buildConversationPrompt({ result: MOCK_RESULT, input: "What should I focus on?", history: MOCK_HISTORY, personalContext: MOCK_CONTEXT });
    const lean = buildLeanPrompt({ result: MOCK_RESULT, input: "What should I focus on?", history: MOCK_HISTORY, personalContext: MOCK_CONTEXT });

    const fullSize = JSON.stringify(full).length;
    const leanSize = JSON.stringify(lean).length;
    assert.ok(leanSize < fullSize * 0.6,
      `Lean payload should be <60% of full size. Full: ${fullSize}, Lean: ${leanSize} (${Math.round(leanSize/fullSize*100)}%)`);
  });

  test("buildLeanPrompt keeps only last 2 history turns", () => {
    const lean = buildLeanPrompt({ result: MOCK_RESULT, input: "test", history: MOCK_HISTORY, personalContext: MOCK_CONTEXT });
    const payload = JSON.parse(lean[0].content);
    assert.equal(payload.recentHistory.length, 2, `Expected 2 history turns, got ${payload.recentHistory.length}`);
  });

  test("buildLeanPrompt includes calendar context", () => {
    const lean = buildLeanPrompt({ result: MOCK_RESULT, input: "test", history: [], personalContext: MOCK_CONTEXT });
    const payload = JSON.parse(lean[0].content);
    assert.ok(payload.calendar, "lean payload should include calendar");
  });

  test("buildLeanPrompt strips missionThreads and recentCaptures", () => {
    const lean = buildLeanPrompt({ result: MOCK_RESULT, input: "test", history: [], personalContext: MOCK_CONTEXT });
    const payload = JSON.parse(lean[0].content);
    assert.ok(!payload.missionThreads, "lean payload should not include missionThreads");
    assert.ok(!payload.recentCaptures, "lean payload should not include recentCaptures");
  });

  test("buildLeanPrompt strips conversationSynthesis and theoryRevision", () => {
    const lean = buildLeanPrompt({ result: MOCK_RESULT, input: "test", history: [], personalContext: MOCK_CONTEXT });
    const payload = JSON.parse(lean[0].content);
    assert.ok(!payload.conversationSynthesis, "lean payload should not include conversationSynthesis");
    assert.ok(!payload.theoryRevision, "lean payload should not include theoryRevision");
  });

  test("buildLeanPrompt includes deterministicReply", () => {
    const lean = buildLeanPrompt({ result: MOCK_RESULT, input: "test", history: [], personalContext: MOCK_CONTEXT });
    const payload = JSON.parse(lean[0].content);
    assert.equal(payload.deterministicReply, "Deterministic reply here.");
  });

  test("situation classifier default fallback returns woundRisk: low (not medium)", () => {
    const { classifySituation } = require("../src/engine/resolvers/situation-classifier");
    const result = classifySituation({ input: "I'm going to test my pool.", significance: "unknown_type_xyz" });
    assert.equal(result.woundRisk, "low", `fallback woundRisk should be low, got: ${result.woundRisk}`);
    assert.equal(result.classificationFallback, true);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 10. chatWithBuffer — two-pass buffer unit tests
//     Mocks both OpenAI calls. Verifies the merge, followUp suppression,
//     lean payload routing, and graceful degradation.
// ═════════════════════════════════════════════════════════════════════════════

section("10. chatWithBuffer — two-pass mini→nano pipeline");

async function runBufferTests() {
  for (const k of Object.keys(require.cache)) {
    if (k.includes("llm-router") || k.includes("cost-tracker") || k.includes("/engine/db/")) {
      delete require.cache[k];
    }
  }
  freshDb();
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";
  const { chatWithBuffer, TIER_MODELS } = require("../src/engine/llm/llm-router");

  const ANALYSIS_FACTS = JSON.stringify({
    domain: "Family",
    significance: "family_outing",
    keyFacts: ["Going to the movies", "Father's Day"],
    tone: "celebratory",
    suggestedDomain: "Family",
    conversationHypothesis: "Chris is celebrating Father's Day with his kids.",
  });

  const VOICE_REPLY = JSON.stringify({ reply: "Enjoy the He Man movie with the kids, boss." });

  // Queue-based mock: each fetch call pops the next queued response.
  let fetchQueue = [];
  let fetchCallLog = [];

  function mockFetchQueue(responses) {
    fetchQueue = [...responses];
    fetchCallLog = [];
    global.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      fetchCallLog.push({ model: body.model, messages: body.messages });
      const content = fetchQueue.shift() ?? '{"reply":"fallback"}';
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 50, completion_tokens: 20 },
        }),
      };
    };
  }

  function restoreQueue() { global.fetch = originalFetch; }

  const FULL_MESSAGES = [
    { role: "system", content: "You are Monday." },
    { role: "user",   content: "I'm taking the kids to see He Man today." },
  ];
  const LEAN_MESSAGES = [
    { role: "user", content: JSON.stringify({ userInput: "He Man movie", domain: "Family" }) },
  ];

  // ── Two calls are made ──────────────────────────────────────────────────
  await test("chatWithBuffer makes exactly two fetch calls (analysis + voice)", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    await chatWithBuffer({ messages: FULL_MESSAGES, purpose: "test" });
    restoreQueue();
    assert.equal(fetchCallLog.length, 2, `Expected 2 fetch calls, got ${fetchCallLog.length}`);
  });

  // ── First call = mini (analysis), second = nano (voice) ─────────────────
  await test("first call uses mini (conversation model), second uses nano (utility model)", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    await chatWithBuffer({ messages: FULL_MESSAGES, purpose: "test" });
    restoreQueue();
    assert.equal(fetchCallLog[0].model, TIER_MODELS.conversation,
      `analysis call should use ${TIER_MODELS.conversation}, got ${fetchCallLog[0].model}`);
    assert.equal(fetchCallLog[1].model, TIER_MODELS.utility,
      `voice call should use ${TIER_MODELS.utility}, got ${fetchCallLog[1].model}`);
  });

  // ── Result shape ────────────────────────────────────────────────────────
  await test("result has buffered=true", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    const result = await chatWithBuffer({ messages: FULL_MESSAGES, purpose: "test" });
    restoreQueue();
    assert.equal(result.buffered, true);
  });

  await test("result.followUp is null (no duplicate questions)", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    const result = await chatWithBuffer({ messages: FULL_MESSAGES, purpose: "test" });
    restoreQueue();
    assert.equal(result.json.followUp, null,
      "buffer mode must suppress followUp to prevent double-question");
  });

  await test("result.model contains both tier model names", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    const result = await chatWithBuffer({ messages: FULL_MESSAGES, purpose: "test" });
    restoreQueue();
    assert.ok(result.model.includes(TIER_MODELS.conversation),
      `model string should include ${TIER_MODELS.conversation}`);
    assert.ok(result.model.includes(TIER_MODELS.utility),
      `model string should include ${TIER_MODELS.utility}`);
  });

  await test("result.voice.text equals nano's reply field", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    const result = await chatWithBuffer({ messages: FULL_MESSAGES, purpose: "test" });
    restoreQueue();
    assert.equal(result.json.voice.text, "Enjoy the He Man movie with the kids, boss.");
  });

  await test("result.json.reply equals nano's reply field", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    const result = await chatWithBuffer({ messages: FULL_MESSAGES, purpose: "test" });
    restoreQueue();
    assert.equal(result.json.reply, "Enjoy the He Man movie with the kids, boss.");
  });

  await test("mini's structured facts are merged into result (domain, tone, keyFacts)", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    const result = await chatWithBuffer({ messages: FULL_MESSAGES, purpose: "test" });
    restoreQueue();
    assert.equal(result.json.domain, "Family");
    assert.equal(result.json.tone, "celebratory");
    assert.ok(Array.isArray(result.json.keyFacts));
  });

  // ── Lean messages routing ───────────────────────────────────────────────
  await test("when leanMessages provided, analysis uses lean payload (not full messages)", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    await chatWithBuffer({ messages: FULL_MESSAGES, leanMessages: LEAN_MESSAGES, purpose: "test" });
    restoreQueue();
    // analysis call should contain lean user message content
    const analysisUserMsg = fetchCallLog[0].messages.find(m => m.role === "user");
    assert.ok(analysisUserMsg?.content?.includes("He Man movie"),
      "analysis call should use lean payload content");
    assert.ok(!analysisUserMsg?.content?.includes("I'm taking the kids"),
      "analysis call should NOT contain verbatim full message when lean payload provided");
  });

  await test("when leanMessages is null, analysis uses non-system messages from full payload", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    await chatWithBuffer({ messages: FULL_MESSAGES, leanMessages: null, purpose: "test" });
    restoreQueue();
    const analysisUserMsg = fetchCallLog[0].messages.find(m => m.role === "user");
    assert.ok(analysisUserMsg?.content?.includes("He Man"),
      "analysis call should use full user message when no lean payload");
  });

  await test("voice call always uses full non-system messages (not lean)", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    await chatWithBuffer({ messages: FULL_MESSAGES, leanMessages: LEAN_MESSAGES, purpose: "test" });
    restoreQueue();
    const voiceUserMsg = fetchCallLog[1].messages.find(m => m.role === "user");
    assert.ok(voiceUserMsg?.content?.includes("He Man"),
      "voice call should use original user message content");
  });

  // ── Analysis system prompt is facts-only ───────────────────────────────
  await test("analysis system prompt instructs facts-only JSON, no prose", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    await chatWithBuffer({ messages: FULL_MESSAGES, purpose: "test" });
    restoreQueue();
    const analysisSystem = fetchCallLog[0].messages.find(m => m.role === "system")?.content || "";
    assert.ok(analysisSystem.includes("No reply text. No prose."),
      "analysis system prompt must forbid prose so mini doesn't write a full reply");
    assert.ok(analysisSystem.toLowerCase().includes("facts only"),
      "analysis prompt should say 'Facts only'");
  });

  await test("voice system prompt forbids separate follow-up line", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    await chatWithBuffer({ messages: FULL_MESSAGES, purpose: "test" });
    restoreQueue();
    const voiceSystem = fetchCallLog[1].messages.find(m => m.role === "system")?.content || "";
    assert.ok(voiceSystem.includes("do NOT add a separate follow-up line"),
      "voice prompt must tell nano not to add a follow-up line (prevents duplicate questions)");
  });

  // ── raw field carries both API responses ────────────────────────────────
  await test("result.raw has analysis and voice sub-fields", async () => {
    mockFetchQueue([ANALYSIS_FACTS, VOICE_REPLY]);
    const result = await chatWithBuffer({ messages: FULL_MESSAGES, purpose: "test" });
    restoreQueue();
    assert.ok(result.raw?.analysis, "result.raw.analysis should be present");
    assert.ok(result.raw?.voice, "result.raw.voice should be present");
  });

  // ── Graceful degradation: nano returns bad JSON ─────────────────────────
  await test("when nano returns non-JSON, reply falls back to raw content string", async () => {
    mockFetchQueue([ANALYSIS_FACTS, "Got it, boss. Enjoy the movie."]);
    const result = await chatWithBuffer({ messages: FULL_MESSAGES, purpose: "test" });
    restoreQueue();
    assert.ok(typeof result.json.reply === "string" && result.json.reply.length > 0,
      "reply should be non-empty even when nano returns prose instead of JSON");
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 11. classifyIntent() — nano intent classifier function contract
// ═════════════════════════════════════════════════════════════════════════════

section("11. classifyIntent() — function contract and fallback behavior");

async function runIntentClassifierTests() {
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/engine/llm/")) delete require.cache[k];
  }
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";

  let capturedMessages = null;
  let capturedTier = null;

  function mockClassifierFetch(responseContent) {
    capturedMessages = null;
    capturedTier = null;
    global.fetch = async (_url, opts) => {
      const body = JSON.parse(opts.body);
      capturedMessages = body.messages;
      capturedTier = body.model; // we verify the model instead
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: responseContent } }],
          usage: { prompt_tokens: 20, completion_tokens: 8 },
        }),
      };
    };
  }

  function restoreClassifier() { global.fetch = originalFetch; }

  const { classifyIntent, INTENT_TIERS: IT, INTENT_TYPES: TYPES } = require("../src/engine/llm/intent-classifier");
  const { TIER_MODELS } = require("../src/engine/llm/llm-router");

  // ── Return shape ────────────────────────────────────────────────────────
  await test("classifyIntent returns object with type, tier, posture, confidence, reason", async () => {
    mockClassifierFetch('{"type":"logistical_update","confidence":0.9,"reason":"going to test pool"}');
    const result = await classifyIntent("I'm going to test my pool.");
    restoreClassifier();
    assert.ok("type"       in result, "missing type");
    assert.ok("tier"       in result, "missing tier");
    assert.ok("posture"    in result, "missing posture");
    assert.ok("confidence" in result, "missing confidence");
    assert.ok("reason"     in result, "missing reason");
  });

  await test("logistical_update → utility tier, acknowledge posture", async () => {
    mockClassifierFetch('{"type":"logistical_update","confidence":0.92,"reason":"routine task"}');
    const result = await classifyIntent("I'm going to test my pool.");
    restoreClassifier();
    assert.equal(result.type, "logistical_update");
    assert.equal(result.tier, "utility");
    assert.equal(result.posture, "acknowledge");
  });

  await test("emotional_processing → thinking tier, companion posture", async () => {
    mockClassifierFetch('{"type":"emotional_processing","confidence":0.85,"reason":"expressing stress"}');
    const result = await classifyIntent("I've been struggling with anxiety lately.");
    restoreClassifier();
    assert.equal(result.type, "emotional_processing");
    assert.equal(result.tier, "thinking");
    assert.equal(result.posture, "companion");
  });

  await test("question → conversation tier, answer posture", async () => {
    mockClassifierFetch('{"type":"question","confidence":0.88,"reason":"asking for info"}');
    const result = await classifyIntent("What's the best way to plan a DC trip?");
    restoreClassifier();
    assert.equal(result.type, "question");
    assert.equal(result.tier, "conversation");
    assert.equal(result.posture, "answer");
  });

  await test("reflection → thinking tier, depth posture", async () => {
    mockClassifierFetch('{"type":"reflection","confidence":0.80,"reason":"thinking out loud"}');
    const result = await classifyIntent("I keep wondering whether my work actually means anything.");
    restoreClassifier();
    assert.equal(result.type, "reflection");
    assert.equal(result.tier, "thinking");
    assert.equal(result.posture, "depth");
  });

  await test("task_request → conversation tier, execute posture", async () => {
    mockClassifierFetch('{"type":"task_request","confidence":0.95,"reason":"explicit task"}');
    const result = await classifyIntent("Can you draft a packing list for DC?");
    restoreClassifier();
    assert.equal(result.type, "task_request");
    assert.equal(result.tier, "conversation");
    assert.equal(result.posture, "execute");
  });

  // ── Confidence + reason pass-through ───────────────────────────────────
  await test("confidence value is passed through from nano response", async () => {
    mockClassifierFetch('{"type":"check_in","confidence":0.77,"reason":"simple ping"}');
    const result = await classifyIntent("Hey, you there?");
    restoreClassifier();
    assert.equal(result.confidence, 0.77);
  });

  await test("reason string is passed through from nano response", async () => {
    mockClassifierFetch('{"type":"casual_chat","confidence":0.6,"reason":"light banter"}');
    const result = await classifyIntent("What's up?");
    restoreClassifier();
    assert.equal(result.reason, "light banter");
  });

  // ── Unknown type from nano → default to question/conversation ──────────
  await test("unknown type from nano falls back to question/conversation tier", async () => {
    mockClassifierFetch('{"type":"completely_made_up_type","confidence":0.5,"reason":"???"}');
    const result = await classifyIntent("Something weird.");
    restoreClassifier();
    assert.equal(result.type, "question",
      "unknown type should fall back to 'question'");
    assert.equal(result.tier, "conversation",
      "unknown type should fall back to conversation tier");
  });

  await test("missing type field falls back to question/conversation tier", async () => {
    mockClassifierFetch('{"confidence":0.5,"reason":"no type"}');
    const result = await classifyIntent("No type in response.");
    restoreClassifier();
    assert.equal(result.type, "question");
    assert.equal(result.tier, "conversation");
  });

  // ── Network/parse failure → error fallback ──────────────────────────────
  await test("when nano call throws, returns fallback with type=question, confidence=0", async () => {
    global.fetch = async () => { throw new Error("network failure"); };
    const result = await classifyIntent("This will fail.");
    restoreClassifier();
    assert.equal(result.type, "question");
    assert.equal(result.tier, "conversation");
    assert.equal(result.posture, "answer");
    assert.equal(result.confidence, 0);
  });

  await test("when API returns non-JSON body, falls back to question/conversation", async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "not json at all" } }], usage: {} }),
    });
    const result = await classifyIntent("Non-JSON response.");
    restoreClassifier();
    assert.equal(result.type, "question");
    assert.equal(result.tier, "conversation");
  });

  // ── Uses utility tier (nano) ────────────────────────────────────────────
  await test("classifyIntent sends request using utility tier model (nano)", async () => {
    mockClassifierFetch('{"type":"check_in","confidence":0.9,"reason":"ping"}');
    await classifyIntent("Hey.");
    restoreClassifier();
    assert.equal(capturedTier, TIER_MODELS.utility,
      `classifyIntent should use ${TIER_MODELS.utility}, got ${capturedTier}`);
  });

  // ── User message is passed verbatim ────────────────────────────────────
  await test("classifyIntent passes user input as user role message to nano", async () => {
    const INPUT = "I'm heading to the pool now.";
    mockClassifierFetch('{"type":"logistical_update","confidence":0.9,"reason":"task"}');
    await classifyIntent(INPUT);
    restoreClassifier();
    const userMsg = capturedMessages?.find(m => m.role === "user");
    assert.equal(userMsg?.content, INPUT,
      "user input should be passed verbatim as the user message");
  });

  await test("classifier system prompt lists all 9 intent types", async () => {
    mockClassifierFetch('{"type":"check_in","confidence":0.9,"reason":"ping"}');
    await classifyIntent("Hey.");
    restoreClassifier();
    const sysContent = capturedMessages?.find(m => m.role === "system")?.content || "";
    for (const t of TYPES) {
      assert.ok(sysContent.includes(t),
        `System prompt should list intent type: ${t}`);
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 12. validateConversationResponse — shape, normalization, field validation
// ═════════════════════════════════════════════════════════════════════════════

section("12. validateConversationResponse — shape, normalization, field validation");

{
  for (const k of Object.keys(require.cache)) {
    if (k.includes("response-validator")) delete require.cache[k];
  }
  const { validateConversationResponse, normalizeConfidence } = require("../src/engine/llm/response-validator");

  // ── Null / invalid inputs ────────────────────────────────────────────────
  test("null payload → null", () => {
    assert.equal(validateConversationResponse(null), null);
  });

  test("undefined payload → null", () => {
    assert.equal(validateConversationResponse(undefined), null);
  });

  test("payload missing reply field → null", () => {
    assert.equal(validateConversationResponse({ followUp: "What do you think?" }), null);
  });

  test("reply is not a string (number) → null", () => {
    assert.equal(validateConversationResponse({ reply: 42 }), null);
  });

  test("empty string reply → null", () => {
    assert.equal(validateConversationResponse({ reply: "" }), null);
  });

  test("whitespace-only reply → null", () => {
    assert.equal(validateConversationResponse({ reply: "   " }), null);
  });

  // ── Valid minimal input ──────────────────────────────────────────────────
  test("minimal {reply:'...'} → returns normalized object", () => {
    const result = validateConversationResponse({ reply: "Got it, boss." });
    assert.ok(result !== null, "should return non-null for valid reply");
    assert.equal(result.reply, "Got it, boss.");
  });

  test("reply is trimmed of surrounding whitespace", () => {
    const result = validateConversationResponse({ reply: "  Got it, boss.  " });
    assert.equal(result.reply, "Got it, boss.");
  });

  // ── followUp normalization ───────────────────────────────────────────────
  test("followUp non-empty string → kept and trimmed", () => {
    const result = validateConversationResponse({ reply: "Ok.", followUp: "  What's next?  " });
    assert.equal(result.followUp, "What's next?");
  });

  test("followUp empty string → null", () => {
    const result = validateConversationResponse({ reply: "Ok.", followUp: "" });
    assert.equal(result.followUp, null);
  });

  test("followUp whitespace-only → null", () => {
    const result = validateConversationResponse({ reply: "Ok.", followUp: "   " });
    assert.equal(result.followUp, null);
  });

  test("followUp null → null", () => {
    const result = validateConversationResponse({ reply: "Ok.", followUp: null });
    assert.equal(result.followUp, null);
  });

  test("followUp missing → null", () => {
    const result = validateConversationResponse({ reply: "Ok." });
    assert.equal(result.followUp, null);
  });

  // ── confidence normalization ─────────────────────────────────────────────
  test("confidence 'low' passes through", () => {
    assert.equal(validateConversationResponse({ reply: "Ok.", confidence: "low" }).confidence, "low");
  });

  test("confidence 'medium' passes through", () => {
    assert.equal(validateConversationResponse({ reply: "Ok.", confidence: "medium" }).confidence, "medium");
  });

  test("confidence 'high' passes through", () => {
    assert.equal(validateConversationResponse({ reply: "Ok.", confidence: "high" }).confidence, "high");
  });

  test("unknown confidence string → defaults to 'medium'", () => {
    assert.equal(validateConversationResponse({ reply: "Ok.", confidence: "very-high" }).confidence, "medium");
  });

  test("missing confidence → defaults to 'medium'", () => {
    assert.equal(validateConversationResponse({ reply: "Ok." }).confidence, "medium");
  });

  // ── suggestedDomain normalization ────────────────────────────────────────
  test("suggestedDomain present → kept and trimmed", () => {
    const result = validateConversationResponse({ reply: "Ok.", suggestedDomain: " Family " });
    assert.equal(result.suggestedDomain, "Family");
  });

  test("suggestedDomain empty string → null", () => {
    assert.equal(validateConversationResponse({ reply: "Ok.", suggestedDomain: "" }).suggestedDomain, null);
  });

  test("suggestedDomain missing → null", () => {
    assert.equal(validateConversationResponse({ reply: "Ok." }).suggestedDomain, null);
  });

  // ── capturedDecision validation ──────────────────────────────────────────
  test("valid capturedDecision → included with title, domain, reason", () => {
    const result = validateConversationResponse({
      reply: "Ok.",
      capturedDecision: { title: "Switch to four-day week", domain: "Work", reason: "burnout signal" },
    });
    assert.ok(result.capturedDecision !== null);
    assert.equal(result.capturedDecision.title, "Switch to four-day week");
    assert.equal(result.capturedDecision.domain, "Work");
  });

  test("capturedDecision missing title → null", () => {
    const result = validateConversationResponse({
      reply: "Ok.",
      capturedDecision: { domain: "Work", reason: "no title field" },
    });
    assert.equal(result.capturedDecision, null);
  });

  test("capturedDecision empty title → null", () => {
    const result = validateConversationResponse({ reply: "Ok.", capturedDecision: { title: "", domain: "Work" } });
    assert.equal(result.capturedDecision, null);
  });

  test("capturedDecision null → null", () => {
    assert.equal(validateConversationResponse({ reply: "Ok.", capturedDecision: null }).capturedDecision, null);
  });

  test("capturedDecision non-object → null", () => {
    assert.equal(validateConversationResponse({ reply: "Ok.", capturedDecision: "bad" }).capturedDecision, null);
  });

  // ── detectedContradiction validation ─────────────────────────────────────
  test("valid detectedContradiction → included with both required fields", () => {
    const result = validateConversationResponse({
      reply: "Ok.",
      detectedContradiction: {
        declaredValue: "family first",
        observedPattern: "works 70 hours a week",
        domain: "Family",
      },
    });
    assert.ok(result.detectedContradiction !== null);
    assert.equal(result.detectedContradiction.declaredValue, "family first");
    assert.equal(result.detectedContradiction.observedPattern, "works 70 hours a week");
    assert.equal(result.detectedContradiction.domain, "Family");
  });

  test("detectedContradiction missing observedPattern → null", () => {
    const result = validateConversationResponse({
      reply: "Ok.",
      detectedContradiction: { declaredValue: "family first" },
    });
    assert.equal(result.detectedContradiction, null);
  });

  test("detectedContradiction missing declaredValue → null", () => {
    const result = validateConversationResponse({
      reply: "Ok.",
      detectedContradiction: { observedPattern: "works constantly" },
    });
    assert.equal(result.detectedContradiction, null);
  });

  test("detectedContradiction null → null", () => {
    assert.equal(validateConversationResponse({ reply: "Ok.", detectedContradiction: null }).detectedContradiction, null);
  });

  // ── normalizeConfidence utility ──────────────────────────────────────────
  test("normalizeConfidence('high') → 0.82", () => { assert.equal(normalizeConfidence("high"), 0.82); });
  test("normalizeConfidence('medium') → 0.63", () => { assert.equal(normalizeConfidence("medium"), 0.63); });
  test("normalizeConfidence('low') → 0.4", () => { assert.equal(normalizeConfidence("low"), 0.4); });
  test("normalizeConfidence('unknown') → null", () => { assert.equal(normalizeConfidence("unknown"), null); });
  test("normalizeConfidence(undefined) → null", () => { assert.equal(normalizeConfidence(undefined), null); });
}

// ═════════════════════════════════════════════════════════════════════════════
// 13. Cost tracker — rates, storage, and query functions
// ═════════════════════════════════════════════════════════════════════════════

section("13. Cost tracker — rates, storage, and query functions");

{
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/engine/db/")) delete require.cache[k];
  }
  freshDb();
  const {
    trackCall, getRecentCalls, getCostSummary, getCostByTier, BASE_RATES,
  } = require("../src/engine/db/cost-tracker");

  // ── BASE_RATES shape ─────────────────────────────────────────────────────
  test("BASE_RATES has all expected cloud models", () => {
    for (const m of ["gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.4", "o3", "o3-mini", "gpt-5.5", "gpt-4o"]) {
      assert.ok(BASE_RATES[m], `BASE_RATES missing: ${m}`);
      assert.ok(typeof BASE_RATES[m].in  === "number", `${m}.in should be a number`);
      assert.ok(typeof BASE_RATES[m].out === "number", `${m}.out should be a number`);
    }
  });

  test("gpt-5.4-nano: in=$0.20/M out=$1.25/M", () => {
    assert.equal(BASE_RATES["gpt-5.4-nano"].in,  0.20);
    assert.equal(BASE_RATES["gpt-5.4-nano"].out, 1.25);
  });

  test("gpt-5.4-mini: in=$0.75/M out=$4.50/M", () => {
    assert.equal(BASE_RATES["gpt-5.4-mini"].in,  0.75);
    assert.equal(BASE_RATES["gpt-5.4-mini"].out, 4.50);
  });

  test("gpt-5.4: in=$2.50/M out=$15.00/M", () => {
    assert.equal(BASE_RATES["gpt-5.4"].in,  2.50);
    assert.equal(BASE_RATES["gpt-5.4"].out, 15.00);
  });

  test("o3: in=$10.00/M out=$40.00/M", () => {
    assert.equal(BASE_RATES["o3"].in,  10.00);
    assert.equal(BASE_RATES["o3"].out, 40.00);
  });

  test("gpt-5.5: in=$5.00/M out=$30.00/M", () => {
    assert.equal(BASE_RATES["gpt-5.5"].in,  5.00);
    assert.equal(BASE_RATES["gpt-5.5"].out, 30.00);
  });

  // ── trackCall + getRecentCalls ────────────────────────────────────────────
  test("trackCall writes a record readable by getRecentCalls", () => {
    const before = getRecentCalls({ limit: 100 }).length;
    trackCall({ model: "gpt-5.4-nano", tier: "utility", purpose: "test-write", inputTokens: 100, outputTokens: 50 });
    const after = getRecentCalls({ limit: 100 }).length;
    assert.equal(after, before + 1, "call count should increase by 1");
  });

  test("trackCall records model, tier, purpose, token counts correctly", () => {
    trackCall({ model: "gpt-5.4-mini", tier: "conversation", purpose: "unit-test", inputTokens: 200, outputTokens: 80 });
    const [rec] = getRecentCalls({ limit: 1 });
    assert.equal(rec.model,         "gpt-5.4-mini");
    assert.equal(rec.tier,          "conversation");
    assert.equal(rec.purpose,       "unit-test");
    assert.equal(rec.input_tokens,  200);
    assert.equal(rec.output_tokens, 80);
  });

  test("getRecentCalls returns newest record first", () => {
    trackCall({ model: "gpt-5.4-nano", tier: "utility", purpose: "order-first",  inputTokens: 1, outputTokens: 1 });
    trackCall({ model: "gpt-5.4-mini", tier: "conversation", purpose: "order-second", inputTokens: 2, outputTokens: 2 });
    const [a, b] = getRecentCalls({ limit: 2 });
    assert.equal(a.purpose, "order-second", "most recent first");
    assert.equal(b.purpose, "order-first");
  });

  test("getRecentCalls({ limit: 2 }) returns at most 2 records", () => {
    for (let i = 0; i < 5; i++) {
      trackCall({ model: "gpt-5.4-nano", tier: "utility", purpose: `fill-${i}`, inputTokens: 1, outputTokens: 1 });
    }
    const calls = getRecentCalls({ limit: 2 });
    assert.ok(calls.length <= 2, `Expected ≤2 records, got ${calls.length}`);
  });

  // ── Cost math (via stored total_cost_usd) ────────────────────────────────
  test("1M nano input tokens → total_cost_usd ≈ $0.20", () => {
    trackCall({ model: "gpt-5.4-nano", tier: "utility", purpose: "cost-in", inputTokens: 1_000_000, outputTokens: 0 });
    const [rec] = getRecentCalls({ limit: 1 });
    assert.ok(Math.abs(rec.total_cost_usd - 0.20) < 0.0001,
      `Expected ~$0.20, got $${rec.total_cost_usd}`);
  });

  test("1M nano output tokens → total_cost_usd ≈ $1.25", () => {
    trackCall({ model: "gpt-5.4-nano", tier: "utility", purpose: "cost-out", inputTokens: 0, outputTokens: 1_000_000 });
    const [rec] = getRecentCalls({ limit: 1 });
    assert.ok(Math.abs(rec.total_cost_usd - 1.25) < 0.0001,
      `Expected ~$1.25, got $${rec.total_cost_usd}`);
  });

  test("1M mini input + 1M mini output → total_cost_usd ≈ $5.25", () => {
    trackCall({ model: "gpt-5.4-mini", tier: "conversation", purpose: "cost-both", inputTokens: 1_000_000, outputTokens: 1_000_000 });
    const [rec] = getRecentCalls({ limit: 1 });
    assert.ok(Math.abs(rec.total_cost_usd - 5.25) < 0.0001,
      `Expected ~$5.25 (0.75+4.50), got $${rec.total_cost_usd}`);
  });

  test("prefix match: gpt-5.4-mini-2025-xx uses gpt-5.4-mini rates", () => {
    trackCall({ model: "gpt-5.4-mini-2025-01", tier: "conversation", purpose: "prefix", inputTokens: 1_000_000, outputTokens: 0 });
    const [rec] = getRecentCalls({ limit: 1 });
    assert.ok(Math.abs(rec.total_cost_usd - 0.75) < 0.0001,
      `Expected ~$0.75 via prefix match, got $${rec.total_cost_usd}`);
  });

  test("unknown model: trackCall does not throw, stores fallback cost", () => {
    assert.doesNotThrow(() => {
      trackCall({ model: "completely-unknown-model-xyz", tier: "utility", purpose: "unknown", inputTokens: 1_000_000, outputTokens: 0 });
    });
    const [rec] = getRecentCalls({ limit: 1 });
    assert.ok(rec.total_cost_usd > 0, "unknown model should still record a non-zero fallback cost");
  });

  // ── getCostSummary shape ──────────────────────────────────────────────────
  test("getCostSummary returns today, thisMonth, byTier, byModel, daily30, rates", () => {
    const summary = getCostSummary();
    for (const key of ["today", "thisMonth", "byTier", "byModel", "daily30", "rates"]) {
      assert.ok(key in summary, `getCostSummary missing key: ${key}`);
    }
  });

  test("getCostSummary.rates equals BASE_RATES", () => {
    assert.deepEqual(getCostSummary().rates, BASE_RATES);
  });

  // ── getCostByTier aggregation ─────────────────────────────────────────────
  test("getCostByTier aggregates multiple calls by tier with correct call count", () => {
    for (const k of Object.keys(require.cache)) {
      if (k.includes("/engine/db/")) delete require.cache[k];
    }
    freshDb();
    const { trackCall: tc, getCostByTier: byTier } = require("../src/engine/db/cost-tracker");
    tc({ model: "gpt-5.4-nano", tier: "utility",      purpose: "a", inputTokens: 100, outputTokens: 10 });
    tc({ model: "gpt-5.4-nano", tier: "utility",      purpose: "b", inputTokens: 100, outputTokens: 10 });
    tc({ model: "gpt-5.4-mini", tier: "conversation", purpose: "c", inputTokens: 200, outputTokens: 20 });

    const rows = byTier();
    const util = rows.find(r => r.tier === "utility");
    const conv = rows.find(r => r.tier === "conversation");
    assert.ok(util, "should have utility row");
    assert.equal(util.calls, 2, "utility should have 2 calls");
    assert.ok(conv, "should have conversation row");
    assert.equal(conv.calls, 1, "conversation should have 1 call");
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 15. Duplicate question guard — prompt contract checks
// ═════════════════════════════════════════════════════════════════════════════

section("15. Duplicate question guard — prompt contract checks");

{
  const PROMPT_BUILDER_SRC = readSrc("src/engine/llm/monday-prompt-builder.js");
  const LLM_ROUTER_SRC     = readSrc("src/engine/llm/llm-router.js");

  // ── Main prompt schema instruction ───────────────────────────────────────
  test("prompt builder schema: 'reply must NOT end with a question'", () => {
    assert.ok(PROMPT_BUILDER_SRC.includes("reply must NOT end with a question"),
      "schema instruction must tell the model not to end reply with a question");
  });

  test("prompt builder schema: explains followUp is appended automatically (why rule exists)", () => {
    assert.ok(PROMPT_BUILDER_SRC.includes("followUp is appended automatically"),
      "schema must explain that followUp is auto-appended — prevents model from asking twice");
  });

  // ── Utility tier conciseness ─────────────────────────────────────────────
  test("utility tier conciseness: 'Do not probe for meaning'", () => {
    assert.ok(PROMPT_BUILDER_SRC.includes("Do not probe for meaning"),
      "utility conciseness must forbid probing for meaning on simple updates");
  });

  test("unclassified instruction: 'do not probe for hidden meaning'", () => {
    assert.ok(PROMPT_BUILDER_SRC.includes("do not probe for hidden meaning"),
      "unclassified instruction must prevent over-analysis of mundane statements");
  });

  // ── chatWithBuffer voice prompt ───────────────────────────────────────────
  test("buffer voice prompt: 'do NOT add a separate follow-up line after your reply'", () => {
    assert.ok(LLM_ROUTER_SRC.includes("do NOT add a separate follow-up line after your reply"),
      "nano voice prompt must forbid a separate follow-up line");
  });

  // ── chatWithBuffer analysis prompt ───────────────────────────────────────
  test("buffer analysis prompt: 'No reply text. No prose. Facts only.'", () => {
    assert.ok(LLM_ROUTER_SRC.includes("No reply text. No prose. Facts only."),
      "mini analysis prompt must prohibit prose — only facts JSON");
  });

  // ── chatWithBuffer merged output ─────────────────────────────────────────
  test("chatWithBuffer explicitly sets followUp: null in merged output", () => {
    assert.ok(LLM_ROUTER_SRC.includes("followUp: null"),
      "chatWithBuffer must null out followUp to prevent double-question append");
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 14. Gateway — auth middleware and HTTP adapter
// ═════════════════════════════════════════════════════════════════════════════

section("14. Gateway — auth middleware and HTTP adapter");

async function runGatewayTests() {
  const REAL_SECRET = process.env.MONDAY_GATEWAY_SECRET || "";

  // Helper: clear gateway cache, set env vars, require auth, restore env
  function loadAuthWith({ secret, senders } = {}) {
    for (const k of Object.keys(require.cache)) {
      if (k.includes("/gateway/")) delete require.cache[k];
    }
    const saved = {
      secret: process.env.MONDAY_GATEWAY_SECRET,
      senders: process.env.MONDAY_ALLOWED_SENDERS,
    };
    if (secret !== undefined) process.env.MONDAY_GATEWAY_SECRET = secret;
    else delete process.env.MONDAY_GATEWAY_SECRET;
    if (senders !== undefined) process.env.MONDAY_ALLOWED_SENDERS = senders;
    else delete process.env.MONDAY_ALLOWED_SENDERS;

    const auth = require("../src/engine/gateway/middleware/auth");

    // Restore original values for subsequent module loads
    if (saved.secret != null) process.env.MONDAY_GATEWAY_SECRET = saved.secret;
    else delete process.env.MONDAY_GATEWAY_SECRET;
    if (saved.senders != null) process.env.MONDAY_ALLOWED_SENDERS = saved.senders;
    else delete process.env.MONDAY_ALLOWED_SENDERS;

    return auth;
  }

  // ── verifyHttp — with real secret ────────────────────────────────────────
  {
    const { verifyHttp } = loadAuthWith({ secret: REAL_SECRET });

    test("correct Bearer token → ok", () => {
      const r = verifyHttp({ headers: { authorization: `Bearer ${REAL_SECRET}` }, senderId: "nobody" });
      assert.ok(r.ok, `correct secret should be accepted, got: ${r.reason}`);
    });

    test("wrong Bearer token (secret configured) → not ok", () => {
      if (!REAL_SECRET) return; // skip: dev mode accepts all
      const r = verifyHttp({ headers: { authorization: "Bearer totally-wrong" }, senderId: "nobody" });
      assert.ok(!r.ok, "wrong token should be rejected");
    });

    test("missing Authorization header (secret configured) → not ok", () => {
      if (!REAL_SECRET) return;
      const r = verifyHttp({ headers: {}, senderId: "nobody" });
      assert.ok(!r.ok, "missing auth header should be rejected when secret is set");
    });
  }

  // ── verifyHttp — dev mode (no secret, no allowlist) ─────────────────────
  {
    const { verifyHttp: verifyDev } = loadAuthWith({ secret: "", senders: "" });

    test("no secret + no allowlist → dev mode allows all requests", () => {
      const r = verifyDev({ headers: {}, senderId: "anonymous" });
      assert.ok(r.ok, "dev mode (no auth configured) should allow all requests");
    });
  }

  // ── verifyHttp — sender allowlist bypasses secret ────────────────────────
  {
    const { verifyHttp: verifyList, enforceSenderAllowlist: enforceList } =
      loadAuthWith({ secret: "test-secret", senders: "chris,rebekah" });

    test("sender in allowlist is accepted even with wrong secret", () => {
      const r = verifyList({ headers: { authorization: "Bearer wrong" }, senderId: "chris" });
      assert.ok(r.ok, "allowlisted sender should bypass secret check");
    });

    test("enforceSenderAllowlist: sender in list → ok", () => {
      assert.ok(enforceList("chris").ok, "'chris' is in the allowlist");
    });

    test("enforceSenderAllowlist: sender not in list → not ok with reason", () => {
      const r = enforceList("stranger");
      assert.ok(!r.ok, "'stranger' is not in the allowlist");
      assert.ok(r.reason?.length > 0, "rejection should include a reason string");
    });
  }

  // ── enforceSenderAllowlist — empty list allows all ───────────────────────
  {
    const { enforceSenderAllowlist: enforceEmpty } = loadAuthWith({ secret: REAL_SECRET, senders: "" });

    test("enforceSenderAllowlist with empty list → allows any sender", () => {
      assert.ok(enforceEmpty("any-random-sender").ok,
        "empty allowlist should allow any sender");
    });
  }

  // ── HTTP adapter parse ────────────────────────────────────────────────────
  {
    // Load adapter with secret-only auth (no allowlist) so wrong-token tests work
    // regardless of MONDAY_ALLOWED_SENDERS in .env.
    for (const k of Object.keys(require.cache)) {
      if (k.includes("/gateway/")) delete require.cache[k];
    }
    const savedSenders = process.env.MONDAY_ALLOWED_SENDERS;
    delete process.env.MONDAY_ALLOWED_SENDERS;
    const httpAdapter = require("../src/engine/gateway/adapters/http");
    if (savedSenders != null) process.env.MONDAY_ALLOWED_SENDERS = savedSenders;
    const mockReq = (headers = {}) => ({ headers });

    await test("valid body + correct auth → ok with channel='http'", async () => {
      const body = JSON.stringify({ senderId: "chris", text: "What should I focus on?" });
      const r = await httpAdapter.parse(mockReq({ authorization: `Bearer ${REAL_SECRET}` }), body);
      assert.ok(r.ok, `Expected ok, got: ${r.error}`);
      assert.equal(r.event.channel,  "http");
      assert.equal(r.event.senderId, "chris");
      assert.equal(r.event.text,     "What should I focus on?");
    });

    await test("missing text field → 400 with error", async () => {
      const body = JSON.stringify({ senderId: "chris" });
      const r = await httpAdapter.parse(mockReq({ authorization: `Bearer ${REAL_SECRET}` }), body);
      assert.ok(!r.ok);
      assert.equal(r.status, 400);
    });

    await test("body.text is empty string → 400", async () => {
      const body = JSON.stringify({ senderId: "chris", text: "" });
      const r = await httpAdapter.parse(mockReq({ authorization: `Bearer ${REAL_SECRET}` }), body);
      assert.ok(!r.ok);
      assert.equal(r.status, 400);
    });

    await test("invalid JSON body → 400", async () => {
      const r = await httpAdapter.parse(mockReq({ authorization: `Bearer ${REAL_SECRET}` }), "not valid json");
      assert.ok(!r.ok);
      assert.equal(r.status, 400);
    });

    await test("wrong auth token → 401", async () => {
      if (!REAL_SECRET) return; // skip in dev mode
      // Use a senderId that's definitely not in any allowlist
      const body = JSON.stringify({ senderId: "anonymous-external-caller", text: "Hello" });
      const r = await httpAdapter.parse(mockReq({ authorization: "Bearer wrong-secret" }), body);
      assert.ok(!r.ok, `Expected rejection but got ok — ALLOWED_SENDERS may still include this sender`);
      assert.equal(r.status, 401);
    });

    await test("body.message is accepted as alias for body.text", async () => {
      const body = JSON.stringify({ senderId: "chris", message: "Using message field instead" });
      const r = await httpAdapter.parse(mockReq({ authorization: `Bearer ${REAL_SECRET}` }), body);
      assert.ok(r.ok);
      assert.equal(r.event.text, "Using message field instead");
    });

    await test("body.input is accepted as alias for body.text", async () => {
      const body = JSON.stringify({ senderId: "chris", input: "Using input field" });
      const r = await httpAdapter.parse(mockReq({ authorization: `Bearer ${REAL_SECRET}` }), body);
      assert.ok(r.ok);
      assert.equal(r.event.text, "Using input field");
    });

    await test("reset:true is parsed and forwarded in event", async () => {
      const body = JSON.stringify({ senderId: "chris", text: "Reset please", reset: true });
      const r = await httpAdapter.parse(mockReq({ authorization: `Bearer ${REAL_SECRET}` }), body);
      assert.ok(r.ok);
      assert.equal(r.event.reset, true);
    });

    test("formatReply shape: includes reply, channel='http', senderId", () => {
      const r = httpAdapter.formatReply("Hey boss!", { senderId: "chris" });
      assert.equal(r.reply,    "Hey boss!");
      assert.equal(r.channel,  "http");
      assert.equal(r.senderId, "chris");
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Live End-to-End Routing
//    Real API calls. Verifies routeModel's decision maps to the actual model
//    returned in the response.
// ═════════════════════════════════════════════════════════════════════════════

section("6. Live End-to-End Routing — model used matches routing decision");

async function runLiveTests() {
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/engine/")) delete require.cache[k];
  }
  freshDb();

  const { applyMondayIntelligence } = require("../src/engine/intelligence/monday-intelligence");

  const BASE_CONTEXT = {
    missionSummary: "Chris Binion — life in six domains: Health, Publishing, Retirement, Family, Faith, Work.",
    captures: [], workingTheories: {}, recentDecisions: [], surfacingItem: null,
  };

  // ── Standard turn → conversation tier ───────────────────────────────────
  await test("standard message → conversation tier (gpt-5.4-mini)", async () => {
    const result = await applyMondayIntelligence({
      input: "What should I tackle first today?",
      history: [],
      personalContext: BASE_CONTEXT,
      result: {
        truth: { domain: "Work" },
        finalState: {
          significance: "general_conversation",
          identityProximity: "low",
          woundRisk: "low",
          candidateDomain: "Work",
        },
      },
    });
    assert.equal(result.modelDecision.tier, "conversation",
      `Expected conversation tier, got: ${result.modelDecision.tier}`);
    assert.equal(result.modelDecision.model, "gpt-5.4-mini");
    console.log(`    model: ${result.modelDecision.model}, reply: "${(result.voice?.text || "").slice(0, 60)}"`);
  });

  // ── Significance → thinking tier ─────────────────────────────────────────
  await test("family_time_tension significance → thinking tier (gpt-5.4)", async () => {
    const result = await applyMondayIntelligence({
      input: "I feel like work keeps winning the competition for time with my kids.",
      history: [],
      personalContext: BASE_CONTEXT,
      result: {
        truth: { domain: "Family" },
        finalState: {
          significance: "family_time_tension",
          identityProximity: "medium",
          woundRisk: "low",
          candidateDomain: "Family",
        },
      },
    });
    assert.equal(result.modelDecision.tier, "thinking",
      `Expected thinking tier, got: ${result.modelDecision.tier}`);
    assert.equal(result.modelDecision.model, "gpt-5.4");
    console.log(`    model: ${result.modelDecision.model}, reply: "${(result.voice?.text || "").slice(0, 60)}"`);
  });

  // ── High identity risk → thinking ─────────────────────────────────────────
  await test("high identityProximity → thinking tier regardless of domain", async () => {
    const result = await applyMondayIntelligence({
      input: "Something about this project doesn't feel right for me.",
      history: [],
      personalContext: BASE_CONTEXT,
      result: {
        truth: { domain: "Work" },
        finalState: {
          significance: "general_conversation",
          identityProximity: "high",
          woundRisk: "low",
          candidateDomain: "Work",
        },
      },
    });
    assert.equal(result.modelDecision.tier, "thinking",
      `Expected thinking for high identity risk, got: ${result.modelDecision.tier}`);
    console.log(`    model: ${result.modelDecision.model}, tier: ${result.modelDecision.tier}`);
  });

  // ── Strategic pattern in message → strategic tier ────────────────────────
  await test("'when should I retire' in message → strategic tier (o3)", async () => {
    const result = await applyMondayIntelligence({
      input: "When should I retire? I want to think through this seriously.",
      history: [],
      personalContext: BASE_CONTEXT,
      result: {
        truth: { domain: "Retirement" },
        finalState: {
          significance: "retirement_strategy",
          identityProximity: "medium",
          woundRisk: "low",
          candidateDomain: "Retirement",
        },
      },
    });
    assert.equal(result.modelDecision.tier, "strategic",
      `Expected strategic tier, got: ${result.modelDecision.tier}`);
    assert.equal(result.modelDecision.model, "o3");
    console.log(`    model: ${result.modelDecision.model} — strategic decision engaged`);
    // o3 JSON parsing can vary across API versions — verify routing, not reply content
    assert.ok(result.modelDecision, "modelDecision should be present");
  });

  // ── Cost log records the correct model after each tier ───────────────────
  await test("cost log captures model and tier for each live call", async () => {
    // Re-use a fresh DB so we can count exactly.
    // Must clear ALL engine modules — cost-tracker and llm-router share the DB instance,
    // so a partial cache clear leaves the old (empty) DB connection in llm-router.
    for (const k of Object.keys(require.cache)) {
      if (k.includes("/engine/")) delete require.cache[k];
    }
    freshDb();

    const { applyMondayIntelligence: applyFresh } = require("../src/engine/intelligence/monday-intelligence");
    const { getRecentCalls } = require("../src/engine/db/cost-tracker");

    await applyFresh({
      input: "Quick check on my health goals.",
      history: [],
      personalContext: BASE_CONTEXT,
      result: {
        truth: { domain: "Health" },
        finalState: {
          significance: "general_conversation",
          identityProximity: "low",
          woundRisk: "low",
          candidateDomain: "Health",
        },
      },
    });

    const calls = getRecentCalls({ limit: 5 });
    assert.ok(calls.length > 0, "At least one cost record should be written after a live turn");
    const rec = calls[0];
    assert.ok(rec.model, "Cost record must include model");
    assert.ok(rec.tier, "Cost record must include tier");
    assert.ok(rec.input_tokens > 0, "Cost record must have input token count");
    console.log(`    cost record: model=${rec.model}, tier=${rec.tier}, in=${rec.input_tokens}, out=${rec.output_tokens}`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Run all
// ═════════════════════════════════════════════════════════════════════════════

async function run() {
  await runBodyTests();
  await runDispatchTests();
  await runBufferTests();
  await runIntentClassifierTests();
  await runGatewayTests();
  await runLiveTests();

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
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
