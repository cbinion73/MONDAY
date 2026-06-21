"use strict";
// graph-extractor.js — Pattern-based entity and relation extraction from vault notes.
//
// No LLM required. Entities are inferred from:
//   1. Frontmatter `type` field — person/mission notes become typed entities
//   2. Section headings — decisions/beliefs/questions/goals/tensions extracted
//      from bullets under recognized heading keywords
//   3. Wikilinks in Family/ folder — mentioned people become Person entities
//
// Entity IDs are stable: SHA-256(type::normalized_name).slice(0,20)
// so the same person or concept extracted from multiple notes maps to one node.
//
// Relations:
//   co_mentioned — two entities extracted from the same note
//   supports     — a Decision or Goal within a Mission's domain
//   part_of      — entity belongs to a specific Mission
//
// Tracking: notes.entity_extracted_at is updated after each successful run.
// Re-extraction is triggered when mtime > entity_extracted_at (content changed).

const fs     = require("node:fs");
const path   = require("node:path");
const crypto = require("node:crypto");
const ks     = require("../db/knowledge-store");
const { getVaultRoot } = require("../obsidian/vault-manager");

// ── Section heading patterns → entity type ────────────────────────────────────

const SECTION_RULES = [
  { pattern: /decision|decided|choices?/i,          type: "Decision"    },
  { pattern: /working theory|emerging theory|theory|belief|conviction/i, type: "Belief" },
  { pattern: /open question|question|wondering/i,    type: "Question"    },
  { pattern: /goal|intention|aspiration|aim/i,       type: "Goal"        },
  { pattern: /tension|contradiction|conflict|struggle/i, type: "Tension" },
  { pattern: /lesson|learning|takeaway/i,            type: "Lesson"      },
  { pattern: /commitment|promise|vow/i,              type: "Commitment"  },
];

// Frontmatter types that map directly to entity types
const FRONTMATTER_TYPE_MAP = {
  person:  "Person",
  people:  "Person",
  mission: "Mission",
  project: "Project",
  place:   "Place",
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract entities from all notes that have changed since last extraction.
 * Safe to call repeatedly — skips up-to-date notes.
 * @returns {{ ok, processed, entitiesWritten, relationsWritten, skipped, errors }}
 */
async function extractAllEntities({ limit = Infinity } = {}) {
  const stats = { ok: true, processed: 0, entitiesWritten: 0, relationsWritten: 0, skipped: 0, errors: [] };

  let notes = ks.getNotesNeedingEntityExtraction();
  if (limit < Infinity) notes = notes.slice(0, limit);

  for (const note of notes) {
    try {
      const result = await extractNote(note.path);
      if (result.ok) {
        stats.processed++;
        stats.entitiesWritten  += result.entitiesWritten;
        stats.relationsWritten += result.relationsWritten;
      } else {
        stats.skipped++;
        stats.errors.push(`${note.path}: ${result.error}`);
      }
    } catch (err) {
      stats.skipped++;
      stats.errors.push(`${note.path}: ${err.message}`);
    }
  }

  return stats;
}

/**
 * Extract and persist entities/relations from a single note.
 * Clears any previously extracted entities for the note first (idempotent).
 * @param {string} notePath  vault-relative path
 * @returns {{ ok, notePath, entitiesWritten, relationsWritten, error? }}
 */
async function extractNote(notePath) {
  const note = ks.getNote(notePath);
  if (!note) return { ok: false, notePath, error: "not in index — run sync first", entitiesWritten: 0, relationsWritten: 0 };

  // Read raw markdown from vault
  let raw;
  try {
    raw = fs.readFileSync(path.join(getVaultRoot(), notePath), "utf8");
  } catch {
    return { ok: false, notePath, error: `cannot read file`, entitiesWritten: 0, relationsWritten: 0 };
  }

  // Clear previously extracted entities for this note
  ks.deleteEntitiesBySource(notePath);

  const { entities, relations } = _extractFromNote(note, raw);

  // Persist entities first (relations reference their IDs)
  for (const e of entities) {
    ks.upsertEntity(e);
  }

  // Persist relations (skip if either endpoint wasn't written)
  const writtenIds = new Set(entities.map((e) => e.id));
  let relationsWritten = 0;
  for (const r of relations) {
    if (!writtenIds.has(r.fromId) || !writtenIds.has(r.toId)) continue;
    try {
      ks.addRelation(r.fromId, r.toId, r.relationType, {
        confidence:  r.confidence,
        sourcePath:  notePath,
        properties:  r.properties || {},
      });
      relationsWritten++;
    } catch {
      // duplicate or FK violation — skip silently
    }
  }

  ks.markNoteEntityExtracted(notePath);

  return {
    ok:               true,
    notePath,
    entitiesWritten:  entities.length,
    relationsWritten,
  };
}

/**
 * Return counts of notes pending vs. already extracted.
 */
function getExtractionStatus() {
  const pending = ks.getNotesNeedingEntityExtraction().length;
  const total   = ks.getNoteCount();
  return { total, extracted: total - pending, pending };
}

// ── Core extraction ───────────────────────────────────────────────────────────

function _extractFromNote(note, raw) {
  const entities  = [];
  const relations = [];

  // 1. Frontmatter-based entity (person, mission, project, …)
  const fmEntity = _extractFrontmatterEntity(note);
  if (fmEntity) entities.push(fmEntity);

  // 2. Section-based extraction
  const sections = _parseSections(raw);
  for (const section of sections) {
    const rule = SECTION_RULES.find((r) => r.pattern.test(section.heading));
    if (!rule) continue;
    const extracted = _extractBullets(section, rule.type, note);
    entities.push(...extracted);
  }

  // 3. Person entities from wikilinks in Family/ folder notes
  if (note.folder === "Family" || note.domain === "family") {
    const wikiPeople = _extractWikilinkPeople(raw, note);
    for (const p of wikiPeople) {
      if (!entities.some((e) => e.id === p.id)) entities.push(p);
    }
  }

  // 4. Co-mention relations between all extracted entities in this note
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      relations.push({
        fromId:       entities[i].id,
        toId:         entities[j].id,
        relationType: "co_mentioned",
        confidence:   0.7,
        properties:   { noteTitle: note.title || note.path },
      });
    }
  }

  // 5. Mission-support relations: if note has a Mission entity, link
  //    all Decision/Goal/Belief entities to it via "supports"
  const missionEntity = entities.find((e) => e.type === "Mission");
  if (missionEntity) {
    for (const e of entities) {
      if (e.id === missionEntity.id) continue;
      if (!["Decision", "Goal", "Belief"].includes(e.type)) continue;
      relations.push({
        fromId:       e.id,
        toId:         missionEntity.id,
        relationType: "supports",
        confidence:   0.8,
        properties:   {},
      });
    }
  }

  return { entities, relations };
}

// ── Extraction helpers ────────────────────────────────────────────────────────

function _extractFrontmatterEntity(note) {
  const fm   = note.frontmatter || {};
  const type = FRONTMATTER_TYPE_MAP[String(fm.type || note.type || "").toLowerCase()];
  if (!type) return null;

  const name = note.title || path.basename(note.path, ".md");
  if (!name || name.length < 2) return null;

  return {
    id:          _entityId(type, name),
    type,
    name,
    domain:      note.domain  || null,
    sourcePath:  note.path,
    description: fm.description || fm.summary || null,
    confidence:  0.95,
    properties:  { fromFrontmatter: true },
  };
}

function _extractBullets(section, type, note) {
  const bullets = _parseBullets(section.body);
  return bullets
    .filter((b) => b.length >= 8 && b.length <= 300)
    .map((b) => ({
      id:         _entityId(type, b),
      type,
      name:       _truncate(b, 120),
      domain:     note.domain || null,
      sourcePath: note.path,
      description: b.length > 120 ? b : null,
      confidence: 0.8,
      properties: { sectionHeading: section.heading },
    }));
}

function _extractWikilinkPeople(raw, note) {
  const wikilinkRe = /(?<!!)\ *\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
  const people     = [];
  const seen       = new Set();

  for (const m of raw.matchAll(wikilinkRe)) {
    const name = m[1].trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    // Only treat as a Person entity if the wikilink doesn't look like a path
    if (name.includes("/") || name.includes(".")) continue;
    // Skip short one-word tokens that are likely tags or notes, not people
    if (!name.includes(" ") && name.length < 4) continue;

    people.push({
      id:         _entityId("Person", name),
      type:       "Person",
      name,
      domain:     "family",
      sourcePath: note.path,
      description: null,
      confidence: 0.7,
      properties: { fromWikilink: true },
    });
  }

  return people;
}

// ── Markdown structure helpers ────────────────────────────────────────────────

function _parseSections(raw) {
  // Strip frontmatter
  let body = raw;
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) body = raw.slice(end + 4);
  }

  const lines    = body.split("\n");
  const sections = [];
  let current    = null;

  for (const line of lines) {
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      if (current) sections.push(current);
      current = { heading: hm[2].trim(), level: hm[1].length, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);

  return sections.map((s) => ({ ...s, body: s.lines.join("\n") }));
}

function _parseBullets(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/^[\s\-*+]+/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

// ── Utilities ─────────────────────────────────────────────────────────────────

// Stable entity ID: SHA-256(type::normalized_name).slice(0,20)
// Same concept extracted from different notes → same node in the graph.
function _entityId(type, name) {
  const key = `${type}::${String(name || "").toLowerCase().trim()}`;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 20);
}

function _truncate(text, max) {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

module.exports = {
  extractAllEntities,
  extractNote,
  getExtractionStatus,
  // exported for tests
  _parseSections,
  _parseBullets,
};
