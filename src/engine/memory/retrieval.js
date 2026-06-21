"use strict";
// retrieval.js — Hybrid personal context retrieval.
//
// Combines three channels:
//   semantic  — LanceDB vector search (searchVault)
//   keyword   — SQLite title + tag search
//   graph     — entity name search + inbound link traversal
//
// Results are deduplicated by (notePath, heading) and sorted: semantic first
// (has a score), then keyword, then graph. All channels run in parallel.
//
// Usage:
//   const { retrievePersonalContext } = require("./retrieval");
//   const ctx = await retrievePersonalContext("retirement plan", { domain: "retirement" });

const ks = require("../db/knowledge-store");
const { searchVault } = require("./vault-embedder");

const DEFAULT_LIMIT = 5;

// ── Public ────────────────────────────────────────────────────────────────────

/**
 * Retrieve personal context relevant to a query across all three channels.
 *
 * @param {string} query
 * @param {object} opts
 * @param {string}   [opts.domain]    filter to one domain
 * @param {number}   [opts.limit]     max results returned (default 5)
 * @param {string[]} [opts.channels]  subset of ['semantic','keyword','graph']
 * @param {number}   [opts.minScore]  min semantic score 0–1 (default 0.3)
 * @returns {Promise<{ok, query, results, deduped, channels}>}
 */
async function retrievePersonalContext(query, {
  domain    = null,
  limit     = DEFAULT_LIMIT,
  channels  = ["semantic", "keyword", "graph"],
  minScore  = 0.3,
} = {}) {
  if (!query || !query.trim()) return { ok: false, results: [], query: query || "" };

  const active   = Array.isArray(channels) ? channels : ["semantic", "keyword", "graph"];
  const promises = [];
  const names    = [];

  if (active.includes("semantic")) {
    promises.push(_semanticSearch(query, { domain, limit: limit + 5, minScore }));
    names.push("semantic");
  }
  if (active.includes("keyword")) {
    promises.push(Promise.resolve(_keywordSearch(query, { domain, limit })));
    names.push("keyword");
  }
  if (active.includes("graph")) {
    promises.push(Promise.resolve(_graphSearch(query, { domain, limit })));
    names.push("graph");
  }

  const raw = await Promise.all(promises);

  const byChannel = {};
  for (let i = 0; i < names.length; i++) {
    byChannel[names[i]] = (raw[i] || []).length;
  }

  const allResults = raw.flat().filter(Boolean);
  const deduped    = _dedup(allResults).slice(0, limit * 2);

  return {
    ok:       true,
    query,
    results:  deduped,
    deduped:  true,
    channels: byChannel,
  };
}

// ── Channels ──────────────────────────────────────────────────────────────────

async function _semanticSearch(query, { domain, limit, minScore }) {
  try {
    const res = await searchVault(query, { domain: domain || undefined, limit, minScore });
    if (!res.ok) return [];
    return res.results.map((r) => ({
      source:   "semantic",
      notePath: r.noteChunk.notePath,
      heading:  r.noteChunk.heading || null,
      domain:   r.noteChunk.domain  || null,
      snippet:  r.excerpt,
      citation: r.citation,
      score:    r.score,
      metadata: {
        headingLevel: r.noteChunk.headingLevel,
        mtime:        r.noteChunk.mtime,
      },
    }));
  } catch {
    return [];
  }
}

function _keywordSearch(query, { domain, limit }) {
  try {
    const terms = _terms(query);
    if (!terms.length) return [];

    // Title match
    let notes = ks.getAllNotes();
    if (domain) notes = notes.filter((n) => n.domain === domain);

    const titleHits = notes.filter((n) =>
      n.title && terms.some((t) => n.title.toLowerCase().includes(t))
    );

    // Tag match — look up notes for each term as a tag
    const tagHitMap = new Map();
    for (const term of terms) {
      const tagged = ks.getNotesByTag(term);
      for (const n of tagged) {
        if (!domain || n.domain === domain) tagHitMap.set(n.path, n);
      }
    }

    // Merge title + tag, title wins on overlap
    const merged = new Map();
    for (const n of [...titleHits, ...tagHitMap.values()]) {
      if (!merged.has(n.path)) {
        merged.set(n.path, {
          source:   "keyword",
          notePath: n.path,
          heading:  null,
          domain:   n.domain || null,
          snippet:  n.title  || n.path,
          citation: n.path,
          score:    null,
          metadata: { type: n.type, folder: n.folder },
        });
      }
    }

    return [...merged.values()].slice(0, limit);
  } catch {
    return [];
  }
}

function _graphSearch(query, { domain, limit }) {
  try {
    const terms   = _terms(query);
    const noteMap = new Map();

    // 1. Entity name / description search
    const entities = ks.searchEntities(query);
    for (const e of entities.slice(0, limit * 2)) {
      const src = e.sourcePath;
      if (!src) continue;
      if (domain) {
        const note = ks.getNote(src);
        if (!note || note.domain !== domain) continue;
      }
      if (!noteMap.has(src)) {
        const desc = e.description ? `: ${e.description.slice(0, 120)}` : "";
        noteMap.set(src, {
          source:   "graph",
          notePath: src,
          heading:  null,
          domain:   e.domain || null,
          snippet:  `[${e.type}] ${e.name}${desc}`,
          citation: src,
          score:    null,
          metadata: { entityType: e.type, entityName: e.name },
        });
      }
    }

    // 2. Inbound link traversal: find notes whose title matches, then follow
    //    notes that link TO them (1-hop inbound).
    let notes = ks.getAllNotes();
    if (domain) notes = notes.filter((n) => n.domain === domain);

    const titleMatchPaths = notes
      .filter((n) => n.title && terms.some((t) => n.title.toLowerCase().includes(t)))
      .map((n) => n.path)
      .slice(0, 6);

    for (const targetPath of titleMatchPaths) {
      const inbound = ks.getLinksTo(targetPath).slice(0, 4);
      for (const link of inbound) {
        const src = link.source_path;
        if (noteMap.has(src)) continue;
        const note = ks.getNote(src);
        if (!note) continue;
        if (domain && note.domain !== domain) continue;
        noteMap.set(src, {
          source:   "graph",
          notePath: src,
          heading:  null,
          domain:   note.domain || null,
          snippet:  `Links to: ${targetPath}${link.target_alias ? ` ("${link.target_alias}")` : ""}`,
          citation: src,
          score:    null,
          metadata: { linksTo: targetPath },
        });
      }
    }

    return [...noteMap.values()].slice(0, limit);
  } catch {
    return [];
  }
}

// ── Deduplication ─────────────────────────────────────────────────────────────
// Key: notePath + heading (semantic results may refer to a specific section;
// keyword/graph results refer to the whole note).
// Priority: semantic (has score, heading-specific) > keyword > graph.
// Within same key, the first insertion wins.

function _dedup(results) {
  const seen = new Map();

  const ordered = [
    ...results.filter((r) => r.source === "semantic"),
    ...results.filter((r) => r.source === "keyword"),
    ...results.filter((r) => r.source === "graph"),
  ];

  for (const r of ordered) {
    const key = `${r.notePath}::${r.heading || ""}`;
    if (!seen.has(key)) seen.set(key, r);
  }

  return [...seen.values()].sort((a, b) => {
    // Semantic results with scores rank first
    if (a.score != null && b.score == null) return -1;
    if (a.score == null && b.score != null) return  1;
    if (a.score != null && b.score != null) return b.score - a.score;
    // keyword before graph for scoreless results
    const rank = { keyword: 0, graph: 1 };
    return (rank[a.source] ?? 2) - (rank[b.source] ?? 2);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _terms(query) {
  return String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);   // skip short stop-word fragments
}

module.exports = { retrievePersonalContext };
