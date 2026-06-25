"use strict";
// Skill Result Normalizer — converts raw connector output to observations + patterns.
// Monday thinks about observations. Not JSON.
//
// Every normalizer returns:
//   { observations: string[], patterns: string[], summary: string, confidence: number, source: string }

// ── Event classifiers ─────────────────────────────────────────────────────────

const WORK_KW = /meeting|standup|sync|interview|call|review|client|work|project|deadline|sprint|demo|presentation|conf|1:1|one.on.one/i;
const FAMILY_KW = /family|kids?|children|rebekah|anna|caleb|school|camp|church|wife|spouse|home|birthday|anniversary|grandkid/i;
const HEALTH_KW = /doctor|gym|workout|health|medical|dentist|therapy|run|exercise|appointment/i;

function isWork(title = "", notes = "") { return WORK_KW.test(title) || WORK_KW.test(notes); }
function isFamily(title = "", notes = "") { return FAMILY_KW.test(title) || FAMILY_KW.test(notes); }
function isHealth(title = "", notes = "") { return HEALTH_KW.test(title) || HEALTH_KW.test(notes); }

function formatDate(iso) {
  if (!iso) return "no date";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

const TRAVEL_KW = /\b(ticket|tickets|reservation|confirmation|itinerary|trip|travel|entry|admission|tour|visit|museum|philadelphia|washington|dc|new york|statue of liberty|ellis island)\b/i;

function extractTravelFacts(thread = {}) {
  const text = `${thread.subject || ""} ${thread.snippet || ""} ${thread.bodyText || ""}`.replace(/\s+/g, " ").trim();
  if (!TRAVEL_KW.test(text)) return null;

  const facts = [];
  const normalized = text;

  const dateMatches = normalized.match(/\b(?:mon|tues|wed|thu|fri|sat|sun)?\.?,?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?/gi)
    || normalized.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g)
    || [];
  const timeMatches = normalized.match(/\b\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)\b/g)
    || normalized.match(/\b\d{1,2}\s?(?:AM|PM|am|pm)\b/g)
    || [];
  const codeMatches = normalized.match(/\b(?:confirmation|conf(?:irmation)?|reservation|order|booking|ticket)\s*(?:number|#|no\.?)?\s*[:#]?\s*([A-Z0-9-]{5,})\b/gi) || [];

  const destinationPatterns = [
    /philadelphia/i,
    /washington,\s*dc|washington dc|\bdc\b/i,
    /statue of liberty/i,
    /ellis island/i,
    /new york/i,
  ];

  const destinations = destinationPatterns
    .filter((pattern) => pattern.test(normalized))
    .map((pattern) => {
      const raw = pattern.source.toLowerCase();
      if (raw.includes("philadelphia")) return "Philadelphia";
      if (raw.includes("statue of liberty")) return "Statue of Liberty";
      if (raw.includes("ellis")) return "Ellis Island";
      if (raw.includes("new york")) return "New York";
      return "Washington, DC";
    });

  if (destinations.length > 0) {
    facts.push(`ticket-related for ${[...new Set(destinations)].join(", ")}`);
  }
  if (dateMatches.length > 0) {
    facts.push(`date${dateMatches.length > 1 ? "s" : ""}: ${dateMatches.slice(0, 3).join(", ")}`);
  }
  if (timeMatches.length > 0) {
    facts.push(`time${timeMatches.length > 1 ? "s" : ""}: ${timeMatches.slice(0, 3).join(", ")}`);
  }
  if (codeMatches.length > 0) {
    facts.push(`confirmation details present`);
  }

  return facts.length > 0
    ? {
        subject: thread.subject || "Travel email",
        facts,
      }
    : {
        subject: thread.subject || "Travel email",
        facts: ["travel-related ticket or itinerary email found"],
      };
}

// ── Per-skill normalizers ─────────────────────────────────────────────────────

function normalizeCalendar(raw) {
  const events = raw?.data || [];
  const observations = [];
  const patterns = [];

  if (events.length === 0) {
    observations.push("No upcoming calendar events found");
    return { observations, patterns, summary: "Calendar is clear", confidence: 0.95, source: "calendar" };
  }

  const work = events.filter((e) => isWork(e.title, e.notes));
  const family = events.filter((e) => isFamily(e.title, e.notes));
  const health = events.filter((e) => isHealth(e.title, e.notes));
  const other = events.filter((e) => !isWork(e.title, e.notes) && !isFamily(e.title, e.notes) && !isHealth(e.title, e.notes));

  observations.push(`${events.length} calendar event${events.length !== 1 ? "s" : ""} found`);
  if (work.length > 0) observations.push(`${work.length} work-related`);
  if (family.length > 0) observations.push(`${family.length} family`);
  if (health.length > 0) observations.push(`${health.length} health/personal`);
  if (other.length > 0) observations.push(`${other.length} other`);

  // Specific events
  for (const e of events.slice(0, 6)) {
    observations.push(`"${e.title || "Untitled"}" — ${formatDate(e.startAt)}`);
  }

  // Pattern detection
  if (work.length > 0 && family.length === 0) patterns.push("calendar dominated by work — no family events");
  if (family.length > 0 && family.length >= work.length) patterns.push("family-prioritized week");
  if (events.length >= 6) patterns.push("heavy schedule this period");
  if (events.length === 0) patterns.push("unusually clear calendar");

  const summary = events.slice(0, 4).map((e) => `${e.title || "Untitled"} (${formatDate(e.startAt)})`).join("; ");

  return { observations, patterns, summary, confidence: 0.94, source: "calendar" };
}

function normalizeEmail(raw) {
  const threads = raw?.data || [];
  const observations = [];
  const patterns = [];

  if (threads.length === 0) {
    observations.push("No email threads found");
    return { observations, patterns, summary: "Inbox appears empty", confidence: 0.90, source: "email" };
  }

  const unread = threads.filter((t) => t.unread);
  const starred = threads.filter((t) => t.starred);

  observations.push(`${threads.length} email thread${threads.length !== 1 ? "s" : ""} found`);
  if (unread.length > 0) observations.push(`${unread.length} unread`);
  if (starred.length > 0) observations.push(`${starred.length} starred`);
  if (raw?.unreadCount > 0) observations.push(`${raw.unreadCount} total unread`);

  for (const t of threads.slice(0, 5)) {
    observations.push(`"${t.subject || "No subject"}" from ${t.from || "unknown"}${t.unread ? " [unread]" : ""}`);
  }

  const routed = threads.filter((thread) => thread.threadType || thread.domain || thread.providerCategory);
  for (const t of routed.slice(0, 5)) {
    const parts = [];
    if (t.threadType) parts.push(`type: ${t.threadType}`);
    if (t.domain) parts.push(`domain: ${t.domain}`);
    if (typeof t.significanceScore === "number") parts.push(`significance ${Math.round(t.significanceScore * 100)}%`);
    if (typeof t.junkScore === "number") parts.push(`junk ${Math.round(t.junkScore * 100)}%`);
    if (parts.length > 0) observations.push(`Email intelligence: "${t.subject || "No subject"}" — ${parts.join("; ")}`);
  }

  const travelFacts = threads
    .map(extractTravelFacts)
    .filter(Boolean)
    .slice(0, 5);

  for (const fact of travelFacts) {
    observations.push(`Travel email: "${fact.subject}" — ${fact.facts.join("; ")}`);
  }

  for (const thread of threads.slice(0, 5)) {
    for (const fact of thread.structuredFacts || []) {
      if (fact.type === "date" || fact.type === "time" || fact.type === "location" || fact.type === "reservation" || fact.type === "entry_instruction") {
        observations.push(`Extracted ${fact.type}: ${fact.value}`);
      }
    }
  }

  if (unread.length > 5) patterns.push("inbox accumulating — needs attention");
  if (unread.length === 0) patterns.push("inbox is current");
  if (travelFacts.length > 0) patterns.push("ticket or itinerary details present in email");
  if (raw?.usedIntelligence) patterns.push("local email intelligence funnel used before cloud response");
  if (threads.some((thread) => thread.threadType === "junk" || thread.providerCategory === "promotions")) {
    patterns.push("promotional or junk email filtered down before answer");
  }

  const summary = threads.slice(0, 3).map((t) => `"${t.subject}" from ${t.from}`).join("; ");

  return { observations, patterns, summary, confidence: 0.91, source: "email" };
}

function normalizeFinancial(raw) {
  const { accounts = [], transactions = [], summary: fin = {} } = raw?.data || {};
  const observations = [];
  const patterns = [];

  if (accounts.length > 0) {
    const total = accounts.reduce((s, a) => s + (a.balance || 0), 0);
    observations.push(`${accounts.length} account${accounts.length !== 1 ? "s" : ""} on file`);
    observations.push(`Combined balance: $${total.toLocaleString()}`);

    for (const a of accounts) {
      observations.push(`${a.name} (${a.type}): $${(a.balance || 0).toLocaleString()}`);
      if (a.watchLabel) observations.push(`  Watch note: ${a.watchLabel}`);
    }

    if (total < 2000) patterns.push("total liquid balance is low — may warrant attention");
  }

  if (transactions.length > 0) {
    observations.push(`${transactions.length} recent transaction${transactions.length !== 1 ? "s" : ""}`);
  }

  const summary = accounts.length > 0
    ? accounts.map((a) => `${a.name}: $${(a.balance || 0).toLocaleString()}`).join("; ")
    : "No account data";

  return { observations, patterns, summary, confidence: 0.92, source: "financial" };
}

function normalizeDocuments(raw) {
  const docs = raw?.data || [];
  const observations = [];
  const patterns = [];

  if (docs.length === 0) {
    observations.push("No matching documents found");
    return { observations, patterns, summary: "No documents found", confidence: 0.80, source: "documents" };
  }

  observations.push(`${docs.length} document${docs.length !== 1 ? "s" : ""} found`);
  for (const d of docs.slice(0, 5)) {
    observations.push(`"${d.title}": ${d.summary || d.excerpt || "no summary"}`);
  }

  const summary = docs.slice(0, 3).map((d) => `"${d.title}"`).join(", ");

  return { observations, patterns, summary, confidence: 0.85, source: "documents" };
}

function normalizeWebFetch(raw) {
  const text = raw?.data || "";
  const observations = [];

  if (!text) {
    observations.push("No content retrieved from URL");
    return { observations, patterns: [], summary: "", confidence: 0.50, source: "web" };
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  observations.push(`${wordCount} words retrieved from ${raw?.url || "page"}`);

  const preview = text.slice(0, 300).replace(/\s+/g, " ").trim();
  observations.push(`Preview: ${preview}…`);

  return { observations, patterns: [], summary: preview, confidence: raw?.ok ? 0.80 : 0.30, source: "web" };
}

function normalizeBrowserSearch(raw) {
  const results = raw?.data || [];
  const observations = [];
  const patterns = [];

  if (!raw?.ok || results.length === 0) {
    observations.push(`Web search returned no results for: "${raw?.query || "unknown query"}"`);
    return { observations, patterns, summary: "No results found", confidence: 0.40, source: "browser-search" };
  }

  observations.push(`${results.length} web result${results.length !== 1 ? "s" : ""} for: "${raw.query}"`);

  for (const r of results.slice(0, 6)) {
    const line = `"${r.title}" — ${r.url}`;
    observations.push(r.snippet ? `${line}: ${r.snippet.slice(0, 120)}` : line);
  }

  // Light pattern detection on snippet text
  const allText = results.map((r) => r.snippet || "").join(" ").toLowerCase();
  if (/controversy|debate|criticism|problem|concern/i.test(allText)) patterns.push("web results surface controversy or concern");
  if (/new|recent|latest|announce|launch|release/i.test(allText)) patterns.push("recent developments found");
  if (results.length >= 6) patterns.push("substantial coverage on this topic");

  const summary = results.slice(0, 3).map((r) => `"${r.title}"`).join("; ");

  return { observations, patterns, summary, confidence: 0.82, source: "browser-search" };
}

function normalizeBrowserRead(raw) {
  const observations = [];

  if (!raw?.ok || !raw?.data) {
    observations.push(`Could not read: ${raw?.url || "unknown URL"}`);
    return { observations, patterns: [], summary: "", confidence: 0.30, source: "browser-read" };
  }

  const title = raw.title ? `"${raw.title}"` : raw.url;
  observations.push(`Read ${title} — ${raw.wordCount || 0} words${raw.truncated ? " (truncated)" : ""}`);

  const preview = raw.data.slice(0, 400).replace(/\s+/g, " ").trim();
  if (preview) observations.push(`Content: ${preview}…`);

  return {
    observations,
    patterns: [],
    summary: preview.slice(0, 200),
    confidence: raw.ok ? 0.82 : 0.30,
    source: "browser-read",
  };
}

function normalizeLlm(raw, source) {
  const text = raw?.data || "";
  return {
    observations: text ? [text.slice(0, 400)] : ["No result generated"],
    patterns: [],
    summary: text.slice(0, 200),
    confidence: text ? 0.88 : 0.30,
    source,
  };
}

function normalizeTravelPlan(raw) {
  const data = raw?.data || {};
  const observations = [];
  const patterns = [];

  if (data.missionRead) observations.push(`Travel mission read: ${data.missionRead}`);
  if (data.noDirectTicketEvidence) {
    observations.push("No direct ticket evidence was confirmed in reachable email results.");
    patterns.push("trip planning is falling back to calendar constraints and partial confirmations");
  }
  if (Array.isArray(data.confirmedItems) && data.confirmedItems.length > 0) {
    for (const item of data.confirmedItems.slice(0, 8)) observations.push(`Confirmed: ${item}`);
    patterns.push("trip planning has confirmed reservation evidence");
  }
  if (Array.isArray(data.missingItems) && data.missingItems.length > 0) {
    for (const item of data.missingItems.slice(0, 5)) observations.push(`Missing: ${item}`);
  }
  if (Array.isArray(data.plan) && data.plan.length > 0) {
    observations.push(`${data.plan.length} travel day${data.plan.length === 1 ? "" : "s"} sequenced`);
    for (const day of data.plan.slice(0, 4)) {
      observations.push(`${day.day}: ${day.summary}`);
    }
    patterns.push("trip plan organized into day-by-day execution");
  }
  if (Array.isArray(data.risks) && data.risks.length > 0) {
    for (const item of data.risks.slice(0, 4)) observations.push(`Risk: ${item}`);
  }
  if (Array.isArray(data.contingencies) && data.contingencies.length > 0) {
    patterns.push("contingencies prepared for travel gaps");
  }

  return {
    observations,
    patterns,
    summary: data.missionRead || "Travel plan assembled",
    confidence: data.confidence === "high" ? 0.93 : data.confidence === "medium" ? 0.78 : 0.6,
    source: "travel-plan",
  };
}

function normalizeScienceAdvisor(raw) {
  const data = raw?.data || {};
  const observations = [];
  const patterns = [];

  if (data.mode) observations.push(`Scientific mode: ${data.mode}`);
  if (data.confidence) observations.push(`Scientific confidence: ${data.confidence}`);
  if (data.reply) observations.push(`Reed advisory: ${String(data.reply).slice(0, 240)}`);

  const sources = Array.isArray(data.sources) ? data.sources : [];
  if (sources.length > 0) {
    observations.push(`${sources.length} scientific source${sources.length === 1 ? "" : "s"} gathered`);
    for (const source of sources.slice(0, 4)) {
      observations.push(`[${source.label}] ${source.title} — ${source.url}`);
    }
    patterns.push("scientific response grounded in gathered sources");
  }

  if (data.mode === "thermo_fisher") {
    patterns.push("thermo fisher scientific mode activated");
  }

  return {
    observations,
    patterns,
    summary: data.reply ? String(data.reply).slice(0, 200) : "Scientific advisory returned",
    confidence:
      data.confidence === "high" ? 0.92 : data.confidence === "medium" ? 0.78 : 0.58,
    source: "science-advisor",
  };
}

function normalizeDefault(raw, skillId) {
  return {
    observations: [`${skillId} returned data`],
    patterns: [],
    summary: JSON.stringify(raw).slice(0, 200),
    confidence: 0.70,
    source: skillId,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

const NORMALIZERS = {
  "calendar-read":   normalizeCalendar,
  "email-read":      normalizeEmail,
  "financial-read":  normalizeFinancial,
  "documents-read":  normalizeDocuments,
  "web-fetch":       normalizeWebFetch,
  "browser-search":  normalizeBrowserSearch,
  "browser-read":    normalizeBrowserRead,
  "travel-plan":     normalizeTravelPlan,
  "science-advisor": normalizeScienceAdvisor,
  "summarize":       (r) => normalizeLlm(r, "summarize"),
  "draft-reply":     (r) => normalizeLlm(r, "draft-reply"),
};

function normalizeSkillResult(skillId, rawResult) {
  const fn = NORMALIZERS[skillId];
  if (!fn) return normalizeDefault(rawResult, skillId);
  try {
    return fn(rawResult);
  } catch {
    return normalizeDefault(rawResult, skillId);
  }
}

module.exports = { normalizeSkillResult };
