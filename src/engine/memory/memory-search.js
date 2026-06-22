"use strict";
// memory-search.js — semantic search over the vector store.
// Returns ranked results with metadata and text excerpt.

const { embed } = require("./embedder");
const { getTable, TABLE_NAMES } = require("./vector-store");

const DEFAULT_LIMIT = 5;
const EXCERPT_LEN   = 300;

function excerpt(text) {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= EXCERPT_LEN ? t : t.slice(0, EXCERPT_LEN) + "…";
}

/**
 * Search a single table.
 * @param {string} tableName
 * @param {number[]} queryVec
 * @param {number} limit
 * @param {string|null} domainFilter   exact domain string or null
 * @returns {Promise<object[]>}
 */
async function searchTable(tableName, queryVec, limit, domainFilter) {
  const table = await getTable(tableName);
  if (!table) return [];

  let q = table.vectorSearch(queryVec).limit(limit + 10); // over-fetch for post-filter

  const rows = await q.toArray();

  let results = rows;
  if (domainFilter) {
    results = results.filter((r) => r.domain === domainFilter);
  }
  // Filter out seed rows
  results = results.filter((r) => r.id !== "_seed");

  return results.slice(0, limit);
}

/**
 * Semantic search across memory.
 * @param {string} query — natural language query
 * @param {object} [opts]
 * @param {string}   [opts.domain]  filter to one domain (health/work/etc.)
 * @param {string[]} [opts.tables]  which tables to search; defaults to all
 * @param {number}   [opts.limit]   results per table
 * @returns {Promise<{ok: boolean, results: object[], query: string}>}
 */
async function search(query, { domain = null, tables = null, limit = DEFAULT_LIMIT } = {}) {
  if (!query || typeof query !== "string") {
    return { ok: false, results: [], query: "" };
  }

  const queryVec = await embed(query);
  if (!queryVec) {
    return { ok: false, results: [], query, error: "embed_failed" };
  }

  const targetTables = tables || Object.values(TABLE_NAMES);
  const allResults = [];

  await Promise.all(
    targetTables.map(async (name) => {
      const rows = await searchTable(name, queryVec, limit, domain);
      for (const row of rows) {
        allResults.push({
          table: name,
          id: row.id,
          score: row._distance != null ? 1 - row._distance : null,
          title: row.title || null,
          domain: row.domain || null,
          type: row.type || null,
          source: row.source || null,
          role: row.role || null,
          session: row.session || null,
          ts: row.ts || null,
          excerpt: excerpt(row.text),
        });
      }
    })
  );

  // Sort by score descending (lower _distance = more similar)
  allResults.sort((a, b) => {
    if (a.score == null && b.score == null) return 0;
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score;
  });

  return { ok: true, results: allResults.slice(0, limit * targetTables.length), query };
}

/**
 * Search only notes/missions.
 */
async function searchNotes(query, opts = {}) {
  return search(query, { ...opts, tables: [TABLE_NAMES.notes] });
}

/**
 * Search only captures.
 */
async function searchCaptures(query, opts = {}) {
  return search(query, { ...opts, tables: [TABLE_NAMES.captures] });
}

/**
 * Search only conversation turns.
 */
async function searchTurns(query, opts = {}) {
  return search(query, { ...opts, tables: [TABLE_NAMES.turns] });
}

async function searchCorrespondence(query, opts = {}) {
  return search(query, { ...opts, tables: [TABLE_NAMES.correspondence] });
}

module.exports = { search, searchNotes, searchCaptures, searchTurns, searchCorrespondence };
