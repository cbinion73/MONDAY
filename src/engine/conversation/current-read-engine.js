"use strict";

const { summarizeOptionalText, summarizeText } = require("./conversation-state");
const { arbitrateCurrentRead, inferTheme } = require("./current-read-arbitrator");

const MAX_PROVENANCE_EVENTS = 120;

function sentence(text) {
  const value = summarizeText(text || "");
  if (!value) return null;
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function themeText(signal) {
  return summarizeText(signal?.statement || "");
}

function isoNow() {
  return new Date().toISOString();
}

function parseMs(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? null : parsed;
}

function hoursAgo(timestamp) {
  const ms = parseMs(timestamp);
  if (!ms) return null;
  return Math.max(0, (Date.now() - ms) / (1000 * 60 * 60));
}

function round(value) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.round(Number(value) * 100) / 100;
}

function themeLabel(subjectId, theme) {
  const map = {
    retirement: {
      financial_timing: "financial timing",
      responsibility_redesign: "responsibility redesign",
      retirement_general: "retirement itself",
    },
    family: {
      presence: "intentional presence",
      logistics: "logistics",
      family_general: "family attention",
    },
    faith: {
      silence: "silence",
      practice: "practice",
      faith_general: "faith",
    },
    publishing: {
      significance: "significance",
      output: "output",
      publishing_general: "publishing",
    },
    health: {
      sustainability: "sustainability",
      motivation: "motivation",
      health_general: "health itself",
    },
    work: {
      identity_refuge: "identity and refuge",
      output: "output",
      work_general: "work itself",
    },
  };
  return map[subjectId]?.[theme] || theme?.replace(/_/g, " ") || "the current signal";
}

function shortDuration(timestamp) {
  const hours = hoursAgo(timestamp);
  if (hours == null) return "a while";
  if (hours < 6) return "the last few hours";
  if (hours < 24) return "today";
  if (hours < 48) return "yesterday";
  const days = Math.round(hours / 24);
  if (days < 7) return `about ${days} days`;
  const weeks = Math.round(days / 7);
  return weeks <= 1 ? "about a week" : `about ${weeks} weeks`;
}

function deriveOpinion(subject, arbitration) {
  const strongest = arbitration.strongestSignal;
  const opposing = arbitration.opposingSignal;

  switch (subject?.id) {
    case "retirement":
      if (strongest?.theme === "responsibility_redesign") {
        return opposing?.theme === "financial_timing" && arbitration.decision === "soften"
          ? "I think Retirement is less about leaving work and more about redesigning what work is allowed to carry, even though the financial side still matters."
          : "I think Retirement is less about leaving work and more about redesigning what work is allowed to carry.";
      }
      if (strongest?.theme === "financial_timing") {
        return "I think Retirement is still behaving like a financial and timing decision more than a redesign question.";
      }
      return "I think Retirement is becoming less about when to stop and more about what work should keep carrying.";
    case "family":
      if (/caleb/i.test(themeText(strongest))) {
        return "I still think Caleb needs more intentional presence than logistics.";
      }
      return strongest?.theme === "presence"
        ? "I think Family needs more intentional presence than cleaner logistics."
        : "I think Family is asking for attention before it becomes a larger repair problem.";
    case "faith":
      return strongest?.theme === "silence"
        ? "I suspect silence has become more difficult than prayer."
        : "I think Faith is being shaped by what quiet has become expensive to face.";
    case "publishing":
      return strongest?.theme === "significance"
        ? "I don't think the writing problem is discipline anymore. I think it's significance."
        : "I think Publishing is carrying more meaning pressure than output pressure.";
    case "health":
      return strongest?.theme === "sustainability"
        ? "I don't think the health problem is motivation. I think it's sustainability."
        : "I think Health needs a smaller shape before it needs more intensity.";
    case "work":
      return strongest?.theme === "identity_refuge"
        ? "I think work is carrying more than output right now."
        : "I think Work is doing more jobs than it looks like on the surface.";
    default:
      return strongest?.statement
        ? `I think ${subject?.name || "this"} is really about ${strongest.statement.replace(/[.!?]+$/, "").toLowerCase()}.`
        : `I think ${subject?.name || "this"} still deserves a more precise read than we have right now.`;
  }
}

function deriveConcern(subject, arbitration) {
  if (subject?.id === "retirement") {
    return arbitration.opposingSignal?.theme === "financial_timing"
      ? "I am not dismissing the financial side. I just do not think it is the center anymore."
      : "If we keep calling this retirement, we may solve it like a date problem instead of a responsibility problem.";
  }
  return arbitration.uncertainty || arbitration.opposingSignal?.statement || null;
}

function deriveOpportunity(subject, conversation) {
  const recommendation = summarizeText(conversation.currentRecommendation || conversation.pendingRecommendation || "");
  if (recommendation) return recommendation;
  switch (subject?.id) {
    case "retirement":
      return "Separate what you want freedom from from what you still want to build.";
    case "family":
      return "Protect one block of real presence before this turns into a broader repair conversation.";
    case "faith":
      return "Create one honest return to quiet instead of widening the whole spiritual plan.";
    case "publishing":
      return "Reset what the work means before you ask it for more output.";
    case "health":
      return "Choose one sustainable move and make it repeatable.";
    case "work":
      return "Redesign the heaviest recurring burden before trying to fix all of work.";
    default:
      return null;
  }
}

function deriveQuestion(conversation) {
  return summarizeOptionalText(
    conversation.currentQuestion ||
      conversation.unresolvedQuestion ||
      conversation.currentOpenQuestion ||
      null
  );
}

function buildChangedMind(subject, arbitration) {
  const strongest = arbitration.strongestSignal;
  if (!strongest) return null;
  if (subject?.id === "retirement" && strongest.theme === "responsibility_redesign") {
    return "The strongest signal was the repeated tension between wanting freedom and still wanting to build.";
  }
  if (strongest.source === "workforce_output") {
    return `What moved me most was the newer workforce read: ${strongest.statement}`;
  }
  if (strongest.source === "contradiction") {
    return `What changed my mind was the contradiction that kept surfacing: ${strongest.statement}`;
  }
  return `What changed my mind most was ${strongest.statement}`;
}

function buildStillChecking(subject, arbitration, conversation = {}) {
  const explicitConcern = summarizeText(conversation.currentConcern || "");
  if (explicitConcern) return explicitConcern;
  const opposing = arbitration.opposingSignal;
  if (subject?.id === "retirement" && opposing?.theme === "financial_timing") {
    return "I am not dismissing the financial side. I just do not think it is the center anymore.";
  }
  return arbitration.uncertainty || opposing?.statement || null;
}

function isThinkingState(conversation) {
  const status = String(conversation.status || "").toLowerCase();
  if (status === "thinking" || status === "researching" || status === "waiting") return true;
  return Array.isArray(conversation.pendingWorkforceJobs) && conversation.pendingWorkforceJobs.length > 0;
}

function deriveCurrentRead(subject, conversation) {
  const arbitration = arbitrateCurrentRead(subject, conversation);
  return deriveOpinion(subject, arbitration);
}

function buildSnapshotKey(subjectId, arbitration, currentRead) {
  const strongest = arbitration.strongestSignal;
  const opposing = arbitration.opposingSignal;
  return [
    subjectId,
    arbitration.decision,
    strongest?.theme || "none",
    strongest?.source || "none",
    opposing?.theme || "none",
    round(arbitration.confidence),
    summarizeText(currentRead || ""),
  ].join("|");
}

function didReadChange(subjectId, conversation, arbitration, currentRead) {
  const previousTheme = inferTheme(subjectId, conversation.currentRead || conversation.currentHypothesis || "");
  const currentTheme = arbitration.strongestSignal?.theme || previousTheme;
  const previousRead = summarizeText(conversation.currentRead || conversation.whatIThink || "");
  const nextRead = summarizeText(currentRead || "");
  if (!previousRead) return true;
  if (previousTheme && currentTheme && previousTheme !== currentTheme) return true;
  if (previousRead !== nextRead && ["revise", "escalate", "soften"].includes(arbitration.decision)) return true;
  return false;
}

function buildSignalProvenance(conversation, subject, arbitration, currentRead) {
  const subjectId = subject?.id || "general";
  const snapshotAt = isoNow();
  const snapshotKey = buildSnapshotKey(subjectId, arbitration, currentRead);
  const previousSnapshotKey = summarizeText(conversation.lastArbitrationSnapshotKey || "");
  const existing = Array.isArray(conversation.signalProvenance) ? conversation.signalProvenance : [];

  if (previousSnapshotKey && previousSnapshotKey === snapshotKey) {
    return {
      signalProvenance: existing,
      lastArbitrationSnapshotKey: previousSnapshotKey,
      appended: false,
      readChanged: false,
    };
  }

  const readChanged = didReadChange(subjectId, conversation, arbitration, currentRead);
  const strongest = arbitration.strongestSignal;
  const opposing = arbitration.opposingSignal;
  const events = arbitration.rankedSignals.map((signal) => ({
    source: signal.source,
    signalType: signal.type,
    statement: signal.statement,
    normalizedTheme: signal.theme,
    score: round(signal.score),
    confidence: round(signal.confidence),
    freshness: round(signal.freshness),
    significance: round(signal.significance),
    contradictionWeight: round(signal.contradictionWeight),
    opportunityWeight: round(signal.opportunityWeight),
    evidenceCount: signal.evidenceCount,
    timestamp: signal.timestamp || snapshotAt,
    subjectId,
    wonArbitration:
      Boolean(strongest) &&
      signal.source === strongest.source &&
      signal.type === strongest.type &&
      signal.statement === strongest.statement,
    opposedArbitration:
      Boolean(opposing) &&
      signal.source === opposing.source &&
      signal.type === opposing.type &&
      signal.statement === opposing.statement,
    changedRead: readChanged,
    snapshotAt,
    snapshotKey,
  }));

  return {
    signalProvenance: [...existing, ...events].slice(-MAX_PROVENANCE_EVENTS),
    lastArbitrationSnapshotKey: snapshotKey,
    appended: true,
    readChanged,
  };
}

function buildThemeSummaryEntries(entries, predicate) {
  const grouped = new Map();
  for (const entry of entries.filter(predicate)) {
    const key = entry.normalizedTheme || "general";
    const current = grouped.get(key) || {
      theme: key,
      count: 0,
      firstSeenAt: entry.snapshotAt || entry.timestamp || null,
      lastSeenAt: entry.snapshotAt || entry.timestamp || null,
      lastStatement: entry.statement,
      totalScore: 0,
      lastConfidence: entry.confidence || 0,
    };
    current.count += 1;
    current.totalScore += Number(entry.score || 0);
    current.lastStatement = entry.statement || current.lastStatement;
    current.lastConfidence = Number(entry.confidence || current.lastConfidence || 0);
    if (!current.firstSeenAt || parseMs(entry.snapshotAt || entry.timestamp) < parseMs(current.firstSeenAt || "")) {
      current.firstSeenAt = entry.snapshotAt || entry.timestamp || current.firstSeenAt;
    }
    if (!current.lastSeenAt || parseMs(entry.snapshotAt || entry.timestamp) > parseMs(current.lastSeenAt || "")) {
      current.lastSeenAt = entry.snapshotAt || entry.timestamp || current.lastSeenAt;
    }
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      averageScore: round(entry.totalScore / Math.max(entry.count, 1)),
    }))
    .sort((a, b) => b.count - a.count || b.averageScore - a.averageScore);
}

function summarizeWinningTimeline(entries) {
  return entries
    .filter((entry) => entry.wonArbitration)
    .map((entry) => entry.normalizedTheme || "general");
}

function calculateVolatility(winnerThemes, opposingCount) {
  let shifts = 0;
  for (let index = 1; index < winnerThemes.length; index += 1) {
    if (winnerThemes[index] !== winnerThemes[index - 1]) shifts += 1;
  }
  if (shifts >= 3 || opposingCount >= 3 || (shifts >= 2 && opposingCount >= 2)) return "high";
  if (shifts >= 1 || opposingCount >= 1) return "medium";
  return "low";
}

function calculateDurability(currentThemeWins) {
  if (currentThemeWins >= 3) return "durable";
  if (currentThemeWins >= 2) return "building";
  return "fragile";
}

function calculateStability(currentThemeWins, volatility) {
  if (currentThemeWins >= 3 && volatility === "low") return "high";
  if (currentThemeWins >= 2 && volatility !== "high") return "medium";
  return "low";
}

function buildDriftMemory(subject, conversation, arbitration, provenanceResult) {
  const prior = conversation.driftMemory || {};
  const entries = provenanceResult.signalProvenance || [];
  const dominantThemes = buildThemeSummaryEntries(entries, (entry) => entry.wonArbitration || entry.opposedArbitration);
  const recurringWinningSignals = buildThemeSummaryEntries(entries, (entry) => entry.wonArbitration).filter((entry) => entry.count >= 2);
  const recurringOpposingSignals = buildThemeSummaryEntries(entries, (entry) => entry.opposedArbitration).filter((entry) => entry.count >= 2);
  const winnerThemes = summarizeWinningTimeline(entries);
  const currentCenter = arbitration.strongestSignal?.theme || prior.currentCenterOfGravity || null;
  const previousCurrentCenter = prior.currentCenterOfGravity || null;
  const currentThemeWins = winnerThemes.filter((theme) => theme === currentCenter).length;
  const opposingCount = entries.filter((entry) => entry.opposedArbitration).length;
  const volatility = calculateVolatility(winnerThemes.slice(-6), opposingCount);
  const durability = calculateDurability(currentThemeWins);
  const stability = calculateStability(currentThemeWins, volatility);
  const centerShifted =
    Boolean(previousCurrentCenter) &&
    Boolean(currentCenter) &&
    previousCurrentCenter !== currentCenter &&
    currentThemeWins >= 2;
  const lastCenterOfGravity = centerShifted
    ? previousCurrentCenter
    : (prior.lastCenterOfGravity || previousCurrentCenter || null);
  const driftDirection = centerShifted
    ? `${previousCurrentCenter} -> ${currentCenter}`
    : (prior.driftDirection || null);
  const currentCenterSummary = dominantThemes.find((entry) => entry.theme === currentCenter) || null;
  const centerFirstSeenAt = currentCenterSummary?.firstSeenAt || prior.currentCenterFirstSeenAt || null;

  return {
    dominantThemes,
    recurringWinningSignals,
    recurringOpposingSignals,
    lastCenterOfGravity,
    currentCenterOfGravity: currentCenter,
    driftDirection,
    stability,
    volatility,
    durability,
    centerShifted,
    currentCenterFirstSeenAt: centerFirstSeenAt,
    lastUpdatedAt: isoNow(),
  };
}

function buildReadLabels(arbitration, driftMemory) {
  const labels = [];
  if (driftMemory.durability === "durable") {
    labels.push("repeated evidence", "durable read");
  } else if (driftMemory.durability === "building") {
    labels.push("repeated evidence");
  } else {
    labels.push("new evidence", "fragile read");
  }
  if (driftMemory.centerShifted) labels.push("center shifted");
  if (
    arbitration.decision === "soften" ||
    arbitration.confidence < 0.58 ||
    driftMemory.volatility === "high"
  ) {
    labels.push("still uncertain");
  }
  return [...new Set(labels)];
}

function freshnessLabel(value) {
  if (value >= 0.82) return "fresh";
  if (value >= 0.58) return "recent";
  return "aging";
}

function uniqueSources(signals = []) {
  return [...new Set(
    signals
      .map((signal) => signal?.source)
      .filter(Boolean)
  )];
}

function buildWhatWouldChangeMind(subject, arbitration) {
  const strongest = arbitration.strongestSignal;
  const opposing = arbitration.opposingSignal;
  if (!strongest) {
    return "A stronger, better-supported signal than the one I have now.";
  }

  if (subject?.id === "retirement") {
    if (strongest.theme === "responsibility_redesign") {
      return "Evidence that retirement conversations consistently return to money, readiness, and dates rather than responsibility or what work is carrying.";
    }
    if (strongest.theme === "financial_timing") {
      return "Evidence that the tension keeps returning to freedom, identity, and what work should stop carrying rather than to the numbers.";
    }
  }

  if (opposing?.statement) {
    return `A stronger repeated signal in the opposing direction, especially if ${opposing.statement.replace(/[.!?]+$/, "")}.`;
  }

  return "A stronger repeated signal that keeps pulling the center of gravity somewhere else.";
}

function buildEvidenceModel(subject, conversation, arbitration) {
  const opposingKeySet = new Set(
    (arbitration.opposingSignals || []).map((signal) =>
      [signal?.source, signal?.type, signal?.statement].join("|")
    )
  );
  const supportingEvidence = (arbitration.supportingSignals || [])
    .filter((signal) => !opposingKeySet.has([signal?.source, signal?.type, signal?.statement].join("|")))
    .map((signal) => ({
    source: signal.source,
    type: signal.type,
    statement: signal.statement,
    theme: signal.theme,
    confidence: round(signal.confidence),
    freshness: round(signal.freshness),
    freshnessLabel: freshnessLabel(Number(signal.freshness || 0)),
    evidenceCount: signal.evidenceCount,
    timestamp: signal.timestamp || null,
  }));
  const opposingEvidence = (arbitration.opposingSignals || []).map((signal) => ({
    source: signal.source,
    type: signal.type,
    statement: signal.statement,
    theme: signal.theme,
    confidence: round(signal.confidence),
    freshness: round(signal.freshness),
    freshnessLabel: freshnessLabel(Number(signal.freshness || 0)),
    evidenceCount: signal.evidenceCount,
    timestamp: signal.timestamp || null,
  }));
  const supportingFreshness = supportingEvidence.length > 0
    ? Math.max(...supportingEvidence.map((item) => Number(item.freshness || 0)))
    : 0;
  const opposingFreshness = opposingEvidence.length > 0
    ? Math.max(...opposingEvidence.map((item) => Number(item.freshness || 0)))
    : 0;

  return {
    supportingEvidence,
    opposingEvidence,
    confidence: arbitration.confidence,
    evidenceFreshness: {
      supporting: round(supportingFreshness),
      opposing: round(opposingFreshness),
      overall: round(Math.max(supportingFreshness, opposingFreshness)),
      label: freshnessLabel(Math.max(supportingFreshness, opposingFreshness)),
    },
    sourceProvenance: uniqueSources([
      ...(arbitration.supportingSignals || []),
      ...(arbitration.opposingSignals || []),
    ]),
    whatWouldChangeMyMind: buildWhatWouldChangeMind(subject, arbitration),
  };
}

function recomputeCurrentRead(subject, conversation) {
  const arbitration = arbitrateCurrentRead(subject, conversation);
  const currentRead = sentence(deriveOpinion(subject, arbitration));
  const provenanceResult = buildSignalProvenance(conversation, subject, arbitration, currentRead);
  const driftMemory = buildDriftMemory(subject, conversation, arbitration, provenanceResult);
  const currentReadLabels = buildReadLabels(arbitration, driftMemory);
  const whatIThink = currentRead;
  const whatChangedMyMind = sentence(buildChangedMind(subject, arbitration));
  const whatIAmStillChecking = sentence(buildStillChecking(subject, arbitration, conversation));
  const currentRecommendation = summarizeOptionalText(
    conversation.currentRecommendation || conversation.pendingRecommendation || null
  );
  const currentQuestion = deriveQuestion(conversation);
  const currentConcern = summarizeOptionalText(deriveConcern(subject, arbitration));
  const currentOpportunity = summarizeOptionalText(deriveOpportunity(subject, conversation));
  const currentReadEvidence = buildEvidenceModel(subject, conversation, arbitration);

  return {
    currentRead,
    whatIThink,
    whatChangedMyMind,
    whatIAmStillChecking,
    currentRecommendation,
    currentQuestion,
    currentConcern,
    currentOpportunity,
    currentReadStale: isThinkingState(conversation),
    currentReadConfidence: arbitration.confidence,
    currentReadDecision: arbitration.decision,
    currentReadSupportingSignals: arbitration.supportingSignals,
    currentReadOpposingSignals: arbitration.opposingSignals,
    currentReadEvidence,
    currentReadLabels,
    signalProvenance: provenanceResult.signalProvenance,
    lastArbitrationSnapshotKey: provenanceResult.lastArbitrationSnapshotKey,
    driftMemory,
  };
}

function buildChangedMindReply(subject, conversation) {
  const changed = summarizeText(conversation.whatChangedMyMind || "");
  const stillChecking = summarizeText(conversation.whatIAmStillChecking || "");
  if (!changed && !stillChecking) {
    return "What moved my read most was the newer pattern, not any single isolated line.";
  }
  return [changed, stillChecking].filter(Boolean).join(" ");
}

function buildConfidenceReply(subject, conversation) {
  const confidence = Number(conversation.currentReadConfidence ?? 0.5);
  const currentRead = summarizeText(conversation.currentRead || conversation.whatIThink || "");
  const stillChecking = summarizeText(conversation.whatIAmStillChecking || "");

  if (confidence >= 0.78) {
    return [
      currentRead ? `Fairly sure. ${currentRead}` : "Fairly sure.",
      stillChecking || "I do not think the opposing signal is strong enough to move the center of gravity back.",
    ].filter(Boolean).join(" ");
  }

  if (confidence >= 0.58) {
    return [
      currentRead ? `Reasonably sure. ${currentRead}` : "Reasonably sure.",
      stillChecking || "There is still one live signal I do not want to overrun.",
    ].filter(Boolean).join(" ");
  }

  return [
    currentRead ? `Not fully. ${currentRead}` : "Not fully.",
    stillChecking || "I am still checking the parts of this that have not settled yet.",
  ].filter(Boolean).join(" ");
}

function buildIsThisNewReply(subject, conversation) {
  const drift = conversation.driftMemory || {};
  const labels = conversation.currentReadLabels || [];
  if (labels.includes("repeated evidence") || drift.durability === "durable" || drift.durability === "building") {
    const center = themeLabel(subject?.id, drift.currentCenterOfGravity);
    return [
      "This is not new.",
      drift.centerShifted
        ? "The wording is sharper now, but the pattern has been moving this direction for a while."
        : `I have seen ${center} keep winning more than once.`,
      drift.durability === "durable" ? "At this point I would call the read durable, not just fresh." : null,
    ].filter(Boolean).join(" ");
  }
  return "This still looks new to me. I have a live signal, but I would not call it durable yet.";
}

function buildDriftReply(subject, conversation) {
  const drift = conversation.driftMemory || {};
  const currentCenter = themeLabel(subject?.id, drift.currentCenterOfGravity);
  const lastCenter = themeLabel(subject?.id, drift.lastCenterOfGravity);
  if (drift.centerShifted && drift.lastCenterOfGravity && drift.currentCenterOfGravity) {
    return [
      `Yes. Earlier, the center of gravity looked more like ${lastCenter}.`,
      `Now it looks more like ${currentCenter}.`,
      "This is not a single update. The newer signal has been winning repeatedly.",
    ].join(" ");
  }
  if (drift.durability === "durable" || drift.durability === "building") {
    return `Yes. ${currentCenter.charAt(0).toUpperCase() + currentCenter.slice(1)} has been winning for a while, even if the wording keeps getting clearer.`;
  }
  return "A little, but I would not overstate it yet. I have movement, not a settled drift line.";
}

function buildHowLongReply(subject, conversation) {
  const drift = conversation.driftMemory || {};
  const currentCenter = themeLabel(subject?.id, drift.currentCenterOfGravity);
  const duration = shortDuration(drift.currentCenterFirstSeenAt);
  if (drift.currentCenterFirstSeenAt) {
    return `I have been seeing ${currentCenter} pull at this for ${duration}. It looks stronger now than it did at first.`;
  }
  return "Not long enough to claim a real duration yet. I have the signal, but not much history behind it.";
}

function buildWhyDoYouThinkThatReply(subject, conversation) {
  const evidence = conversation.currentReadEvidence || {};
  const supporting = Array.isArray(evidence.supportingEvidence) ? evidence.supportingEvidence : [];
  const opposing = Array.isArray(evidence.opposingEvidence) ? evidence.opposingEvidence : [];
  const currentRead = summarizeText(conversation.currentRead || conversation.whatIThink || "");
  const supportSummary = supporting
    .slice(0, 3)
    .map((item) => item.statement)
    .filter(Boolean)
    .join(" ");
  const opposingSummary = opposing
    .slice(0, 1)
    .map((item) => item.statement)
    .filter(Boolean)
    .join(" ");

  return [
    currentRead || null,
    supportSummary ? `I think that because the strongest evidence keeps pointing here: ${supportSummary}` : "I think that because the strongest evidence keeps converging in this direction.",
    opposingSummary ? `The main opposing evidence is ${opposingSummary.replace(/[.!?]+$/, "")}.` : null,
    Number.isFinite(Number(evidence.confidence)) ? `My confidence is ${Math.round(Number(evidence.confidence) * 100)}%.` : null,
  ].filter(Boolean).join(" ");
}

function buildWhatWouldChangeMindReply(subject, conversation) {
  const evidence = conversation.currentReadEvidence || {};
  const stillChecking = summarizeText(conversation.whatIAmStillChecking || "");
  return [
    evidence.whatWouldChangeMyMind || "A stronger repeated signal in the other direction.",
    stillChecking ? `What keeps this open is ${stillChecking.replace(/[.!?]+$/, "")}.` : null,
  ].filter(Boolean).join(" ");
}

module.exports = {
  deriveCurrentRead,
  recomputeCurrentRead,
  buildChangedMindReply,
  buildConfidenceReply,
  buildIsThisNewReply,
  buildDriftReply,
  buildHowLongReply,
  buildWhyDoYouThinkThatReply,
  buildWhatWouldChangeMindReply,
};
