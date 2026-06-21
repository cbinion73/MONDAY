"use strict";
// db/connection.js — SQLite connection singleton.
// One database, one connection, opened once on require().
// Path resolves from MONDAY_DB_PATH env, falling back to Monday drive,
// then to the project data dir for local dev without the drive mounted.

const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");

const MONDAY_DRIVE = "/Volumes/Monday/Monday";
const PROJECT_DATA = path.resolve(__dirname, "../../../data/state");

function resolveDbPath() {
  if (process.env.MONDAY_DB_PATH) return process.env.MONDAY_DB_PATH;
  if (fs.existsSync(MONDAY_DRIVE)) return path.join(MONDAY_DRIVE, "db", "monday.db");
  return path.join(PROJECT_DATA, "monday.db");
}

let _db = null;

function getDb() {
  if (_db) return _db;

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");   // safe concurrent reads
  _db.pragma("foreign_keys = ON");
  _db.pragma("synchronous = NORMAL"); // fast enough, safe enough

  applySchema(_db);
  console.log(`[db] opened: ${dbPath}`);
  return _db;
}

function applySchema(db) {
  db.exec(`
    -- Working theories: one per domain, full text
    CREATE TABLE IF NOT EXISTS working_theories (
      domain      TEXT PRIMARY KEY,
      text        TEXT NOT NULL,
      confidence  REAL DEFAULT 0.5,
      updated_at  TEXT NOT NULL
    );

    -- Theory revision history
    CREATE TABLE IF NOT EXISTS theory_revisions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      domain      TEXT NOT NULL,
      text        TEXT NOT NULL,
      confidence  REAL,
      at          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_theory_revisions_domain ON theory_revisions(domain);

    -- Open threads: significance threads Monday is tracking
    CREATE TABLE IF NOT EXISTS threads (
      id          TEXT PRIMARY KEY,
      domain      TEXT,
      title       TEXT,
      significance TEXT DEFAULT 'medium',
      status      TEXT DEFAULT 'open',
      content     TEXT DEFAULT '{}',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      closed_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_threads_domain ON threads(domain);
    CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);

    -- Triage state: single-row, replaced atomically
    CREATE TABLE IF NOT EXISTS triage_state (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      significant_now TEXT DEFAULT '[]',
      watching        TEXT DEFAULT '[]',
      background      TEXT DEFAULT '[]',
      updated_at      TEXT
    );
    INSERT OR IGNORE INTO triage_state (id) VALUES (1);

    -- Heartbeat log: rolling window, pruned to last 500
    CREATE TABLE IF NOT EXISTS heartbeat_log (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      loop  TEXT,
      data  TEXT DEFAULT '{}',
      at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_heartbeat_loop ON heartbeat_log(loop);
  `);
}

module.exports = { getDb, resolveDbPath };
