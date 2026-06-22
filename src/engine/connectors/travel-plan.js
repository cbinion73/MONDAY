"use strict";

const crypto = require("node:crypto");
const { retrieveIntelligentEmail, buildQueryProfile } = require("./email-intelligence");
const { readCalendarStore } = require("./calendar-context");
const { runSpecialistAgent } = require("../council/convene");
const { enqueueSurfacing } = require("../db/surfacing-store");
const { sendViaiMessage, isConfigured } = require("../channels/imessage");

function parseTravelWindow(query) {
  const now = new Date();
  const start = new Date(now);
  let horizonDays = 14;
  if (/\bnext week\b/i.test(query || "")) {
    horizonDays = 10;
  } else if (/\bthis week\b/i.test(query || "")) {
    horizonDays = 7;
  }
  const end = new Date(start.getTime() + horizonDays * 86400000);
  return { start, end };
}

function isExpeditedRequest(query) {
  return /\b(quickly|right now|asap|urgent|urgently|immediately|fast|expedite|rush)\b/i.test(String(query || ""));
}

function hasExplicitScheduleDetails(query) {
  const normalized = String(query || "").replace(/^\s*monday[\s,:-]+/i, "");
  return /\b(mon|monday|tue|tuesday|wed|wednesday|thu|thursday|fri|friday|sat|saturday|sun|sunday)\b/i.test(normalized) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i.test(normalized) ||
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(normalized) ||
    /\bfrom\b.+\bto\b.+/i.test(normalized);
}

function filterCalendarForTrip(events, profile, window) {
  const needles = profile.locations.map((value) => value.toLowerCase());
  return (events || []).filter((event) => {
    const startAt = Date.parse(event.startAt || "");
    if (Number.isNaN(startAt)) return false;
    if (startAt < window.start.getTime() || startAt > window.end.getTime()) return false;
    if (needles.length === 0) return true;
    const haystack = `${event.title || ""} ${event.location || ""} ${event.notes || ""}`.toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  });
}

function hasDirectTicketEvidence(threads) {
  return (threads || []).some((thread) => {
    const facts = thread.structuredFacts || [];
    return (
      facts.some((fact) => fact.type === "date") &&
      facts.some((fact) => fact.type === "location") &&
      (facts.some((fact) => fact.type === "reservation") ||
        facts.some((fact) => fact.type === "time") ||
        facts.some((fact) => fact.type === "entry_instruction"))
    );
  });
}

function collectKnownConstraints(calendarEvents) {
  return (calendarEvents || []).slice(0, 10).map((event) => ({
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    location: event.location || null,
    notes: event.notes || null,
    source: event.source || null,
  }));
}

function assessTravelRequest(query) {
  const travelQuery = String(query || "").trim();
  const queryProfile = buildQueryProfile(travelQuery);
  const window = parseTravelWindow(travelQuery);
  const calendarStore = readCalendarStore();
  const relevantCalendar = filterCalendarForTrip(calendarStore.events || [], queryProfile, window);
  const explicitSchedule = hasExplicitScheduleDetails(travelQuery);
  const needsDates =
    !explicitSchedule &&
    (relevantCalendar.length === 0 || queryProfile.locations.length === 0);
  return {
    travelQuery,
    queryProfile,
    window,
    calendarStore,
    relevantCalendar,
    explicitSchedule,
    needsDates,
    expedited: isExpeditedRequest(travelQuery),
  };
}

function buildMissingDatesReply(assessment) {
  const locations = assessment.queryProfile.locations || [];
  if (locations.length > 0) {
    return `I don't have any trip dates or calendar anchors for ${joinNatural(locations)} yet. What days are those stops supposed to happen next week?`;
  }
  return "I don't have any trip dates or calendar anchors yet. What days are you traveling next week, and what are the key stops or reservations I should build around?";
}

function buildQueuedReply(assessment) {
  const locations = assessment.queryProfile.locations || [];
  if (locations.length > 0) {
    return `Great, I'll get Nick on that right away. He'll use your calendar and the ticket evidence for ${joinNatural(locations)} to build the itinerary, and I'll bring you the plan when it's ready.`;
  }
  return "Great, I'll get Nick on that right away. He'll start with your calendar, pull the ticket evidence, and I'll bring you the itinerary when it's ready.";
}

function fallbackPlan({ queryProfile, calendarEvents, emailThreads, noDirectTicketEvidence }) {
  const confirmedItems = [];
  for (const thread of emailThreads.slice(0, 6)) {
    for (const fact of thread.structuredFacts || []) {
      if (["date", "time", "location", "reservation", "entry_instruction"].includes(fact.type)) {
        confirmedItems.push(`${fact.type}: ${fact.value}`);
      }
    }
  }

  const plan = calendarEvents.slice(0, 7).map((event) => ({
    day: new Date(event.startAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    summary: event.title,
    steps: [
      event.location ? `Be at ${event.location}.` : "Use calendar timing as the current anchor.",
      event.notes ? `Notes: ${event.notes}` : "No additional calendar notes yet.",
    ],
    confidence: "medium",
  }));

  const missingItems = noDirectTicketEvidence
    ? ["No direct ticket or reservation email was confirmed in the current reachable email results."]
    : [];

  return {
    missionRead: noDirectTicketEvidence
      ? "The trip is real, but the ticket evidence is incomplete. The safest move is to plan from calendar constraints and the confirmed reservation details that are actually present."
      : "The trip has enough evidence to build a preliminary itinerary, but a few confirmations still need tightening.",
    plan,
    confirmedItems: [...new Set(confirmedItems)].slice(0, 12),
    missingItems,
    risks: noDirectTicketEvidence ? ["Some reservation or entry details are still unverified."] : [],
    contingencies: noDirectTicketEvidence
      ? ["Search vendor portals directly if ticket emails are missing.", "Use calendar commitments as the hard constraints until ticket proof is found."]
      : [],
    noDirectTicketEvidence,
    confidence: noDirectTicketEvidence ? "medium" : "high",
  };
}

async function buildTripPlan({ assessment, liveProviderSearch = true }) {
  const travelQuery = assessment.travelQuery;
  const queryProfile = assessment.queryProfile;
  const emailResult = await retrieveIntelligentEmail({
    query: travelQuery,
    limit: 6,
    allowLiveProviderSearch: liveProviderSearch,
  });
  const relevantCalendar = assessment.relevantCalendar;
  const noDirectTicketEvidence = !hasDirectTicketEvidence(emailResult.data || []);

  const evidence = {
    query: travelQuery,
    locations: queryProfile.locations,
    emailThreads: (emailResult.data || []).slice(0, 6).map((thread) => ({
      subject: thread.subject,
      from: thread.from,
      providerCategory: thread.providerCategory,
      threadType: thread.threadType,
      significanceScore: thread.significanceScore,
      structuredFacts: thread.structuredFacts || [],
    })),
    calendarEvents: collectKnownConstraints(relevantCalendar),
    noDirectTicketEvidence,
  };

  let specialistPlan = null;
  try {
    specialistPlan = await runSpecialistAgent(
      "fury_travel",
      `TRAVEL REQUEST:\n${travelQuery}\n\nEVIDENCE:\n${JSON.stringify(evidence, null, 2)}\n\nBuild the trip plan now. If direct ticket proof is missing, say that plainly and still produce the best operational plan from the calendar and the confirmed evidence.`,
      fallbackPlan({
        queryProfile,
        calendarEvents: relevantCalendar,
        emailThreads: emailResult.data || [],
        noDirectTicketEvidence,
      })
    );
  } catch {
    specialistPlan = fallbackPlan({
      queryProfile,
      calendarEvents: relevantCalendar,
      emailThreads: emailResult.data || [],
      noDirectTicketEvidence,
    });
  }

  return {
    ok: true,
    data: {
      status: "completed",
      query: travelQuery,
      locations: queryProfile.locations,
      noDirectTicketEvidence: Boolean(specialistPlan.noDirectTicketEvidence),
      missionRead: specialistPlan.missionRead || null,
      plan: Array.isArray(specialistPlan.plan) ? specialistPlan.plan : [],
      confirmedItems: Array.isArray(specialistPlan.confirmedItems) ? specialistPlan.confirmedItems : [],
      missingItems: Array.isArray(specialistPlan.missingItems) ? specialistPlan.missingItems : [],
      risks: Array.isArray(specialistPlan.risks) ? specialistPlan.risks : [],
      contingencies: Array.isArray(specialistPlan.contingencies) ? specialistPlan.contingencies : [],
      confidence: specialistPlan.confidence || "medium",
      emailCount: emailResult.count || 0,
      calendarCount: relevantCalendar.length,
    },
    source: "travel-plan",
  };
}

function resolveDeliveryPhone(senderId) {
  if (senderId && /^\+?[0-9][0-9\-() ]{6,}$/.test(String(senderId).trim())) {
    return String(senderId).trim();
  }
  return undefined;
}

async function deliverDeferredTripPlan(planResult, { senderId = null, channel = null } = {}) {
  const { renderTravelPlanReply } = require("../skills/travel-plan-renderer");
  const reply = renderTravelPlanReply({
    skillId: "travel-plan",
    ok: true,
    raw: planResult,
  });

  enqueueSurfacing({
    source: "travel-plan",
    domain: "Family",
    payload: reply,
    confidence: 0.9,
    priority: 2,
    ttlHours: 72,
  });

  if (isConfigured() && (channel === "imessage" || channel === "http")) {
    await sendViaiMessage(reply, { phone: resolveDeliveryPhone(senderId) });
  }
}

function queueDeferredTripPlan({ assessment, senderId = null, channel = null, liveProviderSearch = true }) {
  const taskId = crypto.randomUUID();
  setTimeout(async () => {
    try {
      const planResult = await buildTripPlan({ assessment, liveProviderSearch });
      await deliverDeferredTripPlan(planResult, { senderId, channel });
    } catch (error) {
      const fallback = `Nick hit a snag while assembling the trip plan: ${error.message}. I'll need another pass on that one.`;
      enqueueSurfacing({
        source: "travel-plan",
        domain: "Family",
        payload: fallback,
        confidence: 0.5,
        priority: 3,
        ttlHours: 24,
      });
    }
  }, 0);
  return taskId;
}

async function planTrip({
  query,
  liveProviderSearch = true,
  expedited = null,
  senderId = null,
  channel = null,
  allowBackground = true,
} = {}) {
  const assessment = assessTravelRequest(query);

  if (assessment.needsDates) {
    return {
      ok: true,
      data: {
        status: "needs_input",
        query: assessment.travelQuery,
        locations: assessment.queryProfile.locations,
        reply: buildMissingDatesReply(assessment),
        waitingOn: "trip_dates",
      },
      source: "travel-plan",
    };
  }

  const runExpedited = expedited == null ? assessment.expedited : Boolean(expedited);
  if (!runExpedited && allowBackground) {
    const taskId = queueDeferredTripPlan({
      assessment,
      senderId,
      channel,
      liveProviderSearch,
    });
    return {
      ok: true,
      data: {
        status: "queued",
        deferred: true,
        taskId,
        query: assessment.travelQuery,
        locations: assessment.queryProfile.locations,
        reply: buildQueuedReply(assessment),
      },
      source: "travel-plan",
    };
  }

  return buildTripPlan({ assessment, liveProviderSearch });
}

module.exports = {
  planTrip,
  assessTravelRequest,
  isExpeditedRequest,
  hasExplicitScheduleDetails,
};

function joinNatural(items) {
  const values = (items || []).filter(Boolean);
  if (values.length <= 1) return values[0] || "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}
