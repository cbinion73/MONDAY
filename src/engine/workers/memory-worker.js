"use strict";
// Memory Worker — on-demand, invisible.
// Reads and writes persistent state. Never talks to the user.

const store = require("../persistence/state-store");

const SIGNIFICANCE_DOMAINS = ["Health", "Publishing", "Retirement", "Family", "Faith", "Work"];

/**
 * Classify items into triage buckets using the significance resolver logic.
 * Significant Now: ripeness passed + high significance.
 * Watching: accumulating evidence but not yet ripe.
 * Background: low significance or no recent activity.
 */
function classifyTriage({ threads, theories, captures = [] }) {
  const significantNow = [];
  const watching = [];
  const background = [];

  for (const thread of threads) {
    const daysSinceUpdate = thread.updatedAt
      ? (Date.now() - Date.parse(thread.updatedAt)) / (1000 * 60 * 60 * 24)
      : 999;

    const occurrences = thread.occurrences || 1;
    const ripenessScore =
      (occurrences >= 3 ? 1 : 0) +
      (thread.significanceHigh ? 1 : 0) +
      (daysSinceUpdate < 7 ? 1 : 0);

    if (ripenessScore >= 2 && thread.significance === "high") {
      significantNow.push({ id: thread.id, label: thread.label || thread.id, domain: thread.domain });
    } else if (occurrences >= 2 || daysSinceUpdate < 14) {
      watching.push({ id: thread.id, label: thread.label || thread.id, domain: thread.domain });
    } else {
      background.push({ id: thread.id, label: thread.label || thread.id, domain: thread.domain });
    }
  }

  // Domains with a theory but no active thread go to background
  for (const domain of SIGNIFICANCE_DOMAINS) {
    if (theories[domain] && !threads.find((t) => t.domain === domain)) {
      background.push({ id: `theory:${domain}`, label: `${domain} — theory active`, domain });
    }
  }

  return { significantNow, watching, background };
}

/**
 * Run the memory worker.
 * @param {object} opts
 *   opts.operation - "read-threads" | "read-theories" | "upsert-thread" | "close-thread"
 *                    | "set-theory" | "classify-triage" | "read-triage" | "log-heartbeat"
 *   opts.payload   - operation-specific data
 */
function runMemoryWorker({ operation, payload = {} }) {
  switch (operation) {
    case "read-threads":
      return { ok: true, data: store.getActiveThreads() };

    case "read-theories":
      return { ok: true, data: store.getWorkingTheories() };

    case "upsert-thread": {
      if (!payload.id) return { ok: false, data: null, error: "Missing thread id" };
      store.upsertThread(payload.id, payload);
      return { ok: true, data: store.getActiveThreads().find((t) => t.id === payload.id) };
    }

    case "close-thread": {
      if (!payload.id) return { ok: false, data: null, error: "Missing thread id" };
      store.closeThread(payload.id);
      return { ok: true, data: null };
    }

    case "set-theory": {
      if (!payload.domain || !payload.text) {
        return { ok: false, data: null, error: "Missing domain or text" };
      }
      const saved = store.setWorkingTheory(payload.domain, payload.text);
      return { ok: true, data: saved };
    }

    case "classify-triage": {
      const threads = store.getActiveThreads();
      const theories = store.getWorkingTheories();
      const triage = classifyTriage({ threads, theories, captures: payload.captures || [] });
      store.setTriageState(triage);
      return { ok: true, data: triage };
    }

    case "read-triage":
      return { ok: true, data: store.getTriageState() };

    case "log-heartbeat": {
      store.appendHeartbeatLog(payload);
      return { ok: true, data: null };
    }

    default:
      return { ok: false, data: null, error: `Unknown operation: ${operation}` };
  }
}

module.exports = { runMemoryWorker, classifyTriage };
