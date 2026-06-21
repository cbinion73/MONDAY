"use strict";
// Note Reader — search and retrieve notes from the vault.
// Returns parsed frontmatter + body. Never throws on missing vault.

const fs = require("node:fs");
const path = require("node:path");
const { vaultPath, vaultAvailable, getVaultRoot } = require("./vault-manager");

function readNote(relPath) {
  if (!vaultAvailable()) return null;
  try {
    const raw = fs.readFileSync(vaultPath(relPath), "utf8");
    return parseNote(raw, relPath);
  } catch {
    return null;
  }
}

function parseNote(raw, relPath = "") {
  const text = String(raw || "");
  let frontmatter = {};
  let body = text;

  if (text.startsWith("---")) {
    const end = text.indexOf("\n---", 3);
    if (end !== -1) {
      frontmatter = parseFrontmatter(text.slice(3, end).trim());
      body = text.slice(end + 4).trim();
    }
  }

  return { path: relPath, frontmatter, body, raw: text };
}

function parseFrontmatter(raw) {
  const result = {};
  for (const line of raw.split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (key) result[key] = val;
  }
  return result;
}

function searchNotes(query, { dir = "", limit = 12 } = {}) {
  if (!vaultAvailable() || !query) return [];
  const root = dir ? vaultPath(dir) : getVaultRoot();
  const lq = query.toLowerCase();
  const results = [];

  walkDir(root, (filePath) => {
    if (results.length >= limit) return;
    if (!filePath.endsWith(".md")) return;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      if (!raw.toLowerCase().includes(lq)) return;
      const rel = path.relative(getVaultRoot(), filePath).replace(/\\/g, "/");
      const note = parseNote(raw, rel);
      const matchLine = note.body.split("\n").find((l) => l.toLowerCase().includes(lq)) || "";
      results.push({
        path: rel,
        title: note.frontmatter.title || path.basename(filePath, ".md"),
        snippet: matchLine.trim().slice(0, 120),
        frontmatter: note.frontmatter,
      });
    } catch {
      // unreadable — skip
    }
  });

  return results;
}

function getRecentNotes(limit = 10) {
  if (!vaultAvailable()) return [];
  const root = getVaultRoot();
  const files = [];

  walkDir(root, (filePath) => {
    if (!filePath.endsWith(".md")) return;
    try {
      const stat = fs.statSync(filePath);
      files.push({ path: path.relative(root, filePath).replace(/\\/g, "/"), mtime: stat.mtimeMs });
    } catch {
      // skip
    }
  });

  return files
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((f) => {
      const note = readNote(f.path);
      return {
        path: f.path,
        title: note?.frontmatter?.title || path.basename(f.path, ".md"),
        mtime: f.mtime,
        snippet: (note?.body || "").split("\n").find((l) => l.trim()) || "",
      };
    });
}

function getMissionNotes(missionId) {
  if (!vaultAvailable()) return {};
  const name = capitalize(missionId);
  const dir = vaultPath("Missions", name);
  const files = ["mission-brief.md", "working-theory.md", "decision-log.md", "opportunities.md", "contradictions.md"];
  const result = {};
  for (const file of files) {
    if (fs.existsSync(path.join(dir, file))) {
      result[file] = readNote(path.join("Missions", name, file).replace(/\\/g, "/"));
    }
  }
  return result;
}

function walkDir(dir, fn) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkDir(full, fn);
      else fn(full);
    }
  } catch {
    // skip
  }
}

function capitalize(s) {
  const str = String(s || "");
  return str.slice(0, 1).toUpperCase() + str.slice(1).toLowerCase();
}

module.exports = { readNote, parseNote, searchNotes, getRecentNotes, getMissionNotes };
