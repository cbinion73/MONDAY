"use strict";
// JSON-backed persistent state for working theories, open threads,
// triage state, and heartbeat log. Stays dependency-free.

const fs = require("node:fs");
const path = require("node:path");

function getDataDir() {
  return path.resolve(
    process.env.MONDAY_STATE_DIR ||
      path.resolve(__dirname, "../../../data/state")
  );
}

function getPath(filename) {
  return path.join(getDataDir(), filename);
}

function ensureDir() {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir();
  fs.writeFileSync(
    filePath,
    JSON.stringify(data, null, 2) + "\n",
    "utf8"
  );
}

// ─── Working Theories ────────────────────────────────────────────────────────

function getWorkingTheories() {
  return readJson(getPath("working-theories.json"), {});
}

function getWorkingTheory(domain) {
  return getWorkingTheories()[domain] || null;
}

function setWorkingTheory(domain, text) {
  const all = getWorkingTheories();
  const existing = all[domain] || {};
  const revisions = (existing.revisions || []).slice(-9);
  if (existing.text) revisions.push({ text: existing.text, at: existing.updatedAt });
  all[domain] = {
    domain,
    text,
    updatedAt: new Date().toISOString(),
    revisions,
  };
  writeJson(getPath("working-theories.json"), all);
  return all[domain];
}

// ─── Open Threads ─────────────────────────────────────────────────────────────

function getOpenThreads() {
  return readJson(getPath("open-threads.json"), []);
}

function getActiveThreads() {
  return getOpenThreads().filter((t) => t.status !== "closed");
}

function upsertThread(id, update) {
  const threads = getOpenThreads();
  const idx = threads.findIndex((t) => t.id === id);
  const now = new Date().toISOString();
  if (idx >= 0) {
    threads[idx] = { ...threads[idx], ...update, updatedAt: now };
  } else {
    threads.push({ id, status: "open", ...update, createdAt: now, updatedAt: now });
  }
  writeJson(getPath("open-threads.json"), threads);
}

function closeThread(id) {
  const threads = getOpenThreads().map((t) =>
    t.id === id ? { ...t, status: "closed", closedAt: new Date().toISOString() } : t
  );
  writeJson(getPath("open-threads.json"), threads);
}

// ─── Triage State ─────────────────────────────────────────────────────────────

function getTriageState() {
  return readJson(getPath("triage-state.json"), {
    significantNow: [],
    watching: [],
    background: [],
    updatedAt: null,
  });
}

function setTriageState({ significantNow = [], watching = [], background = [] }) {
  writeJson(getPath("triage-state.json"), {
    significantNow,
    watching,
    background,
    updatedAt: new Date().toISOString(),
  });
}

// ─── Heartbeat Log ────────────────────────────────────────────────────────────

function appendHeartbeatLog(entry) {
  const logPath = getPath("heartbeat-log.json");
  const log = readJson(logPath, []);
  log.push({ ...entry, at: new Date().toISOString() });
  // Keep last 500 entries
  if (log.length > 500) log.splice(0, log.length - 500);
  writeJson(logPath, log);
}

function getHeartbeatLog({ limit = 50 } = {}) {
  const log = readJson(getPath("heartbeat-log.json"), []);
  return log.slice(-limit);
}

// ─── Delegate Access (for pipeline workers) ───────────────────────────────────

function getLastHeartbeatAt(loop) {
  const log = getHeartbeatLog({ limit: 100 });
  const entry = [...log].reverse().find((e) => e.loop === loop);
  return entry ? entry.at : null;
}

module.exports = {
  getWorkingTheories,
  getWorkingTheory,
  setWorkingTheory,
  getOpenThreads,
  getActiveThreads,
  upsertThread,
  closeThread,
  getTriageState,
  setTriageState,
  appendHeartbeatLog,
  getHeartbeatLog,
  getLastHeartbeatAt,
};
