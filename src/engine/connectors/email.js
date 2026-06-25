"use strict";
const { readEmailStore } = require("./email-context");
const TRAVEL_KW = /\b(ticket|tickets|reservation|confirmation|itinerary|trip|travel|admission|boarding|gate|hotel|flight|train|museum|tour|philadelphia|washington|dc|new york|ellis island|statue of liberty)\b/i;
const STRONG_TRAVEL_EVIDENCE_KW = /\b(itinerary|boarding|gate|check[- ]?in|hotel|flight|train|museum|tour|admission|parking pass|qr code|departure|arrival|terminal|seat|airport|station|ferry|visitor)\b/i;
const DESTINATION_CONTEXT_KW = /\b(philadelphia|washington|new york|ellis island|statue of liberty|airport|station|museum|hotel|terminal)\b/i;
const ACTION_KW = /\b(urgent|asap|important|confirm|confirmation|reply|respond|required|cancellation|delay|gate|boarding|check[- ]?in)\b/i;
const MARKETING_KW = /\b(free preview|preview|special offer|offer|ownership|benefits|newsletter|sale|discount|deal|promo|promotion|unsubscribe|manage preferences|read online)\b/i;
const JUNK_SENDER_KW = /(?:^|[^a-z])(no-?reply|newsletter|offers?|deals?|marketing|mailer-daemon)(?:[^a-z]|$)/i;
const NEWSLETTER_DOMAIN_KW = /\b(ccsend\.com|joinsuperhuman\.ai|substack|mailchimp|constantcontact|campaigns\.|thepointsguy|thepourover|betterreport)\b/i;
const FINANCIAL_RE = /\b(card member|account ending|payment|statement|consumer credit|apr|balance due|autopay)\b/i;

async function read({ limit = 10, missionId = null, unreadOnly = false, query = "" } = {}) {
  if (query && String(query).trim()) {
    const store = readEmailStore();
    const result = rankRelevantThreads({
      threads: store.threads || [],
      query: String(query).trim(),
      limit,
      missionId,
      unreadOnly,
    });
    return {
      ...result,
      unreadCount: (store.threads || []).filter((thread) => thread.unread).length,
      usedIntelligence: false,
      quickLocal: true,
    };
  }

  const store = readEmailStore();
  let threads = store.threads || [];
  if (missionId) threads = threads.filter((t) => t.missionId === missionId);
  if (unreadOnly) threads = threads.filter((t) => t.unread);
  return {
    ok: true,
    data: threads.slice(0, limit),
    count: threads.length,
    unreadCount: threads.filter((t) => t.unread).length,
    source: store.source || "local",
    usedIntelligence: false,
  };
}

function rankRelevantThreads({ threads, query, limit, missionId, unreadOnly }) {
  let filtered = Array.isArray(threads) ? threads.slice() : [];
  if (missionId) filtered = filtered.filter((t) => t.missionId === missionId);
  if (unreadOnly) filtered = filtered.filter((t) => t.unread);
  const travelFocused = /\btravel|trip|ticket|itinerary|reservation|flight|hotel|boarding\b/i.test(query);

  const tokens = tokenize(query);
  const ranked = filtered
    .map((thread) => {
      const haystack = flatten(thread);
      const tokenHits = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      const strongTravel = hasStrongTravelEvidence(thread);
      const travelBoost = strongTravel ? 1.4 : TRAVEL_KW.test(haystack) ? 0.2 : 0;
      const actionBoost = ACTION_KW.test(haystack) ? 0.6 : 0;
      const unreadBoost = thread.unread ? 0.5 : 0;
      const starredBoost = thread.starred ? 0.4 : 0;
      const recencyBoost = recencyScore(thread.updatedAt);
      const trustBoost = senderTrustScore(thread);
      const junkPenalty = computeJunkPenalty(thread);
      const score = tokenHits * 1.1 + travelBoost + actionBoost + unreadBoost + starredBoost + recencyBoost + trustBoost - junkPenalty;
      return {
        ...thread,
        threadType: strongTravel ? "travel" : thread.threadType || null,
        significanceScore: Math.min(0.99, score / 5),
        score,
        trustScore: trustBoost,
        strongTravelEvidence: strongTravel,
      };
    })
    .filter((thread) => thread.score > 0.25)
    .filter((thread) => !travelFocused || isDecisionGradeTravelThread(thread))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    ok: true,
    data: ranked,
    count: ranked.length,
    totalCandidates: filtered.length,
    query,
    source: "local",
  };
}

function tokenize(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !["the", "and", "for", "with", "right", "now"].includes(token));
}

function flatten(thread) {
  return [thread.subject, thread.from, thread.snippet, thread.bodyText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function computeJunkPenalty(thread) {
  const subject = String(thread.subject || "");
  const from = String(thread.from || "");
  const snippet = String(thread.snippet || "");
  const body = String(thread.bodyText || "");
  const text = `${subject} ${snippet} ${body}`;

  let penalty = 0;
  if (JUNK_SENDER_KW.test(from)) penalty += 1.6;
  if (MARKETING_KW.test(text)) penalty += 1.6;
  if (NEWSLETTER_DOMAIN_KW.test(from)) penalty += 1.5;
  if (FINANCIAL_RE.test(text) && !STRONG_TRAVEL_EVIDENCE_KW.test(text)) penalty += 1.2;
  if (/traffic.*travel/i.test(text) && !ACTION_KW.test(text)) penalty += 1.2;
  if (/ownership|vacation club|preview/i.test(text)) penalty += 1.2;
  return penalty;
}

function hasStrongTravelEvidence(thread) {
  const text = `${thread.subject || ""} ${thread.snippet || ""} ${thread.bodyText || ""}`;
  return STRONG_TRAVEL_EVIDENCE_KW.test(text) || DESTINATION_CONTEXT_KW.test(text);
}

function senderTrustScore(thread) {
  const from = String(thread.from || "").toLowerCase();
  const subject = String(thread.subject || "").toLowerCase();
  let score = 0;
  if (JUNK_SENDER_KW.test(from) || NEWSLETTER_DOMAIN_KW.test(from)) return -1.5;
  if (/tickets?|reservations?|booking|museum|amtrak|delta|united|hilton|marriott|airbnb|ticketmaster/.test(from)) score += 0.8;
  if (/confirmation|itinerary|boarding|check-?in|reservation|ticket/.test(subject)) score += 0.6;
  if (thread.starred) score += 0.2;
  return score;
}

function isDecisionGradeTravelThread(thread) {
  const text = `${thread.subject || ""} ${thread.snippet || ""} ${thread.bodyText || ""}`;
  if (/regal|movie|comic expo|anime ohio|season 7 extras|home depot|consumer credit|payment/i.test(text)) {
    return false;
  }
  return hasStrongTravelEvidence(thread) && senderTrustScore(thread) >= 0.35;
}

function recencyScore(updatedAt) {
  const ts = Date.parse(updatedAt || "");
  if (Number.isNaN(ts)) return 0.1;
  const ageDays = (Date.now() - ts) / 86400000;
  if (ageDays <= 2) return 0.8;
  if (ageDays <= 7) return 0.55;
  if (ageDays <= 30) return 0.3;
  return 0.1;
}

module.exports = { read };
