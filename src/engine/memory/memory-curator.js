"use strict";
// memory-curator.js — Review queue, confidence scoring, and candidate management.
//
// Candidates represent insights that Monday thinks are worth writing back to
// Obsidian. They sit in a review queue until Chris approves or rejects them.
//
// Sources:
//   entity_extraction — auto-queued from high-confidence graph entities
//   conversation      — queued from a significant conversation turn
//   manual            — queued explicitly by code calling queueCandidate()
//
// Confidence scoring (0–1):
//   Combines entity extraction confidence with type bonuses/penalties and
//   a duplicate proximity penalty. Only candidates ≥ MIN_AUTO_CONFIDENCE
//   are auto-queued from entities; anything below is silently skipped.
//
// Duplicate detection:
//   Before queuing, Jaccard word-similarity is computed against all existing
//   pending/approved candidates. If similarity ≥ DUPLICATE_THRESHOLD the new
//   candidate is considered a duplicate and skipped.
//   Entity-sourced candidates also check source_ref (entity ID) to avoid
//   re-queuing the same node.

const ks = require("../db/knowledge-store");

const MIN_AUTO_CONFIDENCE  = 0.6;   // below this, entities are not auto-queued
const DUPLICATE_THRESHOLD  = 0.6;   // Jaccard similarity above this = duplicate
const DEFAULT_QUEUE_LIMIT  = 200;   // max entities checked per queueFromEntities call

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Queue a single candidate for review.
 * Runs duplicate detection before inserting.
 * Returns { ok, id, skipped, reason } — skipped=true when duplicate detected.
 *
 * @param {object} candidate
 * @param {string}  candidate.source          e.g. 'conversation', 'manual'
 * @param {string}  candidate.content         short summary shown in review queue
 * @param {string}  [candidate.sourceRef]     opaque ID linking back to source record
 * @param {string}  [candidate.proposedFolder]
 * @param {string}  [candidate.proposedTitle]
 * @param {string}  [candidate.proposedBody]
 * @param {string}  [candidate.reason]        why Monday thinks this is worth keeping
 * @param {number}  [candidate.confidence]    0–1, defaults to 0.5
 * @param {string}  [candidate.domain]
 */
function queueCandidate(candidate) {
  if (!candidate?.content?.trim()) {
    return { ok: false, skipped: true, reason: "empty content" };
  }

  // Duplicate check against existing pending/approved candidates
  const existing = [
    ...ks.getPendingCandidates(DEFAULT_QUEUE_LIMIT),
    ...ks.getCandidatesByStatus("approved"),
  ];
  for (const c of existing) {
    if (_jaccard(candidate.content, c.content) >= DUPLICATE_THRESHOLD) {
      return { ok: true, skipped: true, reason: "duplicate", existingId: c.id };
    }
  }

  const id = ks.addMemoryCandidate({
    source:         candidate.source       || "manual",
    sourceRef:      candidate.sourceRef    || null,
    content:        candidate.content.trim(),
    proposedFolder: candidate.proposedFolder || _domainToFolder(candidate.domain) || null,
    proposedTitle:  candidate.proposedTitle || null,
    proposedBody:   candidate.proposedBody  || null,
    reason:         candidate.reason       || null,
    confidence:     candidate.confidence   ?? 0.5,
  });

  return { ok: true, skipped: false, id };
}

/**
 * Queue a candidate from a significant conversation turn.
 * Scores confidence from significance level + domain.
 *
 * @param {string} content    the insight to queue
 * @param {object} opts
 * @param {string}  [opts.significance]   e.g. 'high', 'medium', 'low'
 * @param {string}  [opts.domain]         Monday domain
 * @param {string}  [opts.sourceRef]      turn ID or thread ID
 * @param {string}  [opts.reason]         why this is noteworthy
 * @param {string}  [opts.proposedTitle]
 * @param {string}  [opts.proposedBody]
 */
function queueFromConversation(content, opts = {}) {
  const confidence = scoreConversationCandidate(content, opts);
  return queueCandidate({
    source:         "conversation",
    content,
    sourceRef:      opts.sourceRef     || null,
    proposedFolder: _domainToFolder(opts.domain),
    proposedTitle:  opts.proposedTitle || null,
    proposedBody:   opts.proposedBody  || null,
    reason:         opts.reason        || null,
    confidence,
    domain:         opts.domain        || null,
  });
}

/**
 * Auto-queue candidates from high-confidence graph entities.
 * Skips entities already queued (by source_ref match).
 * Skips entities below MIN_AUTO_CONFIDENCE after scoring.
 *
 * @param {object} opts
 * @param {string}  [opts.domain]     restrict to one domain
 * @param {string[]} [opts.types]     restrict to these entity types
 * @param {number}  [opts.limit]      max entities to process (default 200)
 * @returns {{ ok, queued, skipped, total }}
 */
function queueFromEntities({ domain = null, types = null, limit = DEFAULT_QUEUE_LIMIT } = {}) {
  const stats = { ok: true, queued: 0, skipped: 0, total: 0 };

  let entities = domain ? ks.getEntitiesByDomain(domain) : _getAllEntities();
  if (types?.length) entities = entities.filter((e) => types.includes(e.type));
  entities = entities.slice(0, limit);

  stats.total = entities.length;

  for (const entity of entities) {
    stats.skipped++;

    // Skip if already queued
    if (entity.id && ks.getCandidateBySourceRef(entity.id)) continue;

    const confidence = scoreEntityCandidate(entity);
    if (confidence < MIN_AUTO_CONFIDENCE) continue;

    const content = _entitySummary(entity);
    const result = queueCandidate({
      source:         "entity_extraction",
      content,
      sourceRef:      entity.id,
      proposedFolder: _domainToFolder(entity.domain),
      proposedTitle:  entity.name,
      proposedBody:   _entityBody(entity),
      reason:         `${entity.type} extracted from vault with confidence ${(entity.confidence || 0).toFixed(2)}`,
      confidence,
      domain:         entity.domain,
    });

    if (!result.skipped) {
      stats.queued++;
      stats.skipped--;
    }
  }

  return stats;
}

/**
 * Approve a candidate. Returns ok:false if not found.
 */
function approveCandidateById(id, reason = "") {
  const candidates = ks.getCandidatesByStatus("pending");
  const found = candidates.find((c) => c.id === id);
  if (!found) return { ok: false, error: "candidate not found or not pending" };
  ks.approveCandidate(id, reason);
  return { ok: true, id };
}

/**
 * Reject a candidate. Returns ok:false if not found.
 */
function rejectCandidateById(id, reason = "") {
  const candidates = ks.getCandidatesByStatus("pending");
  const found = candidates.find((c) => c.id === id);
  if (!found) return { ok: false, error: "candidate not found or not pending" };
  ks.rejectCandidate(id, reason);
  return { ok: true, id };
}

/**
 * Return the pending review queue, sorted by confidence descending.
 */
function getPendingQueue(limit = 50) {
  return ks.getPendingCandidates(limit);
}

/**
 * Return counts by status.
 */
function getReviewStats() {
  return ks.getReviewStats();
}

// ── Confidence scoring ────────────────────────────────────────────────────────

const TYPE_BONUS = {
  Decision:   +0.10,
  Belief:     +0.05,
  Mission:    +0.08,
  Goal:       +0.05,
  Person:     +0.00,
  Tension:    -0.05,
  Question:   -0.08,
  Lesson:     +0.03,
  Commitment: +0.05,
};

/**
 * Score an entity for memory candidacy.
 * Returns a float in [0, 1].
 */
function scoreEntityCandidate(entity) {
  let score = entity.confidence ?? 0.5;
  score += TYPE_BONUS[entity.type] ?? 0;
  if (entity.name && entity.name.length < 20) score -= 0.10;   // too vague
  if (entity.description && entity.description.length > 40) score += 0.05;
  if (!entity.domain) score -= 0.05;
  return Math.min(1, Math.max(0, score));
}

/**
 * Score a conversation-sourced candidate.
 */
function scoreConversationCandidate(content, { significance, domain } = {}) {
  let score = 0.5;
  const SIG_BONUS = { high: 0.25, medium: 0.10, low: -0.05 };
  if (significance && SIG_BONUS[significance] !== undefined) score += SIG_BONUS[significance];
  if (domain) score += 0.10;
  if (content && content.length < 20) score -= 0.15;
  return Math.min(1, Math.max(0, score));
}

// ── Duplicate detection ───────────────────────────────────────────────────────

/**
 * Jaccard similarity on word sets (case-insensitive).
 * Returns 0–1 where 1 = identical word sets.
 */
function _jaccard(a, b) {
  const setA = _wordSet(a);
  const setB = _wordSet(b);
  if (!setA.size && !setB.size) return 1;
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const w of setA) { if (setB.has(w)) intersection++; }
  return intersection / (setA.size + setB.size - intersection);
}

function _wordSet(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function _entitySummary(entity) {
  const parts = [`[${entity.type}] ${entity.name}`];
  if (entity.description) parts.push(entity.description.slice(0, 200));
  if (entity.domain) parts.push(`Domain: ${entity.domain}`);
  return parts.join(" — ");
}

function _entityBody(entity) {
  const lines = [
    `# ${entity.name}`,
    "",
    `**Type:** ${entity.type}`,
    entity.domain ? `**Domain:** ${entity.domain}` : null,
    entity.description ? `\n${entity.description}` : null,
    entity.sourcePath ? `\n**Source:** [[${entity.sourcePath.replace(/\.md$/, "")}]]` : null,
  ].filter((l) => l !== null);
  return lines.join("\n");
}

const DOMAIN_FOLDER = {
  family:     "Family",
  faith:      "Faith",
  health:     "Health",
  retirement: "Retirement",
  work:       "Work",
  publishing: "Publishing",
};

function _domainToFolder(domain) {
  return domain ? (DOMAIN_FOLDER[domain] || null) : null;
}

function _getAllEntities() {
  // Collect from all known types since there's no getAll in knowledge-store
  const types = ["Person", "Mission", "Decision", "Belief", "Goal", "Question", "Tension", "Lesson", "Commitment", "Project"];
  const seen  = new Set();
  const all   = [];
  for (const type of types) {
    for (const e of ks.getEntitiesByType(type)) {
      if (!seen.has(e.id)) { seen.add(e.id); all.push(e); }
    }
  }
  return all;
}

module.exports = {
  queueCandidate,
  queueFromConversation,
  queueFromEntities,
  approveCandidateById,
  rejectCandidateById,
  getPendingQueue,
  getReviewStats,
  // exported for tests
  scoreEntityCandidate,
  scoreConversationCandidate,
  _jaccard,
};
