"use strict";
// Workspace Store — file I/O layer for mission workspaces.
// Each workspace lives in data/workspaces/{id}/
// Files: meta.json, memory.json, threads.json, tools.json, log.jsonl

const fs = require("fs");
const path = require("path");

const BASE_DIR = process.env.MONDAY_WORKSPACE_DIR
  ? path.resolve(process.env.MONDAY_WORKSPACE_DIR)
  : path.resolve(__dirname, "../../../data/workspaces");

function workspaceDir(id) {
  return path.join(BASE_DIR, id);
}

function filePath(id, filename) {
  return path.join(workspaceDir(id), filename);
}

function ensureDir(id) {
  const dir = workspaceDir(id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureBase() {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
}

function readJson(fp, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(fp, data) {
  fs.writeFileSync(fp, JSON.stringify(data, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

// ── Workspace existence ───────────────────────────────────────────────────────

function exists(id) {
  return fs.existsSync(filePath(id, "meta.json"));
}

function listIds() {
  ensureBase();
  return fs.readdirSync(BASE_DIR).filter((d) => {
    try {
      return fs.statSync(path.join(BASE_DIR, d)).isDirectory();
    } catch {
      return false;
    }
  });
}

// ── meta.json ─────────────────────────────────────────────────────────────────

const DEFAULT_META = {
  id: "",
  name: "",
  domain: "",
  status: "active",
  goal: "",
  tags: [],
  agent: null,
  createdAt: "",
  updatedAt: "",
};

function getMeta(id) {
  return { ...DEFAULT_META, ...readJson(filePath(id, "meta.json")) };
}

function setMeta(id, updates) {
  const current = getMeta(id);
  const next = { ...current, ...updates, updatedAt: nowIso() };
  writeJson(filePath(id, "meta.json"), next);
  return next;
}

// ── memory.json ───────────────────────────────────────────────────────────────

const DEFAULT_MEMORY = {
  facts: [],          // [{ key, value, updatedAt }]
  decisions: [],      // [{ key, value, decidedAt }]
  context: "",        // free-form mission context paragraph
  workingTheory: "",  // agent's current theory about this mission
};

function getMemory(id) {
  return { ...DEFAULT_MEMORY, ...readJson(filePath(id, "memory.json")) };
}

function setMemory(id, updates) {
  const current = getMemory(id);
  const next = { ...current, ...updates };
  writeJson(filePath(id, "memory.json"), next);
  setMeta(id, {}); // touch updatedAt on meta
  return next;
}

function upsertFact(id, key, value) {
  const memory = getMemory(id);
  const facts = memory.facts.filter((f) => f.key !== key);
  facts.push({ key, value, updatedAt: nowIso() });
  return setMemory(id, { facts });
}

function upsertDecision(id, key, value) {
  const memory = getMemory(id);
  const decisions = memory.decisions.filter((d) => d.key !== key);
  decisions.push({ key, value, decidedAt: nowIso() });
  return setMemory(id, { decisions });
}

function setWorkingTheory(id, theory) {
  return setMemory(id, { workingTheory: theory });
}

// ── threads.json ──────────────────────────────────────────────────────────────

const DEFAULT_THREADS = { threads: [] };

function getThreads(id) {
  return readJson(filePath(id, "threads.json"), DEFAULT_THREADS);
}

function getActiveThreads(id) {
  return getThreads(id).threads.filter((t) => t.status !== "closed");
}

function upsertThread(id, thread) {
  const store = getThreads(id);
  const idx = store.threads.findIndex((t) => t.id === thread.id);
  const now = nowIso();
  if (idx >= 0) {
    store.threads[idx] = { ...store.threads[idx], ...thread, updatedAt: now };
  } else {
    store.threads.push({ ...thread, status: "open", createdAt: now, updatedAt: now });
  }
  writeJson(filePath(id, "threads.json"), store);
  setMeta(id, {});
  return store.threads.find((t) => t.id === thread.id);
}

function closeThread(id, threadId) {
  const store = getThreads(id);
  const idx = store.threads.findIndex((t) => t.id === threadId);
  if (idx >= 0) {
    store.threads[idx] = { ...store.threads[idx], status: "closed", closedAt: nowIso() };
    writeJson(filePath(id, "threads.json"), store);
  }
}

// ── tools.json ────────────────────────────────────────────────────────────────

const DEFAULT_TOOLS = {
  allowed: ["research", "calendar-read", "documents-read"],
  blocked: [],
  autonomyTier: 1, // 0=silent, 1=notify, 2=suggest, 3=delegate, 4=blocked
};

function getTools(id) {
  return { ...DEFAULT_TOOLS, ...readJson(filePath(id, "tools.json")) };
}

function setTools(id, updates) {
  const current = getTools(id);
  const next = { ...current, ...updates };
  writeJson(filePath(id, "tools.json"), next);
  return next;
}

// ── log.jsonl ─────────────────────────────────────────────────────────────────

function appendLog(id, entry) {
  const fp = filePath(id, "log.jsonl");
  const line = JSON.stringify({ ...entry, timestamp: entry.timestamp || nowIso() }) + "\n";
  fs.appendFileSync(fp, line);
}

function getLog(id, { limit = 50 } = {}) {
  const fp = filePath(id, "log.jsonl");
  if (!fs.existsSync(fp)) return [];
  try {
    const lines = fs.readFileSync(fp, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-limit);
    return lines.map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// ── Full workspace read ───────────────────────────────────────────────────────

function getWorkspace(id) {
  if (!exists(id)) return null;
  return {
    meta: getMeta(id),
    memory: getMemory(id),
    threads: getActiveThreads(id),
    tools: getTools(id),
    logTail: getLog(id, { limit: 20 }),
  };
}

// ── Create ────────────────────────────────────────────────────────────────────

function createWorkspace(id, { name, domain, goal = "", tags = [], agent = null, status = "active" } = {}) {
  if (exists(id)) return getWorkspace(id);

  ensureDir(id);
  const now = nowIso();

  writeJson(filePath(id, "meta.json"), {
    id, name, domain, status, goal, tags, agent,
    createdAt: now, updatedAt: now,
  });
  writeJson(filePath(id, "memory.json"), { ...DEFAULT_MEMORY });
  writeJson(filePath(id, "threads.json"), { threads: [] });
  writeJson(filePath(id, "tools.json"), { ...DEFAULT_TOOLS });
  // log.jsonl is created on first append

  appendLog(id, { type: "created", actor: "system", data: { name, domain, goal } });

  return getWorkspace(id);
}

// ── List ──────────────────────────────────────────────────────────────────────

function listWorkspaces({ status } = {}) {
  ensureBase();
  return listIds()
    .map((id) => (exists(id) ? getMeta(id) : null))
    .filter(Boolean)
    .filter((m) => !status || m.status === status)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

function getWorkspaceForDomain(domain) {
  return listWorkspaces({ status: "active" }).find((m) => m.domain === domain) || null;
}

module.exports = {
  exists,
  listIds,
  getWorkspace,
  createWorkspace,
  listWorkspaces,
  getWorkspaceForDomain,
  getMeta,
  setMeta,
  getMemory,
  setMemory,
  upsertFact,
  upsertDecision,
  setWorkingTheory,
  getThreads,
  getActiveThreads,
  upsertThread,
  closeThread,
  getTools,
  setTools,
  appendLog,
  getLog,
};
