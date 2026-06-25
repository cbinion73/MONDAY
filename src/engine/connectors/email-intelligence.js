"use strict";

const crypto = require("node:crypto");
const https = require("node:https");
const { readEmailStore } = require("./email-context");
const { chatWithLLM } = require("../llm/llm-router");
const {
  upsertEmailThread,
  replaceEmailThreadFacts,
  getEmailThread,
} = require("../db/email-intelligence-store");
const {
  preserveCorrespondenceThreads,
} = require("../correspondence/katy-stampwhistle");
const { searchGmailThreads } = require("./gmail-sync");
const { searchOutlookMessages } = require("./outlook-sync");
const { normalizeUserFacingDate, normalizeUserFacingTime } = require("../utils/local-time");

const INTERNAL_MAX_CLASSIFY = Number(process.env.MONDAY_EMAIL_CLASSIFY_LIMIT || 12);
const INTERNAL_MAX_RETURN = Number(process.env.MONDAY_EMAIL_INTEL_RETURN_LIMIT || 6);
const LOCAL_CLASSIFY_TIMEOUT_MS = Number(process.env.MONDAY_EMAIL_CLASSIFY_TIMEOUT_MS || 15000);
const LOCAL_INTERPRET_TIMEOUT_MS = Number(process.env.MONDAY_EMAIL_INTERPRET_TIMEOUT_MS || 120000);
const LOCAL_INTERPRET_MODEL = process.env.MONDAY_EMAIL_INTERPRET_MODEL || "qwen3:14b";

const JUNK_SENDERS = /(?:no-?reply|do-?not-?reply|noreply|newsletter|news@|updates@|offers@|deals@|marketing|mailer-daemon)/i;
const MARKETING_KW = /\b(sale|discount|offer|offers|member only|member benefits|webinar|survey|promo|promotion|shop now|today only|last chance|save|savings)\b/i;
const NEWSLETTER_KW = /\b(substack|newsletter|read online|weekend press|this day in history|daily digest|roundup)\b/i;
const ACTION_KW = /\b(confirm|book|ticket|reservation|itinerary|deadline|reply|respond|needs action|required|entry|arrive|check[- ]?in|boarding|parking|gate|tour)\b/i;
const TRANSACTIONAL_KW = /\b(ticket|reservation|confirmation|itinerary|order|booking|admission|entry instructions|receipt|invoice|boarding|trip)\b/i;
const TRAVEL_KW = /\b(philadelphia|washington(?:,?\s*dc)?|dc|statue of liberty|ellis island|travel|trip|hotel|flight|amtrak|train|museum|tour|admission)\b/i;
const TRIP_VENDOR_KW = /\b(ticket|tickets|reserve|reservation|booking|itinerary|confirm|confirmation|admission|museum|hotel|flight|amtrak|tour|ferry|parking|gate|visitor)\b/i;
const FAMILY_KW = /\b(caleb|rebekah|anna|family|kids?|wife|spouse|church|camp|school)\b/i;
const WORK_KW = /\b(thermo fisher|project|meeting|client|proposal|work|team|deadline|boss|roadmap)\b/i;
const FAITH_KW = /\b(prayer|church|god|faith|pastor|bible|discipleship)\b/i;
const PUBLISHING_KW = /\b(book|manuscript|chapter|publisher|publishing|write|writing)\b/i;
const FINANCIAL_KW = /\b(invoice|statement|account|balance|payment|financial|retirement|brokerage|advisor)\b/i;
const LOCATION_KW = /\b(philadelphia|washington(?:,?\s*dc)?|statue of liberty|ellis island|new york|manhattan|jersey city)\b/ig;
const URL_KW = /https?:\/\/[^\s)>"']+/g;
const DATE_KW = /\b(?:mon|tues|wed|thu|fri|sat|sun)?\.?,?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/ig;
const TIME_KW = /\b\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)\b|\b\d{1,2}\s?(?:AM|PM|am|pm)\b/g;
const CONFIRMATION_KW = /\b(?:confirmation|reservation|booking|order|ticket)\s*(?:number|#|no\.?)?\s*[:#]?\s*([A-Z0-9-]{5,})\b/ig;
const ORDER_CODE_KW = /\b(?:order code|order id|confirmation code|reservation code)\s*:\s*([A-Z0-9-]{5,})\b/ig;
const RESERVED_ON_KW = /\breserved on:\s*([^\n\r]+?)\b(?:total:|$)/i;
const INTERPRET_THREAD_KW = /\b(ticket|tickets|reservation|booking|itinerary|museum|admission|pass|qr code|entry|arrival|tour|visitor|trip|travel|confirmation)\b/i;
const TRUSTED_RESERVATION_PAGE_RE = /^https:\/\/tickets\.si\.edu\/ticket_order\/[A-Za-z0-9-]+/i;

function hashThread(thread) {
  return crypto
    .createHash("sha256")
    .update(
      [
        thread.subject || "",
        thread.from || "",
        thread.snippet || "",
        thread.bodyText || "",
        thread.updatedAt || "",
      ].join("||")
    )
    .digest("hex");
}

function normalizeProviderMetadata(thread) {
  const labelIds = Array.isArray(thread.labelIds) ? thread.labelIds : [];
  const categories = Array.isArray(thread.categories) ? thread.categories : [];
  const inference = thread.inferenceClassification || null;
  const folder = thread.folder || null;
  const all = new Set([...labelIds, ...categories].map(String));

  if (all.has("SPAM") || all.has("TRASH")) return { providerCategory: "junk", providerLabels: [...all], folder };
  if (all.has("CATEGORY_PROMOTIONS")) return { providerCategory: "promotions", providerLabels: [...all], folder };
  if (all.has("CATEGORY_SOCIAL")) return { providerCategory: "social", providerLabels: [...all], folder };
  if (all.has("CATEGORY_FORUMS")) return { providerCategory: "forums", providerLabels: [...all], folder };
  if (all.has("CATEGORY_UPDATES")) return { providerCategory: "updates", providerLabels: [...all], folder };
  if (all.has("CATEGORY_PERSONAL")) return { providerCategory: "personal", providerLabels: [...all], folder };
  if (inference === "focused") return { providerCategory: "focused", providerLabels: [...all], folder };
  if (inference === "other") return { providerCategory: "other", providerLabels: [...all], folder };
  return { providerCategory: null, providerLabels: [...all], folder };
}

function extractEntities(text) {
  const found = new Set();
  const checks = [
    ["Philadelphia", /\bphiladelphia\b/i],
    ["Washington, DC", /\bwashington(?:,?\s*dc)?\b/i],
    ["Statue of Liberty", /\bstatue of liberty\b/i],
    ["Ellis Island", /\bellis island\b/i],
    ["Rebekah", /\brebekah\b/i],
    ["Caleb", /\bcaleb\b/i],
    ["Thermo Fisher", /\bthermo fisher\b/i],
    ["Publishing", PUBLISHING_KW],
    ["Retirement", /\bretire|retirement\b/i],
    ["Faith", FAITH_KW],
  ];
  for (const [label, pattern] of checks) {
    if (pattern.test(text)) found.add(label);
  }
  return [...found];
}

function computeRelationshipScore(thread, text) {
  let score = 0.2;
  if (thread.userParticipated) score += 0.35;
  if ((thread.messageCount || 0) > 1) score += 0.15;
  if (thread.starred) score += 0.1;
  if (!JUNK_SENDERS.test(thread.from || "")) score += 0.1;
  if (FAMILY_KW.test(text) || WORK_KW.test(text)) score += 0.1;
  return Math.min(1, score);
}

function computeJunkScore(thread, text, meta) {
  let score = 0;
  if (meta.providerCategory === "promotions") score += 0.85;
  if (meta.providerCategory === "social") score += 0.75;
  if (meta.providerCategory === "forums") score += 0.75;
  if (meta.providerCategory === "junk") score += 1;
  if (meta.providerCategory === "updates") score += 0.35;
  if (JUNK_SENDERS.test(thread.from || "")) score += 0.35;
  if (/unsubscribe|manage preferences|view in browser|sale|discount|offer ends|today only/i.test(text)) score += 0.35;
  if (MARKETING_KW.test(text)) score += 0.3;
  if (NEWSLETTER_KW.test(text) || NEWSLETTER_KW.test(thread.from || "") || /substack\.com/i.test(thread.from || "")) score += 0.25;
  if (thread.userParticipated) score -= 0.25;
  if (TRANSACTIONAL_KW.test(text) || ACTION_KW.test(text)) score -= 0.2;
  return clamp(score, 0, 1);
}

function computeActionability(text) {
  let score = 0;
  if (ACTION_KW.test(text)) score += 0.4;
  if (TRANSACTIONAL_KW.test(text)) score += 0.3;
  if (/unread/i.test(text)) score += 0.05;
  return clamp(score, 0, 1);
}

function computeHeuristicDomain(text) {
  if (TRAVEL_KW.test(text)) return "Family";
  if (FAMILY_KW.test(text)) return "Family";
  if (WORK_KW.test(text)) return "Work";
  if (FINANCIAL_KW.test(text)) return "Retirement";
  if (FAITH_KW.test(text)) return "Faith";
  if (PUBLISHING_KW.test(text)) return "Publishing";
  return null;
}

function computeThreadType(text, meta) {
  if (meta.providerCategory === "promotions" || meta.providerCategory === "social" || meta.providerCategory === "forums" || meta.providerCategory === "junk") {
    return "junk";
  }
  if (TRAVEL_KW.test(text) || TRANSACTIONAL_KW.test(text)) return "transactional";
  if (FAMILY_KW.test(text)) return "family_logistics";
  if (WORK_KW.test(text)) return "work";
  if (FINANCIAL_KW.test(text)) return "financial";
  if (FAITH_KW.test(text)) return "faith";
  if (PUBLISHING_KW.test(text)) return "publishing";
  return "personal";
}

function computeQueryRelevance(thread, query) {
  if (!query) return 0;
  const text = flattenThread(thread).toLowerCase();
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const token of tokens) {
    if (text.includes(token)) hits++;
  }
  return clamp(hits / Math.max(tokens.length, 3), 0, 1);
}

function computeSignificanceScore(thread, query, text, meta) {
  const queryRelevance = computeQueryRelevance(thread, query);
  const actionability = computeActionability(text);
  const recency = computeRecencyScore(thread.updatedAt);
  const travel = TRAVEL_KW.test(text) ? 0.25 : 0;
  const family = FAMILY_KW.test(text) ? 0.15 : 0;
  const promoPenalty = meta.providerCategory === "promotions" || meta.providerCategory === "social" ? -0.4 : 0;
  const value = 0.2 + queryRelevance * 0.4 + actionability * 0.2 + recency * 0.15 + travel + family + promoPenalty;
  return clamp(value, 0, 1);
}

function computeRecencyScore(updatedAt) {
  const ts = Date.parse(updatedAt || "");
  if (Number.isNaN(ts)) return 0.1;
  const ageDays = (Date.now() - ts) / 86400000;
  if (ageDays <= 2) return 1;
  if (ageDays <= 7) return 0.75;
  if (ageDays <= 30) return 0.45;
  return 0.15;
}

function flattenThread(thread) {
  return [thread.subject, thread.from, thread.snippet, thread.bodyText].filter(Boolean).join(" ");
}

function cleanEmailBodyForInterpretation(value) {
  return String(value || "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function fetchText(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`fetch failed: ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve(data));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("fetch timeout"));
    });
    req.on("error", reject);
  });
}

function extractJsonLdReservationFacts(thread) {
  const body = String(thread.bodyText || "");
  const facts = [];
  const blocks = [...body.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of blocks) {
    const parsed = safeJsonParse(match[1].trim());
    if (!parsed || typeof parsed !== "object") continue;
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      if (!/EventReservation/i.test(String(item["@type"] || ""))) continue;
      if (item.reservationNumber) {
        facts.push({ type: "confirmation_number", key: null, value: String(item.reservationNumber), confidence: 0.96 });
        facts.push({ type: "reservation", key: "confirmation_number", value: String(item.reservationNumber), confidence: 0.96 });
      }
      const event = item.reservationFor || {};
      if (event.name) {
        facts.push({ type: "title", key: null, value: String(event.name), confidence: 0.9 });
      }
      if (event.startDate) {
        const localDate = normalizeUserFacingDate(String(event.startDate));
        const localTime = normalizeUserFacingTime(String(event.startDate));
        if (localDate) {
          facts.push({ type: "scheduled_date", key: null, value: localDate, confidence: 0.95 });
          facts.push({ type: "date", key: "scheduled", value: localDate, confidence: 0.95 });
        }
        if (localTime) {
          facts.push({ type: "scheduled_time", key: null, value: localTime, confidence: 0.95 });
          facts.push({ type: "time", key: "scheduled", value: localTime, confidence: 0.95 });
        }
      }
      const location = event.location || {};
      if (location.name) {
        facts.push({ type: "location_name", key: null, value: String(location.name), confidence: 0.94 });
        facts.push({ type: "location", key: "name", value: String(location.name), confidence: 0.94 });
      }
      const address = location.address || {};
      const addressParts = [
        address.streetAddress,
        address.addressLocality,
        address.addressRegion,
        address.postalCode,
      ].filter(Boolean).map(String);
      if (addressParts.length) {
        const fullAddress = addressParts.join(", ");
        facts.push({ type: "location_address", key: null, value: fullAddress, confidence: 0.94 });
        facts.push({ type: "location", key: "address", value: fullAddress, confidence: 0.94 });
      }
    }
  }
  return facts;
}

function parseTrustedReservationPageFacts(html) {
  const text = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const facts = [];
  const add = (type, value, key = null, confidence = 0.9) => {
    if (!value) return;
    facts.push({ type, key, value: String(value).trim(), confidence });
  };

  const order = text.match(/\bOrder\s*(?:#|code:?)\s*([A-Z0-9*-]{6,})\b/i);
  if (order?.[1]) {
    const normalized = order[1].replace(/\*/g, "-");
    add("confirmation_number", normalized, null, 0.95);
    add("reservation", normalized, "confirmation_number", 0.95);
  }

  const date = text.match(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/i);
  if (date?.[0]) {
    add("scheduled_date", date[0], null, 0.94);
    add("date", date[0], "scheduled", 0.94);
  }

  const time = text.match(/\bEntry Time:\s*([0-9]{1,2}:[0-9]{2}\s*(?:am|pm|AM|PM))\b/i);
  if (time?.[1]) {
    const normalizedTime = normalizeUserFacingTime(time[1]) || time[1];
    add("scheduled_time", normalizedTime, null, 0.94);
    add("time", normalizedTime, "scheduled", 0.94);
  }

  const museum = text.match(/\bPlan Your Visit\s+([^0-9][A-Za-z&' -]+Museum)\b/i);
  if (museum?.[1]) {
    add("location_name", museum[1], null, 0.93);
    add("location", museum[1], "name", 0.93);
  }

  const address = text.match(/\b(650 Jefferson Drive SW\s+Washington DC\s+20560)\b/i);
  if (address?.[1]) {
    add("location_address", "650 Jefferson Drive SW, Washington, DC 20560", null, 0.95);
    add("location", "650 Jefferson Drive SW, Washington, DC 20560", "address", 0.95);
  }

  const entry = text.match(/\bEntry is via the north side of the Museum[\s\S]{0,240}?building\)\./i);
  if (entry?.[0]) {
    add("entry_instruction", entry[0], null, 0.9);
  }

  if (/National Air and Space Museum/i.test(text)) {
    add("summary", "Confirmation email for National Air and Space Museum visit with QR code instructions.", null, 0.85);
    add("artifact_type", "reservation", null, 0.82);
  }

  return sanitizeFacts(facts);
}

async function enrichFactsFromTrustedReservationLinks(facts = []) {
  const links = facts
    .filter((fact) => fact.type === "link" && TRUSTED_RESERVATION_PAGE_RE.test(String(fact.value || "")))
    .map((fact) => String(fact.value));
  if (!links.length) return sanitizeFacts(facts);

  const enriched = [...facts];
  for (const link of links.slice(0, 1)) {
    try {
      const html = await fetchText(link, 20000);
      enriched.push(...parseTrustedReservationPageFacts(html));
    } catch {
      // Keep the core pipeline resilient if page fetch fails.
    }
  }
  return sanitizeFacts(enriched);
}

function tokenizeQuery(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
    .filter((s) => !["next", "week", "need", "plan", "trip", "email", "tickets"].includes(s));
}

function extractStructuredFacts(thread) {
  const text = flattenThread(thread);
  const facts = [];
  const addFact = (type, value, key = null, confidence = 0.82) => {
    if (!value) return;
    facts.push({ type, key, value: String(value), confidence });
  };

  for (const fact of extractJsonLdReservationFacts(thread)) {
    facts.push(fact);
  }

  for (const match of text.matchAll(DATE_KW)) addFact("date", match[0], null, 0.86);
  for (const match of text.matchAll(TIME_KW)) addFact("time", match[0], null, 0.86);
  for (const match of text.matchAll(LOCATION_KW)) addFact("location", titleCase(match[0]), null, 0.88);
  for (const match of text.matchAll(CONFIRMATION_KW)) addFact("reservation", match[1], null, 0.9);
  for (const match of text.matchAll(ORDER_CODE_KW)) {
    addFact("confirmation_number", match[1], null, 0.93);
    addFact("reservation", match[1], "confirmation_number", 0.93);
  }
  for (const match of text.matchAll(URL_KW)) addFact("link", match[0], null, 0.72);

  const reservedOn = text.match(RESERVED_ON_KW);
  if (reservedOn?.[1]) {
    addFact("email_received_at", reservedOn[1].trim(), null, 0.9);
  }

  const travelerPatterns = [
    /\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g,
    /\btraveler[s]?:\s*([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)*)\b/gi,
  ];
  for (const pattern of travelerPatterns) {
    for (const match of text.matchAll(pattern)) addFact("traveler", match[1], null, 0.68);
  }

  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (/entry|admission|arrive|bring|gate|check[- ]?in|security|must present/i.test(sentence)) {
      addFact("entry_instruction", sentence.trim().slice(0, 240), null, 0.8);
    }
  }

  return sanitizeFacts(facts);
}

function dedupeFacts(facts) {
  const seen = new Set();
  return facts.filter((fact) => {
    const sig = `${fact.type}|${fact.key || ""}|${fact.value}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

function sanitizeFacts(facts = []) {
  const items = dedupeFacts(facts);
  const hasScheduledDate = items.some((fact) => fact.type === "scheduled_date");
  const hasScheduledTime = items.some((fact) => fact.type === "scheduled_time");
  const hasLocationName = items.some((fact) => fact.type === "location_name");
  const hasLocationAddress = items.some((fact) => fact.type === "location_address");
  const canonicalConfirmation = items
    .filter((fact) => fact.type === "confirmation_number")
    .sort((a, b) => String(b.value || "").length - String(a.value || "").length)[0]?.value;
  const hasEmailReceipt = items.some((fact) => fact.type === "email_received_at");
  const canonicalTicketRecord =
    Boolean(canonicalConfirmation) &&
    (hasScheduledDate || hasScheduledTime || hasLocationName || hasLocationAddress);

  if (canonicalTicketRecord) {
    const strongTypes = new Set([
      "artifact_type",
      "title",
      "summary",
      "email_received_at",
      "confirmation_number",
      "scheduled_date",
      "scheduled_time",
      "location_name",
      "location_address",
      "entry_instruction",
    ]);
    return items.filter((fact) => {
      const value = String(fact.value || "").trim();
      if (!value) return false;
      if (fact.type === "confirmation_number" && value !== canonicalConfirmation) return false;
      if (!strongTypes.has(fact.type)) return false;
      if (fact.type === "entry_instruction" && /<!DOCTYPE html/i.test(value)) return false;
      return true;
    });
  }

  return items.filter((fact) => {
    const value = String(fact.value || "").trim();
    if (!value) return false;
    if (fact.type === "link" && /w3\.org|fonts\.googleapis\.com|schema\.org/i.test(value)) return false;
    if (fact.type === "entry_instruction" && /<!DOCTYPE html/i.test(value)) return false;
    if (fact.type === "reservation" && /^(Confirmation|Number|Status|details)$/i.test(value)) return false;
    if (fact.type === "confirmation_number" && canonicalConfirmation && value !== canonicalConfirmation) return false;
    if (fact.type === "reservation" && fact.key === "confirmation_number" && canonicalConfirmation && value !== canonicalConfirmation) return false;
    if (fact.type === "date" && !fact.key && hasEmailReceipt && /^,?\s*[A-Z][a-z]{2}\s+\d{1,2}$/i.test(value)) return false;
    if (fact.type === "time" && !fact.key && hasScheduledTime && /^\d{1,2}:\d{2}\s?(am|pm)$/i.test(value)) return false;
    if (fact.type === "location" && !fact.key && hasLocationName && /^Washington$/i.test(value)) return false;
    if (fact.type === "date" && fact.key === "scheduled" && hasScheduledDate) return false;
    if (fact.type === "time" && fact.key === "scheduled" && hasScheduledTime) return false;
    if (fact.type === "location" && fact.key === "name" && hasLocationName) return false;
    if (fact.type === "location" && fact.key === "address" && hasLocationAddress) return false;
    return true;
  });
}

function shouldInterpretThread(thread, facts = []) {
  const text = flattenThread(thread);
  const threadType = String(thread.threadType || "").toLowerCase();
  const providerCategory = String(thread.providerCategory || "").toLowerCase();
  return (
    threadType === "travel" ||
    threadType === "transactional" ||
    threadType === "family_logistics" ||
    providerCategory === "updates" ||
    INTERPRET_THREAD_KW.test(text) ||
    facts.some((fact) => ["reservation", "entry_instruction", "date", "time", "location"].includes(fact.type))
  );
}

function normalizeInterpretedFact(type, value, confidence = 0.84) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return [];

  switch (type) {
    case "email_received_at":
      return [{ type, key: null, value: trimmed, confidence }];
    case "scheduled_date":
      return [
        { type, key: null, value: trimmed, confidence },
        { type: "date", key: "scheduled", value: trimmed, confidence: Math.max(0.7, confidence - 0.02) },
      ];
    case "scheduled_time":
      return [
        { type, key: null, value: trimmed, confidence },
        { type: "time", key: "scheduled", value: trimmed, confidence: Math.max(0.7, confidence - 0.02) },
      ];
    case "location_name":
      return [
        { type, key: null, value: trimmed, confidence },
        { type: "location", key: "name", value: trimmed, confidence: Math.max(0.7, confidence - 0.02) },
      ];
    case "location_address":
      return [
        { type, key: null, value: trimmed, confidence },
        { type: "location", key: "address", value: trimmed, confidence: Math.max(0.7, confidence - 0.02) },
      ];
    case "confirmation_number":
      return [
        { type, key: null, value: trimmed, confidence },
        { type: "reservation", key: "confirmation_number", value: trimmed, confidence: Math.max(0.72, confidence - 0.02) },
      ];
    case "entry_instruction":
    case "summary":
    case "artifact_type":
    case "title":
      return [{ type, key: null, value: trimmed, confidence }];
    default:
      return [];
  }
}

async function interpretStructuredFactsLocally(thread, initialFacts = []) {
  let facts = await enrichFactsFromTrustedReservationLinks(initialFacts);
  if (!shouldInterpretThread(thread, facts)) {
    return facts;
  }

  const messages = [
    {
      role: "system",
      content:
        "You are Katy Stampwhistle, Monday's local correspondence interpreter. " +
        "Read one email and infer only the information that matters for future use. " +
        "Distinguish email receipt metadata from the scheduled event itself. " +
        "Do not confuse the email sent time with the visit time unless the email explicitly states the event time. " +
        "Return JSON only with this shape: " +
        "{\"artifactType\":\"...\",\"title\":\"...\",\"summary\":\"...\",\"facts\":{\"scheduled_date\":\"...\",\"scheduled_time\":\"...\",\"location_name\":\"...\",\"location_address\":\"...\",\"confirmation_number\":\"...\",\"entry_instruction\":\"...\"}}. " +
        "Leave missing fields empty. Do not invent facts."
    },
    {
      role: "user",
      content: JSON.stringify({
        subject: thread.subject || "",
        from: thread.from || "",
        receivedAt: thread.updatedAt || "",
        snippet: String(thread.snippet || "").slice(0, 500),
        body: cleanEmailBodyForInterpretation(String(thread.bodyText || "")).slice(0, 4000),
        initialFacts: facts,
      }),
    },
  ];

  try {
    const response = await chatWithLLM({
      messages,
      tier: "background",
      model: LOCAL_INTERPRET_MODEL,
      temperature: 0.1,
      timeoutMs: LOCAL_INTERPRET_TIMEOUT_MS,
      purpose: "email-intelligence-interpretation",
    });

    const parsed = response?.json || {};
    const interpreted = [];
    for (const [key, value] of Object.entries(parsed.facts || {})) {
      interpreted.push(...normalizeInterpretedFact(key, value, 0.87));
    }
    interpreted.push(...normalizeInterpretedFact("artifact_type", parsed.artifactType, 0.8));
    interpreted.push(...normalizeInterpretedFact("title", parsed.title, 0.82));
    interpreted.push(...normalizeInterpretedFact("summary", parsed.summary, 0.82));
    interpreted.push(...normalizeInterpretedFact("email_received_at", thread.updatedAt || "", 0.95));
    return sanitizeFacts([...facts, ...interpreted]);
  } catch {
    return sanitizeFacts(facts);
  }
}

function deterministicClassification(thread, scores, meta, text) {
  if (scores.junkScore >= 0.75) {
    return { threadType: "junk", domain: null, significanceScore: Math.max(0, scores.significanceScore - 0.5), entities: scores.entities };
  }
  const threadType = computeThreadType(text, meta);
  const domain = computeHeuristicDomain(text);
  return {
    threadType,
    domain,
    significanceScore: scores.significanceScore,
    entities: scores.entities,
  };
}

async function classifyLocallyWithQwen(threads, query) {
  if (!threads.length) return new Map();
  const payload = threads.map((thread) => ({
    id: thread.id,
    subject: thread.subject || "",
    from: thread.from || "",
    snippet: String(thread.snippet || "").slice(0, 280),
    body: String(thread.bodyText || "").slice(0, 800),
    providerCategory: thread.providerCategory || null,
    relationshipScore: thread.relationshipScore,
    junkScore: thread.junkScore,
    significanceScore: thread.significanceScore,
  }));

  const messages = [
    {
      role: "system",
      content:
        "You are Monday's local email classifier. Classify each email thread into one of: junk, promo, ignore, transactional, personal, travel, family_logistics, work, financial, faith, publishing. " +
        "Return JSON only: {\"threads\":[{\"id\":\"...\",\"threadType\":\"...\",\"domain\":\"Family|Work|Faith|Publishing|Retirement|null\",\"significanceScore\":0-1,\"actionability\":0-1,\"entities\":[\"...\"],\"confidence\":0-1}]}." +
        " Favor travel for tickets/reservations/itineraries. Favor junk/promo for marketing. Do not explain."
    },
    {
      role: "user",
      content: JSON.stringify({ query, threads: payload }),
    },
  ];

  try {
    const response = await chatWithLLM({
      messages,
      tier: "background",
      temperature: 0.2,
      timeoutMs: LOCAL_CLASSIFY_TIMEOUT_MS,
      purpose: "email-intelligence-classification",
    });
    const items = response?.json?.threads || [];
    return new Map(items.map((item) => [item.id, item]));
  } catch {
    return new Map();
  }
}

function mergeClassifications(deterministic, local) {
  if (!local) {
    return {
      ...deterministic,
      localClassification: deterministic,
      classificationConfidence: 0.55,
    };
  }

  return {
    threadType: local.threadType || deterministic.threadType,
    domain: local.domain || deterministic.domain,
    significanceScore: clamp(
      typeof local.significanceScore === "number"
        ? (deterministic.significanceScore + local.significanceScore) / 2
        : deterministic.significanceScore,
      0,
      1
    ),
    actionability: clamp(
      typeof local.actionability === "number" ? local.actionability : deterministic.actionability,
      0,
      1
    ),
    entities: Array.from(new Set([...(deterministic.entities || []), ...((local.entities || []).map(String))])),
    localClassification: local,
    classificationConfidence: clamp(local.confidence ?? 0.72, 0, 1),
  };
}

function buildIntelligenceRecord(thread, query) {
  const text = flattenThread(thread);
  const meta = normalizeProviderMetadata(thread);
  const entities = extractEntities(text);
  const relationshipScore = computeRelationshipScore(thread, text);
  const junkScore = computeJunkScore(thread, text, meta);
  const significanceScore = computeSignificanceScore(thread, query, text, meta);
  const actionability = computeActionability(text);
  return {
    text,
    meta,
    entities,
    relationshipScore,
    junkScore,
    significanceScore,
    actionability,
    deterministic: deterministicClassification(
      thread,
      { relationshipScore, junkScore, significanceScore, actionability, entities },
      meta,
      text
    ),
    structuredFacts: extractStructuredFacts(thread),
  };
}

function buildQueryProfile(query) {
  const raw = String(query || "");
  const normalized = raw.toLowerCase();
  const locations = [...new Set((raw.match(LOCATION_KW) || []).map((item) => titleCase(item)))];
  return {
    raw,
    tripPlanning: /\b(plan|planning).*\btrip\b|\btickets?\b|\bitinerary\b|\breservation\b|\btravel\b/i.test(raw),
    wantsTicketEvidence: /\btickets?\b|\breservation\b|\bconfirmation\b|\bitinerary\b/i.test(raw),
    locations,
    queryTokens: tokenizeQuery(raw),
    normalized,
  };
}

function computeTravelEvidenceScore(thread, profile) {
  const text = flattenThread(thread);
  const facts = thread.structuredFacts || [];
  let score = 0;
  if (TRANSACTIONAL_KW.test(text)) score += 0.35;
  if (TRAVEL_KW.test(text)) score += 0.2;
  if (facts.some((fact) => fact.type === "reservation")) score += 0.35;
  if (facts.some((fact) => fact.type === "date")) score += 0.12;
  if (facts.some((fact) => fact.type === "time")) score += 0.12;
  if (facts.some((fact) => fact.type === "location")) score += 0.15;
  if (facts.some((fact) => fact.type === "entry_instruction")) score += 0.1;
  if (profile.locations.length > 0) {
    const factLocations = new Set(facts.filter((fact) => fact.type === "location").map((fact) => String(fact.value).toLowerCase()));
    if (profile.locations.some((location) => text.toLowerCase().includes(location.toLowerCase()) || factLocations.has(location.toLowerCase()))) {
      score += 0.3;
    }
  }
  if (MARKETING_KW.test(text)) score -= 0.4;
  if (!thread.userParticipated && JUNK_SENDERS.test(thread.from || "")) score -= 0.2;
  if (profile.wantsTicketEvidence && !facts.some((fact) => ["reservation", "date", "time", "location", "entry_instruction"].includes(fact.type))) {
    score -= 0.25;
  }
  return clamp(score, 0, 1);
}

function isTripMatch(thread, profile) {
  const text = flattenThread(thread).toLowerCase();
  const facts = thread.structuredFacts || [];
  const locationHit =
    profile.locations.length === 0
      ? false
      : profile.locations.some((location) => {
          const needle = location.toLowerCase();
          return (
            text.includes(needle) ||
            facts.some(
              (fact) =>
                fact.type === "location" &&
                String(fact.value || "")
                  .toLowerCase()
                  .includes(needle)
            )
          );
        });
  const factCount = facts.filter((fact) =>
    ["reservation", "date", "time", "entry_instruction", "location", "link"].includes(fact.type)
  ).length;
  const hasReservation = facts.some((fact) => fact.type === "reservation");
  const hasDate = facts.some((fact) => fact.type === "date");
  const hasTime = facts.some((fact) => fact.type === "time");
  const hasEntry = facts.some((fact) => fact.type === "entry_instruction");
  const anchorFact = facts.some((fact) =>
    ["reservation", "date", "time", "entry_instruction", "link"].includes(fact.type)
  );
  const transactional = TRANSACTIONAL_KW.test(text);
  const attachmentSignal = Boolean(thread.hasAttachments);
  const updateSignal = thread.providerCategory === "updates" || thread.inferenceClassification === "focused";
  const vendorSignal = TRIP_VENDOR_KW.test(`${thread.subject || ""} ${thread.from || ""}`);
  const newsletterSignal =
    NEWSLETTER_KW.test(text) ||
    NEWSLETTER_KW.test(thread.subject || "") ||
    NEWSLETTER_KW.test(thread.from || "") ||
    /substack\.com/i.test(thread.from || "");
  const itineraryStrength =
    hasReservation ||
    hasEntry ||
    (hasDate && hasTime) ||
    (hasDate && vendorSignal) ||
    (transactional && (hasDate || hasTime || vendorSignal));
  return (
    locationHit &&
    !newsletterSignal &&
    itineraryStrength &&
    (factCount >= 2 || anchorFact || transactional || attachmentSignal) &&
    (transactional || updateSignal || attachmentSignal)
  );
}

async function retrieveIntelligentEmail({
  query = "",
  limit = INTERNAL_MAX_RETURN,
  unreadOnly = false,
  missionId = null,
  allowLiveProviderSearch = true,
} = {}) {
  const store = readEmailStore();
  const queryProfile = buildQueryProfile(query);
  let threads = store.threads || [];
  if (missionId) threads = threads.filter((thread) => thread.missionId === missionId);
  if (unreadOnly) threads = threads.filter((thread) => thread.unread);

  const enriched = threads.map((thread) => {
    const intelligence = buildIntelligenceRecord(thread, query);
    return {
      ...thread,
      providerCategory: intelligence.meta.providerCategory,
      providerLabels: intelligence.meta.providerLabels,
      folder: intelligence.meta.folder,
      relationshipScore: intelligence.relationshipScore,
      junkScore: intelligence.junkScore,
      significanceScore: intelligence.significanceScore,
      actionability: intelligence.actionability,
      deterministic: intelligence.deterministic,
      structuredFacts: intelligence.structuredFacts,
      entities: intelligence.entities,
      bodyHash: hashThread(thread),
    };
  });

  const filtered = enriched.filter((thread) => thread.junkScore < 0.92);
  const prioritized = filtered
    .sort((a, b) => {
      const aTravel = queryProfile.tripPlanning ? computeTravelEvidenceScore(a, queryProfile) : 0;
      const bTravel = queryProfile.tripPlanning ? computeTravelEvidenceScore(b, queryProfile) : 0;
      const aScore = a.significanceScore + computeQueryRelevance(a, query) + a.actionability + aTravel - a.junkScore;
      const bScore = b.significanceScore + computeQueryRelevance(b, query) + b.actionability + bTravel - b.junkScore;
      return bScore - aScore;
    });

  const candidates = prioritized.slice(0, INTERNAL_MAX_CLASSIFY);
  const localMap = await classifyLocallyWithQwen(candidates, query);
  const interpretedFactsByThread = new Map();
  for (const thread of candidates) {
    interpretedFactsByThread.set(
      thread.id,
      await interpretStructuredFactsLocally(thread, thread.structuredFacts)
    );
  }

  const finalThreads = prioritized.map((thread) => {
    const cached = getEmailThread(thread.id);
    const local = localMap.get(thread.id);
    const merged = mergeClassifications(thread.deterministic, local || cached?.localClassification);
    const interpretedFacts = interpretedFactsByThread.get(thread.id) || thread.structuredFacts;
    const record = {
      threadId: thread.id,
      source: thread.source,
      subject: thread.subject,
      fromAddress: thread.from,
      providerCategory: thread.providerCategory,
      providerLabels: thread.providerLabels,
      folder: thread.folder,
      receivedAt: thread.updatedAt,
      unread: thread.unread,
      starred: thread.starred,
      hasAttachments: thread.hasAttachments,
      relationshipScore: thread.relationshipScore,
      junkScore: thread.junkScore,
      significanceScore: merged.significanceScore,
      domain: merged.domain,
      threadType: merged.threadType,
      actionability: merged.actionability ?? thread.actionability,
      entities: merged.entities,
      structuredFacts: interpretedFacts,
      localClassification: merged.localClassification,
      classificationConfidence: merged.classificationConfidence,
      userParticipated: thread.userParticipated,
      messageCount: thread.messageCount,
      bodyHash: thread.bodyHash,
      updatedAt: thread.updatedAt,
    };
    upsertEmailThread(record);
    replaceEmailThreadFacts(
      thread.id,
      interpretedFacts.map((fact) => ({
        type: fact.type,
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence,
      }))
    );
    return {
      ...thread,
      ...merged,
      structuredFacts: interpretedFacts,
      classificationConfidence: merged.classificationConfidence,
    };
  });

  await preserveCorrespondenceThreads(finalThreads);

  const survivors = finalThreads.filter((thread) => {
    const queryRelevance = computeQueryRelevance(thread, query);
    if (!queryProfile.tripPlanning) {
      return thread.junkScore < 0.75 || queryRelevance > 0.3;
    }
    const travelEvidence = computeTravelEvidenceScore(thread, queryProfile);
    return (
      thread.junkScore < 0.55 &&
      isTripMatch(thread, queryProfile) &&
      (travelEvidence >= 0.28 || queryRelevance >= 0.35)
    );
  });
  const ranked = survivors
    .sort((a, b) => {
      const aTravel = queryProfile.tripPlanning ? computeTravelEvidenceScore(a, queryProfile) : 0;
      const bTravel = queryProfile.tripPlanning ? computeTravelEvidenceScore(b, queryProfile) : 0;
      const aScore = (a.significanceScore || 0) + computeQueryRelevance(a, query) + (a.actionability || 0) + aTravel - a.junkScore;
      const bScore = (b.significanceScore || 0) + computeQueryRelevance(b, query) + (b.actionability || 0) + bTravel - b.junkScore;
      return bScore - aScore;
    })
    .slice(0, limit);

  const response = {
    ok: true,
    data: ranked,
    count: ranked.length,
    totalCandidates: threads.length,
    filteredOut: threads.length - survivors.length,
    query,
    source: store.source || "local",
  };

  if (
    allowLiveProviderSearch &&
    queryProfile.tripPlanning &&
    !hasStrongTicketEvidence(ranked, queryProfile)
  ) {
    const liveMatches = [];
    for (const liveQuery of buildProviderSearchQueries(queryProfile)) {
      const [gmailResults, outlookResults] = await Promise.allSettled([
        searchGmailThreads(liveQuery, { maxResults: 20, lookbackDays: 365 }),
        searchOutlookMessages(liveQuery, { maxResults: 20 }),
      ]);

      liveMatches.push(
        ...(gmailResults.status === "fulfilled" ? gmailResults.value : []),
        ...(outlookResults.status === "fulfilled" ? outlookResults.value : [])
      );

      if (liveMatches.length >= 6) break;
    }

    if (liveMatches.length > 0) {
      return retrieveIntelligentEmail({
        query,
        limit,
        unreadOnly,
        missionId,
        allowLiveProviderSearch: false,
      });
    }
  }

  return response;
}

async function backfillEmailIntelligence({
  batchSize = Number(process.env.MONDAY_EMAIL_BACKFILL_BATCH || 24),
  preserve = true,
} = {}) {
  const store = readEmailStore();
  const threads = Array.isArray(store.threads) ? store.threads : [];
  const results = [];

  for (let i = 0; i < threads.length; i += batchSize) {
    const batch = threads.slice(i, i + batchSize);
    const enriched = batch.map((thread) => {
      const intelligence = buildIntelligenceRecord(thread, "");
      return {
        ...thread,
        providerCategory: intelligence.meta.providerCategory,
        providerLabels: intelligence.meta.providerLabels,
        folder: intelligence.meta.folder,
        relationshipScore: intelligence.relationshipScore,
        junkScore: intelligence.junkScore,
        significanceScore: intelligence.significanceScore,
        actionability: intelligence.actionability,
        deterministic: intelligence.deterministic,
        structuredFacts: intelligence.structuredFacts,
        entities: intelligence.entities,
        bodyHash: hashThread(thread),
      };
    });

    const localMap = await classifyLocallyWithQwen(enriched, "");
    const interpretedFactsByThread = new Map();
    for (const thread of enriched) {
      interpretedFactsByThread.set(
        thread.id,
        await interpretStructuredFactsLocally(thread, thread.structuredFacts)
      );
    }
    const finalThreads = enriched.map((thread) => {
      const cached = getEmailThread(thread.id);
      const local = localMap.get(thread.id);
      const merged = mergeClassifications(thread.deterministic, local || cached?.localClassification);
      const interpretedFacts = interpretedFactsByThread.get(thread.id) || thread.structuredFacts;
      const record = {
        threadId: thread.id,
        source: thread.source,
        subject: thread.subject,
        fromAddress: thread.from,
        providerCategory: thread.providerCategory,
        providerLabels: thread.providerLabels,
        folder: thread.folder,
        receivedAt: thread.updatedAt,
        unread: thread.unread,
        starred: thread.starred,
        hasAttachments: thread.hasAttachments,
        relationshipScore: thread.relationshipScore,
        junkScore: thread.junkScore,
        significanceScore: merged.significanceScore,
        domain: merged.domain,
        threadType: merged.threadType,
        actionability: merged.actionability ?? thread.actionability,
        entities: merged.entities,
        structuredFacts: interpretedFacts,
        localClassification: merged.localClassification,
        classificationConfidence: merged.classificationConfidence,
        userParticipated: thread.userParticipated,
        messageCount: thread.messageCount,
        bodyHash: thread.bodyHash,
        updatedAt: thread.updatedAt,
      };
      upsertEmailThread(record);
      replaceEmailThreadFacts(
        thread.id,
        interpretedFacts.map((fact) => ({
          type: fact.type,
          key: fact.key,
          value: fact.value,
          confidence: fact.confidence,
        }))
      );
      return {
        ...thread,
        ...merged,
        structuredFacts: interpretedFacts,
        classificationConfidence: merged.classificationConfidence,
      };
    });

    if (preserve) {
      await preserveCorrespondenceThreads(finalThreads);
    }

    results.push(...finalThreads);
  }

  return {
    ok: true,
    processed: results.length,
    source: store.source || "local",
  };
}

function hasStrongTicketEvidence(threads, profile) {
  return threads.some((thread) => {
    const travelEvidence = computeTravelEvidenceScore(thread, profile);
    const facts = thread.structuredFacts || [];
    return (
      travelEvidence >= 0.55 &&
      facts.some((fact) => fact.type === "location") &&
      facts.some((fact) => fact.type === "date") &&
      (facts.some((fact) => fact.type === "reservation") || facts.some((fact) => fact.type === "time"))
    );
  });
}

function buildProviderSearchQuery(profile) {
  const terms = new Set(["ticket", "reservation", "itinerary", "confirmation"]);
  for (const location of profile.locations) terms.add(location);
  return [...terms].join(" OR ");
}

function buildProviderSearchQueries(profile) {
  const queries = [];
  const generic = ["ticket", "reservation", "itinerary", "confirmation", "booking", "admission"];
  queries.push(generic.join(" OR "));
  for (const location of profile.locations) {
    queries.push(`${location} ticket reservation itinerary`);
    queries.push(`${location} booking confirmation`);
    queries.push(`${location} visitor admission`);
  }
  queries.push("travel reservation hotel flight amtrak ferry museum visitor");
  return [...new Set(queries.map((item) => item.trim()).filter(Boolean))].slice(0, 10);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

module.exports = {
  backfillEmailIntelligence,
  retrieveIntelligentEmail,
  normalizeProviderMetadata,
  buildIntelligenceRecord,
  extractStructuredFacts,
  enrichFactsFromTrustedReservationLinks,
  interpretStructuredFactsLocally,
  computeRelationshipScore,
  computeJunkScore,
  computeSignificanceScore,
  buildProviderSearchQuery,
  buildProviderSearchQueries,
  buildQueryProfile,
};
