"use strict";

const GREETING_ONLY_RE =
  /^(good morning|morning|good afternoon|afternoon|good evening|evening|hello|hi|hey)\b[!. ]*$/i;
const EXPLICIT_INTENT_SHIFT_RE =
  /\b(new topic|different topic|different question|switching gears|change of subject|intent change|something unrelated|separate question|new lane)\b/i;
const CONTINUATION_MARKERS_RE =
  /\b(it|that|still|again|also|because|same|continue|continuing)\b/i;
const STANDALONE_REQUEST_RE =
  /^(can you|could you|help me|i need|show me|find|search|look up|plan|buy|get|tell me|what|how|why|when|where)\b/i;
const TOPIC_SHIFT_HINT_RE =
  /\b(travel|grocer(?:y|ies)|shopping|recipe|work|health|science|engineering|math|research|calendar|email|finances?|money|trip|vacation|flight|hotel)\b/i;

function isGreetingOnly(text) {
  return GREETING_ONLY_RE.test(String(text || "").trim());
}

function isExplicitIntentShift(text) {
  return EXPLICIT_INTENT_SHIFT_RE.test(String(text || "").trim());
}

function looksLikeStandaloneTopicShift(text) {
  const value = String(text || "").trim();
  if (!value || value.length > 220) return false;
  if (CONTINUATION_MARKERS_RE.test(value)) return false;
  const asksForWork = STANDALONE_REQUEST_RE.test(value) || /\bhelp me with\b/i.test(value);
  return asksForWork && TOPIC_SHIFT_HINT_RE.test(value);
}

function shouldAutoResetSession(text, session) {
  if (!session || !Array.isArray(session.messages) || session.messages.length === 0) {
    return false;
  }
  return (
    isGreetingOnly(text) ||
    isExplicitIntentShift(text) ||
    looksLikeStandaloneTopicShift(text)
  );
}

module.exports = {
  isGreetingOnly,
  isExplicitIntentShift,
  looksLikeStandaloneTopicShift,
  shouldAutoResetSession,
};
