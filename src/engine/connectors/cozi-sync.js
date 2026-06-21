"use strict";
// Cozi iCal connector — fetches the family calendar via a public iCal feed URL.
// No auth required. Merges into calendar-context under source "cozi".

const { mergeCalendarEvents } = require("./calendar-context");

const COZI_ICAL_URL =
  process.env.COZI_ICAL_URL ||
  "https://rest.cozi.com/api/ext/1103/97b13a23-edc9-4c5f-9fa9-4ad4f6a3857a/icalendar/feed/feed.ics";

const TIMEOUT_MS = Number(process.env.COZI_TIMEOUT_MS || 15000);

// ── ICS parser ────────────────────────────────────────────────────────────────
// Handles line folding, parameter stripping, date formats:
//   YYYYMMDDTHHMMSSZ  (UTC)
//   YYYYMMDDTHHMMSS   (local / TZID param)
//   YYYYMMDD          (all-day)

function unfoldLines(raw) {
  return raw.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function parseIcsDate(val) {
  if (!val) return null;
  // Strip TZID= parameter prefix if present
  const bare = val.replace(/^[^:]+:/, "");
  // All-day: YYYYMMDD
  if (/^\d{8}$/.test(bare)) {
    return new Date(`${bare.slice(0, 4)}-${bare.slice(4, 6)}-${bare.slice(6, 8)}T00:00:00Z`).toISOString();
  }
  // DateTime: YYYYMMDDTHHMMSS[Z]
  const m = bare.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (m) {
    const [, y, mo, d, h, mi, s, z] = m;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z || ""}`;
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  return null;
}

function parseIcs(text) {
  const lines = unfoldLines(text).split(/\r?\n/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const keyPart = line.slice(0, colon).toUpperCase();
    const value = line.slice(colon + 1).trim();

    // Match key with or without parameters (e.g. DTSTART;TZID=America/New_York)
    const key = keyPart.split(";")[0];

    switch (key) {
      case "UID":         current.id = value; break;
      case "SUMMARY":    current.title = value.replace(/\\,/g, ",").replace(/\\n/g, " "); break;
      case "DTSTART":    current.startAt = parseIcsDate(line.slice(colon + 1).trim()); break;
      case "DTEND":      current.endAt = parseIcsDate(line.slice(colon + 1).trim()); break;
      case "LOCATION":   current.location = value.replace(/\\,/g, ","); break;
      case "DESCRIPTION": current.notes = value.replace(/\\n/g, "\n").replace(/\\,/g, ","); break;
    }
  }

  return events;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

async function syncCozi() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let text;
  try {
    const res = await fetch(COZI_ICAL_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`Cozi iCal fetch failed: ${res.status}`);
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const events = parseIcs(text);
  const result = mergeCalendarEvents(events, { source: "cozi" });
  console.log(`[cozi-sync] imported ${result.added} events (${result.total} total in store)`);
  return result;
}

module.exports = { syncCozi, parseIcs };
