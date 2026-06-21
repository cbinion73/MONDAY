"use strict";
// vault-embedder.js — Semantic chunking and LanceDB embedding for the Obsidian vault.
//
// Works in tandem with vault-indexer.js:
//   vault-indexer  → maintains notes/note_links/note_tags in SQLite
//   vault-embedder → maintains vault_chunks in LanceDB + embedding_records in SQLite
//
// Chunking strategy:
//   Split each note at markdown headings (# ## ### etc.).
//   Each chunk = preamble or one heading section with its content.
//   If a section exceeds MAX_CHUNK_CHARS it is split further at paragraph boundaries.
//   Chunks carry: note_path, heading, heading_level, chunk_index, domain, mtime.
//
// Change detection (via SQLite embedding_records):
//   Each chunk has a hash (SHA-256 prefix of its text).
//   If the hash matches the stored record the chunk is skipped.
//   When vault-indexer re-indexes a changed note it clears embedding_records for that path,
//   so embedChangedNotes() picks it up automatically.
//
// Deletion:
//   When a note is removed, deleteNoteEmbeddings() deletes from both LanceDB and SQLite.
//
// Search:
//   searchVault(query, opts) returns results with note_path + heading citations.

const crypto   = require("node:crypto");
const embedder = require("./embedder");
const { ensureTable, getTable, TABLE_NAMES } = require("./vector-store");
const ks = require("../db/knowledge-store");

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CHUNK_CHARS = 2400;   // ~600 tokens — well within nomic-embed-text's 8192 limit
const MIN_CHUNK_CHARS = 80;     // skip near-empty sections
const EMBED_CONCURRENCY = 3;    // notes processed in parallel
const TABLE = TABLE_NAMES.vault_chunks;

// Seed row establishes the LanceDB schema — never written to real searches.
const CHUNK_SEED = {
  id:            "_seed",
  vector:        embedder.zeroVector(),
  note_path:     "",
  heading:       "",
  heading_level: 0,
  chunk_index:   0,
  chunk_text:    "",
  domain:        "",
  mtime:         "",
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Embed all notes whose embedding_records were invalidated by vault-indexer.
 * Safe to call frequently — skips notes with up-to-date embeddings.
 * Returns: { ok, embedded, skipped, deleted, errors }
 */
async function embedChangedNotes() {
  const stats = { ok: true, embedded: 0, skipped: 0, deleted: 0, errors: [] };

  try {
    // 1. Delete LanceDB chunks for notes that no longer exist in the vault
    const stalePaths = ks.getStaleEmbeddingPaths();
    for (const notePath of stalePaths) {
      await _deleteChunksFromLanceDB(notePath);
      ks.deleteEmbeddingRecordsByPath(notePath);
      stats.deleted++;
    }

    // 2. Find notes that need embedding (no embedding_records row OR mtime mismatch)
    const allNotes     = ks.getAllNotes();
    const needsEmbed   = allNotes.filter((note) => {
      const recs = ks.getEmbeddingRecordsByPath(note.path);
      if (recs.length === 0) return true;                          // never embedded
      // If any record has a different mtime, note changed → re-embed
      return recs.some((r) => r.note_mtime !== note.mtime);
    });

    // 3. Process in batches
    for (let i = 0; i < needsEmbed.length; i += EMBED_CONCURRENCY) {
      const batch = needsEmbed.slice(i, i + EMBED_CONCURRENCY);
      const results = await Promise.all(batch.map((note) => _embedNote(note).catch((err) => ({ ok: false, error: err.message, path: note.path }))));
      for (const r of results) {
        if (r.ok) {
          stats.embedded += r.chunksWritten;
          stats.skipped  += r.chunksSkipped;
        } else {
          stats.errors.push(r.error || r.path);
        }
      }
    }
  } catch (err) {
    stats.ok    = false;
    stats.error = err.message;
  }

  return stats;
}

/**
 * Force-embed a single note by vault-relative path.
 * Clears existing embeddings for the path first.
 */
async function embedNote(notePath) {
  const note = ks.getNote(notePath);
  if (!note) return { ok: false, error: "Note not in index — run sync first" };
  await _deleteChunksFromLanceDB(notePath);
  ks.deleteEmbeddingRecordsByPath(notePath);
  return _embedNote(note);
}

/**
 * Remove all LanceDB chunks and SQLite records for a note.
 */
async function deleteNoteEmbeddings(notePath) {
  await _deleteChunksFromLanceDB(notePath);
  ks.deleteEmbeddingRecordsByPath(notePath);
  return { ok: true };
}

/**
 * Semantic search over vault chunks.
 * Returns results with note_path, heading, excerpt, domain, score, and citation string.
 *
 * @param {string} query
 * @param {object} opts
 * @param {string}   [opts.domain]   filter to one domain
 * @param {number}   [opts.limit]    max results (default 8)
 * @param {number}   [opts.minScore] minimum similarity score 0–1 (default 0.3)
 */
async function searchVault(query, { domain = null, limit = 8, minScore = 0.3 } = {}) {
  if (!query) return { ok: false, results: [], query: "" };

  const queryVec = await embedder.embed(query);
  if (!queryVec) return { ok: false, results: [], query, error: "embed_failed" };

  const table = await getTable(TABLE);
  if (!table) return { ok: true, results: [], query };   // not yet populated

  const overfetch = Math.min((limit + 10) * (domain ? 3 : 1), 100);
  const rows = await table.vectorSearch(queryVec).limit(overfetch).toArray();

  let results = rows
    .filter((r) => r.id !== "_seed")
    .filter((r) => !domain || r.domain === domain)
    .map((r) => ({
      noteChunk: {
        notePath:     r.note_path,
        heading:      r.heading || "",
        headingLevel: r.heading_level || 0,
        chunkIndex:   r.chunk_index,
        chunkText:    r.chunk_text || "",
        domain:       r.domain || "",
        mtime:        r.mtime || "",
      },
      score:    r._distance != null ? Math.round((1 - r._distance) * 1000) / 1000 : null,
      citation: _citation(r.note_path, r.heading),
      excerpt:  _excerpt(r.chunk_text),
    }))
    .filter((r) => r.score == null || r.score >= minScore)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);

  return { ok: true, results, query };
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _embedNote(note) {
  const result = { ok: true, path: note.path, chunksWritten: 0, chunksSkipped: 0 };

  // Read raw body from the vault — SQLite only stores the hash
  let rawText;
  try {
    const fs   = require("node:fs");
    const path = require("node:path");
    const { getVaultRoot } = require("../obsidian/vault-manager");
    rawText = fs.readFileSync(path.join(getVaultRoot(), note.path), "utf8");
  } catch {
    result.ok    = false;
    result.error = `Cannot read ${note.path}`;
    return result;
  }

  const chunks = chunkMarkdown(rawText);
  if (chunks.length === 0) return result;

  // Clear stale LanceDB rows before writing new ones
  await _deleteChunksFromLanceDB(note.path);
  ks.deleteEmbeddingRecordsByPath(note.path);

  const table = await ensureTable(TABLE, CHUNK_SEED);

  for (let i = 0; i < chunks.length; i++) {
    const chunk    = chunks[i];
    const chunkId  = _chunkId(note.path, i);
    const textHash = _hash(chunk.text);

    // Skip if identical chunk already embedded (shouldn't happen after clear, but safe)
    const existing = ks.getEmbeddingRecord(chunkId);
    if (existing && existing.chunk_hash === textHash) {
      result.chunksSkipped++;
      continue;
    }

    const vector = await embedder.embed(chunk.text) || embedder.zeroVector();

    await table.add([{
      id:            chunkId,
      vector,
      note_path:     note.path,
      heading:       chunk.heading,
      heading_level: chunk.headingLevel,
      chunk_index:   i,
      chunk_text:    chunk.text.slice(0, MAX_CHUNK_CHARS),
      domain:        note.domain || "",
      mtime:         note.mtime  || "",
    }]);

    ks.upsertEmbeddingRecord({
      id:         chunkId,
      notePath:   note.path,
      heading:    chunk.heading || null,
      chunkIndex: i,
      chunkHash:  textHash,
      model:      embedder.MODEL,
      dimensions: embedder.DIM,
      noteMtime:  note.mtime || null,
    });

    result.chunksWritten++;
  }

  return result;
}

async function _deleteChunksFromLanceDB(notePath) {
  try {
    const table = await getTable(TABLE);
    if (!table) return;
    // Escape single quotes in path to avoid SQL injection
    const safe = notePath.replace(/'/g, "''");
    await table.delete(`note_path = '${safe}'`);
  } catch {
    // Table may not exist yet — fine
  }
}

// ── Markdown chunker ──────────────────────────────────────────────────────────

/**
 * Split a markdown document into heading-level chunks.
 * Each chunk has: { heading, headingLevel, text }
 * Chunks shorter than MIN_CHUNK_CHARS are merged with their predecessor.
 * Chunks longer than MAX_CHUNK_CHARS are split at paragraph boundaries.
 *
 * @param {string} raw  — full raw markdown including frontmatter
 * @returns {Array<{heading: string, headingLevel: number, text: string}>}
 */
function chunkMarkdown(raw) {
  const text = String(raw || "");

  // Strip frontmatter
  let body = text;
  if (text.startsWith("---")) {
    const end = text.indexOf("\n---", 3);
    if (end !== -1) body = text.slice(end + 4).trim();
  }

  if (!body.trim()) return [];

  // Split at heading lines
  const headingRe = /^(#{1,6})\s+(.+)$/m;
  const lines     = body.split("\n");
  const sections  = [];   // [{ heading, headingLevel, lines[] }]
  let current     = { heading: "", headingLevel: 0, lines: [] };

  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      if (current.lines.some((l) => l.trim())) {
        sections.push(current);
      }
      current = { heading: m[2].trim(), headingLevel: m[1].length, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some((l) => l.trim())) sections.push(current);

  // Convert sections to chunks, splitting oversized ones
  const chunks = [];
  for (const section of sections) {
    const sectionText = section.lines.join("\n").trim();
    if (!sectionText) continue;

    if (sectionText.length <= MAX_CHUNK_CHARS) {
      chunks.push({ heading: section.heading, headingLevel: section.headingLevel, text: sectionText });
    } else {
      // Split at paragraph boundaries (blank lines), then word-boundaries if a single
      // paragraph still exceeds MAX_CHUNK_CHARS.
      const rawParas = sectionText.split(/\n\n+/);
      // Expand any oversized paragraph into word-boundary pieces
      const paragraphs = rawParas.flatMap((p) => {
        if (p.length <= MAX_CHUNK_CHARS) return [p];
        const pieces = [];
        let pos = 0;
        while (pos < p.length) {
          let end = pos + MAX_CHUNK_CHARS;
          if (end >= p.length) { pieces.push(p.slice(pos).trim()); break; }
          const ws = p.lastIndexOf(" ", end);
          if (ws > pos) end = ws;
          const piece = p.slice(pos, end).trim();
          if (piece) pieces.push(piece);
          pos = end + 1;
        }
        return pieces;
      });
      let buffer = "";
      let firstChunk = true;
      for (const para of paragraphs) {
        const candidate = buffer ? buffer + "\n\n" + para : para;
        if (candidate.length > MAX_CHUNK_CHARS && buffer) {
          chunks.push({
            heading:      firstChunk ? section.heading : `${section.heading} (cont.)`,
            headingLevel: section.headingLevel,
            text:         buffer.trim(),
          });
          buffer     = para;
          firstChunk = false;
        } else {
          buffer = candidate;
        }
      }
      if (buffer.trim()) {
        chunks.push({
          heading:      firstChunk ? section.heading : `${section.heading} (cont.)`,
          headingLevel: section.headingLevel,
          text:         buffer.trim(),
        });
      }
    }
  }

  // Merge tiny chunks (shorter than MIN_CHUNK_CHARS) into their predecessor
  const merged = [];
  for (const chunk of chunks) {
    if (chunk.text.length < MIN_CHUNK_CHARS && merged.length > 0) {
      merged[merged.length - 1].text += "\n\n" + chunk.text;
    } else {
      merged.push({ ...chunk });
    }
  }

  return merged;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _chunkId(notePath, index) {
  return `${notePath}::${index}`;
}

function _hash(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex").slice(0, 16);
}

function _citation(notePath, heading) {
  if (!heading) return notePath;
  return `${notePath} § ${heading}`;
}

function _excerpt(text, len = 280) {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= len ? clean : clean.slice(0, len) + "…";
}

module.exports = {
  embedChangedNotes,
  embedNote,
  deleteNoteEmbeddings,
  searchVault,
  chunkMarkdown,      // exported for tests
};
