"use strict";
// vector-store.js — LanceDB connection and table definitions.
// All vector data lives at /Volumes/Monday/Monday/memory/ (or env override).
// Tables are created lazily on first write; schema is inferred from the first row.

const path = require("node:path");
const fs   = require("node:fs");

const MONDAY_DRIVE  = "/Volumes/Monday/Monday";
const PROJECT_LOCAL = path.resolve(__dirname, "../../../data/memory");

function resolveMemoryDir() {
  if (process.env.MONDAY_MEMORY_DIR) return process.env.MONDAY_MEMORY_DIR;
  if (fs.existsSync(MONDAY_DRIVE))    return path.join(MONDAY_DRIVE, "memory");
  return PROJECT_LOCAL;
}

let _db = null;

async function getDb() {
  if (_db) return _db;
  const lancedb = require("@lancedb/lancedb");
  const dir = resolveMemoryDir();
  fs.mkdirSync(dir, { recursive: true });
  _db = await lancedb.connect(dir);
  console.log(`[memory] vector store: ${dir}`);
  return _db;
}

// ── Table accessors ───────────────────────────────────────────────────────────
// Each table is opened or created on first access. Schema is fixed once the
// first row is written; subsequent writes must match.

const TABLE_NAMES = {
  notes:        "notes",        // Obsidian notes + mission docs (whole-note, legacy)
  captures:     "captures",     // personal captures (voice + text)
  turns:        "turns",        // conversation turns
  vault_chunks: "vault_chunks", // heading-level chunks of vault notes with citations
};

const _tables = {};

async function getTable(name) {
  if (_tables[name]) return _tables[name];
  const db = await getDb();
  const existing = await db.tableNames();
  if (existing.includes(name)) {
    _tables[name] = await db.openTable(name);
  }
  // Table is created on first write via ensureTable()
  return _tables[name] || null;
}

// Create the table with a seed row if it doesn't exist yet.
// LanceDB infers schema from the first row — seed row establishes it.
async function ensureTable(name, seedRow) {
  if (_tables[name]) return _tables[name];
  const db = await getDb();
  const existing = await db.tableNames();
  if (existing.includes(name)) {
    _tables[name] = await db.openTable(name);
    return _tables[name];
  }
  _tables[name] = await db.createTable(name, [seedRow]);
  console.log(`[memory] created table: ${name}`);
  return _tables[name];
}

async function tableNames() {
  const db = await getDb();
  return db.tableNames();
}

module.exports = { getTable, ensureTable, tableNames, TABLE_NAMES, resolveMemoryDir };
