const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function ensureDataDir() {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

function getDataDir() {
  return path.resolve(
    process.env.MONDAY_CONNECTORS_DATA_DIR ||
      path.resolve(__dirname, "../../../data/connectors")
  );
}

function getCalendarPath() {
  return path.join(getDataDir(), "calendar-events.json");
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function defaultStore() {
  return {
    updatedAt: null,
    source: "manual",
    events: [],
  };
}

function readCalendarStore() {
  ensureDataDir();
  return readJson(getCalendarPath(), defaultStore());
}

function writeCalendarStore(store) {
  ensureDataDir();
  writeJson(getCalendarPath(), {
    ...defaultStore(),
    ...store,
    updatedAt: new Date().toISOString(),
  });
}

function normalizeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeEvent(event = {}) {
  const startAt = normalizeIso(event.startAt || event.start || event.startsAt);
  const endAt = normalizeIso(event.endAt || event.end || event.endsAt);

  return {
    id: event.id || crypto.randomUUID(),
    title: String(event.title || event.summary || event.name || "Untitled event"),
    startAt,
    endAt,
    location: event.location ? String(event.location) : null,
    notes: event.notes ? String(event.notes) : null,
    source: event.source ? String(event.source) : "manual",
  };
}

function importCalendarEvents(events = [], options = {}) {
  const normalized = (events || [])
    .map(normalizeEvent)
    .filter((event) => event.startAt)
    .sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));

  const store = {
    source: options.source || "manual",
    events: normalized,
  };

  writeCalendarStore(store);
  return store;
}

function clearCalendarEvents() {
  writeCalendarStore(defaultStore());
}

function getUpcomingEvents({
  from = new Date(),
  horizonHours = 36,
  limit = 8,
} = {}) {
  const fromTime = new Date(from).getTime();
  const horizonTime = fromTime + horizonHours * 60 * 60 * 1000;

  return readCalendarStore().events
    .filter((event) => {
      const start = Date.parse(event.startAt);
      return !Number.isNaN(start) && start >= fromTime && start <= horizonTime;
    })
    .sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt))
    .slice(0, limit);
}

function getCalendarSummary(options = {}) {
  const store = readCalendarStore();
  const upcomingEvents = getUpcomingEvents(options);

  return {
    updatedAt: store.updatedAt,
    source: store.source || "manual",
    totalEvents: store.events.length,
    upcomingEvents,
    nextEvent: upcomingEvents[0] || null,
  };
}

// Merge events from one source into the store without clobbering other sources.
// Removes all existing events tagged source === options.source, then adds the new ones.
function mergeCalendarEvents(events = [], options = {}) {
  const source = options.source || "manual";
  const store = readCalendarStore();

  const kept = store.events.filter((e) => e.source !== source);
  const incoming = (events || [])
    .map((e) => normalizeEvent({ ...e, source }))
    .filter((e) => e.startAt);

  const merged = [...kept, ...incoming].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)
  );

  const sources = [...new Set(merged.map((e) => e.source))];
  writeCalendarStore({ source: sources.length === 1 ? sources[0] : "multi", events: merged });
  return { source, added: incoming.length, total: merged.length };
}

module.exports = {
  clearCalendarEvents,
  getCalendarSummary,
  getUpcomingEvents,
  importCalendarEvents,
  mergeCalendarEvents,
  readCalendarStore,
  getDataDir,
};
