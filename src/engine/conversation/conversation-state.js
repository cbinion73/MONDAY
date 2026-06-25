"use strict";

const CONVERSATION_STATUSES = [
  "Thinking",
  "Waiting",
  "Researching",
  "Ready",
  "Discussing",
  "Revising",
  "Blocked",
  "Watching",
  "Resolved",
  "Paused",
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(status, fallback = "Thinking") {
  const match = CONVERSATION_STATUSES.find(
    (candidate) => candidate.toLowerCase() === String(status || "").trim().toLowerCase()
  );
  return match || fallback;
}

function summarizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeOptionalText(text) {
  const value = summarizeText(text);
  return value || null;
}

function firstSentence(text) {
  const summary = summarizeText(text);
  if (!summary) return null;
  const match = summary.match(/.+?[.!?](?:\s|$)/);
  return match ? match[0].trim() : summary;
}

function extractOpenQuestion(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const found = lines.find((line) => line.endsWith("?"));
  return found || null;
}

function appendHistory(existingHistory = [], entry = null) {
  if (!entry) return existingHistory || [];
  return [...(existingHistory || []), entry].slice(-20);
}

function buildSeedRecommendation(sequence = []) {
  const last = sequence[sequence.length - 1] || null;
  if (!last) return null;
  return summarizeText(last.body || last.title || "");
}

function findSeedHypothesis(sequence = []) {
  for (const step of sequence) {
    if (step?.prop?.type === "theory" && step.prop.body) {
      return summarizeText(step.prop.body);
    }
  }
  return null;
}

function seedStatusForSubject(subject) {
  if (subject?.state === "active") return "Thinking";
  if (subject?.state === "resolved") return "Resolved";
  return "Watching";
}

function createConversationRecord(subject) {
  const sequence = subject?.sequence || [];
  const first = sequence[0] || {};
  const initialThought = summarizeText(first.body || subject?.summary || "");
  const hypothesis = findSeedHypothesis(sequence);

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    domain: subject.domain,
    currentConversationSummary: summarizeText(subject.summary || initialThought),
    currentThought: initialThought,
    currentRead: null,
    whatIThink: null,
    whatChangedMyMind: null,
    whatIAmStillChecking: null,
    currentOpenQuestion: extractOpenQuestion(first.body || ""),
    currentQuestion: null,
    currentHypothesis: hypothesis,
    previousHypothesis: null,
    previousThought: null,
    currentRecommendation: buildSeedRecommendation(sequence),
    currentConcern: null,
    currentOpportunity: null,
    currentReadStale: true,
    currentReadConfidence: 0.5,
    currentReadDecision: "wait",
    currentReadSupportingSignals: [],
    currentReadOpposingSignals: [],
    currentReadEvidence: {
      supportingEvidence: [],
      opposingEvidence: [],
      confidence: 0.5,
      evidenceFreshness: { supporting: 0, opposing: 0, overall: 0, label: "aging" },
      sourceProvenance: [],
      whatWouldChangeMyMind: null,
    },
    currentReadLabels: [],
    signalProvenance: [],
    lastArbitrationSnapshotKey: null,
    driftMemory: {
      dominantThemes: [],
      recurringWinningSignals: [],
      recurringOpposingSignals: [],
      lastCenterOfGravity: null,
      currentCenterOfGravity: null,
      driftDirection: null,
      stability: "low",
      volatility: "low",
      durability: "fragile",
      centerShifted: false,
      currentCenterFirstSeenAt: null,
      lastUpdatedAt: nowIso(),
    },
    status: seedStatusForSubject(subject),
    waitingOn: null,
    pendingReveal: sequence.find((step) => step?.prop)?.prop || null,
    pendingRecommendation: buildSeedRecommendation(sequence),
    pendingWorkforceJobs: [],
    latestWorkforceSignal: null,
    nextSuggestedContinuation: hypothesis
      ? `I've kept thinking about ${subject.name}.`
      : `I still think ${subject.name} deserves our attention.`,
    provenance: null,
    lastProgressAt: nowIso(),
    lastTouchedAt: null,
    lastUpdatedAt: nowIso(),
    lastUserAttentionAt: null,
    lastUserAsk: null,
    lastMondayConclusion: null,
    lastTheoryChangedAt: null,
    lastRecommendationChangedAt: null,
    revealState: "hidden",
    unresolved: true,
    unresolvedQuestion: null,
    changesWhileAway: [],
    history: [],
    modeHint: "arrival",
  };
}

function mergeConversationRecord(existing, update = {}) {
  const nextThought = summarizeText(update.currentThought ?? existing.currentThought);
  const nextHypothesis = summarizeText(update.currentHypothesis ?? existing.currentHypothesis);
  const nextRecommendation = summarizeText(
    update.currentRecommendation ?? existing.currentRecommendation
  );
  const historyEntry = update.historyEntry || null;
  return {
    ...existing,
    ...update,
    status: normalizeStatus(update.status || existing.status),
    currentConversationSummary: summarizeText(
      update.currentConversationSummary ?? existing.currentConversationSummary
    ),
    currentThought: nextThought,
    currentRead: summarizeOptionalText(update.currentRead ?? existing.currentRead),
    whatIThink: summarizeOptionalText(update.whatIThink ?? existing.whatIThink),
    whatChangedMyMind: summarizeOptionalText(update.whatChangedMyMind ?? existing.whatChangedMyMind),
    whatIAmStillChecking: summarizeOptionalText(update.whatIAmStillChecking ?? existing.whatIAmStillChecking),
    currentHypothesis: nextHypothesis,
    currentRecommendation: nextRecommendation,
    currentConcern: summarizeOptionalText(update.currentConcern ?? existing.currentConcern),
    currentOpportunity: summarizeOptionalText(update.currentOpportunity ?? existing.currentOpportunity),
    currentReadStale: Boolean(update.currentReadStale ?? existing.currentReadStale),
    currentReadConfidence: Number(update.currentReadConfidence ?? existing.currentReadConfidence ?? 0.5),
    currentReadDecision: summarizeText(update.currentReadDecision ?? existing.currentReadDecision),
    currentReadSupportingSignals: Array.isArray(update.currentReadSupportingSignals)
      ? update.currentReadSupportingSignals
      : (existing.currentReadSupportingSignals || []),
    currentReadOpposingSignals: Array.isArray(update.currentReadOpposingSignals)
      ? update.currentReadOpposingSignals
      : (existing.currentReadOpposingSignals || []),
    currentReadEvidence:
      update.currentReadEvidence && typeof update.currentReadEvidence === "object"
        ? update.currentReadEvidence
        : (existing.currentReadEvidence || null),
    currentReadLabels: Array.isArray(update.currentReadLabels)
      ? update.currentReadLabels
      : (existing.currentReadLabels || []),
    signalProvenance: Array.isArray(update.signalProvenance)
      ? update.signalProvenance
      : (existing.signalProvenance || []),
    lastArbitrationSnapshotKey: summarizeOptionalText(
      update.lastArbitrationSnapshotKey ?? existing.lastArbitrationSnapshotKey
    ),
    driftMemory:
      update.driftMemory && typeof update.driftMemory === "object"
        ? update.driftMemory
        : (existing.driftMemory || null),
    previousHypothesis: summarizeText(update.previousHypothesis ?? existing.previousHypothesis),
    previousThought: summarizeText(update.previousThought ?? existing.previousThought),
    nextSuggestedContinuation: summarizeText(
      update.nextSuggestedContinuation ?? existing.nextSuggestedContinuation
    ),
    currentOpenQuestion: summarizeOptionalText(update.currentOpenQuestion ?? existing.currentOpenQuestion),
    currentQuestion: summarizeOptionalText(update.currentQuestion ?? existing.currentQuestion),
    waitingOn: summarizeOptionalText(update.waitingOn ?? existing.waitingOn),
    lastUserAsk: summarizeOptionalText(update.lastUserAsk ?? existing.lastUserAsk),
    lastMondayConclusion: summarizeOptionalText(
      update.lastMondayConclusion ?? existing.lastMondayConclusion
    ),
    unresolvedQuestion: summarizeOptionalText(
      update.unresolvedQuestion ?? existing.unresolvedQuestion
    ),
    history: appendHistory(update.history ?? existing.history, historyEntry),
    lastUpdatedAt: update.lastUpdatedAt || nowIso(),
  };
}

module.exports = {
  CONVERSATION_STATUSES,
  nowIso,
  normalizeStatus,
  summarizeText,
  summarizeOptionalText,
  firstSentence,
  extractOpenQuestion,
  appendHistory,
  createConversationRecord,
  mergeConversationRecord,
};
