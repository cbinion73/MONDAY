"use strict";
// Obsidian Service — the only public interface to the vault.
// All other modules inside /obsidian/ are internal.
// External callers (server.js, workspace-manager, etc.) import ONLY this module.
//
// RULE: Obsidian is the bookshelf. Monday is the mind.
// Monday writes here when something is worth keeping for a human to read.
// Obsidian never controls Monday's working theories or decisions.

const { vaultAvailable, initVault, getStructure, getVaultMeta, getVaultRoot } = require("./vault-manager");
const { createInboxNote, createDomainNote, appendToJournal, writeJournalDay, writeDecision, todayISO } = require("./note-writer");
const { searchNotes, getRecentNotes, getMissionNotes, readNote } = require("./note-reader");
const { initMissionFolder, missionExists, missionName } = require("./mission-doc-writer");
const { exportWorkingTheory, exportDecision, exportContradiction, exportOpportunity } = require("./theory-exporter");
const vaultIndexer  = require("./vault-indexer");
const vaultEmbedder = require("../memory/vault-embedder");
const { retrievePersonalContext } = require("../memory/retrieval");

// Significance levels that warrant an Obsidian write
const WRITE_SIGNIFICANCE = new Set([
  "future_life_transition",
  "future_life_tradeoff",
  "work_identity",
  "faith_tension",
  "retirement_strategy",
  "publishing_strategy",
  "creative_strategy",
  "identity_threat",
  "wounded_significance",
  "deep_meaning",
  "calling",
  "legacy",
  "existential",
  "declared_family_value",
  "relationship_concern",
  "family_time_tension",
]);

// ── Init ──────────────────────────────────────────────────────────────────────

function ensureVault() {
  // Always run initVault — it uses recursive:true so existing dirs are no-ops.
  // This ensures subdirectories get created even if the vault root already exists.
  return initVault();
}

// ── Capture handling ──────────────────────────────────────────────────────────
// Called when Monday captures a significant memory.
// Writes to Inbox/ (always) and domain folder (if domain is known).

function handleCapture({ content, significance, domain, missionId }) {
  if (!vaultAvailable()) return { ok: false, skipped: true };

  ensureVault();

  const title = buildCaptureTitle(content, significance);
  const meta = { significance: significance || "unknown", mission: missionId || "" };

  // Always write to Inbox
  const inboxResult = createInboxNote(title, content, meta);

  // Also write to domain folder if domain is known
  if (domain) {
    createDomainNote(domain, title, content, meta);
  }

  return inboxResult;
}

// ── Turn-end handler ──────────────────────────────────────────────────────────
// Called after a significant turn completes. Exports theory if warranted.
// Only writes when the turn is THINKING-tier or high significance.

function handleTurnEnd({ significance, domain, workingTheory, modelDecision }) {
  if (!vaultAvailable()) return { ok: false, skipped: true };
  if (!workingTheory) return { ok: false, skipped: true };

  // Only export if this was a depth turn
  const isThinkingTier = modelDecision?.taskType === "thinking";
  const isHighSignificance = significance && WRITE_SIGNIFICANCE.has(significance);

  if (!isThinkingTier && !isHighSignificance) {
    return { ok: false, skipped: true, reason: "not a significant enough turn" };
  }

  ensureVault();

  const theory = typeof workingTheory === "string" ? workingTheory : workingTheory?.statement;
  if (!theory) return { ok: false, skipped: true, reason: "no theory content" };

  return exportWorkingTheory(domain, theory, null, []);
}

// ── Journal ───────────────────────────────────────────────────────────────────

function writeDailyJournal({ significant, decisions = [], theories = [], openQuestions = [] }) {
  if (!vaultAvailable()) return { ok: false, skipped: true };
  ensureVault();

  const sections = {};

  if (significant?.length) {
    sections["Significant Events & Conversations"] = significant.map((s) => `- ${s}`).join("\n");
  }
  if (decisions?.length) {
    sections["Decisions"] = decisions.map((d) => `- ${d}`).join("\n");
  }
  if (theories?.length) {
    sections["Emerging Theories"] = theories.map((t) => `- ${t}`).join("\n");
  }
  if (openQuestions?.length) {
    sections["Open Questions"] = openQuestions.map((q) => `- ${q}`).join("\n");
  }

  return writeJournalDay(todayISO(), sections);
}

function appendJournalSection(section, content) {
  if (!vaultAvailable()) return { ok: false, skipped: true };
  ensureVault();
  return appendToJournal(section, content);
}

// ── Mission documents ─────────────────────────────────────────────────────────

function createMissionDocs(missionId, opts = {}) {
  ensureVault();
  return initMissionFolder(missionId, opts);
}

function missionDocsExist(missionId) {
  return missionExists(missionId);
}

// ── Theory export (explicit) ──────────────────────────────────────────────────

function saveWorkingTheory(domain, theory, confidence = null, evidence = []) {
  ensureVault();
  return exportWorkingTheory(domain, theory, confidence, evidence);
}

function saveDecision(title, reason, opts = {}) {
  ensureVault();
  return exportDecision(title, reason, opts);
}

function saveContradiction(domain, declaredValue, observedPattern) {
  ensureVault();
  return exportContradiction(domain, declaredValue, observedPattern);
}

function saveOpportunity(domain, title, description, confidence = null) {
  ensureVault();
  return exportOpportunity(domain, title, description, confidence);
}

// ── Reading ───────────────────────────────────────────────────────────────────

function findNotes(query, opts = {}) {
  return searchNotes(query, opts);
}

function recentNotes(limit = 10) {
  return getRecentNotes(limit);
}

function getMissionDocs(missionId) {
  return getMissionNotes(missionId);
}

function getNote(relPath) {
  return readNote(relPath);
}

// ── Vault status ──────────────────────────────────────────────────────────────

function getVaultStatus() {
  return {
    ...getVaultMeta(),
    structure: getStructure(),
  };
}

// ── Create a knowledge note ───────────────────────────────────────────────────

function createNote(title, content, { domain = null, type = "note" } = {}) {
  ensureVault();
  if (domain) {
    return createDomainNote(domain, title, content, { type });
  }
  return createInboxNote(title, content, { type });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCaptureTitle(content, significance) {
  const text = String(content || "").trim().replace(/[.?!]+$/, "").slice(0, 60);
  if (!text) return "Untitled capture";
  return text.length < String(content || "").length ? `${text}…` : text;
}

// ── Vault Indexer (public pass-through) ──────────────────────────────────────

function syncVault() {
  return vaultIndexer.sync();
}

function reindexVault() {
  return vaultIndexer.reindex();
}

function getIndexingStatus() {
  return vaultIndexer.getIndexingStatus();
}

// ── Vault Embedder (public pass-through) ──────────────────────────────────────

function embedVault() {
  return vaultEmbedder.embedChangedNotes();
}

function searchVault(query, opts) {
  return vaultEmbedder.searchVault(query, opts);
}

// ── Hybrid Retrieval (public pass-through) ────────────────────────────────────

function retrieveContext(query, opts) {
  return retrievePersonalContext(query, opts);
}

module.exports = {
  ensureVault,
  handleCapture,
  handleTurnEnd,
  writeDailyJournal,
  appendJournalSection,
  createMissionDocs,
  missionDocsExist,
  saveWorkingTheory,
  saveDecision,
  saveContradiction,
  saveOpportunity,
  findNotes,
  recentNotes,
  getMissionDocs,
  getNote,
  getVaultStatus,
  createNote,
  // Vault indexer
  syncVault,
  reindexVault,
  getIndexingStatus,
  // Vault embedder
  embedVault,
  searchVault,
  // Hybrid retrieval
  retrieveContext,
};
