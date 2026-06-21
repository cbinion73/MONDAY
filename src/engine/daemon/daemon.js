"use strict";
// Monday Daemon — persistent process that wires all heartbeat loops.
// Start with: node ./src/engine/daemon/daemon.js
// Or via: npm run daemon
//
// Loops:
//   15-min  — continuous interrupt check (runMonitorOperative in lightweight mode)
//   hourly  — full monitor_operative: thread watch, synthesis, ripeness
//   7am     — morning_digest: daily brief, triage update, optional iMessage

const { schedule, start, stop, getJobs } = require("./scheduler");
const { runMorningDigest } = require("../workers/morning-digest-worker");
const { runMonitorOperative } = require("../workers/monitor-operative");
const gateway = require("../gateway/server");
const { initFromMissions } = require("../workspace/workspace-manager");

// Connector sync helpers — lazy-require so missing credentials don't block startup
async function syncConnectors() {
  const results = await Promise.allSettled([
    // Cozi: no auth — always runs
    require("../connectors/cozi-sync").syncCozi(),

    // Google: only if credentials are configured
    ...(process.env.GOOGLE_REFRESH_TOKEN ? [
      require("../connectors/gmail-sync").syncGmail(),
      require("../connectors/google-calendar-sync").syncGoogleCalendar(),
    ] : []),

    // Microsoft: only if credentials are configured
    ...(process.env.MICROSOFT_REFRESH_TOKEN ? [
      require("../connectors/outlook-sync").syncOutlook(),
      require("../connectors/outlook-calendar-sync").syncOutlookCalendar(),
    ] : []),
  ]);

  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[daemon] connector sync error:", r.reason?.message || r.reason);
    }
  }
}

// Lightweight 15-min check: only re-classify triage from current state.
// No LLM calls. No surfacing. Just keeps triage fresh.
async function runContinuousCheck() {
  const { runMemoryWorker } = require("../workers/memory-worker");
  const { getRecentCaptures } = require("../personal/personal-store");
  const captures = getRecentCaptures(10);
  runMemoryWorker({ operation: "classify-triage", payload: { captures } });
  console.log("[daemon] 15-min triage refresh done");
}

function registerJobs() {
  // 15-minute: lightweight triage refresh
  schedule("triage-refresh", { minuteInterval: 15 }, runContinuousCheck);

  // Hourly: full monitor_operative (thread watch, ripeness check, queue writes)
  schedule("monitor-operative", { minuteInterval: 60 }, runMonitorOperative);

  // Every 6 hours: deep synthesis (cross-domain pattern detection + theory revision)
  schedule("synthesis", { minuteInterval: 360 }, async () => {
    const { runSynthesisWorker } = require("../workers/synthesis-worker");
    const { getActiveThreads, getWorkingTheories } = require("../db/state-store");
    const { getRecentCaptures } = require("../personal/personal-store");
    const { pruneExpired } = require("../db/surfacing-store");

    pruneExpired();
    await runSynthesisWorker({
      threads:     getActiveThreads(),
      theories:    getWorkingTheories(),
      captures:    getRecentCaptures(30),
      triggerLoop: "6-hour",
    });
    // Synthesis worker writes deliverable + triggers review layer internally.
    // Review worker decides what (if anything) reaches Chris via surfacing queue.
  });

  // Every 30 minutes: sync connectors (Cozi + Google + Outlook mail + calendar)
  schedule("connector-sync", { minuteInterval: 30 }, syncConnectors);

  // 6:45am daily: morning digest
  schedule("morning-digest", { hour: 6, minute: 45 }, runMorningDigest);

  // Every 2 hours: review any deliverables workers wrote but didn't review yet
  schedule("review-deliverables", { minuteInterval: 120 }, async () => {
    const { reviewPendingDeliverables } = require("../workers/review-worker");
    const result = await reviewPendingDeliverables({ limit: 5 });
    if (result.reviewed > 0) {
      console.log(`[daemon] reviewed ${result.reviewed} deliverable(s), surfaced ${result.surfaced}`);
    }
  });
}

function printStatus() {
  const jobs = getJobs();
  console.log("\n[daemon] registered jobs:");
  for (const job of jobs) {
    console.log(`  ${job.name} — ${JSON.stringify(job.opts)} — last: ${job.lastRun || "never"}`);
  }
  console.log();
}

function setupGracefulShutdown() {
  process.on("SIGINT", () => {
    console.log("\n[daemon] SIGINT received — shutting down");
    stop();
    gateway.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("[daemon] SIGTERM received — shutting down");
    stop();
    gateway.stop();
    process.exit(0);
  });

  process.on("uncaughtException", (err) => {
    console.error("[daemon] uncaughtException:", err.message, err.stack);
    // Stay alive — daemon must not crash on worker failure
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[daemon] unhandledRejection:", reason?.message || reason);
    // Stay alive
  });
}

function main() {
  console.log("[daemon] Monday starting up...");
  console.log(`[daemon] PID: ${process.pid}`);
  console.log(`[daemon] env: MONDAY_IMESSAGE_PHONE=${process.env.MONDAY_IMESSAGE_PHONE || "(not set)"}`);
  console.log(`[daemon] env: MONDAY_STATE_DIR=${process.env.MONDAY_STATE_DIR || "data/state (default)"}`);

  setupGracefulShutdown();

  // Ensure all six domain workspaces exist
  try { initFromMissions(); } catch (e) { console.warn("[daemon] workspace init warning:", e.message); }

  registerJobs();
  printStatus();
  start();

  // Start inbound gateway alongside scheduler
  gateway.start();

  console.log("[daemon] Monday is watching.");
}

main();
