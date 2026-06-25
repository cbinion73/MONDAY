"use strict";

const {
  composeTheoryDelta,
  composeWhyItMatters,
  composeRecommendation,
} = require("./follow-up-composers");
const { deriveArrivalMetadata } = require("./conversation-presenter");
const {
  buildChangedMindReply,
  buildConfidenceReply,
  buildDriftReply,
  buildHowLongReply,
  buildIsThisNewReply,
  buildWhatWouldChangeMindReply,
  buildWhyDoYouThinkThatReply,
} = require("./current-read-engine");

function resolveFollowUpIntent(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return null;

  if (/^(what changed your mind|what changed your read|what shifted your read)\b/.test(normalized)) {
    return "what_changed_your_mind";
  }
  if (/^(why do you think that|why do you think this|why do you think so)\b/.test(normalized)) {
    return "why_do_you_think_that";
  }
  if (/^(what would change your mind|what could change your mind)\b/.test(normalized)) {
    return "what_would_change_your_mind";
  }
  if (/^(is this new|is that new|is this a new signal)\b/.test(normalized)) {
    return "is_this_new";
  }
  if (/^(why are you bringing this up|why bring this up|why are you surfacing this)\b/.test(normalized)) {
    return "why_are_you_bringing_this_up";
  }
  if (/^(is this urgent|how urgent is this)\b/.test(normalized)) {
    return "is_this_urgent";
  }
  if (/^(has this been changing|is this changing|has this changed over time)\b/.test(normalized)) {
    return "has_this_been_changing";
  }
  if (/^(how long have you been seeing this|how long have you seen this|how long has this been showing up)\b/.test(normalized)) {
    return "how_long_have_you_been_seeing_this";
  }
  if (/^(what('| i)?s changed|what has changed|what changed)\b/.test(normalized)) {
    return "what_changed";
  }
  if (/^(why does that matter|why does it matter|why does this matter)\b/.test(normalized)) {
    return "why_it_matters";
  }
  if (/^(what do you recommend|what would you recommend)\b/.test(normalized)) {
    return "recommendation";
  }
  if (/^(what should i do next|what should i do|what's the next move|what is the next move)\b/.test(normalized)) {
    return "next_move";
  }
  if (/^(show me evidence|show me the evidence|show the evidence)\b/.test(normalized)) {
    return "show_evidence";
  }
  if (/^(are you sure|how sure are you|how confident are you)\b/.test(normalized)) {
    return "are_you_sure";
  }
  if (/^(stay here)\b/.test(normalized)) {
    return "stay_here";
  }
  if (/^(pause this|pause here)\b/.test(normalized)) {
    return "pause";
  }
  if (/^(come back later|let'?s come back later|come back to this later)\b/.test(normalized)) {
    return "come_back_later";
  }
  return null;
}

function buildFollowUpReply({ intent, subject, conversation, stageMode = "resume" }) {
  if (!intent || !subject || !conversation) return null;
  const arrival = deriveArrivalMetadata(conversation, subject, stageMode);

  if (intent === "what_changed") {
    const composed = composeTheoryDelta({ subject, conversation });
    const reply = composed.reply;
    return {
      reply,
      update: {
        status: "Revising",
        currentThought: composed.revisedThought || conversation.currentThought,
        currentHypothesis: composed.revisedThought || conversation.currentHypothesis,
        currentConversationSummary: composed.revisedThought || conversation.currentConversationSummary,
        pendingReveal: composed.prop || conversation.pendingReveal || null,
        revealState: "revealed",
        lastMondayConclusion: reply,
        unresolvedQuestion: "What does this new read require now?",
      },
    };
  }

  if (intent === "why_it_matters") {
    const composed = composeWhyItMatters({ subject, conversation });
    const reply = composed.reply;
    return {
      reply,
      update: {
        status: "Discussing",
        pendingReveal: composed.prop || conversation.pendingReveal || null,
        revealState: "revealed",
        lastMondayConclusion: reply,
      },
    };
  }

  if (intent === "what_changed_your_mind") {
    const reply = buildChangedMindReply(subject, conversation);
    return {
      reply,
      update: {
        status: "Discussing",
        lastMondayConclusion: reply,
      },
    };
  }

  if (intent === "why_do_you_think_that") {
    const reply = buildWhyDoYouThinkThatReply(subject, conversation);
    return {
      reply,
      update: {
        status: "Discussing",
        lastMondayConclusion: reply,
      },
    };
  }

  if (intent === "what_would_change_your_mind") {
    const reply = buildWhatWouldChangeMindReply(subject, conversation);
    return {
      reply,
      update: {
        status: "Discussing",
        lastMondayConclusion: reply,
      },
    };
  }

  if (intent === "is_this_new") {
    const reply = buildIsThisNewReply(subject, conversation);
    return {
      reply,
      update: {
        status: "Discussing",
        lastMondayConclusion: reply,
      },
    };
  }

  if (intent === "why_are_you_bringing_this_up") {
    const center = conversation.driftMemory?.centerShifted
      ? "The center of gravity has moved."
      : null;
    const reply = [
      center,
      arrival.arrivalReason,
      conversation.currentRead || conversation.whatIThink || null,
    ].filter(Boolean).join(" ");
    return {
      reply,
      update: {
        status: "Discussing",
        lastMondayConclusion: reply,
      },
    };
  }

  if (intent === "is_this_urgent") {
    const urgencyLine =
      arrival.urgency === "urgent"
        ? "Urgent."
        : arrival.urgency === "important_but_not_urgent"
          ? "Important, but not urgent."
          : arrival.urgency === "not_ready_yet"
            ? "Not ready yet."
            : "Worth watching.";
    const reason =
      arrival.urgency === "urgent"
        ? "The signal is strong enough that waiting would make the next move harder."
        : arrival.urgency === "important_but_not_urgent"
          ? "The center is clear enough to act on, but it does not need panic."
          : arrival.urgency === "not_ready_yet"
            ? "I have movement, but not enough stability to push it harder."
            : "The pattern matters, but I do not think it needs an immediate move.";
    const reply = [urgencyLine, reason].join(" ");
    return {
      reply,
      update: {
        status: "Discussing",
        lastMondayConclusion: reply,
      },
    };
  }

  if (intent === "has_this_been_changing") {
    const reply = buildDriftReply(subject, conversation);
    return {
      reply,
      update: {
        status: "Discussing",
        lastMondayConclusion: reply,
      },
    };
  }

  if (intent === "how_long_have_you_been_seeing_this") {
    const reply = buildHowLongReply(subject, conversation);
    return {
      reply,
      update: {
        status: "Discussing",
        lastMondayConclusion: reply,
      },
    };
  }

  if (intent === "recommendation" || intent === "next_move") {
    const composed = composeRecommendation({ subject, conversation });
    const recommendation = composed.recommendation;
    const reply = composed.reply;
    return {
      reply,
      update: {
        status: "Discussing",
        currentRecommendation: recommendation,
        pendingReveal: composed.prop || conversation.pendingReveal || null,
        revealState: "revealed",
        lastMondayConclusion: reply,
        lastRecommendationChangedAt: new Date().toISOString(),
      },
    };
  }

  if (intent === "are_you_sure") {
    const reply = buildConfidenceReply(subject, conversation);
    return {
      reply,
      update: {
        status: "Discussing",
        lastMondayConclusion: reply,
      },
    };
  }

  if (intent === "show_evidence") {
    const reply = "I'm bringing the supporting evidence back onto the stage so we can look at what actually changed.";
    return {
      reply,
      update: {
        status: "Discussing",
        revealState: "revealed",
        lastMondayConclusion: reply,
      },
      revealAction: "continue",
    };
  }

  if (intent === "stay_here" || intent === "pause" || intent === "come_back_later") {
    const reply =
      intent === "come_back_later"
        ? "We'll come back to it later. I’ll keep the thread warm so we do not have to rebuild it."
        : "We can stay here. I won't force the next move before the thought is ready.";
    return {
      reply,
      update: {
        status: "Paused",
        lastMondayConclusion: reply,
      },
      revealAction: "pause",
    };
  }

  return null;
}

module.exports = {
  resolveFollowUpIntent,
  buildFollowUpReply,
};
