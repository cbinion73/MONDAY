"use strict";
// vault-indexer.js — Keeps monday.db in sync with the Obsidian vault.
//
// Two public entry points:
//   sync()    — incremental: only process new, changed, and deleted notes
//   reindex() — full: reprocess every note regardless of change state
//
// Owns: notes, note_links, note_tags, indexing_runs tables
// Does not embed — that is vault-embedder.js (step #3)
// Safe to call while the vault is being written by another process

const fs     = require("node:fs");
const path   = require("node:path");
const crypto = require("node:crypto");
const { getVaultRoot, vaultAvailable } = require("./vault-manager");
const ks = require("../db/knowledge-store");

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Incremental sync — only processes notes that are new, changed, or deleted.
 * Safe to call frequently; unchanged files are skipped after a hash check.
 */
async function sync() {
  if (!vaultAvailable()) return { ok: false, skipped: true, reason: "vault not mounted" };
  return _run({ force: false });
}

/**
 * Full reindex — processes every note in the vault regardless of change state.
 * Use after a vault migration, bulk import, or when the DB is rebuilt from scratch.
 */
async function reindex() {
  if (!vaultAvailable()) return { ok: false, skipped: true, reason: "vault not mounted" };
  return _run({ force: true });
}

/**
 * Status of the last indexing run.
 */
function getIndexingStatus() {
  const last = ks.getLastIndexingRun();
  const noteCount = ks.getNoteCount();
  return {
    lastRun: last || null,
    noteCount,
    vaultAvailable: vaultAvailable(),
    vaultRoot: getVaultRoot(),
  };
}

// ── Core run ──────────────────────────────────────────────────────────────────

async function _run({ force }) {
  const runId = ks.startIndexingRun();
  const stats = { scanned: 0, indexed: 0, skipped: 0, deleted: 0 };

  try {
    // 1. Walk the filesystem
    const fsFiles = scanVault();            // Map<relPath, { mtime, absPath }>
    stats.scanned = fsFiles.size;

    // 2. Build a title→path resolution map for wikilink resolution
    //    We pass this to all note parsers so links can be resolved in one scan.
    const titleMap = buildTitleMap(fsFiles);

    // 3. Detect deleted and moved notes
    const { deleted, moved } = detectRemovals(fsFiles);
    for (const [oldPath, newPath] of moved) {
      ks.upsertNote({ ...(ks.getNote(oldPath) || {}), path: newPath });
      ks.deleteNote(oldPath);
      stats.indexed++;
    }
    for (const relPath of deleted) {
      ks.deleteNote(relPath);
      ks.deleteEmbeddingRecordsByPath(relPath);
      stats.deleted++;
    }

    // 4. Process each file in the filesystem
    for (const [relPath, { mtime, absPath }] of fsFiles) {
      const existing = ks.getNote(relPath);
      const mtimeISO = new Date(mtime).toISOString();

      if (!force && existing) {
        // Quick skip: mtime hasn't changed → no work needed
        if (existing.mtime === mtimeISO) {
          stats.skipped++;
          continue;
        }
      }

      let raw;
      try {
        raw = fs.readFileSync(absPath, "utf8");
      } catch {
        stats.skipped++;
        continue;                            // File disappeared between scan and read
      }

      const parsed = parseMarkdown(raw, relPath);
      const hash   = bodyHash(parsed.body);

      if (!force && existing && existing.bodyHash === hash) {
        // mtime changed but content didn't (e.g. touch, iCloud sync metadata)
        ks.upsertNote({ ...existing, mtime: mtimeISO });
        stats.skipped++;
        continue;
      }

      // Write note metadata to SQLite
      ks.upsertNote({
        path:        relPath,
        title:       parsed.title,
        folder:      parsed.folder,
        type:        parsed.type,
        domain:      parsed.domain,
        frontmatter: parsed.frontmatter,
        bodyHash:    hash,
        mtime:       mtimeISO,
        wordCount:   countWords(parsed.body),
        indexedAt:   new Date().toISOString(),
      });

      // Replace wikilinks and tags (full replace — idempotent)
      const resolvedLinks = resolveLinks(parsed.wikilinks, relPath, titleMap);
      ks.replaceNoteLinks(relPath, resolvedLinks);
      ks.replaceNoteTags(relPath, parsed.tags);

      // Invalidate any stale embeddings so vault-embedder picks this up
      ks.deleteEmbeddingRecordsByPath(relPath);

      stats.indexed++;
    }

    ks.completeIndexingRun(runId, stats);
    return { ok: true, runId, ...stats };

  } catch (err) {
    ks.failIndexingRun(runId, err.message);
    return { ok: false, error: err.message, runId, ...stats };
  }
}

// ── Filesystem scan ───────────────────────────────────────────────────────────

/**
 * Walk the vault and return a Map<relPath, { mtime, absPath }>.
 * Skips hidden directories (.obsidian, .trash, etc.) and non-.md files.
 */
function scanVault() {
  const root   = getVaultRoot();
  const result = new Map();
  walkDir(root, root, result);
  return result;
}

function walkDir(root, dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;       // skip .obsidian, .trash, etc.
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(root, abs, acc);
    } else if (entry.name.endsWith(".md")) {
      try {
        const stat = fs.statSync(abs);
        const rel  = path.relative(root, abs).replace(/\\/g, "/");
        acc.set(rel, { mtime: stat.mtimeMs, absPath: abs });
      } catch {
        // File disappeared — skip
      }
    }
  }
}

// ── Deletion / move detection ─────────────────────────────────────────────────

/**
 * Compare the DB's known note paths against the current filesystem.
 * Returns:
 *   deleted — paths in DB that are no longer on disk (and no hash match elsewhere)
 *   moved   — Map<oldPath, newPath> where the content hash appeared at a new location
 */
function detectRemovals(fsFiles) {
  const dbNotes  = ks.getAllNotes();
  const fsPaths  = new Set(fsFiles.keys());

  // Build a hash→newPath map from files that are NEW (not in DB)
  const dbPaths  = new Set(dbNotes.map((n) => n.path));
  const hashToNewPath = new Map();
  for (const [relPath, { absPath }] of fsFiles) {
    if (!dbPaths.has(relPath)) {
      try {
        const raw  = fs.readFileSync(absPath, "utf8");
        const hash = bodyHash(parseMarkdown(raw, relPath).body);
        if (hash && !hashToNewPath.has(hash)) hashToNewPath.set(hash, relPath);
      } catch {
        // unreadable new file — skip
      }
    }
  }

  const deleted = [];
  const moved   = new Map();

  for (const note of dbNotes) {
    if (fsPaths.has(note.path)) continue;           // still present — no action

    // Not on disk — check if it moved (hash appears at a new path)
    if (note.bodyHash && hashToNewPath.has(note.bodyHash)) {
      moved.set(note.path, hashToNewPath.get(note.bodyHash));
    } else {
      deleted.push(note.path);
    }
  }

  return { deleted, moved };
}

// ── Title map for wikilink resolution ────────────────────────────────────────

/**
 * Build a Map<normalizedTitle, relPath> from the filesystem.
 * Used to resolve [[Link Text]] → actual note paths.
 * On collision (two notes with same title), prefer shorter path (root-level wins).
 */
function buildTitleMap(fsFiles) {
  const map = new Map();
  for (const [relPath] of fsFiles) {
    const baseName  = path.basename(relPath, ".md");
    const titleKey  = normalizeTitle(baseName);
    const existing  = map.get(titleKey);
    if (!existing || relPath.split("/").length < existing.split("/").length) {
      map.set(titleKey, relPath);
    }
  }
  return map;
}

function resolveLinks(wikilinks, sourcePath, titleMap) {
  return wikilinks.map((link) => {
    const targetPath = titleMap.get(normalizeTitle(link.targetAlias)) || null;
    return {
      targetAlias: link.targetAlias,
      targetPath:  targetPath === sourcePath ? null : targetPath,
      linkType:    link.linkType || "wikilink",
    };
  });
}

function normalizeTitle(s) {
  return String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

// ── Markdown parser ───────────────────────────────────────────────────────────

/**
 * Full parse of a markdown note.
 * Returns: { title, folder, type, domain, frontmatter, body, wikilinks, tags }
 */
function parseMarkdown(raw, relPath) {
  const text = String(raw || "");

  // ── Frontmatter ──
  let frontmatter = {};
  let body        = text;

  if (text.startsWith("---")) {
    const end = text.indexOf("\n---", 3);
    if (end !== -1) {
      frontmatter = parseFrontmatter(text.slice(3, end + 1));
      body        = text.slice(end + 4).trim();
    }
  }

  // ── Derived fields ──
  const folder = relPath.includes("/") ? relPath.split("/")[0] : "";
  const title  = frontmatter.title
    || path.basename(relPath, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " ");
  const domain = frontmatter.domain
    || domainFromFolder(folder);
  const type   = frontmatter.type
    || typeFromFolder(folder);

  // ── Wikilinks ──
  const wikilinks = extractWikilinks(body);

  // ── Tags ──
  const tags = extractTags(body, frontmatter);

  return { title, folder, type, domain, frontmatter, body, wikilinks, tags };
}

/**
 * Parse YAML-style frontmatter.
 * Handles: simple scalars, inline arrays [a, b], block arrays (- item).
 */
function parseFrontmatter(raw) {
  const result = {};
  const lines  = raw.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) { i++; continue; }

    const key = line.slice(0, colonIdx).trim();
    if (!key || key.startsWith("#")) { i++; continue; }

    const rest = line.slice(colonIdx + 1).trim();

    // Inline array: key: [a, b, c]
    if (rest.startsWith("[") && rest.endsWith("]")) {
      result[key] = rest.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      i++;
      continue;
    }

    // Block array: next lines start with "  - "
    if (rest === "" && i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1])) {
      const items = [];
      i++;
      while (i < lines.length && /^\s+-\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s+-\s*/, "").trim().replace(/^["']|["']$/g, ""));
        i++;
      }
      result[key] = items;
      continue;
    }

    // Simple scalar
    result[key] = rest.replace(/^["']|["']$/g, "");
    i++;
  }

  return result;
}

/**
 * Extract [[wikilinks]] from markdown body.
 * Handles: [[Note]], [[Note|Alias]], [[Note#Heading]], ![[embed]] (skipped).
 */
function extractWikilinks(text) {
  const links = [];
  // Match [[...]] but not ![[...]] (embeds)
  const re = /(?<!!)\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1];
    // [[Note#Heading|Alias]] → split on | first, then #
    const [target, _alias] = inner.split("|");
    const [notePart]       = target.split("#");
    const targetAlias      = notePart.trim();
    if (targetAlias) {
      links.push({ targetAlias, linkType: "wikilink" });
    }
  }
  return links;
}

/**
 * Extract tags from inline #tag syntax and frontmatter tags field.
 * Returns a deduplicated, normalized array (lowercase, no leading #).
 */
function extractTags(body, frontmatter) {
  const tags = new Set();

  // Frontmatter tags (array or comma-separated string)
  const fmTags = frontmatter.tags;
  if (Array.isArray(fmTags)) {
    for (const t of fmTags) addTag(tags, t);
  } else if (typeof fmTags === "string" && fmTags) {
    for (const t of fmTags.split(",")) addTag(tags, t);
  }

  // Inline #tags in body (word boundary, allow nested tags like #faith/prayer)
  const re = /(?:^|[\s,;(])#([A-Za-z][A-Za-z0-9/_-]*)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    addTag(tags, m[1]);
  }

  return [...tags];
}

function addTag(set, raw) {
  const normalized = String(raw || "").toLowerCase().replace(/^#/, "").trim();
  if (normalized) set.add(normalized);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bodyHash(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex").slice(0, 16);
}

function countWords(text) {
  return (String(text || "").match(/\S+/g) || []).length;
}

/**
 * Map top-level Obsidian folders to Monday life domains.
 * Falls back to lowercase folder name.
 */
const FOLDER_TO_DOMAIN = {
  Family:        "family",
  Faith:         "faith",
  Health:        "health",
  Retirement:    "retirement",
  Work:          "work",
  Publishing:    "publishing",
  Books:         "publishing",
  Missions:      "",
  Journal:       "",
  Decisions:     "",
  Contradictions:"",
  Opportunities: "",
  Inbox:         "",
  Knowledge:     "",
  Archive:       "",
};

function domainFromFolder(folder) {
  if (!folder) return "";
  return FOLDER_TO_DOMAIN[folder] ?? folder.toLowerCase();
}

/**
 * Infer note type from folder or frontmatter.
 */
function typeFromFolder(folder) {
  const map = {
    Journal:       "journal",
    Decisions:     "decision",
    Contradictions:"contradiction",
    Opportunities: "opportunity",
    Missions:      "mission",
    Inbox:         "inbox",
  };
  return map[folder] || "note";
}

module.exports = {
  sync,
  reindex,
  getIndexingStatus,
  // Exposed for testing
  parseMarkdown,
  parseFrontmatter,
  extractWikilinks,
  extractTags,
  bodyHash,
  scanVault,
};
