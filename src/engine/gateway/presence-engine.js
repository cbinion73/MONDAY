"use strict";

const {
  hydrateConversationState,
  advanceConversationState,
  syncConversationAfterTurn,
} = require("../conversation/conversation-engine");

function hydratePresenceState({ channel, senderId, requestedSubjectId = null }) {
  return hydrateConversationState({
    channel,
    senderId,
    requestedSubjectId,
  });
}

function advancePresenceState({ channel, senderId, action = "continue", subjectId = null }) {
  return advanceConversationState({
    channel,
    senderId,
    action,
    subjectId,
  });
}

function syncPresenceAfterConversation({
  channel,
  senderId,
  currentSubjectId = null,
  domain = null,
  reply = "",
  workingTheory = null,
  userInput = "",
  conversationTurn = null,
}) {
  return syncConversationAfterTurn({
    channel,
    senderId,
    currentSubjectId,
    domain,
    reply,
    workingTheory,
    userInput,
    conversationTurn,
  });
}

module.exports = {
  hydratePresenceState,
  advancePresenceState,
  syncPresenceAfterConversation,
};
