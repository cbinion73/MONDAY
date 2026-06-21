"use strict";
// LLM Cost Tracker — records every cloud model call with token counts and USD cost.
// Wired into llm-router.js after each successful OpenAI response.
// Costs are written to SQLite and queryable via getCostSummary().

const { getDb } = require("./connection");

// ── Model pricing (USD per 1M tokens) ─────────────────────────────────────────
// Override any rate via env: MONDAY_COST_<MODEL_SLUG>_IN / _OUT
// Model slugs: dots and hyphens become underscores, uppercased.
// e.g. gpt-5.4-mini → MONDAY_COST_GPT_5_4_MINI_IN

const BASE_RATES = {
  "gpt-5.4-nano": { in: 0.20,  out: 1.25  },
  "gpt-5.4-mini": { in: 0.75,  out: 4.50  },
  "gpt-5.4":      { in: 2.50,  out: 15.00 },
  "o3":           { in: 10.00, out: 40.00 },
  "o3-mini":      { in: 1.10,  out: 4.40  },
  "gpt-5.5":      { in: 5.00,  out: 30.00 },
  "gpt-4o":       { in: 2.50,  out: 10.00 },
};

function ratesFor(model) {
  if (BASE_RATES[model]) return BASE_RATES[model];

  // Prefix match — handles minor version variants (gpt-5.4-mini-2025-xx)
  const prefix = Object.keys(BASE_RATES).find(k => model.startsWith(k));
  if (prefix) return BASE_RATES[prefix];

  // Unknown model — log a warning and use a safe default so tracking doesn't break
  console.warn(`[cost-tracker] unknown model "${model}" — using $2.50/$10.00 fallback`);
  return { in: 2.50, out: 10.00 };
}

function calcCost(model, inputTokens, outputTokens) {
  const rates = ratesFor(model);
  const inputCost  = (inputTokens  / 1_000_000) * rates.in;
  const outputCost = (outputTokens / 1_000_000) * rates.out;
  return { inputCost, outputCost, totalCost: inputCost + outputCost };
}

// ── Write ──────────────────────────────────────────────────────────────────────

/**
 * Record one LLM call.
 * Non-blocking — errors are caught so cost tracking never breaks a conversation.
 *
 * @param {object} opts
 *   opts.model        - e.g. "gpt-5.4-mini"
 *   opts.tier         - "conversation" | "thinking" | "strategic" | etc.
 *   opts.purpose      - free-label for the call context (e.g. "daily-brief", "review")
 *   opts.inputTokens  - from usage.prompt_tokens
 *   opts.outputTokens - from usage.completion_tokens
 */
function trackCall({ model, tier = null, purpose = null, inputTokens = 0, outputTokens = 0 }) {
  try {
    const { inputCost, outputCost, totalCost } = calcCost(model, inputTokens, outputTokens);
    getDb().prepare(`
      INSERT INTO llm_cost_log
        (model, tier, purpose, input_tokens, output_tokens, input_cost_usd, output_cost_usd, total_cost_usd, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(model, tier, purpose, inputTokens, outputTokens, inputCost, outputCost, totalCost, new Date().toISOString());
  } catch (err) {
    console.error("[cost-tracker] write failed:", err.message);
  }
}

// ── Query ──────────────────────────────────────────────────────────────────────

function todayPrefix() {
  return new Date().toISOString().slice(0, 10); // "2026-06-21"
}

function monthPrefix() {
  return new Date().toISOString().slice(0, 7);  // "2026-06"
}

/** Today's spend: total USD and call count. */
function getDailyCost() {
  const prefix = todayPrefix();
  return getDb().prepare(`
    SELECT
      COUNT(*)            AS calls,
      SUM(input_tokens)   AS input_tokens,
      SUM(output_tokens)  AS output_tokens,
      SUM(total_cost_usd) AS total_usd
    FROM llm_cost_log
    WHERE created_at >= ?
  `).get(prefix + "T00:00:00.000Z");
}

/** This calendar month's spend. */
function getMonthlyCost() {
  const prefix = monthPrefix();
  return getDb().prepare(`
    SELECT
      COUNT(*)            AS calls,
      SUM(input_tokens)   AS input_tokens,
      SUM(output_tokens)  AS output_tokens,
      SUM(total_cost_usd) AS total_usd
    FROM llm_cost_log
    WHERE created_at >= ?
  `).get(prefix + "-01T00:00:00.000Z");
}

/** Per-tier breakdown for a time window. Default: last 30 days. */
function getCostByTier({ since = null } = {}) {
  const from = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return getDb().prepare(`
    SELECT
      tier,
      COUNT(*)            AS calls,
      SUM(input_tokens)   AS input_tokens,
      SUM(output_tokens)  AS output_tokens,
      SUM(total_cost_usd) AS total_usd
    FROM llm_cost_log
    WHERE created_at >= ?
    GROUP BY tier
    ORDER BY total_usd DESC
  `).all(from);
}

/** Per-model breakdown for a time window. Default: last 30 days. */
function getCostByModel({ since = null } = {}) {
  const from = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return getDb().prepare(`
    SELECT
      model,
      COUNT(*)            AS calls,
      SUM(input_tokens)   AS input_tokens,
      SUM(output_tokens)  AS output_tokens,
      SUM(total_cost_usd) AS total_usd
    FROM llm_cost_log
    WHERE created_at >= ?
    GROUP BY model
    ORDER BY total_usd DESC
  `).all(from);
}

/** Daily totals for the last N days (for sparklines / trends). */
function getDailyTotals({ days = 30 } = {}) {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return getDb().prepare(`
    SELECT
      substr(created_at, 1, 10) AS date,
      COUNT(*)                  AS calls,
      SUM(total_cost_usd)       AS total_usd
    FROM llm_cost_log
    WHERE created_at >= ?
    GROUP BY date
    ORDER BY date ASC
  `).all(from);
}

/** Full summary object — used by the /gateway/costs endpoint. */
function getCostSummary() {
  return {
    today:      getDailyCost(),
    thisMonth:  getMonthlyCost(),
    byTier:     getCostByTier(),
    byModel:    getCostByModel(),
    daily30:    getDailyTotals({ days: 30 }),
    rates:      BASE_RATES,
  };
}

/** Most recent N calls (for debug / audit). */
function getRecentCalls({ limit = 20 } = {}) {
  return getDb().prepare(`
    SELECT id, model, tier, purpose, input_tokens, output_tokens, total_cost_usd, created_at
    FROM llm_cost_log
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  trackCall,
  getDailyCost,
  getMonthlyCost,
  getCostByTier,
  getCostByModel,
  getDailyTotals,
  getCostSummary,
  getRecentCalls,
  BASE_RATES,
};
