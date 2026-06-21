"use strict";
// Monday Model Router — decides which model tier handles each task.
//
// Active layer (user-facing) uses OpenAI cloud tiers:
//   utility      → gpt-5.4-nano   — memory extraction, tagging, classification
//   conversation → gpt-5.4-mini   — daily Monday turns (most messages)
//   thinking     → gpt-5.4        — theory generation, strategy, deep synthesis
//   strategic    → o3             — major life decisions, retirement planning
//   executive    → gpt-5.5        — annual reviews, exceptional situations
//
// Background layer (workers, async) always uses local Ollama:
//   background   → qwen3:30b-a3b      — synthesis, monitor, research workers
//   embedding    → nomic-embed-text — vector search only

const CLOUD_MODELS = {
  utility:      process.env.MONDAY_MODEL_UTILITY      || "gpt-5.4-nano",
  conversation: process.env.MONDAY_MODEL_CONVERSATION || "gpt-5.4-mini",
  thinking:     process.env.MONDAY_MODEL_THINKING     || "gpt-5.4",
  strategic:    process.env.MONDAY_MODEL_STRATEGIC    || "o3",
  executive:    process.env.MONDAY_MODEL_EXECUTIVE    || "gpt-5.5",
  background:   process.env.MONDAY_MODEL_BACKGROUND   || "qwen3:30b-a3b",
  embedding:    process.env.MONDAY_MODEL_EMBEDDINGS   || "nomic-embed-text",
};

// Legacy alias — background worker config
const MODELS = {
  ROUTER:    CLOUD_MODELS.background,
  DEFAULT:   CLOUD_MODELS.background,
  THINKING:  CLOUD_MODELS.background,
  EMBEDDING: CLOUD_MODELS.embedding,
};

const TASK_TYPES = {
  DETERMINISTIC: "deterministic", // no LLM
  UTILITY:       "utility",       // nano — classification, tagging
  CONVERSATION:  "conversation",  // mini — standard Monday turn
  THINKING:      "thinking",      // gpt-5.4 — strategy, theory, depth
  STRATEGIC:     "strategic",     // o3 — major life decisions
  EXECUTIVE:     "executive",     // gpt-5.5 — annual review, exceptional
  BACKGROUND:    "background",    // local Ollama — workers
  EMBEDDING:     "embedding",     // nomic-embed-text — vectors
};

// Significance values that always warrant the thinking tier
const THINKING_SIGNIFICANCE = new Set([
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
]);

// Significance values that warrant the strategic tier when identity risk is critical
const STRATEGIC_SIGNIFICANCE = new Set([
  "retirement_strategy",
  "calling",
  "legacy",
  "existential",
]);

const DEPTH_DOMAINS = new Set(["Retirement", "Faith", "Family", "Publishing"]);

const THINKING_PATTERNS = [
  /\bmeaning\b/i,
  /\bpurpose\b/i,
  /\bcalling\b/i,
  /\bidentity\b/i,
  /\bwho am i\b/i,
  /\bwhat.*matter/i,
  /\bwhat.*life\b/i,
  /\bfaith\b/i,
  /\bGod\b/i,
  /\bprayer\b/i,
  /\bvocation\b/i,
  /\b(80|70|60)\s*hour/i,
  /\bwork.*win(s|ning)\b/i,
  /pattern/i,
  /hypothesis/i,
  /\btheory\b/i,
  /\bwhy.*work/i,
  /\bstuck\b/i,
  /\bwhat.*next.*chapter/i,
];

const STRATEGIC_PATTERNS = [
  /\bretire\s+(now|soon|this\s+year|next\s+year)\b/i,
  /\bwhen\s+(should|do)\s+I\s+retire/i,
  /\blife\s+plan\b/i,
  /\bbiggest\s+decision/i,
  /\brest\s+of\s+my\s+life\b/i,
  /\bmulti[- ]?year\s+plan/i,
  /\blegacy\s+plan/i,
];

/**
 * Route a user-facing conversation turn to the right model tier.
 *
 * @param {object} opts
 *   opts.domain            - "Family" | "Work" | "Retirement" | etc.
 *   opts.significance      - significance string from engine state
 *   opts.identityProximity - "low" | "medium" | "high" | "critical" | null
 *   opts.woundRisk         - "low" | "medium" | "high" | "critical" | null
 *   opts.input             - raw user message string
 *   opts.taskType          - explicit task type override
 * @returns {ModelDecision}
 */
function routeModel({
  domain = null,
  significance = null,
  identityProximity = null,
  woundRisk = null,
  input = "",
  taskType = null,
  classificationFallback = false,
  intentType = null,
} = {}) {
  // Explicit overrides
  if (taskType === TASK_TYPES.EMBEDDING) {
    return decision("embedding", TASK_TYPES.EMBEDDING, "Vector embedding");
  }
  if (taskType === TASK_TYPES.UTILITY) {
    return decision("utility", TASK_TYPES.UTILITY, "Lightweight classification task");
  }
  if (taskType === TASK_TYPES.BACKGROUND) {
    return decision("background", TASK_TYPES.BACKGROUND, "Background worker task");
  }
  if (taskType === TASK_TYPES.DETERMINISTIC) {
    return decision(null, TASK_TYPES.DETERMINISTIC, "No LLM needed");
  }
  if (taskType === TASK_TYPES.STRATEGIC) {
    return decision("strategic", TASK_TYPES.STRATEGIC, "Explicit strategic task");
  }
  if (taskType === TASK_TYPES.EXECUTIVE) {
    return decision("executive", TASK_TYPES.EXECUTIVE, "Explicit executive task");
  }

  // ── Strategic signals (o3) ───────────────────────────────────────────────────

  const criticalRisk = identityProximity === "critical" || woundRisk === "critical";

  if (significance && STRATEGIC_SIGNIFICANCE.has(significance) && criticalRisk) {
    return decision("strategic", TASK_TYPES.STRATEGIC,
      `Critical "${significance}" with identity risk warrants strategic review`);
  }

  const matchedStrategic = STRATEGIC_PATTERNS.find(p => p.test(input));
  if (matchedStrategic) {
    return decision("strategic", TASK_TYPES.STRATEGIC,
      "Strategic life decision detected in message", { matchedPattern: String(matchedStrategic) });
  }

  // ── Thinking signals (gpt-5.4) ───────────────────────────────────────────────

  if (significance && THINKING_SIGNIFICANCE.has(significance)) {
    return decision("thinking", TASK_TYPES.THINKING,
      `Significance "${significance}" requires depth`);
  }

  if (significance && STRATEGIC_SIGNIFICANCE.has(significance)) {
    // Strategic significance without critical risk → still needs depth
    return decision("thinking", TASK_TYPES.THINKING,
      `"${significance}" warrants thinking partner`);
  }

  const highRisk = identityProximity === "high" || identityProximity === "critical"
    || woundRisk === "high" || woundRisk === "critical";
  if (highRisk) {
    return decision("thinking", TASK_TYPES.THINKING,
      `Identity proximity: ${identityProximity}, wound risk: ${woundRisk}`);
  }

  const matchedThinking = THINKING_PATTERNS.find(p => p.test(input));
  if (matchedThinking) {
    return decision("thinking", TASK_TYPES.THINKING,
      "Depth keyword detected", { matchedPattern: String(matchedThinking) });
  }

  if (domain && DEPTH_DOMAINS.has(domain)) {
    const words = input.trim().split(/\s+/).length;
    const hasDepthSignal = input.includes("?") || THINKING_PATTERNS.some(p => p.test(input));
    // Require both length AND a depth signal — long logistics messages in Family/Retirement
    // shouldn't escalate to thinking tier just because they're in a depth domain.
    if (words > 25 && hasDepthSignal) {
      return decision("thinking", TASK_TYPES.THINKING,
        `${domain} domain with substantive message and depth signal (${words} words)`);
    }
  }

  // ── Intent-classified fallback → tier from intent map ───────────────────────
  // Nano classified the message type; use that to pick the right tier.
  if (classificationFallback && intentType) {
    const { INTENT_TIERS } = require("./intent-classifier");
    const intentTier = INTENT_TIERS[intentType];
    if (intentTier) {
      const taskTypeForTier = intentTier.tier === "utility" ? TASK_TYPES.UTILITY
        : intentTier.tier === "thinking" ? TASK_TYPES.THINKING
        : TASK_TYPES.CONVERSATION;
      return decision(intentTier.tier, taskTypeForTier,
        `Intent: ${intentType} → ${intentTier.tier} tier`);
    }
  }

  // ── Unclassified with no intent type — safe default ─────────────────────────
  const lowRisk = (woundRisk === "low" || !woundRisk) && (identityProximity === "low" || !identityProximity);
  if (classificationFallback && lowRisk) {
    return decision("utility", TASK_TYPES.UTILITY, "Unclassified low-risk — nano acknowledgment");
  }

  // ── Default: daily conversation (gpt-5.4-mini) ───────────────────────────────
  return decision("conversation", TASK_TYPES.CONVERSATION, "Standard Monday turn");
}

/**
 * Route a lightweight internal task (intent detection, classification).
 * Uses the utility tier (gpt-5.4-nano).
 */
function routeInternalTask(reason = "Internal task") {
  return decision("utility", TASK_TYPES.UTILITY, reason);
}

/**
 * Route a background worker task. Always uses local Ollama.
 */
function routeBackgroundTask(reason = "Background worker") {
  return decision("background", TASK_TYPES.BACKGROUND, reason);
}

/**
 * Route an embedding task. Always uses local nomic-embed-text.
 */
function routeEmbedding() {
  return decision("embedding", TASK_TYPES.EMBEDDING, "Vector embedding");
}

function decision(tier, taskType, reason, opts = {}) {
  return {
    tier,
    model: tier ? CLOUD_MODELS[tier] : null,
    taskType,
    reason,
    matchedPattern: opts.matchedPattern || null,
    // Legacy field — some code checks paidBlocked for logging
    paidBlocked: false,
  };
}

module.exports = {
  CLOUD_MODELS,
  MODELS, // legacy alias
  TASK_TYPES,
  routeModel,
  routeInternalTask,
  routeBackgroundTask,
  routeEmbedding,
};
