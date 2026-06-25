"use strict";
// Intent Detector — rule-based mapping from user input to skill invocations.
// No LLM call. Fast. Deterministic. Rule-first, always.
//
// Each rule has a baseConfidence. Each additional pattern match adds 0.03 (capped 0.98).
// Skills below CONFIDENCE_THRESHOLD are not invoked.

const CONFIDENCE_THRESHOLD = 0.65;

const INTENT_RULES = [
  // ── Travel Planning ───────────────────────────────────────────────────────
  {
    skillId: "travel-plan",
    reason: "the question asks Monday to build a trip plan from reservations, tickets, and calendar constraints",
    baseConfidence: 0.96,
    params: (input) => ({ query: input.trim(), expedited: /\b(quickly|right now|asap|urgent|urgently|immediately|fast|expedite|rush)\b/i.test(input) }),
    patterns: [
      /\bplan\b.*\btrip\b/i,
      /\btravel\b.*\bplan\b/i,
      /\btickets?\b.*\bemail\b/i,
      /\bitinerary\b/i,
      /\breservation\b/i,
      /\bphiladelphia\b/i,
      /\bstatue of liberty\b/i,
      /\bwashington(?:,?\s*dc)?\b/i,
    ],
  },

  // ── Calendar ───────────────────────────────────────────────────────────────
  {
    skillId: "calendar-read",
    reason: "the question depends on real-time scheduling data",
    baseConfidence: 0.92,
    params: () => ({}),
    patterns: [
      /\bcalendar\b/i,
      /\bschedule\b/i,
      /\bmeeting\b/i,
      /\bappointment\b/i,
      /\bevent\b/i,
      /\btoday\b/i,
      /\btomorrow\b/i,
      /\bthis week\b/i,
      /\bnext week\b/i,
      /what.{0,20}(on|coming up|planned)/i,
      /\b(calendar|schedule|meetings?)\b.{0,20}\b(graph|chart|dashboard|show|display)\b/i,
    ],
  },

  // ── Email ──────────────────────────────────────────────────────────────────
  {
    skillId: "email-read",
    reason: "the question requires checking current email or messages",
    baseConfidence: 0.90,
    params: (input) => ({ query: input.trim() }),
    patterns: [
      /\bemail\b/i,
      /\bemails\b/i,
      /\binbox\b/i,
      /\bunread\b/i,
      /\bmail\b/i,
      /\bmessages?\b/i,
      /\bthreads?\b/i,
      /\bheard from\b/i,
      /\breplied\b/i,
      /\bwaiting.*response\b/i,
      /\b(email|inbox|messages?|threads?)\b.{0,20}\b(graph|chart|dashboard|show|display)\b/i,
    ],
  },

  // ── Financial ─────────────────────────────────────────────────────────────
  {
    skillId: "financial-read",
    reason: "the question involves financial data or account balances",
    baseConfidence: 0.88,
    params: (input) => {
      if (/transaction|spending|spent|charge/i.test(input)) return { section: "transactions" };
      if (/account|balance|checking|saving/i.test(input)) return { section: "accounts" };
      return { section: "all" };
    },
    patterns: [
      /\bfinances?\b/i,
      /\bmoney\b/i,
      /\bbalance\b/i,
      /\baccounts?\b/i,
      /\bbudget\b/i,
      /\bspend\b|\bspent\b|\bspending\b/i,
      /\bsavings?\b/i,
      /\binvestment\b/i,
      /\bnet worth\b/i,
      /\bbrokerage\b/i,
      /\b(finances?|spending|budget|accounts?|money|net worth)\b.{0,20}\b(graph|chart|dashboard|show|display)\b/i,
    ],
  },

  // ── Browser Search ────────────────────────────────────────────────────────
  {
    skillId: "browser-search",
    reason: "the question requires current information from the web",
    baseConfidence: 0.85,
    params: (input) => {
      const query = extractSearchQuery(input) || extractTopicQuery(input) || input.trim().slice(0, 100);
      return { query };
    },
    patterns: [
      /\bsearch\b.*\bfor\b/i,
      /\blook\s*up\b/i,
      /\bfind\b.*\bonline\b/i,
      /\bresearch\b/i,
      /\bwhat do people say\b/i,
      /\blatest\b.*\bon\b/i,
      /\bcurrent.{0,20}info\b/i,
      /\bweb search\b/i,
      /\bgoogle\b/i,
      /\bwhat.{0,20}internet\b/i,
    ],
  },

  // ── Browser Read ──────────────────────────────────────────────────────────
  {
    skillId: "browser-read",
    reason: "the input references a URL to read and summarize",
    baseConfidence: 0.90,
    params: (input) => {
      const url = extractUrl(input);
      return url ? { url } : {};
    },
    patterns: [
      /https?:\/\/[^\s]+/i,
      /\bread.*\burl\b/i,
      /\bsummarize.*https?:\/\//i,
    ],
  },

  // ── Science / Baxter Building ─────────────────────────────────────────────
  {
    skillId: "science-advisor",
    reason: "the question is scientific, technical, medical, laboratory, or research-oriented and should be routed to Reed Richards in the Baxter Building",
    baseConfidence: 0.94,
    params: (input) => ({ query: input.trim() }),
    patterns: [
      /\bscience\b/i,
      /\bscientific\b/i,
      /\bresearch\b/i,
      /\bstudy\b/i,
      /\bpaper\b/i,
      /\bhplc\b/i,
      /\blc-?ms\b/i,
      /\bgc-?ms\b/i,
      /\bchromatograph(?:y|ic)\b/i,
      /\bmass spectrom(?:etry|eter)\b/i,
      /\bsequencing\b/i,
      /\bngs\b/i,
      /\bpcr\b/i,
      /\bqpcr\b/i,
      /\bgenomics?\b/i,
      /\bproteomics?\b/i,
      /\bbiology\b/i,
      /\bchemistry\b/i,
      /\bphysics\b/i,
      /\bmedicine\b/i,
      /\bmedical\b/i,
      /\bbiotech\b/i,
      /\blab(?:oratory)?\b/i,
      /\bassay\b/i,
      /\binstrument(?:ation)?\b/i,
      /\bthermo fisher\b/i,
      /\bfisher scientific\b/i,
      /\bapplied biosystems\b/i,
      /\bion torrent\b/i,
      /\bquantstudio\b/i,
    ],
  },

  // ── Documents ─────────────────────────────────────────────────────────────
  {
    skillId: "documents-read",
    reason: "the question may reference personal notes or documents",
    baseConfidence: 0.74,
    params: (input) => {
      const query = extractSearchQuery(input);
      return query ? { query } : {};
    },
    patterns: [
      /\bdocument\b/i,
      /\bnotes?\b/i,
      /\bfile\b/i,
      /\bwrote\b/i,
      /\bdraft\b/i,
      /what.*wrote/i,
      /\bsaved\b/i,
      /my (plan|notes|doc)/i,
      /\b(notes?|documents?|files?|medical record)\b.{0,20}\b(graph|chart|dashboard|show|display)\b/i,
      /\bmedical record\b/i,
    ],
  },
];

function detectIntents(input) {
  if (!input || typeof input !== "string") return [];
  const text = input.trim();

  const raw = [];
  for (const rule of INTENT_RULES) {
    const hits = rule.patterns.filter((p) => p.test(text));
    if (hits.length === 0) continue;

    const confidence = Math.min(0.98, rule.baseConfidence + (hits.length - 1) * 0.03);
    if (confidence < CONFIDENCE_THRESHOLD) continue;

    raw.push({
      skillId: rule.skillId,
      params: rule.params(text),
      reason: rule.reason,
      confidence,
      matchCount: hits.length,
      source: "rule",
    });
  }

  // Deduplicate — highest confidence wins per skillId
  const seen = new Set();
  let ranked = raw
    .sort((a, b) => b.confidence - a.confidence)
    .filter((d) => {
      if (seen.has(d.skillId)) return false;
      seen.add(d.skillId);
      return true;
    });

  if (ranked.some((intent) => intent.skillId === "travel-plan")) {
    ranked = ranked.filter((intent) => !["calendar-read", "email-read"].includes(intent.skillId));
  }

  return ranked;
}

function hasAnyIntents(input) {
  return detectIntents(input).length > 0;
}

function extractSearchQuery(input) {
  const m = input.match(/(?:about|on|for|regarding)\s+["']?([a-z0-9 ]{3,40})["']?/i);
  return m ? m[1].trim() : null;
}

function extractTopicQuery(input) {
  const m = input.match(/(?:search|look up|research|google|find)\s+(?:for\s+)?["']?([a-z0-9 ]{3,60})["']?/i);
  return m ? m[1].trim() : null;
}

function extractUrl(input) {
  const m = input.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}

module.exports = { detectIntents, hasAnyIntents, CONFIDENCE_THRESHOLD };
