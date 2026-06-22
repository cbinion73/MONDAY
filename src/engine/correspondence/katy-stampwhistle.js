"use strict";

const { indexCorrespondence } = require("../memory/memory-writer");
const {
  getEmailMemoryRecord,
  upsertEmailMemoryRecord,
} = require("../db/email-memory-store");

const PRESERVE_TYPES = new Set([
  "transactional",
  "travel",
  "family_logistics",
  "work",
  "financial",
  "faith",
  "publishing",
]);

const LOW_VALUE_TYPES = new Set(["junk", "promo", "ignore"]);
const LOW_VALUE_PROVIDER_CATEGORIES = new Set(["junk", "promotions", "social", "forums"]);
const MARKETING_SENDER_RE = /(?:no-?reply|do-?not-?reply|noreply|newsletter|updates@|offers@|deals@|marketing|mailer-daemon|creativeappliques|myhumehealth|foxnews)/i;
const MARKETING_CONTENT_RE = /\b(unsubscribe|manage preferences|view in browser|sale|discount|offer(?:s)?|promo|promotion|today only|last chance|limited time|ends tonight|father'?s day|happy father'?s day|shop now|webinar|newsletter|roundup|digest)\b/i;
const HIGH_VALUE_FACT_TYPES = new Set([
  "date",
  "time",
  "location",
  "reservation",
  "entry_instruction",
  "traveler",
]);
const DURABLE_FACT_TYPES = new Set([
  "reservation",
  "traveler",
]);
const TRANSACTIONAL_EVIDENCE_RE = /\b(ticket|tickets|reservation|booking|itinerary|confirmation|confirm(?:ed)?|admission|entry pass|boarding|gate|check[- ]?in)\b/i;

function correspondenceDomain(thread) {
  return String(thread.domain || "").toLowerCase();
}

function correspondenceText(thread = {}) {
  return [
    thread.subject || "",
    thread.from || "",
    thread.snippet || "",
    thread.bodyText || "",
  ]
    .filter(Boolean)
    .join("\n");
}

function countFacts(thread = {}, allowedTypes = null) {
  const facts = Array.isArray(thread.structuredFacts) ? thread.structuredFacts : [];
  if (!allowedTypes) return facts.length;
  return facts.filter((fact) => allowedTypes.has(String(fact?.type || "").toLowerCase())).length;
}

function marketingSignalCount(thread = {}) {
  const sender = String(thread.from || "");
  const subject = String(thread.subject || "");
  const text = correspondenceText(thread);
  let count = 0;
  if (MARKETING_SENDER_RE.test(sender)) count++;
  if (MARKETING_CONTENT_RE.test(subject)) count++;
  if (MARKETING_CONTENT_RE.test(text)) count++;
  return count;
}

function shouldPreserveCorrespondence(thread = {}) {
  const threadType = String(thread.threadType || "").toLowerCase();
  const providerCategory = String(thread.providerCategory || "").toLowerCase();
  const significanceScore = Number(thread.significanceScore || 0);
  const relationshipScore = Number(thread.relationshipScore || 0);
  const junkScore = Number(thread.junkScore || 0);
  const actionability = Number(thread.actionability || 0);
  const factCount = countFacts(thread);
  const highValueFactCount = countFacts(thread, HIGH_VALUE_FACT_TYPES);
  const durableFactCount = countFacts(thread, DURABLE_FACT_TYPES);
  const entitiesCount = Array.isArray(thread.entities) ? thread.entities.length : 0;
  const userParticipated = Boolean(thread.userParticipated);
  const text = correspondenceText(thread);
  const transactionalEvidence =
    TRANSACTIONAL_EVIDENCE_RE.test(text) &&
    (durableFactCount > 0 || highValueFactCount >= 2 || Boolean(thread.hasAttachments));
  const directEvidence = durableFactCount > 0 || transactionalEvidence;
  const marketingSignals = marketingSignalCount(thread);
  const lowValueProvider = LOW_VALUE_PROVIDER_CATEGORIES.has(providerCategory);
  const transactionalType = ["transactional", "travel", "financial"].includes(threadType);

  if (LOW_VALUE_TYPES.has(threadType)) {
    return { preserve: false, score: 0, reason: "classified as low-value correspondence" };
  }

  if (junkScore >= 0.85 && !directEvidence) {
    return { preserve: false, score: 0, reason: "junk scoring indicates this thread should not be preserved" };
  }

  if (lowValueProvider && !directEvidence && !userParticipated) {
    return { preserve: false, score: 0, reason: "provider metadata indicates low-value mail" };
  }

  if (marketingSignals >= 2 && !directEvidence && !userParticipated) {
    return { preserve: false, score: 0, reason: "marketing signals outweigh any durable memory value" };
  }

  if (marketingSignals >= 1 && !directEvidence && !userParticipated && actionability < 0.45) {
    return { preserve: false, score: 0, reason: "one-way marketing or newsletter mail should not be preserved" };
  }

  if (
    transactionalType &&
    !directEvidence &&
    !userParticipated &&
    relationshipScore < 0.55 &&
    actionability < 0.6
  ) {
    return { preserve: false, score: 0, reason: "transactional classification lacks direct evidence or real actionability" };
  }

  if (
    providerCategory === "updates" &&
    !transactionalType &&
    !userParticipated &&
    relationshipScore < 0.6 &&
    actionability < 0.55 &&
    highValueFactCount === 0
  ) {
    return { preserve: false, score: 0, reason: "updates-category thread lacks enough durable signal to preserve" };
  }

  if (
    ["personal", "work", "faith", "publishing", "family_logistics"].includes(threadType) &&
    !directEvidence &&
    !userParticipated &&
    relationshipScore < 0.65 &&
    actionability < 0.55
  ) {
    return { preserve: false, score: 0, reason: "one-way thematic mail without action should not be preserved" };
  }

  let score = 0;
  if (PRESERVE_TYPES.has(threadType)) score += 0.35;
  if (significanceScore >= 0.45) score += 0.3;
  if (actionability >= 0.5) score += 0.15;
  if (relationshipScore >= 0.55) score += 0.15;
  if (durableFactCount > 0) score += 0.25;
  else if (highValueFactCount > 0) score += 0.1;
  else if (factCount > 0) score += 0.08;
  if (entitiesCount > 0) score += 0.08;
  if (userParticipated) score += 0.12;
  if (correspondenceDomain(thread)) score += 0.08;
  if (thread.starred) score += 0.08;
  score -= Math.min(junkScore * 0.45, 0.35);
  score -= Math.min(marketingSignals * 0.12, 0.3);
  if (lowValueProvider) score -= 0.18;

  if (threadType === "personal" && !userParticipated && relationshipScore < 0.5 && factCount === 0) {
    score -= 0.25;
  }

  if (!transactionalType && !userParticipated && relationshipScore < 0.5 && highValueFactCount === 0 && actionability < 0.45) {
    score -= 0.2;
  }

  const threshold = transactionalType || directEvidence ? 0.45 : 0.58;
  const preserve = score >= threshold;
  let reason = "thread carries durable correspondence value";
  if (durableFactCount > 0) reason = "durable structured facts make this thread worth preserving";
  else if (highValueFactCount > 0) reason = "time-and-place facts make this thread worth preserving";
  else if (userParticipated && relationshipScore >= 0.55) reason = "relational correspondence with participation deserves continuity";
  else if (PRESERVE_TYPES.has(threadType)) reason = `classified as ${threadType} and likely needed again`;

  return {
    preserve,
    score: Math.max(0, Math.min(score, 1)),
    reason,
  };
}

function summarizeCorrespondence(thread = {}) {
  const facts = Array.isArray(thread.structuredFacts) ? thread.structuredFacts : [];
  const topFacts = facts
    .filter((fact) => ["date", "time", "location", "reservation", "entry_instruction"].includes(fact.type))
    .slice(0, 5)
    .map((fact) => `${fact.type}: ${fact.value}`);

  const parts = [
    thread.subject ? `Subject: ${thread.subject}` : null,
    thread.from ? `From: ${thread.from}` : null,
    thread.snippet ? `Snippet: ${thread.snippet}` : null,
    topFacts.length ? `Facts: ${topFacts.join(" | ")}` : null,
  ].filter(Boolean);

  return parts.join("\n");
}

async function preserveCorrespondenceThread(thread = {}) {
  const verdict = shouldPreserveCorrespondence(thread);
  if (!verdict.preserve) {
    return {
      preserved: false,
      reason: verdict.reason,
      score: verdict.score,
      threadId: thread.id,
    };
  }

  const existing = getEmailMemoryRecord(thread.id);
  if (existing && existing.bodyHash && existing.bodyHash === thread.bodyHash) {
    return {
      preserved: false,
      skipped: true,
      reason: "already preserved for this thread body",
      score: verdict.score,
      threadId: thread.id,
      vectorDocId: existing.vectorDocId,
    };
  }

  const summary = summarizeCorrespondence(thread);
  const text = [
    thread.subject || "",
    thread.snippet || "",
    thread.bodyText || "",
    summary,
  ].filter(Boolean).join("\n\n");

  const vectorDocId = await indexCorrespondence({
    threadId: thread.id,
    subject: thread.subject || "",
    fromAddress: thread.from || "",
    text,
    summary,
    domain: correspondenceDomain(thread),
    source: thread.source || "email",
    threadType: thread.threadType || "personal",
    significanceScore: Number(thread.significanceScore || 0),
    relationshipScore: Number(thread.relationshipScore || 0),
    entities: thread.entities || [],
    ts: thread.updatedAt ? Date.parse(thread.updatedAt) || Date.now() : Date.now(),
  });

  upsertEmailMemoryRecord({
    threadId: thread.id,
    bodyHash: thread.bodyHash || null,
    preserveState: "preserved",
    preserveReason: verdict.reason,
    preserveScore: verdict.score,
    vectorDocId,
    summary,
  });

  return {
    preserved: true,
    reason: verdict.reason,
    score: verdict.score,
    threadId: thread.id,
    vectorDocId,
  };
}

async function preserveCorrespondenceThreads(threads = []) {
  const results = [];
  for (const thread of threads) {
    results.push(await preserveCorrespondenceThread(thread));
  }
  return results;
}

module.exports = {
  shouldPreserveCorrespondence,
  summarizeCorrespondence,
  preserveCorrespondenceThread,
  preserveCorrespondenceThreads,
};
