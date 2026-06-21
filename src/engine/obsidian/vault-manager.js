"use strict";
// Vault Manager — owns the vault root path and directory structure.
// Single source of truth for where the vault lives.
// Vault is at: MONDAY_VAULT_ROOT (env) or /Volumes/Monday/Obsidian/Monday
// If the volume isn't mounted, operations fail gracefully — Monday keeps running.

const fs = require("node:fs");
const path = require("node:path");

const VAULT_ROOT = process.env.MONDAY_VAULT_ROOT || "/Volumes/Monday/Obsidian/Monday";

const VAULT_DIRS = [
  "Inbox",
  "Knowledge",
  "Books",
  "Faith",
  "Family",
  "Retirement",
  "Health",
  "Work",
  "Missions",
  "Journal",
  "Decisions",
  "Opportunities",
  "Contradictions",
  "Archive",
];

function getVaultRoot() {
  return VAULT_ROOT;
}

function vaultPath(...segments) {
  return path.join(VAULT_ROOT, ...segments);
}

function vaultAvailable() {
  try {
    return fs.existsSync(VAULT_ROOT);
  } catch {
    return false;
  }
}

function initVault() {
  try {
    fs.mkdirSync(VAULT_ROOT, { recursive: true });
    for (const dir of VAULT_DIRS) {
      fs.mkdirSync(path.join(VAULT_ROOT, dir), { recursive: true });
    }
    return { ok: true, root: VAULT_ROOT };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function ensureDir(...segments) {
  const dir = path.join(VAULT_ROOT, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function listDirectory(relPath = "") {
  const target = path.join(VAULT_ROOT, relPath);
  try {
    const entries = fs.readdirSync(target, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "dir" : "file",
        path: path.join(relPath, e.name).replace(/\\/g, "/"),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return [];
  }
}

function getStructure() {
  if (!vaultAvailable()) return { available: false, root: VAULT_ROOT };
  const dirs = VAULT_DIRS.map((dir) => ({
    name: dir,
    type: "dir",
    entries: listDirectory(dir),
  }));
  return { available: true, root: VAULT_ROOT, dirs };
}

function getVaultMeta() {
  return { root: VAULT_ROOT, available: vaultAvailable() };
}

module.exports = {
  getVaultRoot,
  vaultPath,
  vaultAvailable,
  initVault,
  ensureDir,
  listDirectory,
  getStructure,
  getVaultMeta,
  VAULT_DIRS,
};
