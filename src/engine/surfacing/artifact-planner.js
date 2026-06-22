"use strict";

const WEBSITE_HINTS = /\b(website|site|page|article|fox|iran|url|link|browser|web)\b/i;
const DISPLAY_HINTS = /\b(show|display|surface|pull up|bring up|visualize|plot|graph|chart|dashboard|data)\b/i;
const HEALTH_HINTS = /\b(health|medical|record|a1c|blood pressure|bp|weight|steps|exercise|glucose|metabolic)\b/i;
const FINANCIAL_HINTS = /\b(finance|financial|spending|balance|accounts?|budget|net worth|transactions?)\b/i;
const CALENDAR_HINTS = /\b(calendar|schedule|meeting|events?)\b/i;
const EMAIL_HINTS = /\b(email|inbox|messages?|threads?)\b/i;
const TRAVEL_HINTS = /\b(travel|trip|itinerary|route|birthday|philadelphia|national parks?)\b/i;
const DENVER_HINTS = /\b(denver|colorado|red rocks|union station|rocky mountain|rockies)\b/i;
const TRANSPORT_HINTS = /\b(drive|driving|train|airfare|flight|fly|get there|transport|transportation)\b/i;
const QUANTUM_HINTS = /\b(quantum|quantum computing|qubit|qubits|superconducting|trapped ions?|error correction)\b/i;
const DOCUMENT_SURVEY_HINTS = /\b(survey|overview|brief|briefing|compare|comparison|plan)\b/i;

function buildArtifactPlan({ input = "", domain = null, recommendedOutcome = null, skillResults = [] } = {}) {
  const text = String(input || "").trim();
  const lowered = text.toLowerCase();
  const skillIds = (skillResults || []).map((s) => s.skillId);

  const asksForDisplay = DISPLAY_HINTS.test(text);
  const leansWebsite = WEBSITE_HINTS.test(text) || skillIds.includes("browser-read") || skillIds.includes("browser-search");
  const leansHealth = HEALTH_HINTS.test(text) || String(domain || "").toLowerCase() === "health";
  const leansFinancial = FINANCIAL_HINTS.test(text) || skillIds.includes("financial-read");
  const leansCalendar = CALENDAR_HINTS.test(text) || skillIds.includes("calendar-read");
  const leansEmail = EMAIL_HINTS.test(text) || skillIds.includes("email-read");
  const leansDocuments = skillIds.includes("documents-read");
  const leansTravel = TRAVEL_HINTS.test(text) || skillIds.includes("travel-plan");
  const leansDenver = DENVER_HINTS.test(text);
  const leansTransport = TRANSPORT_HINTS.test(text);
  const leansQuantum = QUANTUM_HINTS.test(text);
  const leansSurveyDocument = DOCUMENT_SURVEY_HINTS.test(text);
  const surfaceThenAdvise = recommendedOutcome === "surface_then_advise";

  if (leansQuantum && (asksForDisplay || surfaceThenAdvise || leansDocuments || leansSurveyDocument)) {
    return {
      shouldSurface: true,
      artifactType: "document",
      artifactKey: "quantum",
      sourceDomain: "documents",
      displayStyle: "full_screen_modal",
      narrativeMode: "research_survey_brief",
      staging: "surface_before_explanation",
      voiceModeBehavior: "suppress_bubbles_if_speaking",
      sourceSkills: skillIds,
      rationale: "Research-survey questions are clearer when Monday surfaces a structured briefing document instead of answering in prose alone.",
    };
  }

  if (leansTransport && (asksForDisplay || surfaceThenAdvise || leansTravel || leansDenver || leansSurveyDocument)) {
    return {
      shouldSurface: true,
      artifactType: "document",
      artifactKey: "transport",
      sourceDomain: "travel",
      displayStyle: "full_screen_modal",
      narrativeMode: "transport_option_comparison",
      staging: "surface_before_explanation",
      voiceModeBehavior: "suppress_bubbles_if_speaking",
      sourceSkills: skillIds,
      rationale: "Mode-choice questions are easier to understand as a side-by-side recommendation surface with tradeoffs, fares, and routing context.",
    };
  }

  if (leansDenver && (asksForDisplay || surfaceThenAdvise || leansTravel || leansSurveyDocument || /\btravel to\b/i.test(text))) {
    return {
      shouldSurface: true,
      artifactType: "document",
      artifactKey: "denver",
      sourceDomain: "travel",
      displayStyle: "full_screen_modal",
      narrativeMode: "destination_recommendation_brief",
      staging: "surface_before_explanation",
      voiceModeBehavior: "suppress_bubbles_if_speaking",
      sourceSkills: skillIds,
      rationale: "Destination recommendation questions benefit from a structured visual brief that combines why-it-fits, suggested shape, and transport recommendation.",
    };
  }

  if (leansTravel && (asksForDisplay || surfaceThenAdvise || leansSurveyDocument || skillIds.includes("travel-plan") || /\bitinerary\b/i.test(text))) {
    return {
      shouldSurface: true,
      artifactType: "document",
      artifactKey: "travel",
      sourceDomain: "travel",
      displayStyle: "full_screen_modal",
      narrativeMode: "itinerary_document_brief",
      staging: "surface_before_explanation",
      voiceModeBehavior: "suppress_bubbles_if_speaking",
      sourceSkills: skillIds,
      rationale: "Travel-planning threads are clearer when Monday surfaces an itinerary document with route, daily structure, and supporting evidence.",
    };
  }

  if (leansWebsite && (asksForDisplay || surfaceThenAdvise)) {
    return {
      shouldSurface: true,
      artifactType: "website",
      artifactKey: "website",
      displayStyle: "full_screen_modal",
      staging: "surface_before_explanation",
      voiceModeBehavior: "suppress_bubbles_if_speaking",
      sourceSkills: skillIds,
      rationale: "The user or turn context points to a live web source that should be shown directly.",
    };
  }

  if (leansHealth && (asksForDisplay || surfaceThenAdvise || /tell me about my health|medical record/i.test(lowered))) {
    return {
      shouldSurface: true,
      artifactType: "data_display",
      artifactKey: "health",
      displayStyle: "full_screen_modal",
      narrativeMode: "progressive_sequence",
      recommendedVisuals: ["a1c", "steps", "weight", "blood_pressure"],
      maxPanelsPerPage: 4,
      staging: "surface_before_explanation",
      voiceModeBehavior: "suppress_bubbles_if_speaking",
      sourceSkills: skillIds,
      rationale: "Health questions are better explained through staged visual evidence than prose alone.",
    };
  }

  if ((leansFinancial || leansCalendar || leansEmail || leansDocuments) && (asksForDisplay || surfaceThenAdvise)) {
    const sourceDomain = leansFinancial
      ? "financial"
      : leansCalendar
        ? "calendar"
        : leansEmail
          ? "email"
          : "documents";

    return {
      shouldSurface: true,
      artifactType: "data_display",
      artifactKey: null,
      sourceDomain,
      displayStyle: "full_screen_modal",
      narrativeMode: "source_signal_comparison_explanation",
      maxPanelsPerPage: 4,
      staging: "surface_before_explanation",
      voiceModeBehavior: "suppress_bubbles_if_speaking",
      sourceSkills: skillIds,
      rationale: `The turn calls for structured ${sourceDomain} evidence that may be clearer as a graph, chart, or dashboard.`,
    };
  }

  return null;
}

module.exports = { buildArtifactPlan };
