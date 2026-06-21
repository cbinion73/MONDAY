"use strict";
// personal-context.js — Enrich a personalContext object with vault memory recall.
//
// Called once per intelligence turn (before the LLM prompt is built) to surface
// up to DEFAULT_LIMIT relevant Obsidian notes via hybrid retrieval.
//
// Graceful by design:
//   - Returns personalContext unchanged if vault is unavailable, query is empty,
//     retrieval errors, or a hard timeout fires.
//   - Never throws; the turn must proceed even if vault recall fails.
//   - Skips enrichment when captureIntent=true (capture turns don't need recall).
//   - Skips enrichment when memoryRecall is already populated (caller-provided).

const retrieval = require("./retrieval");

const DEFAULT_LIMIT        = 5;
const RETRIEVAL_TIMEOUT_MS = 3000;

/**
 * Add vault memory recall to personalContext before an intelligence turn.
 *
 * @param {string} query            User input for this turn
 * @param {object} personalContext  Existing personalContext object
 * @param {object} opts
 * @param {string} [opts.domain]    Domain hint for focused retrieval
 * @param {number} [opts.limit]     Max results to surface (default 5)
 * @returns {Promise<object>}       personalContext (possibly with memoryRecall added)
 */
async function enrichPersonalContext(query, personalContext = {}, { domain = null, limit = DEFAULT_LIMIT } = {}) {
  if (!query || !query.trim()) return personalContext;
  if (personalContext.captureIntent) return personalContext;
  if (personalContext.memoryRecall && personalContext.memoryRecall.length > 0) return personalContext;

  try {
    const inferredDomain = domain || _inferDomain(personalContext);

    const ctx = await Promise.race([
      retrieval.retrievePersonalContext(query, {
        domain: inferredDomain || null,
        limit,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("vault retrieval timeout")), RETRIEVAL_TIMEOUT_MS)
      ),
    ]);

    if (!ctx || !ctx.ok || !ctx.results || ctx.results.length === 0) return personalContext;

    const memoryRecall = ctx.results.slice(0, limit).map(_formatResult);
    if (!memoryRecall.length) return personalContext;

    return { ...personalContext, memoryRecall };
  } catch {
    return personalContext;
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

function _formatResult(r) {
  const noteName = r.notePath
    ? r.notePath.split("/").pop().replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "")
    : "note";
  const title  = r.heading || noteName;
  const excerpt = String(r.snippet || "").trim().slice(0, 200);
  const table  = r.domain || "vault";
  return { table, title, excerpt };
}

// ── Domain inference ──────────────────────────────────────────────────────────

function _inferDomain(personalContext) {
  if (personalContext.relevantThread?.missionId) {
    return personalContext.relevantThread.missionId;
  }
  const missions = personalContext.missionThreads || [];
  const live     = missions.find((m) => (m.significanceThreads || []).length > 0);
  return live ? live.id : null;
}

module.exports = { enrichPersonalContext };
