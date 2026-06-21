"use strict";
// Morning Digest Worker — scheduled at 7am (OpenJARVIS morning_digest pattern).
// Runs the daily brief through a significance filter.
// Delivers to the triage state for the UI. Optionally delivers via iMessage.

const { generateDailyBrief } = require("../intelligence/monday-intelligence");
const {
  getMissionSummary,
  getRecentCaptures,
} = require("../personal/personal-store");
const {
  getCalendarSummary,
} = require("../connectors/calendar-context");
const {
  getDocumentsSummary,
} = require("../connectors/documents-context");
const {
  getEmailSummary,
} = require("../connectors/email-context");
const {
  getFinancialSummary,
} = require("../connectors/financial-context");
const { runMemoryWorker } = require("./memory-worker");
const store = require("../persistence/state-store");

// Significance filter: only pass through items that genuinely deserve attention.
// Mirrors Monday doctrine: significance over urgency.
function applySignificanceFilter(brief) {
  if (!brief) return brief;

  // stillMatters and deservesProtection always pass — they're already filtered
  // needsAttention: only pass items with significant weight, drop admin noise
  const filteredAttention = (brief.needsAttention || []).filter((item) => {
    const lower = item.toLowerCase();
    // Drop pure logistical/administrative items
    const isAdmin = /\b(reminder|appointment|meeting|call|sync|standup|deadline)\b/i.test(lower);
    const hasSignificance = /\b(family|faith|health|retirement|book|publishing|identity|meaning|relationship)\b/i.test(lower);
    return hasSignificance || !isAdmin;
  });

  return {
    ...brief,
    needsAttention: filteredAttention,
    significanceFiltered: true,
  };
}

function buildTriageFromBrief(brief) {
  const significantNow = [];
  const watching = [];
  const background = [];

  // Items needing attention → Significant Now
  for (const item of (brief.needsAttention || []).slice(0, 3)) {
    significantNow.push({ id: `brief:attention:${Date.now()}`, label: item, source: "daily-brief" });
  }

  // stillMatters → Watching
  for (const domain of (brief.stillMatters || []).slice(0, 4)) {
    watching.push({ id: `brief:matters:${domain}`, label: `${domain} is still active`, source: "daily-brief" });
  }

  // deservesProtection → Watching (with protection flag)
  for (const item of (brief.deservesProtection || []).slice(0, 2)) {
    watching.push({ id: `brief:protect:${Date.now()}`, label: item, source: "daily-brief", protected: true });
  }

  // changed items → Background (already handled, low urgency)
  for (const item of (brief.changed || []).slice(0, 3)) {
    background.push({ id: `brief:changed:${Date.now()}`, label: item, source: "daily-brief" });
  }

  return { significantNow, watching, background };
}

async function runMorningDigest() {
  console.log("[morning-digest] starting...");
  const startedAt = Date.now();

  try {
    const missions = getMissionSummary();
    const captures = getRecentCaptures(20);
    const calendar = getCalendarSummary();
    const documents = getDocumentsSummary({ limit: 6 });
    const email = getEmailSummary({ limit: 6 });
    const finances = getFinancialSummary({ limit: 6 });

    const rawBrief = await generateDailyBrief({
      missions,
      captures,
      calendar,
      documents,
      email,
      finances,
    });

    const brief = applySignificanceFilter(rawBrief);

    // Update triage state from brief
    const triage = buildTriageFromBrief(brief);

    // Merge with existing thread-based triage
    const existing = store.getTriageState();
    const mergedTriage = {
      significantNow: [
        ...triage.significantNow,
        ...(existing.significantNow || []).filter((i) => i.source !== "daily-brief"),
      ].slice(0, 5),
      watching: [
        ...triage.watching,
        ...(existing.watching || []).filter((i) => i.source !== "daily-brief"),
      ].slice(0, 8),
      background: [
        ...triage.background,
        ...(existing.background || []).filter((i) => i.source !== "daily-brief"),
      ].slice(0, 10),
    };

    store.setTriageState(mergedTriage);

    // Log the heartbeat
    store.appendHeartbeatLog({
      loop: "morning-digest",
      latencyMs: Date.now() - startedAt,
      briefSource: brief.source,
      triageItemCount: mergedTriage.significantNow.length + mergedTriage.watching.length,
    });

    // Deliver via iMessage if configured
    if (process.env.MONDAY_IMESSAGE_PHONE) {
      const { sendViaiMessage } = require("../channels/imessage");
      const lines = [];
      if (brief.brief) lines.push(brief.brief);
      if (mergedTriage.significantNow.length > 0) {
        lines.push("→ " + mergedTriage.significantNow.map((i) => i.label).join("\n→ "));
      }
      if (lines.length > 0) {
        await sendViaiMessage(lines.join("\n\n")).catch((err) =>
          console.error("[morning-digest] iMessage delivery failed:", err.message)
        );
      }
    }

    console.log(`[morning-digest] done in ${Date.now() - startedAt}ms`);
    return { ok: true, brief, triage: mergedTriage };
  } catch (err) {
    console.error("[morning-digest] error:", err.message);
    store.appendHeartbeatLog({
      loop: "morning-digest",
      error: err.message,
      latencyMs: Date.now() - startedAt,
    });
    return { ok: false, error: err.message };
  }
}

module.exports = { runMorningDigest };
