"use strict";
// Apple Calendar live sync — reads real events from Apple Calendar via osascript.
// No API key. No external service. Reads directly from the calendar database.
//
// Call syncAppleCalendar() to pull events and write them into the connector store.
// The sandbox import API (POST /api/monday-sandbox/calendar) or a scheduled daemon
// job should call this on startup and periodically (every 30–60 min).
//
// Capability note: requires Calendar access permission for the process.
// On first run, macOS will prompt for permission — approve it in System Settings > Privacy.

const { exec } = require("node:child_process");
const { importCalendarEvents } = require("./calendar-context");

const DEFAULT_DAYS_AHEAD = 21;
const TIMEOUT_MS = 15000;

// AppleScript reads events from all calendars in the next N days.
// Output format: one event per line, pipe-delimited:
//   title|ISO-start|ISO-end|calendar-name|location
function buildScript(daysAhead) {
  return `
set outputLines to {}
set theStart to current date
set theEnd to current date
set day of theEnd to (day of theEnd) + ${daysAhead}

tell application "Calendar"
  repeat with aCal in calendars
    try
      set calEvents to (every event of aCal whose start date >= theStart and start date <= theEnd)
      repeat with anEvent in calEvents
        try
          set t to summary of anEvent
          set s to start date of anEvent
          set e to end date of anEvent
          set calName to name of aCal
          set loc to ""
          try
            set loc to location of anEvent
            if loc is missing value then set loc to ""
          end try
          set sStr to (year of s as string) & "-" & my pad2(month of s as integer) & "-" & my pad2(day of s) & "T" & my pad2(hours of s) & ":" & my pad2(minutes of s) & ":00"
          set eStr to (year of e as string) & "-" & my pad2(month of e as integer) & "-" & my pad2(day of e) & "T" & my pad2(hours of e) & ":" & my pad2(minutes of e) & ":00"
          set outputLines to outputLines & {t & "|" & sStr & "|" & eStr & "|" & calName & "|" & loc}
        end try
      end repeat
    end try
  end repeat
end tell

on pad2(n)
  set s to n as string
  if length of s < 2 then set s to "0" & s
  return s
end pad2

set AppleScript's text item delimiters to linefeed
return outputLines as string
`.trim();
}

function parseOutput(raw) {
  if (!raw || !raw.trim()) return [];

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|");
      if (parts.length < 4) return null;
      const [title, startAt, endAt, calendar, location] = parts;
      return {
        title: title || "Untitled",
        startAt: toIso(startAt),
        endAt: toIso(endAt),
        source: "apple-calendar",
        calendar: calendar || null,
        location: location && location !== "missing value" ? location : null,
      };
    })
    .filter((e) => e && e.startAt);
}

function toIso(s) {
  if (!s) return null;
  // Already in ISO-like format from AppleScript: YYYY-MM-DDTHH:MM:SS
  // Make it a real ISO 8601 string with local timezone
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Pull events from Apple Calendar and write them into the connector store.
 * @param {object} opts
 *   opts.daysAhead - how many days forward to fetch (default 21)
 * @returns {Promise<{ ok: boolean, count?: number, error?: string }>}
 */
async function syncAppleCalendar({ daysAhead = DEFAULT_DAYS_AHEAD } = {}) {
  const script = buildScript(daysAhead);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, error: "Apple Calendar sync timed out" });
    }, TIMEOUT_MS);

    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (err, stdout, stderr) => {
      clearTimeout(timer);

      if (err) {
        // Common cause: Calendar access not granted
        const denied = /not authorized|access denied|not allowed/i.test(err.message + stderr);
        resolve({
          ok: false,
          error: denied
            ? "Calendar access not granted. Allow in System Settings › Privacy & Security › Calendars."
            : err.message,
        });
        return;
      }

      const events = parseOutput(stdout);
      if (events.length === 0) {
        resolve({ ok: true, count: 0, source: "apple-calendar", note: "No upcoming events found" });
        return;
      }

      try {
        const store = importCalendarEvents(events, { source: "apple-calendar" });
        resolve({ ok: true, count: store.events.length, source: "apple-calendar" });
      } catch (importErr) {
        resolve({ ok: false, error: `Import failed: ${importErr.message}` });
      }
    });
  });
}

module.exports = { syncAppleCalendar };
