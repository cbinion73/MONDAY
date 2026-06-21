const assert = require("node:assert/strict");

// Temporarily neutralize env vars so tests are deterministic
const saved = {};
for (const k of ["MONDAY_MODEL_ROUTER", "MONDAY_MODEL_DEFAULT", "MONDAY_MODEL_THINKING", "MONDAY_MODEL_EMBEDDINGS", "MONDAY_USE_PAID_MODELS"]) {
  saved[k] = process.env[k];
  delete process.env[k];
}

const { routeModel, routeInternalTask, routeEmbedding, MODELS, TASK_TYPES } = require("../src/engine/llm/model-router");

// Restore env vars after module load
for (const [k, v] of Object.entries(saved)) {
  if (v !== undefined) process.env[k] = v;
  else delete process.env[k];
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── 1. Standard conversation → DEFAULT (qwen3:14b) ────────────────────────
test("Standard question routes to CONVERSATION / DEFAULT model", () => {
  const d = routeModel({ input: "How should I think about tomorrow?" });
  assert.equal(d.taskType, TASK_TYPES.CONVERSATION, "taskType");
  assert.equal(d.model, "qwen3:14b", "model");
});

// ── 2. Thinking significance trigger ─────────────────────────────────────
test("Significance 'future_life_transition' routes to THINKING", () => {
  const d = routeModel({ significance: "future_life_transition", input: "Should I retire?" });
  assert.equal(d.taskType, TASK_TYPES.THINKING, "taskType");
  assert.equal(d.model, "qwen3:30b", "model");
});

// ── 3. High identity proximity trigger ───────────────────────────────────
test("identityProximity=high routes to THINKING", () => {
  const d = routeModel({ identityProximity: "high", input: "I don't know who I am without work." });
  assert.equal(d.taskType, TASK_TYPES.THINKING, "taskType");
});

// ── 4. Critical wound risk trigger ───────────────────────────────────────
test("woundRisk=critical routes to THINKING", () => {
  const d = routeModel({ woundRisk: "critical", input: "Something happened." });
  assert.equal(d.taskType, TASK_TYPES.THINKING, "taskType");
});

// ── 5. Keyword pattern trigger ───────────────────────────────────────────
test("'meaning' keyword routes to THINKING", () => {
  const d = routeModel({ input: "What is the meaning of all this?" });
  assert.equal(d.taskType, TASK_TYPES.THINKING, "taskType");
  assert.ok(d.matchedPattern, "matchedPattern should be set");
});

// ── 6. routeInternalTask → ROUTING (qwen3:4b) ────────────────────────────
test("routeInternalTask routes to ROUTING / ROUTER model", () => {
  const d = routeInternalTask("Intent classification");
  assert.equal(d.taskType, TASK_TYPES.ROUTING, "taskType");
  assert.equal(d.model, "qwen3:4b", "model");
});

// ── 7. routeEmbedding → EMBEDDING (nomic-embed-text) ─────────────────────
test("routeEmbedding routes to EMBEDDING model", () => {
  const d = routeEmbedding();
  assert.equal(d.taskType, TASK_TYPES.EMBEDDING, "taskType");
  assert.equal(d.model, "nomic-embed-text", "model");
});

// ── 8. Depth domain + long message → THINKING ────────────────────────────
test("Retirement domain + 16-word message routes to THINKING", () => {
  const longInput = "I have been thinking about what retirement means for who I am going to be";
  const d = routeModel({ domain: "Retirement", input: longInput });
  assert.equal(d.taskType, TASK_TYPES.THINKING, "taskType");
});

// ── 9. Depth domain + short message → CONVERSATION ───────────────────────
test("Retirement domain + short message stays at CONVERSATION", () => {
  const d = routeModel({ domain: "Retirement", input: "What time is it?" });
  assert.equal(d.taskType, TASK_TYPES.CONVERSATION, "taskType");
});

// ── 10. Explicit DETERMINISTIC override ──────────────────────────────────
test("Explicit DETERMINISTIC taskType returns null model", () => {
  const d = routeModel({ taskType: TASK_TYPES.DETERMINISTIC });
  assert.equal(d.taskType, TASK_TYPES.DETERMINISTIC, "taskType");
  assert.equal(d.model, null, "model should be null");
});

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\nmodel-router: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
