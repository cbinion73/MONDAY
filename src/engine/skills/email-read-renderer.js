"use strict";

function findEmailReadSkillResult(skillResults = []) {
  return (skillResults || []).find((item) => item.skillId === "email-read" && item.ok && item.raw?.ok !== false) || null;
}

function renderEmailReadReply(skillResult) {
  const raw = skillResult?.raw || {};
  const threads = Array.isArray(raw.data) ? raw.data : [];
  if (threads.length === 0) {
    return "I checked your email and I don't see any relevant threads for that right now.";
  }

  const strongTravel = threads.filter(hasStrongTravelEvidence);
  const actionableTravel = strongTravel.filter(isActionableTravelThread);
  if (mentionsTravelRequest(raw.query) && actionableTravel.length === 0) {
    return "I checked your email and I do not see strong travel confirmations, itinerary changes, or boarding-style updates in the current local results right now. The matches I have are weak, so I would not treat them as decision-grade travel evidence yet.";
  }

  if (mentionsTravelRequest(raw.query) && actionableTravel.length > 0) {
    return renderTravelTriageReply(actionableTravel, raw);
  }

  const top = (strongTravel.length > 0 ? strongTravel : threads).slice(0, 3);
  const lines = [
    `I checked your email. ${threads.length} relevant thread${threads.length === 1 ? "" : "s"} surfaced${typeof raw.unreadCount === "number" ? `, with ${raw.unreadCount} unread total in the local store` : ""}.`,
    "Most relevant right now:",
  ];

  for (const thread of top) {
    const subject = thread.subject || "No subject";
    const from = thread.from || "unknown sender";
    const details = [];
    if (thread.unread) details.push("unread");
    if (thread.threadType) details.push(`type: ${thread.threadType}`);
    if (typeof thread.significanceScore === "number") {
      details.push(`significance ${Math.round(thread.significanceScore * 100)}%`);
    }

    const factSummary = summarizeFacts(thread.structuredFacts || []);
    const suffixParts = [];
    if (details.length > 0) suffixParts.push(details.join(", "));
    if (factSummary) suffixParts.push(factSummary);
    lines.push(`- "${subject}" from ${from}${suffixParts.length ? ` — ${suffixParts.join("; ")}` : ""}`);
  }

  if (raw.usedIntelligence) {
    lines.push("This came through Monday's local email intelligence pass rather than a raw inbox dump.");
  }

  return lines.join("\n");
}

function renderTravelTriageReply(threads, raw) {
  const clusters = clusterTrips(threads);
  const lines = [
    `I checked your email. ${threads.length} decision-grade travel thread${threads.length === 1 ? "" : "s"} surfaced${typeof raw.unreadCount === "number" ? `, with ${raw.unreadCount} unread total in the local store` : ""}.`,
    "Likely trips or reservations right now:",
  ];

  for (const cluster of clusters.slice(0, 3)) {
    const unreadTag = cluster.unreadCount > 0 ? `, ${cluster.unreadCount} unread` : "";
    const dateTag = cluster.dateLabel ? `, ${cluster.dateLabel}` : "";
    lines.push(`- ${cluster.label}: ${cluster.kinds.join(", ")}${dateTag}${unreadTag}`);
  }

  return lines.join("\n");
}

function summarizeFacts(facts) {
  const chosen = [];
  for (const fact of facts) {
    if (!fact || !fact.type || !fact.value) continue;
    if (["scheduled_date", "scheduled_time", "date", "time", "location_name", "location", "reservation", "confirmation_number", "entry_instruction"].includes(fact.type)) {
      chosen.push(`${fact.type}: ${fact.value}`);
    }
    if (chosen.length >= 2) break;
  }
  return chosen.join(", ");
}

function mentionsTravelRequest(query) {
  return /\btravel|trip|ticket|itinerary|reservation|flight|hotel|boarding\b/i.test(String(query || ""));
}

function hasStrongTravelEvidence(thread) {
  const text = `${thread.subject || ""} ${thread.snippet || ""}`.toLowerCase();
  const travelNouns = /\b(ticket|tickets|itinerary|reservation|boarding|check[- ]?in|hotel|flight|train|museum|tour|admission|gate|terminal|seat|departure|arrival)\b/;
  const travelPlaces = /\bphiladelphia|washington|new york|ellis island|statue of liberty|airport|station\b/;
  return travelNouns.test(text) || travelPlaces.test(text);
}

function isActionableTravelThread(thread) {
  const text = `${thread.subject || ""} ${thread.snippet || ""} ${thread.bodyText || ""}`.toLowerCase();
  if (/newsletter|extended hours|summer programs|auto-renewal|event calendar|friday night at the museum/i.test(text)) {
    return false;
  }
  return /\b(confirm|confirmation|reserved|reservation|booked|booking|itinerary|boarding|check[- ]?in|arrival|departure|admission|tour|order code|order id|ticket order|timed-entry)\b/i.test(text);
}

function clusterTrips(threads) {
  const map = new Map();
  for (const thread of threads) {
    const info = inferTripInfo(thread);
    const key = `${info.label}::${info.dateLabel}`;
    const current = map.get(key) || {
      label: info.label,
      dateLabel: info.dateLabel,
      kinds: new Set(),
      unreadCount: 0,
      score: 0,
    };
    current.kinds.add(info.kind);
    current.unreadCount += thread.unread ? 1 : 0;
    current.score += Number(thread.significanceScore || 0);
    map.set(key, current);
  }
  return [...map.values()]
    .map((item) => ({
      label: item.label,
      dateLabel: item.dateLabel,
      kinds: [...item.kinds],
      unreadCount: item.unreadCount,
      score: item.score,
    }))
    .sort((a, b) => b.score - a.score);
}

function inferTripInfo(thread) {
  const text = `${thread.subject || ""} ${thread.snippet || ""} ${thread.bodyText || ""}`;
  const lower = text.toLowerCase();

  let label = "Unsorted travel item";
  if (/air and space|smithsonian|national archives|washington,?\s*dc|constitution avenue/i.test(lower)) {
    label = "Washington, DC museum reservations";
  } else if (/shell island|georgetown,?\s*sc|lowcountry/i.test(lower)) {
    label = "Georgetown / Shell Island reservation";
  } else if (/philadelphia/i.test(lower)) {
    label = "Philadelphia trip";
  } else if (/new york|ellis island|statue of liberty/i.test(lower)) {
    label = "New York trip";
  }

  let kind = "reservation";
  if (/boat tour/i.test(lower)) kind = "boat tour";
  else if (/air and space|museum|archives/i.test(lower)) kind = "museum admission";
  else if (/flight|boarding|gate|airport/i.test(lower)) kind = "flight";
  else if (/hotel/i.test(lower)) kind = "hotel";

  const dateMatch =
    text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?/i) ||
    text.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/);
  const dateLabel = dateMatch ? dateMatch[0] : null;

  return { label, kind, dateLabel };
}

module.exports = {
  findEmailReadSkillResult,
  renderEmailReadReply,
};
