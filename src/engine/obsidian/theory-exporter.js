"use strict";
// Theory Exporter — writes Monday's reasoning artifacts to Obsidian.
// Exports: working theories, decisions, contradictions, opportunities.
// These are the outputs Monday produces; Obsidian makes them human-readable.

const { vaultAvailable } = require("./vault-manager");
const { writeNote, appendNote, writeDecision, frontmatter, todayISO, slugify } = require("./note-writer");
const { updateWorkingTheory, logDecision, addOpportunity, addContradiction, missionExists } = require("./mission-doc-writer");

const DOMAIN_FOLDERS = {
  health: "Health",
  family: "Family",
  faith: "Faith",
  retirement: "Retirement",
  publishing: "Publishing",
  work: "Work",
};

function domainFolder(domain) {
  return DOMAIN_FOLDERS[String(domain || "").toLowerCase()] || null;
}

// ── Export working theory to domain folder ────────────────────────────────────
// Writes to both {Domain}/working-theory.md AND Missions/{Mission}/working-theory.md if exists.

function exportWorkingTheory(domain, theory, confidence = null, evidence = []) {
  if (!vaultAvailable() || !theory) return { ok: false, error: "No vault or empty theory" };

  const folder = domainFolder(domain);
  const date = todayISO();
  const conf = confidence != null ? `${Math.round(Number(confidence) * 100)}%` : null;

  const results = [];

  // Domain folder copy (human-readable quick view)
  if (folder) {
    const content = [
      frontmatter({ title: `${folder} — Working Theory`, domain: folder, type: "working-theory", updated: date }),
      "",
      `# ${folder} — Working Theory`,
      "",
      "## Current Theory",
      "",
      String(theory),
      "",
      conf ? `**Confidence:** ${conf}\n` : "",
      evidence.length > 0 ? ["## Supporting Evidence", "", ...evidence.map((e) => `- ${e}`), ""].join("\n") : "",
      "## Last Updated",
      "",
      date,
    ].filter((s) => s !== "").join("\n");

    results.push(writeNote(`${folder}/working-theory.md`, content));
  }

  // Mission folder copy (if mission is initialized)
  const missionId = domain?.toLowerCase();
  if (missionId && missionExists(missionId)) {
    results.push(updateWorkingTheory(missionId, theory, confidence, evidence));
  }

  const failed = results.filter((r) => !r.ok);
  return failed.length === 0
    ? { ok: true, domain, paths: results.map((r) => r.path) }
    : { ok: false, errors: failed.map((r) => r.error) };
}

// ── Export a decision ─────────────────────────────────────────────────────────
// Writes to Decisions/ and optionally logs to mission decision-log.

function exportDecision(title, reason, { domain = null, context = "" } = {}) {
  if (!vaultAvailable()) return { ok: false, error: "Vault not available" };

  const results = [];

  // Top-level Decisions/ file
  results.push(writeDecision(title, reason, { domain, context }));

  // Mission decision log (if mission initialized)
  const missionId = domain?.toLowerCase();
  if (missionId && missionExists(missionId)) {
    results.push(logDecision(missionId, title, reason, context));
  }

  const failed = results.filter((r) => !r.ok);
  return failed.length === 0
    ? { ok: true, title }
    : { ok: false, errors: failed.map((r) => r.error) };
}

// ── Export a contradiction ────────────────────────────────────────────────────

function exportContradiction(domain, declaredValue, observedPattern, status = "Active contradiction") {
  if (!vaultAvailable()) return { ok: false, error: "Vault not available" };

  const date = todayISO();
  const slug = slugify(declaredValue);
  const results = [];

  // Top-level Contradictions/ file
  const content = [
    frontmatter({ title: `${domain} — Contradiction`, domain, type: "contradiction", date }),
    "",
    `# ${domain} — Contradiction`,
    "",
    `## Declared Value`,
    "",
    String(declaredValue),
    "",
    `## Observed Pattern`,
    "",
    String(observedPattern),
    "",
    `## Status`,
    "",
    String(status),
    "",
    `*Noted: ${date}*`,
  ].join("\n");

  results.push(writeNote(`Contradictions/${date}-${slug}.md`, content));

  // Mission contradictions file (if initialized)
  const missionId = domain?.toLowerCase();
  if (missionId && missionExists(missionId)) {
    results.push(addContradiction(missionId, declaredValue, observedPattern, status));
  }

  const failed = results.filter((r) => !r.ok);
  return failed.length === 0
    ? { ok: true, domain }
    : { ok: false, errors: failed.map((r) => r.error) };
}

// ── Export an opportunity ─────────────────────────────────────────────────────

function exportOpportunity(domain, title, description, confidence = null, status = "Monitoring") {
  if (!vaultAvailable()) return { ok: false, error: "Vault not available" };

  const date = todayISO();
  const slug = slugify(title);
  const conf = confidence != null ? `${Math.round(Number(confidence) * 100)}%` : null;
  const results = [];

  // Top-level Opportunities/ file
  const content = [
    frontmatter({ title, domain, type: "opportunity", date, status }),
    "",
    `# ${title}`,
    "",
    String(description || ""),
    "",
    conf ? `**Confidence:** ${conf}\n` : "",
    `**Domain:** ${domain}`,
    `**Status:** ${status}`,
    `**Noted:** ${date}`,
  ].filter((s) => s !== "").join("\n");

  results.push(writeNote(`Opportunities/${date}-${slug}.md`, content));

  // Mission opportunities file (if initialized)
  const missionId = domain?.toLowerCase();
  if (missionId && missionExists(missionId)) {
    results.push(addOpportunity(missionId, title, description, confidence, status));
  }

  const failed = results.filter((r) => !r.ok);
  return failed.length === 0
    ? { ok: true, domain, title }
    : { ok: false, errors: failed.map((r) => r.error) };
}

module.exports = {
  exportWorkingTheory,
  exportDecision,
  exportContradiction,
  exportOpportunity,
};
