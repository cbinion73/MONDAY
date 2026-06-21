"use strict";
// db/knowledge-store.js — Data access layer for the PKM tables added in migration 002.
//
// Tables: notes, note_links, note_tags, entities, entity_relations,
//         memory_candidates, memory_reviews, indexing_runs, embedding_records,
//         missions, decisions, contradictions, people, preferences, life_events
//
// Design rules:
//   - All writes are upserts or explicit inserts — callers don't manage SQL.
//   - JSON columns (frontmatter, aliases, properties, etc.) are parsed on read.
//   - Bulk operations use transactions.
//   - IDs for new rows use crypto.randomUUID().
//   - Timestamps are always ISO 8601 strings.

const crypto = require("node:crypto");
const { getDb } = require("./connection");

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function safeJson(s, fallback = {}) {
  if (s == null) return fallback;
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return fallback; }
}

// ── Notes ─────────────────────────────────────────────────────────────────────

function upsertNote(note) {
  const db = getDb();
  const ts = now();
  db.prepare(`
    INSERT INTO notes (path, title, folder, type, domain, frontmatter, body_hash, mtime, word_count, indexed_at, created_at, updated_at)
    VALUES (@path, @title, @folder, @type, @domain, @frontmatter, @body_hash, @mtime, @word_count, @indexed_at, @created_at, @updated_at)
    ON CONFLICT(path) DO UPDATE SET
      title      = excluded.title,
      folder     = excluded.folder,
      type       = excluded.type,
      domain     = excluded.domain,
      frontmatter = excluded.frontmatter,
      body_hash  = excluded.body_hash,
      mtime      = excluded.mtime,
      word_count = excluded.word_count,
      indexed_at = excluded.indexed_at,
      updated_at = excluded.updated_at
  `).run({
    path:        note.path,
    title:       note.title || null,
    folder:      note.folder || null,
    type:        note.type || "note",
    domain:      note.domain || null,
    frontmatter: JSON.stringify(note.frontmatter || {}),
    body_hash:   note.bodyHash || null,
    mtime:       note.mtime || null,
    word_count:  note.wordCount || 0,
    indexed_at:  note.indexedAt || ts,
    created_at:  ts,
    updated_at:  ts,
  });
}

function getNote(path) {
  const row = getDb().prepare("SELECT * FROM notes WHERE path = ?").get(path);
  return row ? deserializeNote(row) : null;
}

function getNotesByFolder(folder) {
  return getDb().prepare("SELECT * FROM notes WHERE folder = ? ORDER BY mtime DESC").all(folder).map(deserializeNote);
}

function getNotesByDomain(domain) {
  return getDb().prepare("SELECT * FROM notes WHERE domain = ? ORDER BY mtime DESC").all(domain).map(deserializeNote);
}

function getAllNotes() {
  return getDb().prepare("SELECT * FROM notes ORDER BY mtime DESC").all().map(deserializeNote);
}

// Returns notes whose mtime is newer than the last indexed_at — i.e. changed since index.
function getNotesNeedingIndex() {
  return getDb().prepare(`
    SELECT * FROM notes
    WHERE indexed_at IS NULL OR mtime > indexed_at
    ORDER BY mtime DESC
  `).all().map(deserializeNote);
}

function deleteNote(path) {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM note_links WHERE source_path = ?").run(path);
    db.prepare("DELETE FROM note_tags WHERE note_path = ?").run(path);
    db.prepare("DELETE FROM notes WHERE path = ?").run(path);
  })();
}

function getNoteCount() {
  return getDb().prepare("SELECT COUNT(*) as n FROM notes").get().n;
}

function deserializeNote(row) {
  return {
    path:        row.path,
    title:       row.title,
    folder:      row.folder,
    type:        row.type,
    domain:      row.domain,
    frontmatter: safeJson(row.frontmatter),
    bodyHash:    row.body_hash,
    mtime:       row.mtime,
    wordCount:   row.word_count,
    indexedAt:   row.indexed_at,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

// ── Note Links ────────────────────────────────────────────────────────────────

// Replace all links from a source note in one transaction (call after re-parsing).
function replaceNoteLinks(sourcePath, links) {
  const db = getDb();
  const ts = now();
  db.transaction(() => {
    db.prepare("DELETE FROM note_links WHERE source_path = ?").run(sourcePath);
    const stmt = db.prepare(`
      INSERT INTO note_links (source_path, target_path, target_alias, link_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const link of links) {
      stmt.run(sourcePath, link.targetPath || null, link.targetAlias, link.linkType || "wikilink", ts);
    }
  })();
}

function getLinksFrom(sourcePath) {
  return getDb().prepare("SELECT * FROM note_links WHERE source_path = ? ORDER BY id").all(sourcePath);
}

function getLinksTo(targetPath) {
  return getDb().prepare("SELECT * FROM note_links WHERE target_path = ? ORDER BY id").all(targetPath);
}

// ── Note Tags ─────────────────────────────────────────────────────────────────

function replaceNoteTags(notePath, tags) {
  const db = getDb();
  const ts = now();
  db.transaction(() => {
    db.prepare("DELETE FROM note_tags WHERE note_path = ?").run(notePath);
    const stmt = db.prepare("INSERT OR IGNORE INTO note_tags (note_path, tag, created_at) VALUES (?, ?, ?)");
    for (const tag of tags) {
      stmt.run(notePath, String(tag).toLowerCase().replace(/^#/, ""), ts);
    }
  })();
}

function getTagsForNote(notePath) {
  return getDb().prepare("SELECT tag FROM note_tags WHERE note_path = ? ORDER BY tag").all(notePath).map((r) => r.tag);
}

function getNotesByTag(tag) {
  const normalized = String(tag).toLowerCase().replace(/^#/, "");
  return getDb().prepare(`
    SELECT n.* FROM notes n
    JOIN note_tags t ON t.note_path = n.path
    WHERE t.tag = ?
    ORDER BY n.mtime DESC
  `).all(normalized).map(deserializeNote);
}

function getAllTags() {
  return getDb().prepare("SELECT tag, COUNT(*) as count FROM note_tags GROUP BY tag ORDER BY count DESC").all();
}

// ── Entities ──────────────────────────────────────────────────────────────────

function upsertEntity(entity) {
  const db = getDb();
  const ts = now();
  const id = entity.id || uuid();
  db.prepare(`
    INSERT INTO entities (id, type, name, aliases, description, domain, source_path, confidence, properties, created_at, updated_at)
    VALUES (@id, @type, @name, @aliases, @description, @domain, @source_path, @confidence, @properties, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      type        = excluded.type,
      name        = excluded.name,
      aliases     = excluded.aliases,
      description = excluded.description,
      domain      = excluded.domain,
      source_path = excluded.source_path,
      confidence  = excluded.confidence,
      properties  = excluded.properties,
      updated_at  = excluded.updated_at
  `).run({
    id,
    type:        entity.type,
    name:        entity.name,
    aliases:     JSON.stringify(entity.aliases || []),
    description: entity.description || null,
    domain:      entity.domain || null,
    source_path: entity.sourcePath || null,
    confidence:  entity.confidence ?? 0.8,
    properties:  JSON.stringify(entity.properties || {}),
    created_at:  ts,
    updated_at:  ts,
  });
  return id;
}

function getEntity(id) {
  const row = getDb().prepare("SELECT * FROM entities WHERE id = ?").get(id);
  return row ? deserializeEntity(row) : null;
}

function getEntitiesByType(type) {
  return getDb().prepare("SELECT * FROM entities WHERE type = ? ORDER BY name").all(type).map(deserializeEntity);
}

function getEntitiesByDomain(domain) {
  return getDb().prepare("SELECT * FROM entities WHERE domain = ? ORDER BY type, name").all(domain).map(deserializeEntity);
}

function searchEntities(query) {
  const like = `%${query}%`;
  return getDb().prepare(`
    SELECT * FROM entities
    WHERE name LIKE ? OR description LIKE ? OR aliases LIKE ?
    ORDER BY name
    LIMIT 50
  `).all(like, like, like).map(deserializeEntity);
}

function deleteEntitiesBySource(sourcePath) {
  getDb().prepare("DELETE FROM entities WHERE source_path = ?").run(sourcePath);
}

function deserializeEntity(row) {
  return {
    id:          row.id,
    type:        row.type,
    name:        row.name,
    aliases:     safeJson(row.aliases, []),
    description: row.description,
    domain:      row.domain,
    sourcePath:  row.source_path,
    confidence:  row.confidence,
    properties:  safeJson(row.properties),
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

// ── Entity Relations ──────────────────────────────────────────────────────────

function addRelation(from, to, relationType, opts = {}) {
  const ts = now();
  getDb().prepare(`
    INSERT OR REPLACE INTO entity_relations
      (from_entity_id, to_entity_id, relation_type, confidence, source_path, properties, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(from, to, relationType, opts.confidence ?? 0.8, opts.sourcePath || null, JSON.stringify(opts.properties || {}), ts);
}

function getRelationsFrom(entityId) {
  return getDb().prepare(`
    SELECT r.*, e.name as to_name, e.type as to_type
    FROM entity_relations r JOIN entities e ON e.id = r.to_entity_id
    WHERE r.from_entity_id = ?
    ORDER BY r.relation_type
  `).all(entityId);
}

function getRelationsTo(entityId) {
  return getDb().prepare(`
    SELECT r.*, e.name as from_name, e.type as from_type
    FROM entity_relations r JOIN entities e ON e.id = r.from_entity_id
    WHERE r.to_entity_id = ?
    ORDER BY r.relation_type
  `).all(entityId);
}

// ── Memory Candidates ─────────────────────────────────────────────────────────

function addMemoryCandidate(candidate) {
  const ts = now();
  const id = candidate.id || uuid();
  getDb().prepare(`
    INSERT INTO memory_candidates
      (id, source, source_ref, content, proposed_folder, proposed_title, proposed_body, reason, confidence, status, created_at, updated_at)
    VALUES (@id, @source, @source_ref, @content, @proposed_folder, @proposed_title, @proposed_body, @reason, @confidence, 'pending', @created_at, @updated_at)
  `).run({
    id,
    source:          candidate.source,
    source_ref:      candidate.sourceRef || null,
    content:         candidate.content,
    proposed_folder: candidate.proposedFolder || null,
    proposed_title:  candidate.proposedTitle || null,
    proposed_body:   candidate.proposedBody || null,
    reason:          candidate.reason || null,
    confidence:      candidate.confidence ?? 0.5,
    created_at:      ts,
    updated_at:      ts,
  });
  return id;
}

function getPendingCandidates(limit = 50) {
  return getDb().prepare(`
    SELECT * FROM memory_candidates WHERE status = 'pending'
    ORDER BY confidence DESC, created_at ASC
    LIMIT ?
  `).all(limit).map(deserializeCandidate);
}

function getCandidatesByStatus(status) {
  return getDb().prepare(`
    SELECT * FROM memory_candidates WHERE status = ?
    ORDER BY created_at DESC LIMIT 200
  `).all(status).map(deserializeCandidate);
}

function approveCandidate(id, reason) {
  const ts = now();
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE memory_candidates SET status = 'approved', reviewed_at = ?, updated_at = ? WHERE id = ?").run(ts, ts, id);
    db.prepare("INSERT INTO memory_reviews (candidate_id, decision, reason, reviewed_at) VALUES (?, 'approved', ?, ?)").run(id, reason || null, ts);
  })();
}

function rejectCandidate(id, reason) {
  const ts = now();
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE memory_candidates SET status = 'rejected', reviewed_at = ?, updated_at = ? WHERE id = ?").run(ts, ts, id);
    db.prepare("INSERT INTO memory_reviews (candidate_id, decision, reason, reviewed_at) VALUES (?, 'rejected', ?, ?)").run(id, reason || null, ts);
  })();
}

function markCandidateWritten(id, vaultPath) {
  const ts = now();
  getDb().prepare(`
    UPDATE memory_candidates SET status = 'written', written_path = ?, updated_at = ? WHERE id = ?
  `).run(vaultPath, ts, id);
}

function deserializeCandidate(row) {
  return {
    id:             row.id,
    source:         row.source,
    sourceRef:      row.source_ref,
    content:        row.content,
    proposedFolder: row.proposed_folder,
    proposedTitle:  row.proposed_title,
    proposedBody:   row.proposed_body,
    reason:         row.reason,
    confidence:     row.confidence,
    status:         row.status,
    reviewedAt:     row.reviewed_at,
    writtenPath:    row.written_path,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  };
}

// ── Indexing Runs ─────────────────────────────────────────────────────────────

function startIndexingRun() {
  const info = getDb().prepare(`
    INSERT INTO indexing_runs (started_at, status) VALUES (?, 'running')
  `).run(now());
  return info.lastInsertRowid;
}

function completeIndexingRun(id, stats = {}) {
  getDb().prepare(`
    UPDATE indexing_runs SET
      status        = 'completed',
      completed_at  = ?,
      notes_scanned = ?,
      notes_indexed = ?,
      notes_skipped = ?,
      notes_deleted = ?
    WHERE id = ?
  `).run(now(), stats.scanned || 0, stats.indexed || 0, stats.skipped || 0, stats.deleted || 0, id);
}

function failIndexingRun(id, error) {
  getDb().prepare(`
    UPDATE indexing_runs SET status = 'failed', completed_at = ?, error = ? WHERE id = ?
  `).run(now(), String(error), id);
}

function getLastIndexingRun() {
  const row = getDb().prepare("SELECT * FROM indexing_runs ORDER BY id DESC LIMIT 1").get();
  return row || null;
}

function getIndexingHistory(limit = 10) {
  return getDb().prepare("SELECT * FROM indexing_runs ORDER BY id DESC LIMIT ?").all(limit);
}

// ── Embedding Records ─────────────────────────────────────────────────────────

function upsertEmbeddingRecord(record) {
  const ts = now();
  getDb().prepare(`
    INSERT INTO embedding_records (id, note_path, heading, chunk_index, chunk_hash, model, dimensions, embedded_at, note_mtime)
    VALUES (@id, @note_path, @heading, @chunk_index, @chunk_hash, @model, @dimensions, @embedded_at, @note_mtime)
    ON CONFLICT(id) DO UPDATE SET
      chunk_hash  = excluded.chunk_hash,
      model       = excluded.model,
      dimensions  = excluded.dimensions,
      embedded_at = excluded.embedded_at,
      note_mtime  = excluded.note_mtime
  `).run({
    id:          record.id,
    note_path:   record.notePath,
    heading:     record.heading || null,
    chunk_index: record.chunkIndex || 0,
    chunk_hash:  record.chunkHash,
    model:       record.model,
    dimensions:  record.dimensions,
    embedded_at: ts,
    note_mtime:  record.noteMtime || null,
  });
}

function getEmbeddingRecord(id) {
  return getDb().prepare("SELECT * FROM embedding_records WHERE id = ?").get(id) || null;
}

function getEmbeddingRecordsByPath(notePath) {
  return getDb().prepare("SELECT * FROM embedding_records WHERE note_path = ? ORDER BY chunk_index").all(notePath);
}

function deleteEmbeddingRecordsByPath(notePath) {
  getDb().prepare("DELETE FROM embedding_records WHERE note_path = ?").run(notePath);
}

// Returns records where the stored note_mtime differs from the note's current mtime.
function getStaleEmbeddingPaths() {
  return getDb().prepare(`
    SELECT DISTINCT e.note_path
    FROM embedding_records e
    LEFT JOIN notes n ON n.path = e.note_path
    WHERE n.path IS NULL OR (n.mtime IS NOT NULL AND e.note_mtime != n.mtime)
  `).all().map((r) => r.note_path);
}

// ── Missions ──────────────────────────────────────────────────────────────────

function upsertMission(mission) {
  const ts = now();
  const id = mission.id;
  getDb().prepare(`
    INSERT INTO missions (id, title, domain, type, status, seed_theory, current_theory, vault_path, properties, created_at, updated_at)
    VALUES (@id, @title, @domain, @type, @status, @seed_theory, @current_theory, @vault_path, @properties, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      title          = excluded.title,
      domain         = excluded.domain,
      type           = excluded.type,
      status         = excluded.status,
      seed_theory    = excluded.seed_theory,
      current_theory = excluded.current_theory,
      vault_path     = excluded.vault_path,
      properties     = excluded.properties,
      updated_at     = excluded.updated_at
  `).run({
    id,
    title:          mission.title,
    domain:         mission.domain,
    type:           mission.type || "personal",
    status:         mission.status || "active",
    seed_theory:    mission.seedTheory || null,
    current_theory: mission.currentTheory || null,
    vault_path:     mission.vaultPath || null,
    properties:     JSON.stringify(mission.properties || {}),
    created_at:     ts,
    updated_at:     ts,
  });
  return id;
}

function getMission(id) {
  const row = getDb().prepare("SELECT * FROM missions WHERE id = ?").get(id);
  return row ? deserializeMission(row) : null;
}

function getActiveMissions() {
  return getDb().prepare("SELECT * FROM missions WHERE status = 'active' ORDER BY domain").all().map(deserializeMission);
}

function getAllMissions() {
  return getDb().prepare("SELECT * FROM missions ORDER BY domain").all().map(deserializeMission);
}

function deserializeMission(row) {
  return {
    id:            row.id,
    title:         row.title,
    domain:        row.domain,
    type:          row.type,
    status:        row.status,
    seedTheory:    row.seed_theory,
    currentTheory: row.current_theory,
    vaultPath:     row.vault_path,
    properties:    safeJson(row.properties),
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

// ── Decisions ─────────────────────────────────────────────────────────────────

function addDecision(decision) {
  const ts = now();
  const id = decision.id || uuid();
  getDb().prepare(`
    INSERT INTO decisions (id, title, domain, mission_id, reason, context, outcome, status, vault_path, decided_at, created_at, updated_at)
    VALUES (@id, @title, @domain, @mission_id, @reason, @context, @outcome, @status, @vault_path, @decided_at, @created_at, @updated_at)
  `).run({
    id,
    title:      decision.title,
    domain:     decision.domain || null,
    mission_id: decision.missionId || null,
    reason:     decision.reason || null,
    context:    decision.context || null,
    outcome:    decision.outcome || null,
    status:     decision.status || "made",
    vault_path: decision.vaultPath || null,
    decided_at: decision.decidedAt || ts,
    created_at: ts,
    updated_at: ts,
  });
  return id;
}

function getDecisions({ domain, missionId, limit = 100 } = {}) {
  if (domain) {
    return getDb().prepare("SELECT * FROM decisions WHERE domain = ? ORDER BY decided_at DESC LIMIT ?").all(domain, limit).map(deserializeDecision);
  }
  if (missionId) {
    return getDb().prepare("SELECT * FROM decisions WHERE mission_id = ? ORDER BY decided_at DESC LIMIT ?").all(missionId, limit).map(deserializeDecision);
  }
  return getDb().prepare("SELECT * FROM decisions ORDER BY decided_at DESC LIMIT ?").all(limit).map(deserializeDecision);
}

function deserializeDecision(row) {
  return {
    id:         row.id,
    title:      row.title,
    domain:     row.domain,
    missionId:  row.mission_id,
    reason:     row.reason,
    context:    row.context,
    outcome:    row.outcome,
    status:     row.status,
    vaultPath:  row.vault_path,
    decidedAt:  row.decided_at,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  };
}

// ── Contradictions ────────────────────────────────────────────────────────────

function addContradiction(contradiction) {
  const ts = now();
  const id = contradiction.id || uuid();
  getDb().prepare(`
    INSERT INTO contradictions (id, domain, mission_id, declared_value, observed_pattern, status, resolution, vault_path, detected_at, created_at, updated_at)
    VALUES (@id, @domain, @mission_id, @declared_value, @observed_pattern, @status, @resolution, @vault_path, @detected_at, @created_at, @updated_at)
  `).run({
    id,
    domain:           contradiction.domain || null,
    mission_id:       contradiction.missionId || null,
    declared_value:   contradiction.declaredValue,
    observed_pattern: contradiction.observedPattern,
    status:           contradiction.status || "active",
    resolution:       contradiction.resolution || null,
    vault_path:       contradiction.vaultPath || null,
    detected_at:      contradiction.detectedAt || ts,
    created_at:       ts,
    updated_at:       ts,
  });
  return id;
}

function getContradictions({ domain, status, missionId } = {}) {
  if (domain) {
    return getDb().prepare("SELECT * FROM contradictions WHERE domain = ? ORDER BY detected_at DESC").all(domain).map(deserializeContradiction);
  }
  if (status) {
    return getDb().prepare("SELECT * FROM contradictions WHERE status = ? ORDER BY detected_at DESC").all(status).map(deserializeContradiction);
  }
  if (missionId) {
    return getDb().prepare("SELECT * FROM contradictions WHERE mission_id = ? ORDER BY detected_at DESC").all(missionId).map(deserializeContradiction);
  }
  return getDb().prepare("SELECT * FROM contradictions ORDER BY detected_at DESC LIMIT 100").all().map(deserializeContradiction);
}

function resolveContradiction(id, resolution) {
  const ts = now();
  getDb().prepare(`
    UPDATE contradictions SET status = 'resolved', resolution = ?, resolved_at = ?, updated_at = ? WHERE id = ?
  `).run(resolution, ts, ts, id);
}

function deserializeContradiction(row) {
  return {
    id:              row.id,
    domain:          row.domain,
    missionId:       row.mission_id,
    declaredValue:   row.declared_value,
    observedPattern: row.observed_pattern,
    status:          row.status,
    resolution:      row.resolution,
    vaultPath:       row.vault_path,
    detectedAt:      row.detected_at,
    resolvedAt:      row.resolved_at,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}

// ── People ────────────────────────────────────────────────────────────────────

function upsertPerson(person) {
  const ts = now();
  const id = person.id || uuid();
  getDb().prepare(`
    INSERT INTO people (id, name, aliases, relation, domain, notes, entity_id, vault_path, properties, created_at, updated_at)
    VALUES (@id, @name, @aliases, @relation, @domain, @notes, @entity_id, @vault_path, @properties, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name       = excluded.name,
      aliases    = excluded.aliases,
      relation   = excluded.relation,
      domain     = excluded.domain,
      notes      = excluded.notes,
      entity_id  = excluded.entity_id,
      vault_path = excluded.vault_path,
      properties = excluded.properties,
      updated_at = excluded.updated_at
  `).run({
    id,
    name:       person.name,
    aliases:    JSON.stringify(person.aliases || []),
    relation:   person.relation || null,
    domain:     person.domain || null,
    notes:      person.notes || null,
    entity_id:  person.entityId || null,
    vault_path: person.vaultPath || null,
    properties: JSON.stringify(person.properties || {}),
    created_at: ts,
    updated_at: ts,
  });
  return id;
}

function getPerson(id) {
  const row = getDb().prepare("SELECT * FROM people WHERE id = ?").get(id);
  return row ? deserializePerson(row) : null;
}

function searchPeople(query) {
  const like = `%${query}%`;
  return getDb().prepare(`
    SELECT * FROM people WHERE name LIKE ? OR aliases LIKE ? OR notes LIKE ?
    ORDER BY name LIMIT 20
  `).all(like, like, like).map(deserializePerson);
}

function getAllPeople() {
  return getDb().prepare("SELECT * FROM people ORDER BY name").all().map(deserializePerson);
}

function deserializePerson(row) {
  return {
    id:        row.id,
    name:      row.name,
    aliases:   safeJson(row.aliases, []),
    relation:  row.relation,
    domain:    row.domain,
    notes:     row.notes,
    entityId:  row.entity_id,
    vaultPath: row.vault_path,
    properties: safeJson(row.properties),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Preferences ───────────────────────────────────────────────────────────────

function setPreference(category, key, value, opts = {}) {
  const ts = now();
  const id = uuid();
  getDb().prepare(`
    INSERT INTO preferences (id, category, key, value, source, confidence, source_path, created_at, updated_at)
    VALUES (@id, @category, @key, @value, @source, @confidence, @source_path, @created_at, @updated_at)
    ON CONFLICT(category, key) DO UPDATE SET
      value       = excluded.value,
      source      = excluded.source,
      confidence  = excluded.confidence,
      source_path = excluded.source_path,
      updated_at  = excluded.updated_at
  `).run({
    id,
    category:    category,
    key:         key,
    value:       String(value),
    source:      opts.source || "stated",
    confidence:  opts.confidence ?? 0.7,
    source_path: opts.sourcePath || null,
    created_at:  ts,
    updated_at:  ts,
  });
}

function getPreference(category, key) {
  return getDb().prepare("SELECT * FROM preferences WHERE category = ? AND key = ?").get(category, key) || null;
}

function getPreferencesByCategory(category) {
  return getDb().prepare("SELECT * FROM preferences WHERE category = ? ORDER BY key").all(category);
}

function getAllPreferences() {
  return getDb().prepare("SELECT * FROM preferences ORDER BY category, key").all();
}

// ── Life Events ───────────────────────────────────────────────────────────────

function addLifeEvent(event) {
  const ts = now();
  const id = event.id || uuid();
  getDb().prepare(`
    INSERT INTO life_events (id, title, description, domain, event_type, significance, happened_at, happened_at_precision, people, source_path, properties, created_at, updated_at)
    VALUES (@id, @title, @description, @domain, @event_type, @significance, @happened_at, @happened_at_precision, @people, @source_path, @properties, @created_at, @updated_at)
  `).run({
    id,
    title:                event.title,
    description:          event.description || null,
    domain:               event.domain || null,
    event_type:           event.eventType || "event",
    significance:         event.significance || "medium",
    happened_at:          event.happenedAt,
    happened_at_precision: event.happenedAtPrecision || "day",
    people:               JSON.stringify(event.people || []),
    source_path:          event.sourcePath || null,
    properties:           JSON.stringify(event.properties || {}),
    created_at:           ts,
    updated_at:           ts,
  });
  return id;
}

function getLifeEvents({ domain, eventType, significance, limit = 100 } = {}) {
  if (domain) {
    return getDb().prepare("SELECT * FROM life_events WHERE domain = ? ORDER BY happened_at DESC LIMIT ?").all(domain, limit).map(deserializeLifeEvent);
  }
  if (eventType) {
    return getDb().prepare("SELECT * FROM life_events WHERE event_type = ? ORDER BY happened_at DESC LIMIT ?").all(eventType, limit).map(deserializeLifeEvent);
  }
  if (significance) {
    return getDb().prepare("SELECT * FROM life_events WHERE significance = ? ORDER BY happened_at DESC LIMIT ?").all(significance, limit).map(deserializeLifeEvent);
  }
  return getDb().prepare("SELECT * FROM life_events ORDER BY happened_at DESC LIMIT ?").all(limit).map(deserializeLifeEvent);
}

function deserializeLifeEvent(row) {
  return {
    id:                   row.id,
    title:                row.title,
    description:          row.description,
    domain:               row.domain,
    eventType:            row.event_type,
    significance:         row.significance,
    happenedAt:           row.happened_at,
    happenedAtPrecision:  row.happened_at_precision,
    people:               safeJson(row.people, []),
    sourcePath:           row.source_path,
    properties:           safeJson(row.properties),
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // Notes
  upsertNote,
  getNote,
  getNotesByFolder,
  getNotesByDomain,
  getAllNotes,
  getNotesNeedingIndex,
  deleteNote,
  getNoteCount,

  // Links
  replaceNoteLinks,
  getLinksFrom,
  getLinksTo,

  // Tags
  replaceNoteTags,
  getTagsForNote,
  getNotesByTag,
  getAllTags,

  // Entities
  upsertEntity,
  getEntity,
  getEntitiesByType,
  getEntitiesByDomain,
  searchEntities,
  deleteEntitiesBySource,

  // Relations
  addRelation,
  getRelationsFrom,
  getRelationsTo,

  // Memory candidates
  addMemoryCandidate,
  getPendingCandidates,
  getCandidatesByStatus,
  approveCandidate,
  rejectCandidate,
  markCandidateWritten,

  // Indexing runs
  startIndexingRun,
  completeIndexingRun,
  failIndexingRun,
  getLastIndexingRun,
  getIndexingHistory,

  // Embedding records
  upsertEmbeddingRecord,
  getEmbeddingRecord,
  getEmbeddingRecordsByPath,
  deleteEmbeddingRecordsByPath,
  getStaleEmbeddingPaths,

  // Missions
  upsertMission,
  getMission,
  getActiveMissions,
  getAllMissions,

  // Decisions
  addDecision,
  getDecisions,

  // Contradictions
  addContradiction,
  getContradictions,
  resolveContradiction,

  // People
  upsertPerson,
  getPerson,
  searchPeople,
  getAllPeople,

  // Preferences
  setPreference,
  getPreference,
  getPreferencesByCategory,
  getAllPreferences,

  // Life events
  addLifeEvent,
  getLifeEvents,
};
