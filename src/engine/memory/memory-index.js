"use strict";
// memory-index.js — public API for Monday's vector memory.
// Wire this into the JARVIS loop for semantic recall before answering.

const writer = require("./memory-writer");
const searcher = require("./memory-search");
const { resolveMemoryDir } = require("./vector-store");

// ── Write ──────────────────────────────────────────────────────────────────

module.exports.indexNote     = writer.indexNote;
module.exports.indexCapture  = writer.indexCapture;
module.exports.indexTurn     = writer.indexTurn;
module.exports.indexDirectory = writer.indexDirectory;

// ── Search ─────────────────────────────────────────────────────────────────

module.exports.search         = searcher.search;
module.exports.searchNotes    = searcher.searchNotes;
module.exports.searchCaptures = searcher.searchCaptures;
module.exports.searchTurns    = searcher.searchTurns;

// ── Context recall (used by JARVIS loop) ──────────────────────────────────
//
// Returns the most relevant memory snippets for a given user input.
// Safe to call even if the vector store hasn't been initialized yet —
// returns an empty array rather than throwing.

/**
 * @param {string} input — raw user input or engine query
 * @param {object} [opts]
 * @param {string} [opts.domain]  constrain to one domain
 * @param {number} [opts.limit]   total results (default 6)
 * @returns {Promise<object[]>}   array of {table, title, excerpt, domain, ts, score}
 */
async function recall(input, { domain = null, limit = 6 } = {}) {
  try {
    const res = await searcher.search(input, { domain, limit });
    if (!res.ok) return [];
    return res.results;
  } catch {
    return [];
  }
}

module.exports.recall = recall;

// ── Bootstrap ──────────────────────────────────────────────────────────────
//
// Called once at startup to seed the vector store from known locations.
// Non-blocking — fires and forgets; logs errors but never crashes.

async function bootstrap() {
  const fs   = require("node:fs");
  const path = require("node:path");

  const VAULT   = process.env.MONDAY_OBSIDIAN_VAULT   || "/Volumes/Monday/Obsidian/Monday";
  const MISSIONS = process.env.MONDAY_MISSIONS_DIR    || "/Volumes/Monday/Monday/missions";

  const tasks = [
    { dir: VAULT,    domain: "",   type: "note"    },
    { dir: MISSIONS, domain: "",   type: "mission" },
  ];

  let total = 0;
  for (const { dir, domain, type } of tasks) {
    if (!fs.existsSync(dir)) continue;
    try {
      const n = await writer.indexDirectory(dir, domain, type);
      total += n;
    } catch (err) {
      console.warn(`[memory] bootstrap skip ${dir}:`, err.message);
    }
  }

  if (total > 0) {
    console.log(`[memory] bootstrapped ${total} documents`);
  }
}

module.exports.bootstrap = bootstrap;
module.exports.resolveMemoryDir = resolveMemoryDir;
