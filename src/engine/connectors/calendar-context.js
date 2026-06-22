const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const SOURCE_PRIORITY = Object.freeze({
  "google-calendar": 5,
  "outlook-calendar": 4,
  "apple-calendar": 3,
  cozi: 2,
  manual: 1,
  test: 1,
});

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
  const source = event.source ? String(event.source) : "manual";

  return {
    id: event.id || crypto.randomUUID(),
    title: String(event.title || event.summary || event.name || "Untitled event"),
    startAt,
    endAt,
    location: event.location ? String(event.location) : null,
    notes: event.notes ? String(event.notes) : null,
    source,
    sources: Array.isArray(event.sources) && event.sources.length
      ? [...new Set(event.sources.map(String))]
      : [source],
  };
}

function normalizeComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceRank(source) {
  return SOURCE_PRIORITY[source] || 0;
}

function eventIdentityKey(event) {
  return [
    normalizeComparableText(event.title),
    event.startAt || "",
    event.endAt || "",
  ].join("|");
}

function locationsCompatible(left, right) {
  const a = normalizeComparableText(left.location);
  const b = normalizeComparableText(right.location);
  return !a || !b || a === b;
}

function choosePrimaryEvent(left, right) {
  const leftRank = sourceRank(left.source);
  const rightRank = sourceRank(right.source);
  if (rightRank > leftRank) return right;
  if (leftRank > rightRank) return left;

  const leftNotes = (left.notes || "").length;
  const rightNotes = (right.notes || "").length;
  if (rightNotes > leftNotes) return right;
  return left;
}

function mergeDuplicateEvent(left, right) {
  const primary = choosePrimaryEvent(left, right);
  const secondary = primary === left ? right : left;

  return {
    ...primary,
    id: primary.id || secondary.id,
    title: primary.title || secondary.title,
    startAt: primary.startAt || secondary.startAt,
    endAt: primary.endAt || secondary.endAt,
    location: primary.location || secondary.location || null,
    notes:
      (primary.notes || "").length >= (secondary.notes || "").length
        ? (primary.notes || secondary.notes || null)
        : (secondary.notes || primary.notes || null),
    sources: [...new Set([...(left.sources || [left.source]), ...(right.sources || [right.source])])],
  };
}

function dedupeCalendarEvents(events = []) {
  const byIdentity = new Map();

  for (const event of events) {
    const key = eventIdentityKey(event);
    const existing = byIdentity.get(key);

    if (!existing) {
      byIdentity.set(key, event);
      continue;
    }

    if (locationsCompatible(existing, event)) {
      byIdentity.set(key, mergeDuplicateEvent(existing, event));
      continue;
    }

    byIdentity.set(`${key}|${normalizeComparableText(event.location)}`, event);
  }

  return Array.from(byIdentity.values()).sort(
    (left, right) => Date.parse(left.startAt) - Date.parse(right.startAt)
  );
}

function importCalendarEvents(events = [], options = {}) {
  const normalized = dedupeCalendarEvents((events || [])
    .map(normalizeEvent)
    .filter((event) => event.startAt)
  );

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

  const merged = dedupeCalendarEvents([...kept, ...incoming]);

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
