"use strict";
// pkm-e2e.test.js — End-to-end HTTP tests for the PKM sandbox API routes.
//
// Starts the Monday sandbox server in-process, exercises the full HTTP surface
// for the PKM pipeline: curator queue, vault search, write-back, memory recall.
//
// This is the equivalent of Playwright for the sandbox's REST API layer —
// it tests the full request/response path without mocking the HTTP layer.
//
// Requires: no external services. Uses in-memory SQLite and a temp vault.
// Runtime: ~5–10 seconds (server start + route tests).

const http   = require("node:http");
const fs     = require("node:fs");
const path   = require("node:path");
const os     = require("node:os");

// ── Environment setup (before any engine modules are loaded) ──────────────────

const TEMP_VAULT  = fs.mkdtempSync(path.join(os.tmpdir(), "monday-e2e-vault-"));
const TEMP_MEMORY = fs.mkdtempSync(path.join(os.tmpdir(), "monday-e2e-mem-"));
const TEST_PORT   = 19473; // fixed non-standard port to avoid collision

process.env.MONDAY_VAULT_ROOT    = TEMP_VAULT;
process.env.MONDAY_DB_PATH       = ":memory:";
process.env.MONDAY_MEMORY_DIR    = TEMP_MEMORY;
process.env.MONDAY_SANDBOX_PORT  = String(TEST_PORT);
// Disable Ollama and paid LLMs so no external calls are made
process.env.MONDAY_OLLAMA_ENABLED = "false";
process.env.OPENAI_API_KEY        = "";

// Pre-seed the vault with a couple of notes before the server starts
fs.mkdirSync(path.join(TEMP_VAULT, "Retirement"), { recursive: true });
fs.mkdirSync(path.join(TEMP_VAULT, "Family"),     { recursive: true });

fs.writeFileSync(path.join(TEMP_VAULT, "Retirement", "goals.md"), `---
title: Retirement Goals
domain: retirement
tags: [retirement, goals, financial]
---
# Retirement Goals

The golden line: $15,000/month passive income.
`);

fs.writeFileSync(path.join(TEMP_VAULT, "Family", "presence.md"), `---
title: Family Presence
domain: family
tags: [family, presence, kids]
---
# Being Present

Weekly check-ins. Summer camp. Sunday dinners.
`);

// ── Test harness ──────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function ok(label) {
  console.log(`  ✓ ${label}`);
  pass++;
}

function nok(label, msg) {
  console.error(`  ✗ ${label}`);
  console.error(`    ${msg}`);
  fail++;
}

// HTTP helper — returns { status, body } where body is parsed JSON
function request(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: "127.0.0.1",
      port: TEST_PORT,
      path: urlPath,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, body: JSON.parse(text) });
        } catch (err) {
          resolve({ status: res.statusCode, body: {} });
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get  = (p)       => request("GET",   p);
const post = (p, body) => request("POST",  p, body);
const patch = (p, body) => request("PATCH", p, body);

async function runTests(server) {
  // ── Curator queue routes ────────────────────────────────────────────────────

  console.log("\nE2E — Memory Curator routes");

  {
    const { status, body } = await get("/api/monday-sandbox/curator/stats");
    if (status === 200 && body.ok !== false)
      ok("GET /curator/stats returns 200");
    else
      nok("GET /curator/stats returns 200", `got ${status} ${JSON.stringify(body)}`);
  }

  {
    const { status, body } = await get("/api/monday-sandbox/curator/queue?limit=10");
    if (status === 200 && Array.isArray(body.candidates))
      ok("GET /curator/queue returns candidates array");
    else
      nok("GET /curator/queue returns candidates array", `got ${status} ${JSON.stringify(body)}`);
  }

  {
    const { status, body } = await post("/api/monday-sandbox/curator/queue/from-entities");
    if (status === 200 && typeof body.queued === "number")
      ok("POST /curator/queue/from-entities returns queued count");
    else
      nok("POST /curator/queue/from-entities returns queued count", `got ${status} ${JSON.stringify(body)}`);
  }

  // Queue a test candidate manually
  let testCandidateId = null;
  {
    const { status, body } = await post("/api/monday-sandbox/curator/queue", {
      content: "E2E test: Chris wants $15k/month passive income by 58.",
      type: "Belief",
      domain: "retirement",
      confidence: 0.88,
      source: "e2e-test",
    });
    if (status === 200 && body.ok && body.id) {
      testCandidateId = body.id;
      ok("POST /curator/queue queues a candidate and returns id");
    } else {
      nok("POST /curator/queue queues a candidate and returns id", `got ${status} ${JSON.stringify(body)}`);
    }
  }

  // Approve it
  if (testCandidateId) {
    const { status, body } = await patch(`/api/monday-sandbox/curator/${encodeURIComponent(testCandidateId)}/approve`, { reason: "e2e approval" });
    if (status === 200 && body.ok)
      ok("PATCH /curator/:id/approve approves a candidate");
    else
      nok("PATCH /curator/:id/approve approves a candidate", `got ${status} ${JSON.stringify(body)}`);
  }

  // Queue another, reject it
  let rejectId = null;
  {
    const { status, body } = await post("/api/monday-sandbox/curator/queue", {
      content: "Low-quality E2E test candidate.",
      type: "Note",
      domain: "work",
      confidence: 0.25,
      source: "e2e-test",
    });
    if (status === 200 && body.ok && body.id) rejectId = body.id;
  }

  if (rejectId) {
    const { status, body } = await patch(`/api/monday-sandbox/curator/${encodeURIComponent(rejectId)}/reject`, { reason: "e2e rejection" });
    if (status === 200 && body.ok)
      ok("PATCH /curator/:id/reject rejects a candidate");
    else
      nok("PATCH /curator/:id/reject rejects a candidate", `got ${status} ${JSON.stringify(body)}`);
  }

  // ── Vault context search route ──────────────────────────────────────────────

  console.log("\nE2E — Vault context search route");

  {
    const { status, body } = await get("/api/monday-sandbox/vault/search?q=retirement+goals&channels=keyword&limit=5");
    if (status === 200 && Array.isArray(body.results))
      ok("GET /vault/search returns results array");
    else
      nok("GET /vault/search returns results array", `got ${status} ${JSON.stringify(body)}`);
  }

  {
    const { status } = await get("/api/monday-sandbox/vault/search");
    if (status === 400)
      ok("GET /vault/search without q returns 400");
    else
      nok("GET /vault/search without q returns 400", `got ${status}`);
  }

  {
    const { status, body } = await get("/api/monday-sandbox/vault/search?q=family+presence&channels=keyword,graph&limit=8");
    if (status === 200 && typeof body.ok !== "undefined")
      ok("GET /vault/search with multi-channel param succeeds");
    else
      nok("GET /vault/search with multi-channel param succeeds", `got ${status} ${JSON.stringify(body)}`);
  }

  // ── Write-back route ────────────────────────────────────────────────────────

  console.log("\nE2E — Write-back routes");

  {
    const { status, body } = await post("/api/monday-sandbox/write-back/approved");
    // approved candidates in vault require vault to be available
    // result.ok is true only if vault path is accessible (TEMP_VAULT is)
    if (status === 200 && typeof body.written === "number")
      ok("POST /write-back/approved returns written count");
    else
      nok("POST /write-back/approved returns written count", `got ${status} ${JSON.stringify(body)}`);
  }

  {
    const { status, body } = await post("/api/monday-sandbox/write-back/append", {
      relPath: "Retirement/goals.md",
      content: "E2E appended content.",
      source: "e2e-test",
    });
    if (status === 200 && body.ok)
      ok("POST /write-back/append appends to an existing note");
    else
      nok("POST /write-back/append appends to an existing note", `got ${status} ${JSON.stringify(body)}`);
  }

  {
    const { status, body } = await post("/api/monday-sandbox/write-back/append", {});
    if (status === 400)
      ok("POST /write-back/append without body returns 400");
    else
      nok("POST /write-back/append without body returns 400", `got ${status}`);
  }

  // ── Curator stats after all operations ─────────────────────────────────────

  console.log("\nE2E — Curator stats after operations");

  {
    const { status, body } = await get("/api/monday-sandbox/curator/stats");
    // approved candidates are moved to "written" after write-back runs,
    // so check that rejected ≥ 1 and total reviewed (approved + written + rejected) ≥ 2
    const reviewed = (body.approved || 0) + (body.written || 0) + (body.rejected || 0);
    if (status === 200 && body.rejected >= 1 && reviewed >= 2)
      ok("Curator stats reflect reviewed candidates after operations");
    else
      nok("Curator stats reflect reviewed candidates after operations", `got ${status} ${JSON.stringify(body)}`);
  }

  // ── Health / obsidian status ────────────────────────────────────────────────

  console.log("\nE2E — General API health");

  {
    const { status, body } = await get("/api/monday-sandbox/obsidian/status");
    if (status === 200 && typeof body.available === "boolean")
      ok("GET /obsidian/status returns available field");
    else
      nok("GET /obsidian/status returns available field", `got ${status} ${JSON.stringify(body)}`);
  }

  {
    const { status } = await get("/api/monday-sandbox/nonexistent-route");
    if (status === 404)
      ok("Unknown routes return 404");
    else
      nok("Unknown routes return 404", `got ${status}`);
  }
}

// ── Boot server and run ───────────────────────────────────────────────────────

async function main() {
  // Clear engine module cache for fresh env
  Object.keys(require.cache).forEach((k) => {
    if (k.includes("/engine/") || k.includes("/sandbox/")) delete require.cache[k];
  });

  // Start the sandbox server
  const server = require("../src/sandbox/server");

  // Wait for the server to be ready (it listens after module load)
  await new Promise((resolve) => setTimeout(resolve, 800));

  try {
    await runTests(server);
  } finally {
    // Shut down
    try { server.close?.(); } catch {}
    try { fs.rmSync(TEMP_VAULT,  { recursive: true, force: true }); } catch {}
    try { fs.rmSync(TEMP_MEMORY, { recursive: true, force: true }); } catch {}
  }

  console.log(`\npkm-e2e: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => { console.error("E2E error:", err); process.exit(1); });
