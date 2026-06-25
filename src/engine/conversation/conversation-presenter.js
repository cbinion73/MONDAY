"use strict";

const { resolvePropState } = require("../gateway/prop-manager");
const { firstSentence, summarizeText } = require("./conversation-state");
const { recomputeCurrentRead } = require("./current-read-engine");

const PROVENANCE_LABELS = {
  synthesis: "Research Division",
  "morning-digest": "Mission Control",
  contradiction: "Family Office",
  "family-office": "Family Office",
  "research-division": "Research Division",
  "strategy-division": "Strategy Division",
  "mission-control": "Mission Control",
  monitor: "Research Division",
  travel: "Mission Control",
  publishing: "Research Division",
  family: "Family Office",
  faith: "Stewardship Review",
  retirement: "Strategy Division",
  work: "Strategy Division",
  health: "Health Review",
};

function theoryToText(workingTheory) {
  if (!workingTheory) return "";
  if (typeof workingTheory === "string") return summarizeText(workingTheory);
  if (typeof workingTheory === "object") {
    return summarizeText(
      workingTheory.revisedTheory ||
      workingTheory.currentTheory ||
      workingTheory.summary ||
      workingTheory.theory ||
      ""
    );
  }
  return summarizeText(String(workingTheory));
}

function buildProvenance(source) {
  if (!source) return null;
  return {
    source,
    label: PROVENANCE_LABELS[source] || PROVENANCE_LABELS[String(source).toLowerCase()] || "Research Division",
  };
}

function parseMs(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? null : parsed;
}

function describeDuration(timestamp) {
  const ms = parseMs(timestamp);
  if (!ms) return "recently";
  const hours = Math.max(0, (Date.now() - ms) / (1000 * 60 * 60));
  if (hours < 12) return "today";
  if (hours < 48) return "the last day or two";
  const days = Math.round(hours / 24);
  if (days < 7) return `the last several days`;
  const weeks = Math.round(days / 7);
  return weeks <= 1 ? "about a week" : `about ${weeks} weeks`;
}

function deriveArrivalMetadata(conversation, subject, stageMode = "arrival") {
  const drift = conversation.driftMemory || {};
  const labels = conversation.currentReadLabels || [];
  const confidence = Number(conversation.currentReadConfidence ?? 0.5);
  const decision = String(conversation.currentReadDecision || "").toLowerCase();
  const provenance = conversation.provenance || null;
  const provenanceLabel = provenance?.label || null;
  const latestSignal = conversation.latestWorkforceSignal || null;
  const hasRecommendation = Boolean(conversation.currentRecommendation || conversation.pendingRecommendation);

  let arrivalMode = "fresh_update";

  if (conversation.currentReadStale || confidence < 0.48 || decision === "wait") {
    arrivalMode = "still_checking";
  } else if (drift.centerShifted) {
    arrivalMode = "center_shifted";
  } else if (drift.volatility === "high" || labels.includes("fragile read")) {
    arrivalMode = "fragile_read";
  } else if (drift.durability === "durable" || (labels.includes("repeated evidence") && confidence >= 0.66)) {
    arrivalMode = "pattern_hardening";
  } else if (hasRecommendation || conversation.unresolvedQuestion) {
    arrivalMode = "ready_to_discuss";
  }

  if (stageMode === "interruption" && arrivalMode === "ready_to_discuss" && latestSignal) {
    arrivalMode = drift.centerShifted ? "center_shifted" : "fresh_update";
  }

  let arrivalReason = "Built from the latest active read.";
  switch (arrivalMode) {
    case "center_shifted":
      arrivalReason = `Prepared from repeated ${subject.name} signals over ${describeDuration(drift.currentCenterFirstSeenAt)}.`;
      break;
    case "pattern_hardening":
      arrivalReason = `Prepared from repeated ${subject.name} signals over ${describeDuration(drift.currentCenterFirstSeenAt)}.`;
      break;
    case "fragile_read":
      arrivalReason = "Built from live but competing signals. The read is real, but it is not settled.";
      break;
    case "still_checking":
      arrivalReason = latestSignal && provenanceLabel
        ? `Based on a newer ${provenanceLabel} signal, but the read is still moving.`
        : "The newer signal is real, but Monday is still checking the center of gravity.";
      break;
    case "ready_to_discuss":
      arrivalReason = "The read is clear enough to talk through, and there is a real next move if you want it.";
      break;
    case "fresh_update":
    default:
      if (latestSignal && provenanceLabel) {
        arrivalReason = `Based on a new ${provenanceLabel} signal.`;
      } else if (latestSignal) {
        arrivalReason = "Based on a newer signal that surfaced since the last pass.";
      }
      break;
  }

  let urgency = "worth_watching";
  if (arrivalMode === "still_checking" && confidence < 0.48) {
    urgency = "not_ready_yet";
  } else if (stageMode === "interruption" && (decision === "escalate" || (drift.centerShifted && confidence >= 0.78))) {
    urgency = "urgent";
  } else if (hasRecommendation || arrivalMode === "center_shifted" || arrivalMode === "pattern_hardening") {
    urgency = "important_but_not_urgent";
  }

  return {
    arrivalMode,
    arrivalReason,
    arrivalConfidence: confidence,
    urgency,
  };
}

function buildStageCopy(conversation, subject, stageMode, arrival) {
  const leadRead = conversation.currentRead || conversation.currentThought || conversation.currentConversationSummary;
  if (stageMode === "interruption") {
    const titles = {
      fresh_update: "I found something new.",
      pattern_hardening: "This is not new, but it is getting harder to ignore.",
      center_shifted: "The center of gravity has moved.",
      fragile_read: "I have a read, but I would not call it settled yet.",
      still_checking: "I'm still checking this.",
      ready_to_discuss: "I think this is ready to talk through.",
    };
    return {
      eyebrow: "Monday found something",
      title: titles[arrival.arrivalMode] || "I found something new.",
      body: leadRead,
    };
  }

  if (stageMode === "resume") {
    if (conversation.status === "Revising") {
      return {
        eyebrow: "Revising",
        title: `I've updated my read on ${subject.name}.`,
        body:
          conversation.currentRead ||
          conversation.lastMondayConclusion ||
          conversation.currentThought ||
          conversation.currentConversationSummary,
      };
    }
    if (conversation.status === "Discussing") {
      return {
        eyebrow: "Discussing",
        title: `We're still in ${subject.name}.`,
        body:
          conversation.currentRead ||
          conversation.lastMondayConclusion ||
          conversation.currentThought ||
          conversation.currentConversationSummary,
      };
    }
    if (conversation.status === "Paused") {
      return {
        eyebrow: "Resume",
        title: "Before we move on...",
        body: conversation.currentQuestion || conversation.currentOpenQuestion || "I don't think we finished this.",
      };
    }
    if (arrival.arrivalMode === "center_shifted" || arrival.arrivalMode === "pattern_hardening") {
      return {
        eyebrow: "Resume",
        title:
          arrival.arrivalMode === "center_shifted"
            ? "The center of gravity has moved."
            : "This is not new, but it is getting harder to ignore.",
        body: leadRead,
      };
    }
    return {
      eyebrow: "Resume",
      title: `I've kept thinking about ${subject.name}.`,
      body: leadRead,
    };
  }

  if (conversation.status === "Ready") {
    const titles = {
      fresh_update: "I found something new.",
      pattern_hardening: "This is not new, but it is getting harder to ignore.",
      center_shifted: "The center of gravity has moved.",
      fragile_read: "I have a read, but I would not call it settled yet.",
      still_checking: "I'm still checking this.",
      ready_to_discuss: "I think this is ready to talk through.",
    };
    return {
      eyebrow: "Ready",
      title: titles[arrival.arrivalMode] || "I think I figured something out.",
      body:
        conversation.currentRead ||
        conversation.currentThought ||
        conversation.currentHypothesis ||
        conversation.currentConversationSummary,
    };
  }

  if (conversation.status === "Revising") {
    return {
      eyebrow: "Revising",
      title: `I've updated my read on ${subject.name}.`,
      body:
        conversation.currentRead ||
        conversation.lastMondayConclusion ||
        conversation.currentThought ||
        conversation.currentConversationSummary,
    };
  }

  if (conversation.status === "Discussing") {
    return {
      eyebrow: "Discussing",
      title: `Let's stay with ${subject.name}.`,
      body:
        conversation.currentRead ||
        conversation.lastMondayConclusion ||
        conversation.currentThought ||
        conversation.currentConversationSummary,
    };
  }

  if (conversation.status === "Researching") {
    return {
      eyebrow: "Researching",
      title: `I'm still working ${subject.name}.`,
      body:
        conversation.currentRead ||
        conversation.currentConcern ||
        conversation.currentThought ||
        `There's more here, and I don't want to force it early.`,
    };
  }

  return {
    eyebrow: conversation.status || "Thinking",
    title: "Chris...",
    body: leadRead || conversation.nextSuggestedContinuation || `I've kept thinking about ${subject.name}.`,
  };
}

function buildControls(conversation, phase) {
  if (phase === "thought" && conversation.pendingReveal) {
    return {
      primaryAction: "continue",
      primaryLabel: "Continue",
    };
  }
  return {
    primaryAction: "pause",
    primaryLabel: "Stay here",
  };
}

function buildNavigation(presenterState, envelope, leadSubjectId) {
  return Object.values(presenterState.subjects || {}).map((subject) => ({
    id: subject.id,
    name: subject.name,
    domain: subject.domain,
    state: envelope.subjects[subject.id]?.status || subject.state || "Watching",
    summary:
      envelope.subjects[subject.id]?.currentRead ||
      envelope.subjects[subject.id]?.currentConversationSummary ||
      subject.summary ||
      "",
    lead: subject.id === leadSubjectId,
  }));
}

function buildPresenterPayload({
  presenterState,
  envelope,
  subjectId,
  stageMode,
  phase,
  pendingSurfacing = null,
}) {
  const subject = presenterState.subjects[subjectId];
  const conversation = envelope.subjects[subjectId];
  const arrival = deriveArrivalMetadata(conversation, subject, stageMode);
  const stageCopy = buildStageCopy(conversation, subject, stageMode, arrival);
  const propState = resolvePropState({
    prop: conversation.pendingReveal,
    phase,
  });

  return {
    generatedAt: presenterState.generatedAt,
    greeting: presenterState.greeting,
    subheading: presenterState.subheading,
    navigation: buildNavigation(presenterState, envelope, subjectId),
    subjects: Object.values(presenterState.subjects || {}).reduce((acc, item) => {
      const conversationForItem = envelope.subjects[item.id];
      acc[item.id] = {
        ...item,
        state: conversationForItem?.status || item.state,
        summary:
          conversationForItem?.currentRead ||
          conversationForItem?.currentConversationSummary ||
          item.summary,
      };
      return acc;
    }, {}),
    runtime: {
      ...presenterState.runtime,
      pendingSurfacing,
    },
    home: {
      id: "current-conversation",
      name: "Current Conversation",
    },
    conversation: {
      subjectId,
      read: conversation.currentRead,
      whatIThink: conversation.whatIThink,
      whatChangedMyMind: conversation.whatChangedMyMind,
      whatIAmStillChecking: conversation.whatIAmStillChecking,
      summary: conversation.currentConversationSummary,
      thought: conversation.currentThought,
      openQuestion: conversation.currentQuestion || conversation.currentOpenQuestion,
      question: conversation.currentQuestion,
      hypothesis: conversation.currentHypothesis,
      recommendation: conversation.currentRecommendation,
      concern: conversation.currentConcern,
      opportunity: conversation.currentOpportunity,
      readStale: conversation.currentReadStale,
      confidence: conversation.currentReadConfidence,
      decision: conversation.currentReadDecision,
      labels: conversation.currentReadLabels || [],
      evidence: conversation.currentReadEvidence || null,
      driftMemory: conversation.driftMemory || null,
      supportingSignals: conversation.currentReadSupportingSignals || [],
      opposingSignals: conversation.currentReadOpposingSignals || [],
      status: conversation.status,
      waitingOn: conversation.waitingOn,
      lastProgressAt: conversation.lastProgressAt,
    },
    subject,
    stage: {
      mode: stageMode,
      phase,
      subjectId,
      title: stageCopy.title,
      body: stageCopy.body,
      eyebrow: stageCopy.eyebrow,
      arrivalMode: arrival.arrivalMode,
      arrivalReason: arrival.arrivalReason,
      arrivalConfidence: arrival.arrivalConfidence,
      urgency: arrival.urgency,
      pauseSuggestedMs: propState.visible ? 1200 : 800,
      prop: propState,
      provenance: conversation.provenance || null,
    },
    controls: buildControls(conversation, phase),
  };
}

function buildConversationUpdateFromReply({ reply, workingTheory, existingConversation }) {
  const first = firstSentence(reply) || existingConversation.currentThought;
  const theoryText = theoryToText(workingTheory);
  const question = String(reply || "").includes("?")
    ? String(reply).split(/\n+/).map((line) => line.trim()).find((line) => line.endsWith("?")) || null
    : null;

  return {
    currentThought: first,
    currentConversationSummary:
      theoryText ||
      existingConversation.currentConversationSummary ||
      first,
    previousHypothesis:
      theoryText && theoryText !== existingConversation.currentHypothesis
        ? existingConversation.currentHypothesis
        : existingConversation.previousHypothesis,
    previousThought:
      first && first !== existingConversation.currentThought
        ? existingConversation.currentThought
        : existingConversation.previousThought,
    currentHypothesis:
      theoryText ||
      existingConversation.currentHypothesis ||
      first,
    currentOpenQuestion: question,
    currentQuestion: question,
    nextSuggestedContinuation: question
      ? "Before we move on..."
      : existingConversation.nextSuggestedContinuation,
    unresolvedQuestion: question || existingConversation.unresolvedQuestion || null,
    status: question ? "Paused" : "Thinking",
  };
}

function applyCurrentRead(subject, conversation) {
  return {
    ...conversation,
    ...recomputeCurrentRead(subject, conversation),
  };
}

module.exports = {
  buildProvenance,
  deriveArrivalMetadata,
  buildPresenterPayload,
  buildConversationUpdateFromReply,
  applyCurrentRead,
};
