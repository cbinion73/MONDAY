"use strict";
// Skills Registry — closed allowlist of every skill Monday may invoke.
// New skills must be added here by a developer. There is no dynamic install
// from external sources. This file IS the hard trust gate.
//
// Autonomy tiers (Observe → Synthesize → Recommend → Execute doctrine):
//   0 = think    — observe only, no visible action, no external effects
//   1 = research — read and surface data automatically; log every invocation
//   2 = prepare  — open/stage actions with no external effects; recommend first, user confirms
//   3 = send     — send/notify/book; requires standing authority per workspace
//   4 = autonomous — approved domains only; never the default

const SKILLS = {
  // ── Data connectors (tier 1 — act and notify) ───────────────────────────────

  "calendar-read": {
    id: "calendar-read",
    name: "Calendar Read",
    description: "Read upcoming calendar events from the connected calendar store.",
    category: "data",
    autonomyTier: 1,
    trusted: true,
    inputs: { limit: "number (optional, default 10)", after: "ISO date string (optional)" },
    outputs: "Array of calendar events with id, title, startAt, location, notes",
  },

  "documents-read": {
    id: "documents-read",
    name: "Documents Read",
    description: "Read personal documents and notes. Can filter by domain or search term.",
    category: "data",
    autonomyTier: 1,
    trusted: true,
    inputs: { query: "string (optional)", missionId: "string (optional)", limit: "number (optional)" },
    outputs: "Array of documents with title, summary, excerpt",
  },

  "email-read": {
    id: "email-read",
    name: "Email Read",
    description: "Read and rank relevant email threads locally using provider metadata, heuristic scoring, and local classification before Monday answers.",
    category: "data",
    autonomyTier: 1,
    trusted: true,
    inputs: { limit: "number (optional)", missionId: "string (optional)", unreadOnly: "boolean (optional)", query: "string (optional)" },
    outputs: "Array of relevant email threads with local intelligence metadata and extracted facts",
  },

  "travel-plan": {
    id: "travel-plan",
    name: "Travel Plan",
    description: "Build a travel itinerary from local email intelligence, calendar constraints, and Nick Fury travel coordination.",
    category: "data",
    autonomyTier: 1,
    trusted: true,
    inputs: { query: "string (required)" },
    outputs: "Structured trip plan with confirmed items, missing items, risks, and contingencies",
  },

  "financial-read": {
    id: "financial-read",
    name: "Financial Read",
    description: "Read account balances and financial summary. No transactions by default.",
    category: "data",
    autonomyTier: 1,
    trusted: true,
    inputs: { section: "'accounts' | 'transactions' | 'summary' | 'all' (optional, default 'all')" },
    outputs: "Financial data object with accounts, transactions, and summary",
  },

  // ── Research (tier 1 — auto-run, logged) ─────────────────────────────────────

  "web-fetch": {
    id: "web-fetch",
    name: "Web Fetch",
    description: "Fetch and extract plain text from a URL for research. Strips HTML, returns first N chars.",
    category: "research",
    autonomyTier: 1,
    trusted: true,
    inputs: { url: "string (required)", maxChars: "number (optional, default 3000)" },
    outputs: "Extracted text content from the page",
  },

  "browser-search": {
    id: "browser-search",
    name: "Browser Search",
    description: "Search the web via DuckDuckGo. Returns titles, URLs, and snippets. No API key required. Fires automatically when research intent is detected.",
    category: "research",
    autonomyTier: 1,
    trusted: true,
    inputs: { query: "string (required)", limit: "number (optional, default 8)" },
    outputs: "Array of { title, url, snippet } search results",
  },

  "browser-read": {
    id: "browser-read",
    name: "Browser Read",
    description: "Fetch a URL and extract its readable text content. More structured than web-fetch — returns title, wordCount, and truncation flag.",
    category: "research",
    autonomyTier: 1,
    trusted: true,
    inputs: { url: "string (required)", maxChars: "number (optional, default 4000)" },
    outputs: "{ title, data, wordCount, truncated, url }",
  },

  // ── Prepare (tier 2 — recommend first, user confirms) ────────────────────────

  "browser-open": {
    id: "browser-open",
    name: "Browser Open",
    description: "Open a URL in the default browser. Tier 2: Monday surfaces a recommendation card — never auto-opens. User confirms before execution.",
    category: "prepare",
    autonomyTier: 2,
    trusted: true,
    inputs: { url: "string (required)" },
    outputs: "{ ok, url, opened }",
  },

  "summarize": {
    id: "summarize",
    name: "Summarize",
    description: "Summarize a body of text into key points using Monday's intelligence layer.",
    category: "intelligence",
    autonomyTier: 1,
    trusted: true,
    inputs: { text: "string (required)", style: "'bullets' | 'paragraph' | 'brief' (optional, default 'bullets')" },
    outputs: "Summarized text",
  },

  // ── Communication (tier 3 — requires standing authority) ──────────────────

  "draft-reply": {
    id: "draft-reply",
    name: "Draft Reply",
    description: "Draft a reply to a message or email in Monday's voice. Returns draft only — does not send.",
    category: "communication",
    autonomyTier: 2,
    trusted: true,
    inputs: { originalMessage: "string (required)", context: "string (optional background)" },
    outputs: "Draft reply text",
  },

  "send-imessage": {
    id: "send-imessage",
    name: "Send iMessage",
    description: "Send an iMessage to an approved recipient via AppleScript. Requires MONDAY_IMESSAGE_PHONE env or explicit phone param.",
    category: "communication",
    autonomyTier: 3,
    trusted: true,
    inputs: { message: "string (required)", phone: "string (optional, overrides MONDAY_IMESSAGE_PHONE)" },
    outputs: "Delivery status { ok, error? }",
  },

  "notification-send": {
    id: "notification-send",
    name: "Send Notification",
    description: "Send a macOS system notification. Tier 3: requires standing authority. Never auto-fires — used for proactive alerts when explicitly authorized.",
    category: "communication",
    autonomyTier: 3,
    trusted: true,
    inputs: { title: "string (required)", message: "string (required)", subtitle: "string (optional)" },
    outputs: "Delivery status { ok, delivered, error? }",
  },
};

const CATEGORY_ORDER = ["data", "research", "prepare", "intelligence", "communication"];

function getSkill(id) {
  return SKILLS[id] || null;
}

function getAllSkills() {
  return Object.values(SKILLS).sort((a, b) => {
    const ci = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    return ci !== 0 ? ci : a.id.localeCompare(b.id);
  });
}

function isSkillTrusted(id) {
  const skill = SKILLS[id];
  return skill ? skill.trusted === true : false;
}

function getSkillsByCategory() {
  const groups = {};
  for (const skill of getAllSkills()) {
    if (!groups[skill.category]) groups[skill.category] = [];
    groups[skill.category].push(skill);
  }
  return groups;
}

module.exports = { SKILLS, getSkill, getAllSkills, isSkillTrusted, getSkillsByCategory };
