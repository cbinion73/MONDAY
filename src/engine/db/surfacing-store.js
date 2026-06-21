"use strict";
// surfacing-store.js — Read/write the surfacing_queue table.
//
// Workers write ripe findings here. Monday checks at turn start and leads with them.
// Once surfaced, items are marked and not re-shown.

const crypto = require("node:crypto");
const { getDb } = require("./connection");

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

const DEFAULT_TTL_HOURS = 48;

/**
 * Add a finding to the surfacing queue.
 *
 * @param {object} opts
 *   opts.source    - 'synthesis' | 'morning-digest' | 'contradiction' | 'monitor'
 *   opts.domain    - life domain (optional)
 *   opts.payload   - the message Monday will surface (string)
 *   opts.confidence - 0.0–1.0
 *   opts.priority  - integer, lower = higher priority (default 5)
 *   opts.ttlHours  - hours until this item expires (default 48)
 */
function enqueueSurfacing({ source, domain = null, payload, confidence = 0.5, priority = 5, ttlHours = DEFAULT_TTL_HOURS }) {
  if (!payload || !source) return null;

  const id = uuid();
  const ts = now();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  getDb().prepare(`
    INSERT INTO surfacing_queue (id, source, domain, payload, confidence, priority, surfaced, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(id, source, domain, payload, confidence, priority, ts, expiresAt);

  return id;
}

/**
 * Get the next unsurfaced item (highest priority, not expired).
 * Returns null if queue is empty.
 */
function nextSurfacingItem() {
  const ts = now();
  const row = getDb().prepare(`
    SELECT * FROM surfacing_queue
    WHERE surfaced = 0
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY priority ASC, created_at ASC
    LIMIT 1
  `).get(ts);

  if (!row) return null;
  return {
    id:         row.id,
    source:     row.source,
    domain:     row.domain,
    payload:    row.payload,
    confidence: row.confidence,
    priority:   row.priority,
    createdAt:  row.created_at,
    expiresAt:  row.expires_at,
  };
}

/**
 * Mark an item as surfaced so it doesn't appear again.
 */
function markSurfaced(id) {
  getDb().prepare(`
    UPDATE surfacing_queue SET surfaced = 1, surfaced_at = ? WHERE id = ?
  `).run(now(), id);
}

/**
 * Peek at all pending items (for debugging).
 */
function getPendingItems() {
  const ts = now();
  return getDb().prepare(`
    SELECT * FROM surfacing_queue
    WHERE surfaced = 0
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY priority ASC, created_at ASC
  `).all(ts).map(r => ({
    id: r.id, source: r.source, domain: r.domain,
    payload: r.payload, confidence: r.confidence, priority: r.priority,
    createdAt: r.created_at,
  }));
}

/**
 * Clear expired items (call periodically).
 */
function pruneExpired() {
  getDb().prepare(`
    DELETE FROM surfacing_queue WHERE expires_at IS NOT NULL AND expires_at < ?
  `).run(now());
}

module.exports = { enqueueSurfacing, nextSurfacingItem, markSurfaced, getPendingItems, pruneExpired };
