"use strict";
// Outlook Calendar connector — pulls events via Microsoft Graph API.
// Merges into calendar-context under source "outlook-calendar".

const { getAccessToken } = require("./microsoft-auth");
const { mergeCalendarEvents } = require("./calendar-context");

const BASE         = "https://graph.microsoft.com/v1.0/me";
const TIMEOUT      = Number(process.env.OUTLOOK_TIMEOUT_MS || 20000);
const HORIZON_DAYS = Number(process.env.OUTLOOK_CAL_HORIZON_DAYS || 14);
const MAX_RESULTS  = Number(process.env.OUTLOOK_CAL_MAX_RESULTS || 50);

async function msfetch(path, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: 'outlook.timezone="UTC"',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Graph Calendar API ${path} failed [${res.status}]: ${body}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeOutlookEvent(item) {
  const startAt = item.start?.dateTime ? new Date(`${item.start.dateTime}Z`).toISOString() : null;
  const endAt   = item.end?.dateTime   ? new Date(`${item.end.dateTime}Z`).toISOString()   : null;
  return {
    id:       item.id,
    title:    item.subject || "Untitled event",
    startAt,
    endAt,
    location: item.location?.displayName || null,
    notes:    item.bodyPreview || null,
    source:   "outlook-calendar",
  };
}

async function syncOutlookCalendar() {
  const token = await getAccessToken();

  const startDateTime = new Date().toISOString();
  const endDateTime   = new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString();

  const select = "id,subject,start,end,location,bodyPreview";
  const params = new URLSearchParams({
    startDateTime,
    endDateTime,
    $top: String(MAX_RESULTS),
    $select: select,
    $orderby: "start/dateTime",
  });

  const data = await msfetch(`/calendarView?${params}`, token);
  const events = (data.value || []).map(normalizeOutlookEvent).filter((e) => e.startAt);

  const result = mergeCalendarEvents(events, { source: "outlook-calendar" });
  console.log(`[outlook-cal-sync] imported ${result.added} events (${result.total} total in store)`);
  return result;
}

module.exports = { syncOutlookCalendar };
