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

  if (unread.length > 5) patterns.push("inbox accumulating — needs attention");
  if (unread.length === 0) patterns.push("inbox is current");

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
