"use strict";
// Google Calendar connector — pulls events from the primary calendar.
// Uses the same OAuth2 refresh token as Gmail.
// Merges into calendar-context under source "google-calendar".

const { getAccessToken } = require("./google-auth");
const { mergeCalendarEvents } = require("./calendar-context");

const BASE    = "https://www.googleapis.com/calendar/v3";
const TIMEOUT = Number(process.env.GCAL_TIMEOUT_MS || 20000);
const HORIZON_DAYS = Number(process.env.GCAL_HORIZON_DAYS || 14);
const MAX_RESULTS  = Number(process.env.GCAL_MAX_RESULTS || 50);

async function gcalFetch(path, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Calendar API ${path} failed [${res.status}]: ${body}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeGCalEvent(item) {
  const startAt = item.start?.dateTime || (item.start?.date ? `${item.start.date}T00:00:00Z` : null);
  const endAt   = item.end?.dateTime   || (item.end?.date   ? `${item.end.date}T00:00:00Z`   : null);
  return {
    id:       item.id,
    title:    item.summary || "Untitled event",
    startAt,
    endAt,
    location: item.location || null,
    notes:    item.description || null,
    source:   "google-calendar",
  };
}

async function syncGoogleCalendar({ calendarId = "primary" } = {}) {
  const token = await getAccessToken();

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: String(MAX_RESULTS),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const data = await gcalFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`, token);
  const events = (data.items || []).map(normalizeGCalEvent).filter((e) => e.startAt);

  const result = mergeCalendarEvents(events, { source: "google-calendar" });
  console.log(`[gcal-sync] imported ${result.added} events (${result.total} total in store)`);
  return result;
}

module.exports = { syncGoogleCalendar };
