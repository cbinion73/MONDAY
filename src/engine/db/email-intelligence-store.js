"use strict";

const { getDb } = require("./connection");

const now = () => new Date().toISOString();

function safeJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function upsertEmailThread(record) {
  const db = getDb();
  db.prepare(`
    INSERT INTO email_threads (
      thread_id, source, subject, from_address, provider_category, provider_labels, folder,
      received_at, unread, starred, has_attachments, relationship_score, junk_score,
      significance_score, domain, thread_type, actionability, entities, structured_facts,
      local_classification, classification_confidence, user_participated, message_count,
      body_hash, updated_at
    ) VALUES (
      @thread_id, @source, @subject, @from_address, @provider_category, @provider_labels, @folder,
      @received_at, @unread, @starred, @has_attachments, @relationship_score, @junk_score,
      @significance_score, @domain, @thread_type, @actionability, @entities, @structured_facts,
      @local_classification, @classification_confidence, @user_participated, @message_count,
      @body_hash, @updated_at
    )
    ON CONFLICT(thread_id) DO UPDATE SET
      source                    = excluded.source,
      subject                   = excluded.subject,
      from_address              = excluded.from_address,
      provider_category         = excluded.provider_category,
      provider_labels           = excluded.provider_labels,
      folder                    = excluded.folder,
      received_at               = excluded.received_at,
      unread                    = excluded.unread,
      starred                   = excluded.starred,
      has_attachments           = excluded.has_attachments,
      relationship_score        = excluded.relationship_score,
      junk_score                = excluded.junk_score,
      significance_score        = excluded.significance_score,
      domain                    = excluded.domain,
      thread_type               = excluded.thread_type,
      actionability             = excluded.actionability,
      entities                  = excluded.entities,
      structured_facts          = excluded.structured_facts,
      local_classification      = excluded.local_classification,
      classification_confidence = excluded.classification_confidence,
      user_participated         = excluded.user_participated,
      message_count             = excluded.message_count,
      body_hash                 = excluded.body_hash,
      updated_at                = excluded.updated_at
  `).run({
    thread_id: record.threadId,
    source: record.source,
    subject: record.subject || null,
    from_address: record.fromAddress || null,
    provider_category: record.providerCategory || null,
    provider_labels: JSON.stringify(record.providerLabels || []),
    folder: record.folder || null,
    received_at: record.receivedAt || null,
    unread: record.unread ? 1 : 0,
    starred: record.starred ? 1 : 0,
    has_attachments: record.hasAttachments ? 1 : 0,
    relationship_score: record.relationshipScore ?? 0,
    junk_score: record.junkScore ?? 0,
    significance_score: record.significanceScore ?? 0,
    domain: record.domain || null,
    thread_type: record.threadType || null,
    actionability: record.actionability ?? 0,
    entities: JSON.stringify(record.entities || []),
    structured_facts: JSON.stringify(record.structuredFacts || []),
    local_classification: JSON.stringify(record.localClassification || {}),
    classification_confidence: record.classificationConfidence ?? 0,
    user_participated: record.userParticipated ? 1 : 0,
    message_count: record.messageCount || 0,
    body_hash: record.bodyHash || null,
    updated_at: record.updatedAt || now(),
  });
}

function replaceEmailThreadFacts(threadId, facts = []) {
  const db = getDb();
  const stamp = now();
  db.transaction(() => {
    db.prepare("DELETE FROM email_thread_facts WHERE thread_id = ?").run(threadId);
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO email_thread_facts
        (thread_id, fact_type, fact_key, fact_value, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const fact of facts) {
      stmt.run(
        threadId,
        fact.type,
        fact.key || null,
        String(fact.value),
        fact.confidence ?? 0.8,
        stamp
      );
    }
  })();
}

function getEmailThread(threadId) {
  const row = getDb().prepare("SELECT * FROM email_threads WHERE thread_id = ?").get(threadId);
  return row ? deserializeEmailThread(row) : null;
}

function getEmailThreadFacts(threadId) {
  return getDb()
    .prepare("SELECT fact_type, fact_key, fact_value, confidence, created_at FROM email_thread_facts WHERE thread_id = ? ORDER BY id")
    .all(threadId)
    .map((row) => ({
      type: row.fact_type,
      key: row.fact_key,
      value: row.fact_value,
      confidence: row.confidence,
      createdAt: row.created_at,
    }));
}

function deserializeEmailThread(row) {
  return {
    threadId: row.thread_id,
    source: row.source,
    subject: row.subject,
    fromAddress: row.from_address,
    providerCategory: row.provider_category,
    providerLabels: safeJson(row.provider_labels, []),
    folder: row.folder,
    receivedAt: row.received_at,
    unread: Boolean(row.unread),
    starred: Boolean(row.starred),
    hasAttachments: Boolean(row.has_attachments),
    relationshipScore: row.relationship_score,
    junkScore: row.junk_score,
    significanceScore: row.significance_score,
    domain: row.domain,
    threadType: row.thread_type,
    actionability: row.actionability,
    entities: safeJson(row.entities, []),
    structuredFacts: safeJson(row.structured_facts, []),
    localClassification: safeJson(row.local_classification, {}),
    classificationConfidence: row.classification_confidence,
    userParticipated: Boolean(row.user_participated),
    messageCount: row.message_count,
    bodyHash: row.body_hash,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  upsertEmailThread,
  replaceEmailThreadFacts,
  getEmailThread,
  getEmailThreadFacts,
};
