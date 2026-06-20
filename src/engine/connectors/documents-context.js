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

function getDocumentsPath() {
  return path.join(getDataDir(), "documents.json");
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
    documents: [],
  };
}

function readDocumentsStore() {
  ensureDataDir();
  return readJson(getDocumentsPath(), defaultStore());
}

function writeDocumentsStore(store) {
  ensureDataDir();
  writeJson(getDocumentsPath(), {
    ...defaultStore(),
    ...store,
    updatedAt: new Date().toISOString(),
  });
}

function inferMissionId(document = {}) {
  const text = `${document.title || ""} ${document.summary || ""} ${document.excerpt || ""}`.toLowerCase();
  if (/\bweight|health|exercise|sleep\b/.test(text)) return "health";
  if (/\bbook|write|publishing|manuscript\b/.test(text)) return "publishing";
  if (/\bretire|retirement|legacy\b/.test(text)) return "retirement";
  if (/\bfamily|wife|marriage|caleb|rebekah|kids?\b/.test(text)) return "family";
  if (/\bfaith|prayer|church|god|spiritual\b/.test(text)) return "faith";
  if (/\bwork|job|career|thermo fisher|leadership\b/.test(text)) return "work";
  return null;
}

function normalizeDocument(document = {}) {
  return {
    id: document.id || crypto.randomUUID(),
    title: String(document.title || document.name || "Untitled document"),
    summary: document.summary ? String(document.summary) : null,
    excerpt: document.excerpt ? String(document.excerpt) : null,
    url: document.url ? String(document.url) : null,
    missionId: document.missionId || inferMissionId(document),
    source: document.source ? String(document.source) : "manual",
    updatedAt: document.updatedAt || new Date().toISOString(),
  };
}

function importDocuments(documents = [], options = {}) {
  const normalized = (documents || [])
    .map(normalizeDocument)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  const store = {
    source: options.source || "manual",
    documents: normalized,
  };

  writeDocumentsStore(store);
  return store;
}

function clearDocuments() {
  writeDocumentsStore(defaultStore());
}

function getDocumentsSummary({ limit = 8, missionId = null } = {}) {
  const store = readDocumentsStore();
  const filtered = missionId
    ? store.documents.filter((document) => document.missionId === missionId)
    : store.documents;

  return {
    updatedAt: store.updatedAt,
    source: store.source || "manual",
    totalDocuments: store.documents.length,
    missionId,
    documents: filtered.slice(0, limit),
  };
}

module.exports = {
  clearDocuments,
  getDocumentsSummary,
  importDocuments,
  readDocumentsStore,
  getDataDir,
};
