"use strict";

const sessions = require("../gateway/sessions");
const {
  createConversationRecord,
  mergeConversationRecord,
  nowIso,
} = require("./conversation-state");
const { recomputeCurrentRead } = require("./current-read-engine");

function defaultConversationEnvelope() {
  return {
    activeSubjectId: null,
    lastSelectedSubjectId: null,
    subjects: {},
    lastUpdatedAt: null,
  };
}

function readConversationEnvelope(channel, senderId) {
  const session = sessions.getOrCreateSession(channel, senderId);
  return {
    session,
    envelope: {
      ...defaultConversationEnvelope(),
      ...(session.context?.conversations || {}),
    },
  };
}

function ensureSubjects(envelope, presenterState) {
  const subjects = { ...(envelope.subjects || {}) };
  for (const subject of Object.values(presenterState.subjects || {})) {
    if (!subjects[subject.id]) {
      const created = createConversationRecord(subject);
      subjects[subject.id] = {
        ...created,
        ...recomputeCurrentRead(subject, created),
      };
      continue;
    }

    const merged = mergeConversationRecord(subjects[subject.id], {
      subjectId: subject.id,
      subjectName: subject.name,
      domain: subject.domain,
      currentConversationSummary:
        subjects[subject.id].currentConversationSummary || subject.summary || "",
      pendingReveal: subjects[subject.id].pendingReveal || subject.sequence?.find((step) => step?.prop)?.prop || null,
    });
    subjects[subject.id] = {
      ...merged,
      ...recomputeCurrentRead(subject, merged),
    };
  }

  return {
    ...defaultConversationEnvelope(),
    ...envelope,
    subjects,
  };
}

function saveConversationEnvelope(channel, senderId, envelope, preserveContext = {}) {
  const session = sessions.getOrCreateSession(channel, senderId);
  sessions.saveSession(channel, senderId, {
    context: {
      ...session.context,
      ...preserveContext,
      conversations: {
        ...defaultConversationEnvelope(),
        ...envelope,
        lastUpdatedAt: nowIso(),
      },
    },
  });
}

function hydrateConversationEnvelope(channel, senderId, presenterState) {
  const { session, envelope } = readConversationEnvelope(channel, senderId);
  return {
    session,
    envelope: ensureSubjects(envelope, presenterState),
  };
}

function updateConversation(channel, senderId, presenterState, subjectId, update = {}) {
  const { envelope } = hydrateConversationEnvelope(channel, senderId, presenterState);
  const current = envelope.subjects[subjectId];
  if (!current) return envelope;

  const next = {
    ...envelope,
    subjects: {
      ...envelope.subjects,
      [subjectId]: mergeConversationRecord(current, update),
    },
  };
  saveConversationEnvelope(channel, senderId, next);
  return next;
}

module.exports = {
  defaultConversationEnvelope,
  readConversationEnvelope,
  hydrateConversationEnvelope,
  saveConversationEnvelope,
  updateConversation,
};
