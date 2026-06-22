"use strict";

const { getDb } = require("./connection");

function safeJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function upsertEmailMemoryRecord(record) {
  getDb().prepare(`
    INSERT INTO email_memory_records (
      thread_id, body_hash, preserve_state, preserve_reason, preserve_score,
      vector_doc_id, summary, last_preserved_at
    ) VALUES (
      @thread_id, @body_hash, @preserve_state, @preserve_reason, @preserve_score,
      @vector_doc_id, @summary, @last_preserved_at
    )
    ON CONFLICT(thread_id) DO UPDATE SET
      body_hash = excluded.body_hash,
      preserve_state = excluded.preserve_state,
      preserve_reason = excluded.preserve_reason,
      preserve_score = excluded.preserve_score,
      vector_doc_id = excluded.vector_doc_id,
      summary = excluded.summary,
      last_preserved_at = excluded.last_preserved_at
  `).run({
    thread_id: record.threadId,
    body_hash: record.bodyHash || null,
    preserve_state: record.preserveState || "preserved",
    preserve_reason: record.preserveReason || null,
    preserve_score: record.preserveScore ?? 0,
    vector_doc_id: record.vectorDocId || null,
    summary: record.summary || null,
    last_preserved_at: record.lastPreservedAt || new Date().toISOString(),
  });
}

function getEmailMemoryRecord(threadId) {
  const row = getDb()
    .prepare("SELECT * FROM email_memory_records WHERE thread_id = ?")
    .get(threadId);
  if (!row) return null;
  return {
    threadId: row.thread_id,
    bodyHash: row.body_hash,
    preserveState: row.preserve_state,
    preserveReason: row.preserve_reason,
    preserveScore: row.preserve_score,
    vectorDocId: row.vector_doc_id,
    summary: row.summary,
    lastPreservedAt: row.last_preserved_at,
  };
}

function listEmailMemoryRecords({ limit = 25, preserveState = null } = {}) {
  const where = preserveState ? "WHERE emr.preserve_state = ?" : "";
  const stmt = getDb().prepare(`
    SELECT
      emr.thread_id,
      emr.body_hash,
      emr.preserve_state,
      emr.preserve_reason,
      emr.preserve_score,
      emr.vector_doc_id,
      emr.summary,
      emr.last_preserved_at,
      et.source,
      et.subject,
      et.from_address,
      et.provider_category,
      et.domain,
      et.thread_type,
      et.significance_score,
      et.relationship_score,
      et.actionability,
      et.entities
    FROM email_memory_records emr
    LEFT JOIN email_threads et
      ON et.thread_id = emr.thread_id
    ${where}
    ORDER BY emr.last_preserved_at DESC
    LIMIT ?
  `);
  const rows = preserveState ? stmt.all(preserveState, limit) : stmt.all(limit);
  return rows.map((row) => ({
    threadId: row.thread_id,
    bodyHash: row.body_hash,
    preserveState: row.preserve_state,
    preserveReason: row.preserve_reason,
    preserveScore: row.preserve_score,
    vectorDocId: row.vector_doc_id,
    summary: row.summary,
    lastPreservedAt: row.last_preserved_at,
    source: row.source,
    subject: row.subject,
    fromAddress: row.from_address,
    providerCategory: row.provider_category,
    domain: row.domain,
    threadType: row.thread_type,
    significanceScore: row.significance_score,
    relationshipScore: row.relationship_score,
    actionability: row.actionability,
    entities: safeJson(row.entities, []),
  }));
}

function getEmailMemoryStats() {
  const row = getDb().prepare(`
    SELECT
      COUNT(*) AS preservedCount,
      SUM(CASE WHEN preserve_state = 'preserved' THEN 1 ELSE 0 END) AS activePreservedCount,
      AVG(preserve_score) AS avgPreserveScore,
      MAX(last_preserved_at) AS lastPreservedAt
    FROM email_memory_records
  `).get();
  return {
    preservedCount: row?.preservedCount || 0,
    activePreservedCount: row?.activePreservedCount || 0,
    avgPreserveScore: row?.avgPreserveScore || 0,
    lastPreservedAt: row?.lastPreservedAt || null,
  };
}

function markEmailMemoryRecordDropped(threadId, reason = "no longer meets preserve threshold") {
  getDb().prepare(`
    UPDATE email_memory_records
    SET preserve_state = 'dropped',
        preserve_reason = ?,
        last_preserved_at = ?
    WHERE thread_id = ?
  `).run(reason, new Date().toISOString(), threadId);
}

module.exports = {
  upsertEmailMemoryRecord,
  getEmailMemoryRecord,
  listEmailMemoryRecords,
  getEmailMemoryStats,
  markEmailMemoryRecordDropped,
};
