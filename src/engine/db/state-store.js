"use strict";
// db/state-store.js — SQLite-backed replacement for persistence/state-store.js.
// Same public API — every caller requires this as a drop-in.
//
// Stores: working theories + revision history, open threads, triage state, heartbeat log.

const { getDb } = require("./connection");

// ── Working Theories ──────────────────────────────────────────────────────────

function getWorkingTheories() {
  const rows = getDb().prepare("SELECT * FROM working_theories ORDER BY domain").all();
  const result = {};
  for (const row of rows) {
    result[row.domain] = {
      domain: row.domain,
      text: row.text,
      confidence: row.confidence,
      updatedAt: row.updated_at,
      revisions: getTheoryRevisions(row.domain),
    };
  }
  return result;
}

function getWorkingTheory(domain) {
  const row = getDb().prepare("SELECT * FROM working_theories WHERE domain = ?").get(domain);
  if (!row) return null;
  return {
    domain: row.domain,
    text: row.text,
    confidence: row.confidence,
    updatedAt: row.updated_at,
    revisions: getTheoryRevisions(domain),
  };
}

function getTheoryRevisions(domain) {
  return getDb()
    .prepare("SELECT text, confidence, at FROM theory_revisions WHERE domain = ? ORDER BY at DESC LIMIT 10")
    .all(domain);
}

function setWorkingTheory(domain, text, confidence = 0.5) {
  const db = getDb();
  const now = new Date().toISOString();

  // Archive current version before overwriting
  const existing = db.prepare("SELECT text, confidence FROM working_theories WHERE domain = ?").get(domain);
  if (existing) {
    db.prepare("INSERT INTO theory_revisions (domain, text, confidence, at) VALUES (?, ?, ?, ?)").run(
      domain, existing.text, existing.confidence, now
    );
    // Keep only last 10 revisions per domain
    db.prepare(`
      DELETE FROM theory_revisions
      WHERE domain = ?
        AND id NOT IN (
          SELECT id FROM theory_revisions WHERE domain = ? ORDER BY at DESC LIMIT 10
        )
    `).run(domain, domain);
  }

  db.prepare(`
    INSERT INTO working_theories (domain, text, confidence, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(domain) DO UPDATE SET text = excluded.text, confidence = excluded.confidence, updated_at = excluded.updated_at
  `).run(domain, text, confidence, now);

  return getWorkingTheory(domain);
}

// ── Open Threads ──────────────────────────────────────────────────────────────

function getOpenThreads() {
  return getDb().prepare("SELECT * FROM threads ORDER BY updated_at DESC").all().map(deserializeThread);
}

function getActiveThreads() {
  return getDb().prepare("SELECT * FROM threads WHERE status != 'closed' ORDER BY updated_at DESC").all().map(deserializeThread);
}

function upsertThread(id, update) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM threads WHERE id = ?").get(id);

  if (existing) {
    const merged = { ...deserializeThread(existing), ...update, updatedAt: now };
    db.prepare(`
      UPDATE threads SET
        domain = ?, title = ?, significance = ?, status = ?,
        content = ?, updated_at = ?, closed_at = ?
      WHERE id = ?
    `).run(
      merged.domain || null,
      merged.title || null,
      merged.significance || "medium",
      merged.status || "open",
      JSON.stringify(merged.content || {}),
      now,
      merged.closedAt || null,
      id
    );
  } else {
    db.prepare(`
      INSERT INTO threads (id, domain, title, significance, status, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      update.domain || null,
      update.title || null,
      update.significance || "medium",
      update.status || "open",
      JSON.stringify(update.content || {}),
      now,
      now
    );
  }
}

function closeThread(id) {
  const now = new Date().toISOString();
  getDb().prepare("UPDATE threads SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
}

function deserializeThread(row) {
  let content = {};
  try { content = JSON.parse(row.content || "{}"); } catch {}
  return {
    id: row.id,
    domain: row.domain,
    title: row.title,
    significance: row.significance,
    status: row.status,
    content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at || null,
  };
}

// ── Triage State ──────────────────────────────────────────────────────────────

function getTriageState() {
  const row = getDb().prepare("SELECT * FROM triage_state WHERE id = 1").get();
  if (!row) return { significantNow: [], watching: [], background: [], updatedAt: null };
  return {
    significantNow: safeParseJson(row.significant_now, []),
    watching:       safeParseJson(row.watching, []),
    background:     safeParseJson(row.background, []),
    updatedAt:      row.updated_at,
  };
}

function setTriageState({ significantNow = [], watching = [], background = [] }) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO triage_state (id, significant_now, watching, background, updated_at)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      significant_now = excluded.significant_now,
      watching        = excluded.watching,
      background      = excluded.background,
      updated_at      = excluded.updated_at
  `).run(JSON.stringify(significantNow), JSON.stringify(watching), JSON.stringify(background), now);
}

// ── Heartbeat Log ─────────────────────────────────────────────────────────────

function appendHeartbeatLog(entry) {
  const db = getDb();
  const now = new Date().toISOString();
  const { loop, ...rest } = entry;
  db.prepare("INSERT INTO heartbeat_log (loop, data, at) VALUES (?, ?, ?)").run(
    loop || null,
    JSON.stringify(rest),
    now
  );
  // Prune — keep last 500 rows
  db.prepare("DELETE FROM heartbeat_log WHERE id NOT IN (SELECT id FROM heartbeat_log ORDER BY id DESC LIMIT 500)").run();
}

function getHeartbeatLog({ limit = 50 } = {}) {
  return getDb()
    .prepare("SELECT * FROM heartbeat_log ORDER BY id DESC LIMIT ?")
    .all(limit)
    .map((row) => ({ loop: row.loop, at: row.at, ...safeParseJson(row.data, {}) }))
    .reverse();
}

function getLastHeartbeatAt(loop) {
  const row = getDb()
    .prepare("SELECT at FROM heartbeat_log WHERE loop = ? ORDER BY id DESC LIMIT 1")
    .get(loop);
  return row ? row.at : null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeParseJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

module.exports = {
  getWorkingTheories,
  getWorkingTheory,
  setWorkingTheory,
  getOpenThreads,
  getActiveThreads,
  upsertThread,
  closeThread,
  getTriageState,
  setTriageState,
  appendHeartbeatLog,
  getHeartbeatLog,
  getLastHeartbeatAt,
};
