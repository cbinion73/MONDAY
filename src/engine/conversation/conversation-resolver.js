"use strict";

const { getWorkingTheories } = require("../db/state-store");
const { getContradictions } = require("../db/knowledge-store");
const { nextSurfacingItem } = require("../db/surfacing-store");

function hoursSince(isoString) {
  if (!isoString) return null;
  const parsed = Date.parse(isoString);
  if (Number.isNaN(parsed)) return null;
  return (Date.now() - parsed) / (1000 * 60 * 60);
}

function contradictionCountForDomain(domain) {
  try {
    return getContradictions({ domain, status: "active" }).length;
  } catch {
    return 0;
  }
}

function calculateConversationScore({ subject, conversation, pendingSurfacing, workingTheories }) {
  const domainKey = subject.domain || subject.name;
  const contradictionCount = contradictionCountForDomain(domainKey);
  const theory = workingTheories[domainKey];
  const theoryAge = hoursSince(theory?.updatedAt);
  const progressAge = hoursSince(conversation.lastProgressAt);
  const attentionAge = hoursSince(conversation.lastUserAttentionAt || conversation.lastTouchedAt);

  let score = subject.state === "active" ? 32 : 14;
  score += contradictionCount * 12;
  score += conversation.currentHypothesis ? 10 : 0;
  score += conversation.currentRecommendation ? 6 : 0;
  score += conversation.pendingReveal ? 7 : 0;
  score += conversation.status === "Ready" ? 18 : 0;
  score += conversation.status === "Researching" ? 8 : 0;
  score += conversation.status === "Watching" ? -4 : 0;
  score += conversation.status === "Resolved" ? -20 : 0;

  if (theoryAge !== null && theoryAge <= 24) score += 16;
  if (progressAge !== null && progressAge <= 12) score += 10;
  if (progressAge !== null && progressAge > 24) score += 5;
  if (attentionAge !== null && attentionAge <= 2) score -= 18;
  if (attentionAge !== null && attentionAge > 6) score += 8;

  if (
    pendingSurfacing &&
    String(pendingSurfacing.domain || "").trim().toLowerCase() === String(domainKey || "").trim().toLowerCase()
  ) {
    score += 28;
  }

  return {
    subjectId: subject.id,
    score,
  };
}

function rankSubjectConversations(presenterState, envelope) {
  const pendingSurfacing = nextSurfacingItem();
  const workingTheories = getWorkingTheories();
  const ranked = Object.values(presenterState.subjects || {})
    .map((subject) =>
      calculateConversationScore({
        subject,
        conversation: envelope.subjects[subject.id],
        pendingSurfacing,
        workingTheories,
      })
    )
    .sort((a, b) => b.score - a.score);

  return {
    ranked,
    pendingSurfacing,
    leadSubjectId: ranked[0]?.subjectId || "retirement",
  };
}

module.exports = {
  rankSubjectConversations,
};
