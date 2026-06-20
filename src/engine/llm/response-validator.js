function normalizeConfidence(confidence) {
  switch (confidence) {
    case "high":
      return 0.82;
    case "medium":
      return 0.63;
    case "low":
      return 0.4;
    default:
      return null;
  }
}

function validateConversationResponse(payload) {
  if (!payload || typeof payload.reply !== "string" || payload.reply.trim() === "") {
    return null;
  }

  return {
    reply: payload.reply.trim(),
    followUp:
      typeof payload.followUp === "string" && payload.followUp.trim() !== ""
        ? payload.followUp.trim()
        : null,
    suggestedDomain:
      typeof payload.suggestedDomain === "string" && payload.suggestedDomain.trim() !== ""
        ? payload.suggestedDomain.trim()
        : null,
    suggestedClassification:
      typeof payload.suggestedClassification === "string" &&
      payload.suggestedClassification.trim() !== ""
        ? payload.suggestedClassification.trim()
        : null,
    confidence:
      payload.confidence === "low" ||
      payload.confidence === "medium" ||
      payload.confidence === "high"
        ? payload.confidence
        : "medium",
  };
}

function validateDailyBriefResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const brief = firstNonEmptyString([
    payload.brief,
    payload.summary,
    payload.dailyBrief,
    payload.daily_brief,
    payload.message,
  ]);

  if (!brief) {
    return null;
  }

  return {
    brief,
    changed: normalizeBriefList(
      payload.changed ??
        payload.whatChanged ??
        payload.what_changed
    ).slice(0, 4),
    stillMatters: normalizeBriefList(
      payload.stillMatters ??
        payload.still_matters ??
        payload.whatStillMatters ??
        payload.what_still_matters
    ).slice(0, 6),
    needsAttention: normalizeBriefList(
      payload.needsAttention ??
        payload.needs_attention ??
        payload.whatNeedsAttention ??
        payload.what_needs_attention
    ).slice(0, 4),
    deservesProtection: normalizeBriefList(
      payload.deservesProtection ??
        payload.deserves_protection ??
        payload.whatDeservesProtection ??
        payload.what_deserves_protection
    ).slice(0, 4),
  };
}

function firstNonEmptyString(values = []) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}

function normalizeBriefList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|;/)
      .map((item) => item.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }

  return [];
}

module.exports = {
  normalizeConfidence,
  validateConversationResponse,
  validateDailyBriefResponse,
};
