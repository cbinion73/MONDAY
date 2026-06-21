"use strict";
// Monday Model Router — decides which local Ollama model handles each task.
//
// Model tiers (set via env vars):
//   qwen3:4b   = ROUTER  — intent detection, classification, lightweight tasks (no user-facing output)
//   qwen3:14b  = DEFAULT — normal Monday conversation, daily brief, planning, synthesis
//   qwen3:30b  = THINKING — deep thinking-partner: identity, meaning, strategy, theory revision
//   nomic-embed-text = EMBEDDING — vector search only
//   paid models  = disabled by default (MONDAY_USE_PAID_MODELS=false)

const MODELS = {
  ROUTER:    process.env.MONDAY_MODEL_ROUTER     || process.env.MONDAY_OLLAMA_MODEL || "qwen3:4b",
  DEFAULT:   process.env.MONDAY_MODEL_DEFAULT    || process.env.MONDAY_OLLAMA_MODEL || "qwen3:14b",
  THINKING:  process.env.MONDAY_MODEL_THINKING   || "qwen3:30b",
  EMBEDDING: process.env.MONDAY_MODEL_EMBEDDINGS || "nomic-embed-text",
};

const TASK_TYPES = {
  DETERMINISTIC: "deterministic", // no LLM — trust gates, lifecycle, logging
  ROUTING:       "routing",       // qwen3:4b — intent detection, classification
  CONVERSATION:  "conversation",  // qwen3:14b — normal Monday turn
  THINKING:      "thinking",      // qwen3:30b — identity, meaning, strategy
  EMBEDDING:     "embedding",     // nomic-embed-text — vector search only
};

// Significance values that require deep thinking
const THINKING_SIGNIFICANCE = new Set([
  "family_time_tension",
  "future_life_transition",
  "future_life_tradeoff",
  "work_identity",
  "faith_tension",
  "retirement_strategy",
  "publishing_strategy",
  "creative_strategy",
  "wounded_significance",
  "identity_threat",
  "deep_meaning",
  "calling",
  "legacy",
  "existential",
]);

// Domains where depth is more likely
const DEPTH_DOMAINS = new Set(["Retirement", "Faith", "Family", "Publishing"]);

// Keyword patterns that signal a thinking-partner turn
const THINKING_PATTERNS = [
  /\bretir(e|ing|ement)\b/i,
  /\bmeaning\b/i,
  /\bpurpose\b/i,
  /\bcalling\b/i,
  /\blegacy\b/i,
  /\bidentity\b/i,
  /\bwho am i\b/i,
  /\bwhat.*matter/i,
  /\bwhat.*life\b/i,
  /\bwhat.*for\b/i,
  /\bfaith\b/i,
  /\bGod\b/i,
  /\bprayer\b/i,
  /\bvocation\b/i,
  /\b(80|70|60)\s*hour/i,
  /\bwork.*win(s|ning)\b/i,
  /\bfamily.*matter/i,
  /pattern/i,
  /hypothesis/i,
  /\btheory\b/i,
  /\bwhy.*work/i,
  /\bwho.*really\b/i,
  /\bnot sure.*want/i,
  /\bstuck\b/i,
  /\bwhat.*next.*chapter/i,
];

/**
 * Route a user-facing conversation turn to the right model.
 *
 * @param {object} opts
 *   opts.domain           - "Family" | "Work" | "Retirement" | etc.
 *   opts.significance     - significance string from engine state
 *   opts.identityProximity - "low" | "medium" | "high" | "critical" | null
 *   opts.woundRisk        - "low" | "medium" | "high" | "critical" | null
 *   opts.input            - raw user message string
 *   opts.taskType         - explicit task type override (ROUTING, EMBEDDING, etc.)
 * @returns {ModelDecision}
 */
function routeModel({
  domain = null,
  significance = null,
  identityProximity = null,
  woundRisk = null,
  input = "",
  taskType = null,
} = {}) {
  const paidBlocked = process.env.MONDAY_USE_PAID_MODELS !== "true";

  // Explicit task type overrides
  if (taskType === TASK_TYPES.EMBEDDING) {
    return decision(MODELS.EMBEDDING, TASK_TYPES.EMBEDDING, "Embedding generation", { paidBlocked });
  }
  if (taskType === TASK_TYPES.ROUTING) {
    return decision(MODELS.ROUTER, TASK_TYPES.ROUTING, "Lightweight routing/classification task", { paidBlocked });
  }
  if (taskType === TASK_TYPES.DETERMINISTIC) {
    return decision(null, TASK_TYPES.DETERMINISTIC, "No LLM needed", { paidBlocked });
  }

  // ── Thinking signals ────────────────────────────────────────────────────────

  // 1. Significance-level trigger
  if (significance && THINKING_SIGNIFICANCE.has(significance)) {
    return decision(MODELS.THINKING, TASK_TYPES.THINKING,
      `Significance "${significance}" requires depth`, { paidBlocked, consideredLarger: false });
  }

  // 2. High identity proximity or wound risk
  const highRisk = identityProximity === "high" || identityProximity === "critical"
    || woundRisk === "high" || woundRisk === "critical";
  if (highRisk) {
    return decision(MODELS.THINKING, TASK_TYPES.THINKING,
      `Identity proximity: ${identityProximity}, wound risk: ${woundRisk}`, { paidBlocked });
  }

  // 3. Keyword patterns — depth signals in the message
  const matchedPattern = THINKING_PATTERNS.find(p => p.test(input));
  if (matchedPattern) {
    return decision(MODELS.THINKING, TASK_TYPES.THINKING,
      `Depth keyword detected in message`, { paidBlocked, matchedPattern: String(matchedPattern) });
  }

  // 4. Depth-prone domain + signal in message
  if (domain && DEPTH_DOMAINS.has(domain)) {
    // Domain alone is not enough — needs at least a moderately complex message
    const words = input.trim().split(/\s+/).length;
    if (words > 15) {
      return decision(MODELS.THINKING, TASK_TYPES.THINKING,
        `${domain} domain with substantive message (${words} words)`, { paidBlocked, consideredLarger: false });
    }
  }

  // ── Default ─────────────────────────────────────────────────────────────────
  return decision(MODELS.DEFAULT, TASK_TYPES.CONVERSATION,
    "Standard conversation", { paidBlocked, consideredLarger: true });
}

/**
 * Route a lightweight internal task (intent detection, classification, summarization).
 * Always returns ROUTING tier (qwen3:4b).
 */
function routeInternalTask(reason = "Internal task") {
  return decision(MODELS.ROUTER, TASK_TYPES.ROUTING, reason, {
    paidBlocked: process.env.MONDAY_USE_PAID_MODELS !== "true",
  });
}

/**
 * Route an embedding task. Always returns nomic-embed-text.
 */
function routeEmbedding() {
  return decision(MODELS.EMBEDDING, TASK_TYPES.EMBEDDING, "Vector embedding", {
    paidBlocked: process.env.MONDAY_USE_PAID_MODELS !== "true",
  });
}

function decision(model, taskType, reason, { paidBlocked = true, consideredLarger = false, matchedPattern = null } = {}) {
  return { model, taskType, reason, paidBlocked, consideredLarger, matchedPattern };
}

module.exports = {
  MODELS,
  TASK_TYPES,
  routeModel,
  routeInternalTask,
  routeEmbedding,
};
