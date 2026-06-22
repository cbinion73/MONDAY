"use strict";
// db/connection.js — SQLite connection singleton with versioned migrations.
// One database, one connection, opened once on require().
// Path resolves from MONDAY_DB_PATH env → Monday drive → project data dir.
//
// Migration rules:
//   - Each migration has a unique integer version and runs exactly once.
//   - Migrations run in order inside a single transaction.
//   - Never edit a migration that has already run — add a new one instead.
//   - All DDL uses IF NOT EXISTS / IF EXISTS so replaying is safe.

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
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("synchronous = NORMAL");

  runMigrations(_db);
  console.log(`[db] opened: ${dbPath}`);
  return _db;
}

// ── Migration runner ──────────────────────────────────────────────────────────

function runMigrations(db) {
  // Bootstrap the migrations table before running anything else.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version)
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString()
      );
    })();

    console.log(`[db] migration ${migration.version} applied`);
  }
}

// ── Migrations ────────────────────────────────────────────────────────────────
// RULE: Never edit a migration below. Add a new entry at the bottom.

const MIGRATIONS = [
  // ── 001: Core operational state ────────────────────────────────────────────
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS working_theories (
        domain      TEXT PRIMARY KEY,
        text        TEXT NOT NULL,
        confidence  REAL DEFAULT 0.5,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS theory_revisions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        domain      TEXT NOT NULL,
        text        TEXT NOT NULL,
        confidence  REAL,
        at          TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_theory_revisions_domain ON theory_revisions(domain);

      CREATE TABLE IF NOT EXISTS threads (
        id           TEXT PRIMARY KEY,
        domain       TEXT,
        title        TEXT,
        significance TEXT DEFAULT 'medium',
        status       TEXT DEFAULT 'open',
        content      TEXT DEFAULT '{}',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        closed_at    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_threads_domain ON threads(domain);
      CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);

      CREATE TABLE IF NOT EXISTS triage_state (
        id              INTEGER PRIMARY KEY CHECK (id = 1),
        significant_now TEXT DEFAULT '[]',
        watching        TEXT DEFAULT '[]',
        background      TEXT DEFAULT '[]',
        updated_at      TEXT
      );
      INSERT OR IGNORE INTO triage_state (id) VALUES (1);

      CREATE TABLE IF NOT EXISTS heartbeat_log (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        loop  TEXT,
        data  TEXT DEFAULT '{}',
        at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_heartbeat_loop ON heartbeat_log(loop);
    `,
  },

  // ── 002: Personal Knowledge and Memory subsystem ───────────────────────────
  {
    version: 2,
    sql: `
      -- Vault note index: one row per markdown file in Obsidian
      CREATE TABLE IF NOT EXISTS notes (
        path         TEXT PRIMARY KEY,
        title        TEXT,
        folder       TEXT,
        type         TEXT DEFAULT 'note',
        domain       TEXT,
        frontmatter  TEXT DEFAULT '{}',
        body_hash    TEXT,
        mtime        TEXT,
        word_count   INTEGER DEFAULT 0,
        indexed_at   TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notes_folder    ON notes(folder);
      CREATE INDEX IF NOT EXISTS idx_notes_domain    ON notes(domain);
      CREATE INDEX IF NOT EXISTS idx_notes_type      ON notes(type);
      CREATE INDEX IF NOT EXISTS idx_notes_mtime     ON notes(mtime);
      CREATE INDEX IF NOT EXISTS idx_notes_body_hash ON notes(body_hash);

      -- Wikilinks and other inter-note links
      CREATE TABLE IF NOT EXISTS note_links (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        source_path  TEXT NOT NULL,
        target_path  TEXT,
        target_alias TEXT NOT NULL,
        link_type    TEXT DEFAULT 'wikilink',
        created_at   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_path);
      CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_path);

      -- Tag index
      CREATE TABLE IF NOT EXISTS note_tags (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        note_path  TEXT NOT NULL,
        tag        TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_note_tags_unique ON note_tags(note_path, tag);
      CREATE INDEX IF NOT EXISTS idx_note_tags_tag       ON note_tags(tag);
      CREATE INDEX IF NOT EXISTS idx_note_tags_note_path ON note_tags(note_path);

      -- Knowledge graph nodes
      -- Types: Person, Relationship, Mission, Decision, Belief, Preference,
      --        Goal, Project, Memory, Lesson, Contradiction, Event, Organization, Place
      CREATE TABLE IF NOT EXISTS entities (
        id          TEXT PRIMARY KEY,
        type        TEXT NOT NULL,
        name        TEXT NOT NULL,
        aliases     TEXT DEFAULT '[]',
        description TEXT,
        domain      TEXT,
        source_path TEXT,
        confidence  REAL DEFAULT 0.8,
        properties  TEXT DEFAULT '{}',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entities_type   ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_name   ON entities(name);
      CREATE INDEX IF NOT EXISTS idx_entities_domain ON entities(domain);
      CREATE INDEX IF NOT EXISTS idx_entities_source ON entities(source_path);

      -- Knowledge graph edges
      -- Relation types: spouse_of, parent_of, child_of, works_for, reports_to,
      --                 belongs_to, supports, conflicts_with, derived_from, related_to
      CREATE TABLE IF NOT EXISTS entity_relations (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entity_id TEXT NOT NULL,
        to_entity_id   TEXT NOT NULL,
        relation_type  TEXT NOT NULL,
        confidence     REAL DEFAULT 0.8,
        source_path    TEXT,
        properties     TEXT DEFAULT '{}',
        created_at     TEXT NOT NULL,
        FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (to_entity_id)   REFERENCES entities(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_entity_relations_from   ON entity_relations(from_entity_id);
      CREATE INDEX IF NOT EXISTS idx_entity_relations_to     ON entity_relations(to_entity_id);
      CREATE INDEX IF NOT EXISTS idx_entity_relations_type   ON entity_relations(relation_type);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_relations_unique
        ON entity_relations(from_entity_id, to_entity_id, relation_type);

      -- Memory review queue: candidates waiting for approval before Obsidian write-back
      -- Status flow: pending → approved → written
      --              pending → rejected
      CREATE TABLE IF NOT EXISTS memory_candidates (
        id              TEXT PRIMARY KEY,
        source          TEXT NOT NULL,
        source_ref      TEXT,
        content         TEXT NOT NULL,
        proposed_folder TEXT,
        proposed_title  TEXT,
        proposed_body   TEXT,
        reason          TEXT,
        confidence      REAL DEFAULT 0.5,
        status          TEXT DEFAULT 'pending',
        reviewed_at     TEXT,
        written_path    TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_candidates_status  ON memory_candidates(status);
      CREATE INDEX IF NOT EXISTS idx_memory_candidates_created ON memory_candidates(created_at);

      -- Audit log for review decisions
      CREATE TABLE IF NOT EXISTS memory_reviews (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id TEXT NOT NULL,
        decision     TEXT NOT NULL,
        reason       TEXT,
        reviewed_at  TEXT NOT NULL,
        FOREIGN KEY (candidate_id) REFERENCES memory_candidates(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_memory_reviews_candidate ON memory_reviews(candidate_id);

      -- Track each vault indexing run for monitoring and debugging
      CREATE TABLE IF NOT EXISTS indexing_runs (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at     TEXT NOT NULL,
        completed_at   TEXT,
        status         TEXT DEFAULT 'running',
        notes_scanned  INTEGER DEFAULT 0,
        notes_indexed  INTEGER DEFAULT 0,
        notes_skipped  INTEGER DEFAULT 0,
        notes_deleted  INTEGER DEFAULT 0,
        error          TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_indexing_runs_status  ON indexing_runs(status);
      CREATE INDEX IF NOT EXISTS idx_indexing_runs_started ON indexing_runs(started_at);

      -- Cross-reference between note chunks and LanceDB embeddings
      -- chunk_id matches the LanceDB row id; used to detect stale/changed embeddings
      CREATE TABLE IF NOT EXISTS embedding_records (
        id          TEXT PRIMARY KEY,
        note_path   TEXT NOT NULL,
        heading     TEXT,
        chunk_index INTEGER DEFAULT 0,
        chunk_hash  TEXT NOT NULL,
        model       TEXT NOT NULL,
        dimensions  INTEGER NOT NULL,
        embedded_at TEXT NOT NULL,
        note_mtime  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_embedding_records_path ON embedding_records(note_path);
      CREATE INDEX IF NOT EXISTS idx_embedding_records_hash ON embedding_records(chunk_hash);

      -- Structured mission records (mirrors Obsidian Missions/ but queryable)
      CREATE TABLE IF NOT EXISTS missions (
        id             TEXT PRIMARY KEY,
        title          TEXT NOT NULL,
        domain         TEXT NOT NULL,
        type           TEXT DEFAULT 'personal',
        status         TEXT DEFAULT 'active',
        seed_theory    TEXT,
        current_theory TEXT,
        vault_path     TEXT,
        properties     TEXT DEFAULT '{}',
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_missions_domain ON missions(domain);
      CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);

      -- Decision log (mirrors Obsidian Decisions/ but queryable)
      CREATE TABLE IF NOT EXISTS decisions (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        domain      TEXT,
        mission_id  TEXT,
        reason      TEXT,
        context     TEXT,
        outcome     TEXT,
        status      TEXT DEFAULT 'made',
        vault_path  TEXT,
        decided_at  TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_decisions_domain   ON decisions(domain);
      CREATE INDEX IF NOT EXISTS idx_decisions_mission  ON decisions(mission_id);
      CREATE INDEX IF NOT EXISTS idx_decisions_decided  ON decisions(decided_at);

      -- Contradiction log (mirrors Obsidian Contradictions/ but queryable)
      CREATE TABLE IF NOT EXISTS contradictions (
        id               TEXT PRIMARY KEY,
        domain           TEXT,
        mission_id       TEXT,
        declared_value   TEXT NOT NULL,
        observed_pattern TEXT NOT NULL,
        status           TEXT DEFAULT 'active',
        resolution       TEXT,
        vault_path       TEXT,
        detected_at      TEXT NOT NULL,
        resolved_at      TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_contradictions_domain ON contradictions(domain);
      CREATE INDEX IF NOT EXISTS idx_contradictions_status ON contradictions(status);

      -- People Chris knows: family, colleagues, friends
      CREATE TABLE IF NOT EXISTS people (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        aliases     TEXT DEFAULT '[]',
        relation    TEXT,
        domain      TEXT,
        notes       TEXT,
        entity_id   TEXT,
        vault_path  TEXT,
        properties  TEXT DEFAULT '{}',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_people_name     ON people(name);
      CREATE INDEX IF NOT EXISTS idx_people_relation ON people(relation);

      -- Stated and observed preferences
      CREATE TABLE IF NOT EXISTS preferences (
        id          TEXT PRIMARY KEY,
        category    TEXT NOT NULL,
        key         TEXT NOT NULL,
        value       TEXT NOT NULL,
        source      TEXT DEFAULT 'stated',
        confidence  REAL DEFAULT 0.7,
        source_path TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_preferences_key      ON preferences(category, key);
      CREATE INDEX IF NOT EXISTS idx_preferences_category        ON preferences(category);

      -- Timeline of significant life events
      CREATE TABLE IF NOT EXISTS life_events (
        id                    TEXT PRIMARY KEY,
        title                 TEXT NOT NULL,
        description           TEXT,
        domain                TEXT,
        event_type            TEXT DEFAULT 'event',
        significance          TEXT DEFAULT 'medium',
        happened_at           TEXT NOT NULL,
        happened_at_precision TEXT DEFAULT 'day',
        people                TEXT DEFAULT '[]',
        source_path           TEXT,
        properties            TEXT DEFAULT '{}',
        created_at            TEXT NOT NULL,
        updated_at            TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_life_events_happened     ON life_events(happened_at);
      CREATE INDEX IF NOT EXISTS idx_life_events_domain       ON life_events(domain);
      CREATE INDEX IF NOT EXISTS idx_life_events_type         ON life_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_life_events_significance ON life_events(significance);
    `,
  },

  // ── 003: Entity extraction tracking ────────────────────────────────────────
  {
    version: 3,
    sql: `
      ALTER TABLE notes ADD COLUMN entity_extracted_at TEXT;
    `,
  },

  // ── 004: Surfacing queue — proactive findings Monday surfaces at turn start ─
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS surfacing_queue (
        id          TEXT PRIMARY KEY,
        source      TEXT NOT NULL,
        domain      TEXT,
        payload     TEXT NOT NULL,
        confidence  REAL DEFAULT 0.5,
        priority    INTEGER DEFAULT 5,
        surfaced    INTEGER DEFAULT 0,
        surfaced_at TEXT,
        created_at  TEXT NOT NULL,
        expires_at  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_surfacing_unsurfaced ON surfacing_queue(surfaced, priority, created_at);
    `,
  },

  // ── 005: LLM cost log — per-call cloud model usage and spend ────────────────
  {
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS llm_cost_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        model           TEXT NOT NULL,
        tier            TEXT,
        purpose         TEXT,
        input_tokens    INTEGER DEFAULT 0,
        output_tokens   INTEGER DEFAULT 0,
        input_cost_usd  REAL DEFAULT 0,
        output_cost_usd REAL DEFAULT 0,
        total_cost_usd  REAL DEFAULT 0,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cost_log_created ON llm_cost_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_cost_log_model   ON llm_cost_log(model);
      CREATE INDEX IF NOT EXISTS idx_cost_log_tier    ON llm_cost_log(tier);
    `,
  },

  // ── 006: Email intelligence cache + structured facts ───────────────────────
  {
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS email_threads (
        thread_id                  TEXT PRIMARY KEY,
        source                     TEXT NOT NULL,
        subject                    TEXT,
        from_address               TEXT,
        provider_category          TEXT,
        provider_labels            TEXT DEFAULT '[]',
        folder                     TEXT,
        received_at                TEXT,
        unread                     INTEGER DEFAULT 0,
        starred                    INTEGER DEFAULT 0,
        has_attachments            INTEGER DEFAULT 0,
        relationship_score         REAL DEFAULT 0,
        junk_score                 REAL DEFAULT 0,
        significance_score         REAL DEFAULT 0,
        domain                     TEXT,
        thread_type                TEXT,
        actionability              REAL DEFAULT 0,
        entities                   TEXT DEFAULT '[]',
        structured_facts           TEXT DEFAULT '[]',
        local_classification       TEXT DEFAULT '{}',
        classification_confidence  REAL DEFAULT 0,
        user_participated          INTEGER DEFAULT 0,
        message_count              INTEGER DEFAULT 0,
        body_hash                  TEXT,
        updated_at                 TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_email_threads_source        ON email_threads(source);
      CREATE INDEX IF NOT EXISTS idx_email_threads_category      ON email_threads(provider_category);
      CREATE INDEX IF NOT EXISTS idx_email_threads_domain        ON email_threads(domain);
      CREATE INDEX IF NOT EXISTS idx_email_threads_type          ON email_threads(thread_type);
      CREATE INDEX IF NOT EXISTS idx_email_threads_significance  ON email_threads(significance_score);
      CREATE INDEX IF NOT EXISTS idx_email_threads_junk          ON email_threads(junk_score);
      CREATE INDEX IF NOT EXISTS idx_email_threads_received      ON email_threads(received_at);

      CREATE TABLE IF NOT EXISTS email_thread_facts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id   TEXT NOT NULL,
        fact_type   TEXT NOT NULL,
        fact_key    TEXT,
        fact_value  TEXT NOT NULL,
        confidence  REAL DEFAULT 0.8,
        created_at  TEXT NOT NULL,
        FOREIGN KEY (thread_id) REFERENCES email_threads(thread_id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_email_thread_facts_unique
        ON email_thread_facts(thread_id, fact_type, IFNULL(fact_key, ''), fact_value);
      CREATE INDEX IF NOT EXISTS idx_email_thread_facts_thread ON email_thread_facts(thread_id);
      CREATE INDEX IF NOT EXISTS idx_email_thread_facts_type   ON email_thread_facts(fact_type);
    `,
  },

  // ── 007: Katy correspondence preservation ledger ─────────────────────────
  {
    version: 7,
    sql: `
      CREATE TABLE IF NOT EXISTS email_memory_records (
        thread_id           TEXT PRIMARY KEY,
        body_hash           TEXT,
        preserve_state      TEXT DEFAULT 'preserved',
        preserve_reason     TEXT,
        preserve_score      REAL DEFAULT 0,
        vector_doc_id       TEXT,
        summary             TEXT,
        last_preserved_at   TEXT NOT NULL,
        FOREIGN KEY (thread_id) REFERENCES email_threads(thread_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_email_memory_state      ON email_memory_records(preserve_state);
      CREATE INDEX IF NOT EXISTS idx_email_memory_preserved  ON email_memory_records(last_preserved_at);
    `,
  },
];

module.exports = { getDb, resolveDbPath };
