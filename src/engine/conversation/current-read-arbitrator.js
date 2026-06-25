"use strict";

const { summarizeText } = require("./conversation-state");

function nowMs() {
  return Date.now();
}

function parseMs(value, fallbackMs = nowMs()) {
  const ms = Date.parse(value || "");
  return Number.isNaN(ms) ? fallbackMs : ms;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function summarize(value) {
  return summarizeText(value || "");
}

function ageFreshness(timestamp) {
  if (!timestamp) return 0.45;
  const ageHours = Math.max(0, (nowMs() - parseMs(timestamp)) / (1000 * 60 * 60));
  if (ageHours <= 2) return 1;
  if (ageHours <= 24) return 0.82;
  if (ageHours <= 72) return 0.64;
  if (ageHours <= 168) return 0.45;
  return 0.28;
}

function buildSignal({
  source,
  subjectId,
  type,
  statement,
  confidence = 0.6,
  freshness = 0.6,
  significance = 0.6,
  contradictionWeight = 0,
  opportunityWeight = 0,
  evidenceCount = 1,
  timestamp = null,
}) {
  const normalizedStatement = summarize(statement);
  if (!normalizedStatement) return null;
  return {
    source,
    subjectId,
    type,
    statement: normalizedStatement,
    confidence: clamp(confidence, 0, 1),
    freshness: clamp(freshness, 0, 1),
    significance: clamp(significance, 0, 1),
    contradictionWeight: clamp(contradictionWeight, 0, 1),
    opportunityWeight: clamp(opportunityWeight, 0, 1),
    evidenceCount: Math.max(0, Number(evidenceCount || 0)),
    timestamp,
  };
}

function inferTheme(subjectId, statement) {
  const text = summarize(statement).toLowerCase();
  switch (subjectId) {
    case "retirement":
      if (/financial|money|timing|date|readiness|portfolio/.test(text)) return "financial_timing";
      if (/responsib|freedom|identity|build|carry|burden|redesign/.test(text)) return "responsibility_redesign";
      return "retirement_general";
    case "family":
      if (/presence|attention|connect|caleb|wife|rebekah|relationship/.test(text)) return "presence";
      if (/schedule|calendar|logistics|time block/.test(text)) return "logistics";
      return "family_general";
    case "faith":
      if (/silence|quiet|stillness|avoid/.test(text)) return "silence";
      if (/discipline|habit|prayer/.test(text)) return "practice";
      return "faith_general";
    case "publishing":
      if (/significance|meaning|identity|pressure|hurt|fear/.test(text)) return "significance";
      if (/output|discipline|production|publish/.test(text)) return "output";
      return "publishing_general";
    case "health":
      if (/sustainab|scope|repeat|continuity/.test(text)) return "sustainability";
      if (/motivation|intensity|discipline/.test(text)) return "motivation";
      return "health_general";
    case "work":
      if (/identity|refuge|avoid|burden|carry/.test(text)) return "identity_refuge";
      if (/output|workload|execution|deliver/.test(text)) return "output";
      return "work_general";
    default:
      return "general";
  }
}

function scoreSignal(signal) {
  return (
    signal.confidence * 4 +
    signal.freshness * 3 +
    signal.significance * 2.5 +
    signal.contradictionWeight * 1.75 +
    signal.opportunityWeight * 1.1 +
    Math.min(signal.evidenceCount, 5) * 0.25
  );
}

function inferUserEmphasis(lastUserAsk) {
  const text = summarize(lastUserAsk).toLowerCase();
  if (!text) return 0;
  let weight = 0;
  if (/really|actually|still|most|matter|important|center/.test(text)) weight += 0.2;
  if (/retire|family|faith|book|health|work/.test(text)) weight += 0.1;
  return clamp(weight, 0, 0.35);
}

function hedgingPenalty(statement) {
  const text = summarize(statement).toLowerCase();
  if (!text) return 0;
  if (/\b(maybe|might|perhaps|possibly|soon|not sure)\b/.test(text)) return 0.24;
  return 0;
}

function metaConversationPenalty(statement) {
  const text = summarize(statement).toLowerCase();
  if (!text) return 0;
  if (/^(before, i was|earlier, i was|it matters because|fairly sure|reasonably sure|not fully)/.test(text)) {
    return 0.3;
  }
  return 0;
}

function collectCandidateSignals(subject, conversation) {
  const subjectId = subject?.id || "general";
  const signals = [];
  const emphasisBoost = inferUserEmphasis(conversation.lastUserAsk);

  const push = (signal) => {
    if (!signal) return;
    const theme = inferTheme(subjectId, signal.statement);
    signals.push({
      ...signal,
      theme,
      score: scoreSignal(signal),
    });
  };

  push(
    buildSignal({
      source: "working_theory",
      subjectId,
      type: "theory",
      statement: conversation.currentHypothesis,
      confidence: 0.72 - hedgingPenalty(conversation.currentHypothesis),
      freshness: ageFreshness(conversation.lastTheoryChangedAt || conversation.lastProgressAt),
      significance: 0.82,
      evidenceCount: 2,
      timestamp: conversation.lastTheoryChangedAt || conversation.lastProgressAt,
    })
  );

  push(
    buildSignal({
      source: "recent_conversation",
      subjectId,
      type: "conversation",
      statement: conversation.currentThought,
      confidence:
        0.66 +
        emphasisBoost -
        hedgingPenalty(conversation.currentThought) -
        metaConversationPenalty(conversation.currentThought),
      freshness: ageFreshness(conversation.lastTouchedAt || conversation.lastProgressAt),
      significance: 0.72,
      evidenceCount: Array.isArray(conversation.history) ? Math.min(conversation.history.length, 4) : 1,
      timestamp: conversation.lastTouchedAt || conversation.lastProgressAt,
    })
  );

  push(
    buildSignal({
      source: "workforce_output",
      subjectId,
      type: "workforce",
      statement: conversation.latestWorkforceSignal?.payload,
      confidence: 0.88,
      freshness: ageFreshness(conversation.latestWorkforceSignal?.createdAt),
      significance: 0.9,
      evidenceCount: 3,
      timestamp: conversation.latestWorkforceSignal?.createdAt,
    })
  );

  push(
    buildSignal({
      source: "contradiction",
      subjectId,
      type: "contradiction",
      statement:
        conversation.pendingReveal?.type === "contradiction"
          ? conversation.pendingReveal.observed || conversation.pendingReveal.body
          : null,
      confidence: 0.83,
      freshness: ageFreshness(conversation.lastProgressAt),
      significance: 0.86,
      contradictionWeight: 0.95,
      evidenceCount: 2,
      timestamp: conversation.lastProgressAt,
    })
  );

  push(
    buildSignal({
      source: "opportunity",
      subjectId,
      type: "opportunity",
      statement:
        conversation.pendingReveal?.type === "opportunity"
          ? conversation.pendingReveal.body || conversation.currentOpportunity
          : conversation.currentOpportunity,
      confidence: 0.64,
      freshness: ageFreshness(conversation.lastRecommendationChangedAt || conversation.lastProgressAt),
      significance: 0.68,
      opportunityWeight: 0.9,
      evidenceCount: 1,
      timestamp: conversation.lastRecommendationChangedAt || conversation.lastProgressAt,
    })
  );

  push(
    buildSignal({
      source: "recent_user_emphasis",
      subjectId,
      type: "emphasis",
      statement: conversation.lastUserAsk,
      confidence: 0.5 + emphasisBoost,
      freshness: ageFreshness(conversation.lastUserAttentionAt || conversation.lastTouchedAt),
      significance: 0.62 + emphasisBoost,
      evidenceCount: 1,
      timestamp: conversation.lastUserAttentionAt || conversation.lastTouchedAt,
    })
  );

  push(
    buildSignal({
      source: "existing_read",
      subjectId,
      type: "current_read",
      statement: conversation.currentRead,
      confidence: 0.44,
      freshness: ageFreshness(conversation.lastProgressAt),
      significance: 0.7,
      evidenceCount: 1,
      timestamp: conversation.lastProgressAt,
    })
  );

  return signals.sort((a, b) => b.score - a.score);
}

function findOpposingSignal(subjectId, strongest, rankedSignals) {
  if (!strongest) return null;
  return (
    rankedSignals.find((signal) => {
      if (signal === strongest) return false;
      if (signal.theme === strongest.theme) return false;
      if (subjectId === "retirement") {
        const retirementOpposed =
          (strongest.theme === "responsibility_redesign" && signal.theme === "financial_timing") ||
          (strongest.theme === "financial_timing" && signal.theme === "responsibility_redesign");
        if (!retirementOpposed) return false;
      }
      return signal.score >= strongest.score * 0.62;
    }) || null
  );
}

function decideArbitration(subject, conversation, rankedSignals) {
  const strongest = rankedSignals[0] || null;
  const subjectId = subject?.id || "general";
  const opposing = findOpposingSignal(subjectId, strongest, rankedSignals.slice(1));
  const existingTheme = inferTheme(subjectId, conversation.currentRead || conversation.currentHypothesis || "");
  const strongestTheme = strongest?.theme || "general";
  const confidenceBase = strongest ? clamp(strongest.score / 9.5, 0.28, 0.96) : 0.25;
  const confidence = opposing
    ? clamp(confidenceBase - 0.22, 0.22, 0.9)
    : confidenceBase;

  let decision = "hold";
  if (!strongest) {
    decision = "wait";
  } else if (strongest.score < 4.2) {
    decision = "wait";
  } else if (strongest.source === "existing_read") {
    decision = "hold";
  } else if (
    strongest.source === "working_theory" &&
    strongest.confidence < 0.56 &&
    summarize(conversation.currentRead)
  ) {
    decision = "hold";
  } else if (opposing && opposing.score >= strongest.score * 0.82) {
    decision = "soften";
  } else if (strongest.source === "contradiction" && strongest.contradictionWeight >= 0.9) {
    decision = "escalate";
  } else if (existingTheme && strongestTheme !== existingTheme) {
    decision = "revise";
  } else if (strongest.freshness >= 0.82 && strongest.source === "workforce_output") {
    decision = "revise";
  } else {
    decision = "hold";
  }

  return {
    decision,
    confidence,
    strongestSignal: strongest,
    opposingSignal: opposing,
    uncertainty:
      !strongest
        ? "I do not have a strong enough signal to revise the read yet."
        : opposing
          ? opposing.statement
          : conversation.currentReadStale
            ? "The read is still moving, so I am watching for one more confirming signal."
            : null,
  };
}

function arbitrateCurrentRead(subject, conversation) {
  const rankedSignals = collectCandidateSignals(subject, conversation);
  const judgment = decideArbitration(subject, conversation, rankedSignals);
  return {
    rankedSignals,
    supportingSignals: rankedSignals.slice(0, 3),
    opposingSignals: judgment.opposingSignal ? [judgment.opposingSignal] : [],
    strongestSignal: judgment.strongestSignal,
    opposingSignal: judgment.opposingSignal,
    confidence: judgment.confidence,
    decision: judgment.decision,
    uncertainty: judgment.uncertainty,
  };
}

module.exports = {
  buildSignal,
  collectCandidateSignals,
  arbitrateCurrentRead,
  inferTheme,
};
