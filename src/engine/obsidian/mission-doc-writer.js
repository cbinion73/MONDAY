"use strict";
// Mission Doc Writer — creates and maintains mission folder structure.
// Each mission gets: mission-brief, working-theory, decision-log, opportunities, contradictions.

const fs = require("node:fs");
const path = require("node:path");
const { vaultPath, vaultAvailable } = require("./vault-manager");
const { writeNote, appendNote, frontmatter, todayISO } = require("./note-writer");

const DOMAIN_TO_NAME = {
  health: "Health",
  family: "Family",
  faith: "Faith",
  retirement: "Retirement",
  publishing: "Publishing",
  work: "Work",
};

function missionName(missionId) {
  return DOMAIN_TO_NAME[String(missionId).toLowerCase()] ||
    (String(missionId).slice(0, 1).toUpperCase() + String(missionId).slice(1));
}

function missionDir(missionId) {
  return path.join("Missions", missionName(missionId));
}

function missionFilePath(missionId, file) {
  return path.join(missionDir(missionId), file).replace(/\\/g, "/");
}

// ── Init full mission folder ──────────────────────────────────────────────────

function initMissionFolder(missionId, opts = {}) {
  if (!vaultAvailable()) return { ok: false, error: "Vault not available" };

  const name = missionName(missionId);
  const date = todayISO();
  const results = [];

  // mission-brief.md
  results.push(writeNote(missionFilePath(missionId, "mission-brief.md"), [
    frontmatter({ title: `${name} — Mission Brief`, mission: name, type: "mission-brief", created: date }),
    "",
    `# ${name} — Mission Brief`,
    "",
    "## Purpose",
    "",
    opts.purpose || `This mission tracks the ${name.toLowerCase()} domain — what matters, what's live, and what needs to move.`,
    "",
    "## Current Focus",
    "",
    opts.focus || "_Not yet defined._",
    "",
    "## Key People",
    "",
    opts.people || "_Not yet defined._",
    "",
    `*Created: ${date}*`,
  ].join("\n")));

  // working-theory.md
  results.push(writeNote(missionFilePath(missionId, "working-theory.md"), buildTheoryFile(missionId, {
    theory: opts.theory || null,
    confidence: opts.confidence || null,
    evidence: opts.evidence || [],
    date,
  })));

  // decision-log.md
  results.push(writeNote(missionFilePath(missionId, "decision-log.md"), [
    frontmatter({ title: `${name} — Decision Log`, mission: name, type: "decision-log" }),
    "",
    `# ${name} — Decision Log`,
    "",
    "_Decisions recorded as they are made. Most recent first._",
    "",
  ].join("\n")));

  // opportunities.md
  results.push(writeNote(missionFilePath(missionId, "opportunities.md"), [
    frontmatter({ title: `${name} — Opportunities`, mission: name, type: "opportunities" }),
    "",
    `# ${name} — Opportunities`,
    "",
    "_Patterns and openings worth tracking._",
    "",
  ].join("\n")));

  // contradictions.md
  results.push(writeNote(missionFilePath(missionId, "contradictions.md"), [
    frontmatter({ title: `${name} — Contradictions`, mission: name, type: "contradictions" }),
    "",
    `# ${name} — Contradictions`,
    "",
    "_Gaps between declared values and observed patterns._",
    "",
  ].join("\n")));

  const failed = results.filter((r) => !r.ok);
  return failed.length === 0
    ? { ok: true, mission: name, dir: missionDir(missionId) }
    : { ok: false, errors: failed.map((r) => r.error) };
}

// ── Update working theory ─────────────────────────────────────────────────────

function updateWorkingTheory(missionId, theory, confidence = null, evidence = []) {
  if (!vaultAvailable()) return { ok: false, error: "Vault not available" };
  const date = todayISO();
  const content = buildTheoryFile(missionId, { theory, confidence, evidence, date });
  return writeNote(missionFilePath(missionId, "working-theory.md"), content);
}

function buildTheoryFile(missionId, { theory, confidence, evidence = [], date }) {
  const name = missionName(missionId);
  const conf = confidence != null ? `${Math.round(Number(confidence) * 100)}%` : null;

  return [
    frontmatter({ title: `${name} — Working Theory`, mission: name, type: "working-theory", updated: date || todayISO() }),
    "",
    `# ${name} — Working Theory`,
    "",
    "## Current Theory",
    "",
    theory ? String(theory) : "_No theory established yet._",
    "",
    conf ? `**Confidence:** ${conf}\n` : "",
    evidence.length > 0 ? ["## Supporting Evidence", "", ...evidence.map((e) => `- ${e}`), ""].join("\n") : "",
    `## Last Updated`,
    "",
    `${date || todayISO()}`,
  ].filter((s) => s !== "").join("\n");
}

// ── Log a decision ────────────────────────────────────────────────────────────

function logDecision(missionId, title, reason, context = "") {
  if (!vaultAvailable()) return { ok: false, error: "Vault not available" };
  const date = todayISO();
  const block = [
    `## ${date} — ${title}`,
    "",
    `**Decision:** ${title}`,
    "",
    reason ? `**Reason:** ${reason}` : "",
    "",
    context ? `**Context:** ${context}\n` : "",
  ].filter(Boolean).join("\n");

  return appendNote(missionFilePath(missionId, "decision-log.md"), block);
}

// ── Add opportunity ───────────────────────────────────────────────────────────

function addOpportunity(missionId, title, description, confidence = null, status = "Monitoring") {
  if (!vaultAvailable()) return { ok: false, error: "Vault not available" };
  const date = todayISO();
  const conf = confidence != null ? `${Math.round(Number(confidence) * 100)}%` : null;

  const block = [
    `## ${title}`,
    "",
    String(description || ""),
    "",
    conf ? `**Confidence:** ${conf}` : "",
    `**Status:** ${status}`,
    `**Noted:** ${date}`,
    "",
  ].filter(Boolean).join("\n");

  return appendNote(missionFilePath(missionId, "opportunities.md"), block);
}

// ── Add contradiction ─────────────────────────────────────────────────────────

function addContradiction(missionId, declaredValue, observedPattern, status = "Active contradiction") {
  if (!vaultAvailable()) return { ok: false, error: "Vault not available" };
  const date = todayISO();

  const block = [
    `## ${date}`,
    "",
    `**Declared Value:** ${declaredValue}`,
    "",
    `**Observed Pattern:** ${observedPattern}`,
    "",
    `**Status:** ${status}`,
    "",
  ].join("\n");

  return appendNote(missionFilePath(missionId, "contradictions.md"), block);
}

// ── Check if mission folder exists ───────────────────────────────────────────

function missionExists(missionId) {
  if (!vaultAvailable()) return false;
  return fs.existsSync(vaultPath(missionDir(missionId), "mission-brief.md"));
}

module.exports = {
  initMissionFolder,
  updateWorkingTheory,
  logDecision,
  addOpportunity,
  addContradiction,
  missionExists,
  missionName,
  missionDir,
};
