"use strict";

const { buildPresenterState } = require("../gateway/presenter-state");
const { nextSurfacingItem, markSurfaced } = require("../db/surfacing-store");
const {
  hydrateConversationEnvelope,
  saveConversationEnvelope,
} = require("./conversation-manager");
const { rankSubjectConversations } = require("./conversation-resolver");
const {
  buildPresenterPayload,
  buildConversationUpdateFromReply,
  buildProvenance,
  applyCurrentRead,
} = require("./conversation-presenter");
const { mergeConversationRecord, nowIso } = require("./conversation-state");

const CONVERSATION_TTL_HOURS = 72;

function isFresh(isoString) {
  if (!isoString) return false;
  const timestamp = Date.parse(isoString);
  if (Number.isNaN(timestamp)) return false;
  return (Date.now() - timestamp) / (1000 * 60 * 60) <= CONVERSATION_TTL_HOURS;
}

function normalizeSubjectId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function applySurfacingToConversations(envelope, pendingSurfacing, presenterState) {
  if (!pendingSurfacing?.domain) return envelope;
  const subjectId = normalizeSubjectId(pendingSurfacing.domain);
  const subject = presenterState.subjects[subjectId];
  const current = envelope.subjects[subjectId];
  if (!subject || !current) return envelope;

  return {
    ...envelope,
    subjects: {
      ...envelope.subjects,
      [subjectId]: applyCurrentRead(subject, mergeConversationRecord(current, {
        status: "Ready",
        previousThought:
          current.currentThought !== pendingSurfacing.payload ? current.currentThought : current.previousThought,
        previousHypothesis: current.currentHypothesis || current.previousHypothesis,
        currentThought: pendingSurfacing.payload,
        currentConversationSummary:
          pendingSurfacing.payload || current.currentConversationSummary,
        pendingReveal: current.pendingReveal || subject.sequence?.find((step) => step?.prop)?.prop || null,
        waitingOn: null,
        latestWorkforceSignal: {
          source: pendingSurfacing.source || pendingSurfacing.domain,
          payload: pendingSurfacing.payload,
          createdAt: pendingSurfacing.createdAt || nowIso(),
        },
        provenance: buildProvenance(pendingSurfacing.source || pendingSurfacing.domain),
        lastProgressAt: nowIso(),
        modeHint: "interruption",
      })),
    },
  };
}

function deriveConversationEnvelope(channel, senderId, requestedSubjectId = null) {
  const presenterState = buildPresenterState();
  const { envelope } = hydrateConversationEnvelope(channel, senderId, presenterState);
  const { pendingSurfacing, leadSubjectId } = rankSubjectConversations(presenterState, envelope);
  const withSurfacing = applySurfacingToConversations(envelope, pendingSurfacing, presenterState);
  const requested =
    requestedSubjectId && requestedSubjectId !== "daily" && presenterState.subjects[requestedSubjectId]
      ? requestedSubjectId
      : null;

  const freshLastSelected =
    withSurfacing.lastSelectedSubjectId &&
    isFresh(withSurfacing.subjects[withSurfacing.lastSelectedSubjectId]?.lastTouchedAt)
      ? withSurfacing.lastSelectedSubjectId
      : null;

  const subjectId =
    requested ||
    (pendingSurfacing ? leadSubjectId : null) ||
    freshLastSelected ||
    leadSubjectId;

  const conversation = withSurfacing.subjects[subjectId];
  const pendingMatchesSelected =
    pendingSurfacing && normalizeSubjectId(pendingSurfacing.domain) === subjectId;
  const stageMode = pendingMatchesSelected && !requested && !freshLastSelected
    ? "interruption"
    : isFresh(conversation?.lastTouchedAt)
      ? "resume"
      : "arrival";
  const phase =
    conversation?.revealState === "revealed" ||
    (pendingMatchesSelected && (requested || freshLastSelected))
      ? "reveal"
      : "thought";
  const nextEnvelope = {
    ...withSurfacing,
    activeSubjectId: subjectId,
    lastSelectedSubjectId: subjectId,
  };
  saveConversationEnvelope(channel, senderId, nextEnvelope);

  return {
    presenterState,
    envelope: nextEnvelope,
    subjectId,
    stageMode,
    phase,
    pendingSurfacing,
  };
}

function hydrateConversationState({ channel, senderId, requestedSubjectId = null }) {
  const derived = deriveConversationEnvelope(channel, senderId, requestedSubjectId);
  return buildPresenterPayload(derived);
}

function getConversationTurnContext({ channel, senderId, requestedSubjectId = null }) {
  const derived = deriveConversationEnvelope(channel, senderId, requestedSubjectId);
  const subject = derived.presenterState.subjects[derived.subjectId];
  const conversation = derived.envelope.subjects[derived.subjectId];
  return {
    subjectId: derived.subjectId,
    stageMode: derived.stageMode,
    phase: derived.phase,
    pendingSurfacing: derived.pendingSurfacing,
    subject,
    conversation,
  };
}

function advanceConversationState({ channel, senderId, action = "continue", subjectId = null }) {
  const presenterState = buildPresenterState();
  const { envelope } = hydrateConversationEnvelope(channel, senderId, presenterState);
  const selectedSubjectId =
    subjectId && subjectId !== "daily" && envelope.subjects[subjectId]
      ? subjectId
      : envelope.activeSubjectId || Object.keys(envelope.subjects)[0];
  const conversation = envelope.subjects[selectedSubjectId];
  let nextConversation = conversation;

  if (action === "select_subject" && selectedSubjectId) {
    nextConversation = mergeConversationRecord(conversation, {
      lastTouchedAt: nowIso(),
    });
  } else if (action === "continue") {
    nextConversation = mergeConversationRecord(conversation, {
      revealState: conversation.pendingReveal ? "revealed" : conversation.revealState,
      status: conversation.pendingReveal ? "Ready" : conversation.status,
      lastTouchedAt: nowIso(),
    });
  } else if (action === "pause") {
    nextConversation = mergeConversationRecord(conversation, {
      status: "Paused",
      lastTouchedAt: nowIso(),
    });
  }

  const nextEnvelope = {
    ...envelope,
    activeSubjectId: selectedSubjectId,
    lastSelectedSubjectId: selectedSubjectId,
    subjects: {
      ...envelope.subjects,
      [selectedSubjectId]: applyCurrentRead(
        presenterState.subjects[selectedSubjectId],
        nextConversation
      ),
    },
  };

  const pendingSurfacing = nextSurfacingItem();
  const pendingMatchesSelected =
    pendingSurfacing && normalizeSubjectId(pendingSurfacing.domain) === selectedSubjectId;
  if (
    action === "continue" &&
    pendingSurfacing?.id &&
    pendingMatchesSelected
  ) {
    try {
      markSurfaced(pendingSurfacing.id);
    } catch {
      // Non-fatal.
    }
  }

  saveConversationEnvelope(channel, senderId, nextEnvelope);

  return buildPresenterPayload({
    presenterState,
    envelope: nextEnvelope,
    subjectId: selectedSubjectId,
    stageMode:
      action === "continue" && pendingSurfacing && !pendingMatchesSelected
        ? "interruption"
        : "subject",
    phase: nextConversation.revealState === "revealed" ? "reveal" : "thought",
    pendingSurfacing,
  });
}

function syncConversationAfterTurn({
  channel,
  senderId,
  currentSubjectId = null,
  domain = null,
  reply = "",
  workingTheory = null,
  userInput = "",
  conversationTurn = null,
}) {
  const presenterState = buildPresenterState();
  const { envelope } = hydrateConversationEnvelope(channel, senderId, presenterState);
  const subjectId =
    currentSubjectId && currentSubjectId !== "daily"
      ? currentSubjectId
      : normalizeSubjectId(domain) || envelope.activeSubjectId;

  if (!subjectId || !envelope.subjects[subjectId]) return;

  const existingConversation = envelope.subjects[subjectId];
  const update = buildConversationUpdateFromReply({
    reply,
    workingTheory,
    existingConversation,
  });
  const theoryChanged = Boolean(
    conversationTurn?.update?.currentHypothesis &&
      conversationTurn.update.currentHypothesis !== existingConversation.currentHypothesis
  );
  const recommendationChanged = Boolean(
    conversationTurn?.update?.currentRecommendation &&
      conversationTurn.update.currentRecommendation !== existingConversation.currentRecommendation
  );

  const nextEnvelope = {
    ...envelope,
    activeSubjectId: subjectId,
    lastSelectedSubjectId: subjectId,
    subjects: {
      ...envelope.subjects,
      [subjectId]: applyCurrentRead(
        presenterState.subjects[subjectId],
        mergeConversationRecord(existingConversation, {
        ...update,
        ...(conversationTurn?.update || {}),
        lastUserAsk: userInput || existingConversation.lastUserAsk,
        lastMondayConclusion:
          conversationTurn?.update?.lastMondayConclusion || reply || existingConversation.lastMondayConclusion,
        lastTouchedAt: nowIso(),
        lastUserAttentionAt: nowIso(),
        lastProgressAt: nowIso(),
        lastTheoryChangedAt: theoryChanged ? nowIso() : existingConversation.lastTheoryChangedAt,
        lastRecommendationChangedAt:
          recommendationChanged ? nowIso() : existingConversation.lastRecommendationChangedAt,
        revealState:
          conversationTurn?.update?.revealState || (conversationTurn ? existingConversation.revealState : "hidden"),
        unresolved: conversationTurn?.update?.status !== "Resolved",
        historyEntry: {
          at: nowIso(),
          user: userInput,
          monday: reply,
          status:
            conversationTurn?.update?.status ||
            update.status ||
            existingConversation.status,
          theoryChanged,
          recommendationChanged,
        },
      })),
    },
  };

  const pendingSurfacing = nextSurfacingItem();
  const pendingMatchesSelected =
    pendingSurfacing && normalizeSubjectId(pendingSurfacing.domain) === subjectId;
  if (pendingMatchesSelected && pendingSurfacing?.id) {
    try {
      markSurfaced(pendingSurfacing.id);
    } catch {
      // Non-fatal.
    }
  }

  saveConversationEnvelope(channel, senderId, nextEnvelope);
}

module.exports = {
  hydrateConversationState,
  getConversationTurnContext,
  advanceConversationState,
  syncConversationAfterTurn,
};
