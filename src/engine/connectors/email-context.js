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

function getEmailPath() {
  return path.join(getDataDir(), "email.json");
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
    threads: [],
  };
}

function readEmailStore() {
  ensureDataDir();
  return readJson(getEmailPath(), defaultStore());
}

function writeEmailStore(store) {
  ensureDataDir();
  writeJson(getEmailPath(), {
    ...defaultStore(),
    ...store,
    updatedAt: new Date().toISOString(),
  });
}

function inferMissionId(thread = {}) {
  const text = `${thread.subject || ""} ${thread.snippet || ""} ${thread.from || ""}`.toLowerCase();
  if (/\bdoctor|clinic|health|medical\b/.test(text)) return "health";
  if (/\bbook|publisher|write|manuscript\b/.test(text)) return "publishing";
  if (/\bretire|retirement|financial planner\b/.test(text)) return "retirement";
  if (/\bfamily|school|camp|caleb|rebekah|wife|kids?\b/.test(text)) return "family";
  if (/\bchurch|prayer|pastor|faith\b/.test(text)) return "faith";
  if (/\bwork|office|team|boss|thermo fisher|project\b/.test(text)) return "work";
  return null;
}

function normalizeThread(thread = {}) {
  return {
    id: thread.id || crypto.randomUUID(),
    subject: String(thread.subject || "Untitled email"),
    from: thread.from ? String(thread.from) : null,
    snippet: thread.snippet ? String(thread.snippet) : null,
    unread: Boolean(thread.unread),
    starred: Boolean(thread.starred),
    missionId: thread.missionId || inferMissionId(thread),
    source: thread.source ? String(thread.source) : "manual",
    updatedAt: thread.updatedAt || new Date().toISOString(),
  };
}

function importEmailThreads(threads = [], options = {}) {
  const normalized = (threads || [])
    .map(normalizeThread)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  const store = {
    source: options.source || "manual",
    threads: normalized,
  };

  writeEmailStore(store);
  return store;
}

function clearEmailThreads() {
  writeEmailStore(defaultStore());
}

function getEmailSummary({ limit = 10, unreadOnly = false, missionId = null } = {}) {
  const store = readEmailStore();
  let threads = store.threads;

  if (missionId) {
    threads = threads.filter((thread) => thread.missionId === missionId);
  }

  if (unreadOnly) {
    threads = threads.filter((thread) => thread.unread);
  }

  return {
    updatedAt: store.updatedAt,
    source: store.source || "manual",
    totalThreads: store.threads.length,
    unreadCount: store.threads.filter((thread) => thread.unread).length,
    missionId,
    threads: threads.slice(0, limit),
  };
}

// Merge threads from one source without clobbering other sources.
function mergeEmailThreads(threads = [], options = {}) {
  const source = options.source || "manual";
  const store = readEmailStore();

  const kept = store.threads.filter((t) => t.source !== source);
  const incoming = (threads || [])
    .map((t) => normalizeThread({ ...t, source }));

  const merged = [...kept, ...incoming].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  );

  const sources = [...new Set(merged.map((t) => t.source))];
  writeEmailStore({ source: sources.length === 1 ? sources[0] : "multi", threads: merged });
  return { source, added: incoming.length, total: merged.length };
}

module.exports = {
  clearEmailThreads,
  getEmailSummary,
  importEmailThreads,
  mergeEmailThreads,
  readEmailStore,
  getDataDir,
};
