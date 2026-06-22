"use strict";

function findTravelPlanSkillResult(skillResults = []) {
  return (skillResults || []).find((item) => item.skillId === "travel-plan" && item.ok && item.raw?.ok !== false) || null;
}

function renderTravelPlanReply(skillResult) {
  const data = skillResult?.raw?.data || {};
  if (data.status === "needs_input" || data.status === "queued") {
    return data.reply || "I'm on it.";
  }
  const locations = Array.isArray(data.locations) ? data.locations.filter(Boolean) : [];
  const intro = data.noDirectTicketEvidence
    ? `I pulled your calendar and the reachable ticket emails. I couldn't confirm direct ticket evidence${locations.length ? ` for ${joinNatural(locations)}` : ""}, so I built the trip plan from your calendar constraints and the confirmed details I do have.`
    : `I pulled your calendar and ticket emails. The trip is concrete enough to plan now, so here's the day-by-day version.`;

  const sections = [intro];

  if (data.plan?.length) {
    sections.push(
      "Trip plan:",
      ...data.plan.map((day) => renderDay(day))
    );
  }

  if (data.confirmedItems?.length) {
    sections.push(
      "Confirmed:",
      ...data.confirmedItems.slice(0, 8).map((item) => `- ${item}`)
    );
  }

  if (data.missingItems?.length) {
    sections.push(
      "Still unverified:",
      ...data.missingItems.slice(0, 5).map((item) => `- ${item}`)
    );
  }

  if (data.risks?.length) {
    sections.push(
      "Watchouts:",
      ...data.risks.slice(0, 4).map((item) => `- ${item}`)
    );
  }

  if (data.contingencies?.length) {
    sections.push(
      "Contingencies:",
      ...data.contingencies.slice(0, 4).map((item) => `- ${item}`)
    );
  }

  if (data.noDirectTicketEvidence) {
    sections.push("If the missing confirmations surface later, I'll tighten this from provisional to locked without rebuilding the whole trip.");
  }

  return sections.join("\n");
}

function renderDay(day) {
  const lines = [`${day.day}: ${day.summary}`];
  for (const step of day.steps || []) {
    lines.push(`- ${step}`);
  }
  return lines.join("\n");
}

function joinNatural(items) {
  const values = items.filter(Boolean);
  if (values.length <= 1) return values[0] || "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

module.exports = {
  findTravelPlanSkillResult,
  renderTravelPlanReply,
};
