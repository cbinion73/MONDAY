"use strict";
// vault-writer.js — Approved memory write-back to the Obsidian vault.
//
// Reads approved candidates from memory_candidates and writes them to vault
// notes, then marks them 'written'. Only approved candidates are written —
// the approval gate prevents anything pending or rejected from reaching disk.
//
// Two write modes per candidate:
//   new note    — created at proposedFolder/date-slug.md (or Inbox/)
//   append      — timestamped section appended to an existing note
//
// Additional primitives exported for direct use:
//   appendWithTimestamp(relPath, content, opts) — append a dated ## section
//   mergeFrontmatter(relPath, updates)          — merge fields into YAML header

const fs   = require("node:fs");
const path = require("node:path");
const { vaultPath, vaultAvailable, getVaultRoot } = require("./vault-manager");
const { writeNote, appendNote, frontmatter, todayISO, slugify } = require("./note-writer");
const ks = require("../db/knowledge-store");

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Write all approved-but-not-yet-written candidates to the vault.
 * Returns { ok, written, skipped, errors }.
 */
async function writeBackApproved({ limit = 50 } = {}) {
  const stats = { ok: true, written: 0, skipped: 0, errors: [] };

  if (!vaultAvailable()) {
    return { ...stats, ok: false, error: "vault not available" };
  }

  const approved = ks.getCandidatesByStatus("approved")
    .filter((c) => !c.writtenPath)
    .slice(0, limit);

  for (const candidate of approved) {
    try {
      const result = await writeBackCandidate(candidate.id);
      if (result.ok) {
        stats.written++;
      } else {
        stats.skipped++;
        stats.errors.push(`${candidate.id}: ${result.error}`);
      }
    } catch (err) {
      stats.skipped++;
      stats.errors.push(`${candidate.id}: ${err.message}`);
    }
  }

  return stats;
}

/**
 * Write a single approved candidate to the vault.
 * Only runs if the candidate is approved and has no writtenPath.
 *
 * @param {string} candidateId
 * @returns {{ ok, candidateId, vaultPath, mode, error? }}
 */
async function writeBackCandidate(candidateId) {
  // Approval gate — must be in approved status
  const all  = [
    ...ks.getCandidatesByStatus("approved"),
    ...ks.getCandidatesByStatus("written"),
  ];
  const candidate = all.find((c) => c.id === candidateId);

  if (!candidate) {
    return { ok: false, candidateId, error: "candidate not found or not approved" };
  }
  if (candidate.status === "written" && candidate.writtenPath) {
    return { ok: false, candidateId, error: "already written", vaultPath: candidate.writtenPath };
  }
  if (candidate.status !== "approved") {
    return { ok: false, candidateId, error: `cannot write candidate with status '${candidate.status}'` };
  }

  if (!vaultAvailable()) {
    return { ok: false, candidateId, error: "vault not available" };
  }

  // Resolve target path
  const { relPath, mode } = _resolveTarget(candidate);

  let result;
  if (mode === "append") {
    result = appendWithTimestamp(relPath, candidate.content, {
      source:     candidate.source,
      confidence: candidate.confidence,
      reason:     candidate.reason,
    });
  } else {
    result = _writeNewNote(relPath, candidate);
  }

  if (!result.ok) return { ok: false, candidateId, error: result.error };

  ks.markCandidateWritten(candidateId, relPath);
  return { ok: true, candidateId, vaultPath: relPath, mode };
}

/**
 * Append a timestamped `## Monday — date` section to an existing note.
 * Creates the note with a minimal header if it does not exist.
 *
 * @param {string} relPath    vault-relative path
 * @param {string} content    markdown content to append
 * @param {object} opts
 * @param {string}  [opts.source]      provenance label
 * @param {number}  [opts.confidence]  0-1 confidence score
 * @param {string}  [opts.reason]      why this was written
 */
function appendWithTimestamp(relPath, content, { source = "monday", confidence = null, reason = null } = {}) {
  if (!vaultAvailable()) return { ok: false, error: "vault not available" };

  const date  = todayISO();
  const lines = [`## Monday — ${date}`, ""];

  if (reason) lines.push(`> ${reason}`, "");

  lines.push(String(content || "").trim(), "");

  const meta = [];
  if (source)     meta.push(`source: ${source}`);
  if (confidence != null) meta.push(`confidence: ${(confidence * 100).toFixed(0)}%`);
  if (meta.length) lines.push(`*${meta.join(" · ")}*`, "");

  const block = lines.join("\n").trimEnd();
  return appendNote(relPath, block);
}

/**
 * Read a vault note and merge `updates` into its YAML frontmatter.
 * Writes the updated file back. Preserves all existing frontmatter fields.
 * Only supports scalar values (string, number, boolean) — not nested objects.
 *
 * @param {string} relPath    vault-relative path
 * @param {object} updates    key/value pairs to merge
 * @returns {{ ok, path, added, updated }}
 */
function mergeFrontmatter(relPath, updates) {
  if (!vaultAvailable()) return { ok: false, error: "vault not available" };
  if (!updates || !Object.keys(updates).length) return { ok: true, path: relPath, added: 0, updated: 0 };

  let raw;
  try {
    raw = fs.readFileSync(vaultPath(relPath), "utf8");
  } catch (err) {
    return { ok: false, error: `cannot read ${relPath}: ${err.message}` };
  }

  const { fm: existing, body } = _parseFrontmatter(raw);
  let added   = 0;
  let updated = 0;

  for (const [k, v] of Object.entries(updates)) {
    if (existing[k] === undefined) added++;
    else if (String(existing[k]) !== String(v)) updated++;
    existing[k] = v;
  }

  const newContent = frontmatter(existing) + "\n" + body;
  return writeNote(relPath, newContent);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _resolveTarget(candidate) {
  // If the candidate's proposed title already matches an existing vault note,
  // append to it instead of creating a new one.
  if (candidate.proposedTitle) {
    const existing = ks.getAllNotes().find(
      (n) => n.title && n.title.toLowerCase() === candidate.proposedTitle.toLowerCase()
    );
    if (existing) return { relPath: existing.path, mode: "append" };
  }

  // Build a new note path
  const date   = todayISO();
  const folder = candidate.proposedFolder || "Inbox";
  const title  = candidate.proposedTitle  || _firstWords(candidate.content, 8);
  const slug   = slugify(title);
  const relPath = `${folder}/${date}-${slug}.md`;

  return { relPath, mode: "new" };
}

function _writeNewNote(relPath, candidate) {
  const title = candidate.proposedTitle || _firstWords(candidate.content, 8);
  const domain = _folderToDomain(candidate.proposedFolder);
  const date   = todayISO();

  const fm = {
    title,
    date,
    source: "monday_memory",
    confidence: candidate.confidence != null ? Number(candidate.confidence.toFixed(2)) : undefined,
  };
  if (domain) fm.domain = domain;

  const body = candidate.proposedBody || candidate.content;
  const lines = [
    frontmatter(fm),
    "",
    `# ${title}`,
    "",
    String(body || "").trim(),
    "",
    `---`,
    "",
    `*Written by Monday on ${date}`,
    candidate.reason ? ` — ${candidate.reason}` : "",
    `*`,
  ];

  return writeNote(relPath, lines.join("\n").trimEnd());
}

function _parseFrontmatter(raw) {
  const fm = {};
  let body = raw;
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) {
      const block = raw.slice(4, end);
      for (const line of block.split("\n")) {
        const m = line.match(/^([^:]+):\s*(.*)$/);
        if (m) {
          const key = m[1].trim();
          const val = m[2].trim().replace(/^"(.*)"$/, "$1");
          fm[key] = val;
        }
      }
      body = raw.slice(end + 4);
    }
  }
  return { fm, body };
}

function _firstWords(text, n) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .slice(0, n)
    .join(" ")
    .slice(0, 60);
}

const FOLDER_DOMAIN = {
  Family: "family", Faith: "faith", Health: "health",
  Retirement: "retirement", Work: "work", Publishing: "publishing",
};

function _folderToDomain(folder) {
  return folder ? (FOLDER_DOMAIN[folder] || null) : null;
}

module.exports = {
  writeBackApproved,
  writeBackCandidate,
  appendWithTimestamp,
  mergeFrontmatter,
};
