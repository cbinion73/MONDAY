"use strict";
// Monitor Operative — continuous/hourly, invisible (OpenJARVIS monitor_operative pattern).
// Watches open threads for state changes. Checks ripeness gates.
// Flags when threshold is crossed. Never talks to the user unless ripeness passes.

const store = require("../persistence/state-store");
const { runSynthesisWorker } = require("./synthesis-worker");
const { runMemoryWorker } = require("./memory-worker");
const { getRecentCaptures } = require("../personal/personal-store");
const { pruneExpired } = require("../db/surfacing-store");
const { writeDeliverable } = require("../db/deliverable-store");
const { runDeliverableReview } = require("./review-worker");

const MIN_HOURS_BETWEEN_SURFACES = 18;
const QUIET_DOMAIN_DAYS = 14; // days of silence before a domain is flagged

function hoursSince(isoString) {
  if (!isoString) return Infinity;
  return (Date.now() - Date.parse(isoString)) / (1000 * 60 * 60);
}

function daysSince(isoString) {
  return hoursSince(isoString) / 24;
}

function detectQuietDomains(threads, theories) {
  const DOMAINS = ["Health", "Publishing", "Retirement", "Family", "Faith", "Work"];
  const quiet = [];

  for (const domain of DOMAINS) {
    const domainThreads = threads.filter((t) => t.domain === domain);
    const theory = theories[domain];

    if (domainThreads.length === 0 && !theory) continue;

    const lastSeen = [
      ...domainThreads.map((t) => t.updatedAt),
      theory?.updatedAt,
    ].filter(Boolean).sort().at(-1);

    if (lastSeen && daysSince(lastSeen) > QUIET_DOMAIN_DAYS) {
      quiet.push({
        domain,
        daysSilent: Math.round(daysSince(lastSeen)),
        lastTheory: theory?.text || null,
      });
    }
  }

  return quiet;
}

function getLastSurfaceTime() {
  const log = store.getHeartbeatLog({ limit: 100 });
  const surfaceEntries = log.filter((e) => e.surfaced);
  const last = surfaceEntries.at(-1);
  return last ? last.at : null;
}

async function runMonitorOperative() {
  console.log("[monitor-operative] running hourly check...");
  const startedAt = Date.now();

  try {
    const threads = store.getActiveThreads();
    const theories = store.getWorkingTheories();
    const captures = getRecentCaptures(20);

    // Reclassify triage from current state
    runMemoryWorker({
      operation: "classify-triage",
      payload: { captures },
    });

    // Check if enough time has passed since last surface
    const lastSurface = getLastSurfaceTime();
    const hoursSinceSurface = hoursSince(lastSurface);
    const canSurface = hoursSinceSurface >= MIN_HOURS_BETWEEN_SURFACES;

    // Detect quiet domains
    const quietDomains = detectQuietDomains(threads, theories);

    // Run synthesis if we have threads or captures
    let synthesisResult = null;
    if (threads.length > 0 || captures.length > 0) {
      synthesisResult = await runSynthesisWorker({
        threads,
        theories,
        captures,
        triggerLoop: "hourly",
      });

      // Apply theory revisions to state
      for (const revision of synthesisResult.theoryRevisions || []) {
        runMemoryWorker({
          operation: "set-theory",
          payload: { domain: revision.domain, text: revision.newTheory },
        });
      }
    }

    const shouldSurface = canSurface && synthesisResult?.shouldSurface;
    const surfacePayload = shouldSurface ? synthesisResult?.surfacePayload : null;

    // Synthesis worker now writes its own deliverable and triggers the review layer.
    // Monitor only needs to prune expired surfacing entries.
    pruneExpired();

    // Write a monitor-level deliverable for quiet domain notices (separate from synthesis)
    if (quietDomains.length > 0) {
      const quietContent = quietDomains.map(q =>
        `- **${q.domain}**: ${q.daysSilent} days without activity`
      ).join("\n");
      const { filePath } = writeDeliverable({
        source:     "monitor",
        domain:     null,
        title:      "Quiet Domains Notice",
        content:    `## Domains Going Quiet\n\n${quietContent}\n\n_These domains have been silent longer than the ${QUIET_DOMAIN_DAYS}-day threshold._`,
        confidence: 0.5,
      });
      runDeliverableReview({ filePath, source: "monitor" }).catch(err =>
        console.error("[monitor-operative] review error:", err.message)
      );
    }

    // Add quiet domain notices to triage watching list
    if (quietDomains.length > 0) {
      const existing = store.getTriageState();
      const quietItems = quietDomains.map((q) => ({
        id: `quiet:${q.domain}`,
        label: `${q.domain} has been quiet for ${q.daysSilent} days`,
        domain: q.domain,
        source: "monitor",
        protected: true,
      }));

      store.setTriageState({
        ...existing,
        watching: [
          ...quietItems,
          ...(existing.watching || []).filter((i) => !i.id?.startsWith("quiet:")),
        ].slice(0, 8),
      });
    }

    // Log
    store.appendHeartbeatLog({
      loop: "hourly",
      latencyMs: Date.now() - startedAt,
      threadCount: threads.length,
      quietDomains: quietDomains.map((q) => q.domain),
      synthesisObservations: (synthesisResult?.observations || []).length,
      theoryRevisions: (synthesisResult?.theoryRevisions || []).length,
      surfaced: shouldSurface,
      surfacePayload,
    });

    // Deliver via iMessage if ripeness passed and configured
    if (shouldSurface && surfacePayload && process.env.MONDAY_IMESSAGE_PHONE) {
      const { sendViaiMessage } = require("../channels/imessage");
      await sendViaiMessage(surfacePayload).catch((err) =>
        console.error("[monitor-operative] iMessage delivery failed:", err.message)
      );
    }

    console.log(`[monitor-operative] done in ${Date.now() - startedAt}ms — surfaced: ${shouldSurface}`);
    return {
      ok: true,
      threadsChecked: threads.length,
      quietDomains,
      shouldSurface,
      surfacePayload,
      synthesis: synthesisResult,
    };
  } catch (err) {
    console.error("[monitor-operative] error:", err.message);
    store.appendHeartbeatLog({
      loop: "hourly",
      error: err.message,
      latencyMs: Date.now() - startedAt,
    });
    return { ok: false, error: err.message };
  }
}

module.exports = { runMonitorOperative };
