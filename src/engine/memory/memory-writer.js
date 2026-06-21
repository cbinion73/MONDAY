"use strict";
// memory-writer.js — index text into the vector store.
// Sources: Obsidian notes, mission docs, voice/text captures, conversation turns.

const fs   = require("node:fs");
const path = require("node:path");
const { embed, zeroVector } = require("./embedder");
const { ensureTable, TABLE_NAMES } = require("./vector-store");

// ── Seed rows (define the schema for each table) ─────────────────────────────
// LanceDB infers column types from the first row — must match all future rows.

const NOTE_SEED = {
  id: "_seed",
  vector: zeroVector(),
  title: "",
  text: "",
  domain: "",         // "health" | "publishing" | "retirement" | "family" | "faith" | "work" | ""
  type: "note",       // "note" | "mission"
  source: "",         // file path or URL
  ts: 0,
};

const CAPTURE_SEED = {
  id: "_seed",
  vector: zeroVector(),
  text: "",
  domain: "",
  source: "voice",    // "voice" | "text" | "manual"
  ts: 0,
};

const TURN_SEED = {
  id: "_seed",
  vector: zeroVector(),
  role: "user",       // "user" | "monday"
  text: "",
  session: "",
  ts: 0,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowMs() { return Date.now(); }

function makeId(prefix) {
  return `${prefix}_${nowMs()}_${Math.floor(Math.random() * 1e6)}`;
}

async function safeEmbed(text) {
  const vec = await embed(text);
  return vec || zeroVector();
}

async function addRows(tableName, seed, rows) {
  const table = await ensureTable(tableName, seed);
  // Filter out seed row noise on first ever call
  const filtered = rows.filter((r) => r.id !== "_seed");
  if (!filtered.length) return;
  await table.add(filtered);
}

// ── Public write functions ────────────────────────────────────────────────────

/**
 * Index one Obsidian note or mission doc.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.text — full text content
 * @param {string} [opts.domain]
 * @param {string} [opts.type]   "note" | "mission"
 * @param {string} [opts.source] file path
 * @param {string} [opts.id]     stable ID (use path-based slug to allow upsert-by-source)
 */
async function indexNote({ title, text, domain = "", type = "note", source = "", id }) {
  const combined = [title, text].filter(Boolean).join("\n");
  const vector = await safeEmbed(combined);
  const row = {
    id: id || makeId("note"),
    vector,
    title: title || "",
    text: (text || "").slice(0, 6000),
    domain,
    type,
    source,
    ts: nowMs(),
  };
  await addRows(TABLE_NAMES.notes, NOTE_SEED, [row]);
  return row.id;
}

/**
 * Index a personal capture.
 * @param {object} opts
 * @param {string} opts.text
 * @param {string} [opts.domain]
 * @param {string} [opts.source]
 * @param {number} [opts.ts]
 */
async function indexCapture({ text, domain = "", source = "manual", ts }) {
  const vector = await safeEmbed(text);
  const row = {
    id: makeId("cap"),
    vector,
    text: (text || "").slice(0, 3000),
    domain,
    source,
    ts: ts || nowMs(),
  };
  await addRows(TABLE_NAMES.captures, CAPTURE_SEED, [row]);
  return row.id;
}

/**
 * Index a conversation turn.
 * @param {object} opts
 * @param {string} opts.role    "user" | "monday"
 * @param {string} opts.text
 * @param {string} [opts.session]
 * @param {number} [opts.ts]
 */
async function indexTurn({ role, text, session = "", ts }) {
  const vector = await safeEmbed(text);
  const row = {
    id: makeId("turn"),
    vector,
    role,
    text: (text || "").slice(0, 3000),
    session,
    ts: ts || nowMs(),
  };
  await addRows(TABLE_NAMES.turns, TURN_SEED, [row]);
  return row.id;
}

/**
 * Bulk-index all markdown files in a directory as notes.
 * Skips files already indexed (by checking if id slot exists — future: use a seen-set).
 * @param {string} dir   directory path
 * @param {string} [domain]
 * @param {string} [type]   "note" | "mission"
 */
async function indexDirectory(dir, domain = "", type = "note") {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md") || f.endsWith(".txt"));
  let count = 0;
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const text = fs.readFileSync(fullPath, "utf8");
    const title = path.basename(file, path.extname(file)).replace(/-|_/g, " ");
    await indexNote({ title, text, domain, type, source: fullPath });
    count++;
  }
  return count;
}

module.exports = { indexNote, indexCapture, indexTurn, indexDirectory };
