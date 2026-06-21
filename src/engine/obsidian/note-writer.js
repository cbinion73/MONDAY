"use strict";
// Note Writer — create and update notes in the vault.
// Handles frontmatter, Inbox, domain folders, and the daily journal.

const fs = require("node:fs");
const path = require("node:path");
const { vaultPath, vaultAvailable, ensureDir } = require("./vault-manager");

// ── Frontmatter ──────────────────────────────────────────────────────────────

function frontmatter(obj) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null || v === "") continue;
    const safe = String(v).includes(":") ? `"${v}"` : String(v);
    lines.push(`${k}: ${safe}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// ── Core write ────────────────────────────────────────────────────────────────

function writeNote(relPath, content) {
  if (!vaultAvailable()) return { ok: false, error: "Vault not available" };
  try {
    const full = vaultPath(relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
    return { ok: true, path: relPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function appendNote(relPath, content) {
  if (!vaultAvailable()) return { ok: false, error: "Vault not available" };
  try {
    const full = vaultPath(relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const sep = fs.existsSync(full) ? "\n\n---\n\n" : "";
    fs.appendFileSync(full, sep + content, "utf8");
    return { ok: true, path: relPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

function createInboxNote(title, body, meta = {}) {
  const date = todayISO();
  const slug = slugify(title);
  const filename = `${date}-${slug}.md`;
  const relPath = `Inbox/${filename}`;

  const content = [
    frontmatter({ title, date, ...meta }),
    "",
    `# ${title}`,
    "",
    String(body || ""),
  ].join("\n");

  return writeNote(relPath, content);
}

// ── Domain notes (Faith, Family, etc.) ────────────────────────────────────────

function createDomainNote(domain, title, body, meta = {}) {
  const date = todayISO();
  const slug = slugify(title);
  const filename = `${date}-${slug}.md`;
  const domainDir = capitalize(domain);
  const relPath = `${domainDir}/${filename}`;

  const content = [
    frontmatter({ title, date, domain: domainDir, ...meta }),
    "",
    `# ${title}`,
    "",
    String(body || ""),
  ].join("\n");

  return writeNote(relPath, content);
}

// ── Daily journal ─────────────────────────────────────────────────────────────

function appendToJournal(section, content, date = null) {
  const d = date || todayISO();
  const relPath = `Journal/${d}.md`;
  const full = vaultPath(relPath);

  // Create header if new file
  if (!fs.existsSync(full)) {
    const header = [
      frontmatter({ title: `Journal — ${d}`, date: d, type: "journal" }),
      "",
      `# Journal — ${d}`,
      "",
    ].join("\n");
    writeNote(relPath, header);
  }

  const block = `## ${section}\n\n${String(content || "").trim()}`;
  return appendNote(relPath, block);
}

function writeJournalDay(date, sections) {
  const d = date || todayISO();
  const relPath = `Journal/${d}.md`;

  const lines = [
    frontmatter({ title: `Journal — ${d}`, date: d, type: "journal" }),
    "",
    `# Journal — ${d}`,
    "",
  ];

  for (const [heading, body] of Object.entries(sections)) {
    if (!body) continue;
    lines.push(`## ${heading}`, "", String(body).trim(), "");
  }

  return writeNote(relPath, lines.join("\n"));
}

// ── Decisions ─────────────────────────────────────────────────────────────────

function writeDecision(title, reason, context = {}) {
  const date = todayISO();
  const slug = slugify(title);
  const relPath = `Decisions/${date}-${slug}.md`;

  const content = [
    frontmatter({ title, date, domain: context.domain || "", type: "decision" }),
    "",
    `# ${title}`,
    "",
    "## Decision",
    "",
    String(title || ""),
    "",
    "## Reason",
    "",
    String(reason || ""),
    "",
    context.context ? `## Context\n\n${context.context}\n` : "",
    `*Recorded: ${date}*`,
  ].join("\n");

  return writeNote(relPath, content.trim());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalize(s) {
  const str = String(s || "");
  return str.slice(0, 1).toUpperCase() + str.slice(1).toLowerCase();
}

module.exports = {
  writeNote,
  appendNote,
  createInboxNote,
  createDomainNote,
  appendToJournal,
  writeJournalDay,
  writeDecision,
  frontmatter,
  todayISO,
  slugify,
};
