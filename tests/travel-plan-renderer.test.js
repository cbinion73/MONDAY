"use strict";

const assert = require("node:assert/strict");
const {
  findTravelPlanSkillResult,
  renderTravelPlanReply,
} = require("../src/engine/skills/travel-plan-renderer");

function main() {
  const skill = {
    skillId: "travel-plan",
    ok: true,
    raw: {
      ok: true,
      data: {
        locations: ["Philadelphia", "Statue Of Liberty", "Washington, Dc"],
        noDirectTicketEvidence: true,
        plan: [
          {
            day: "Fri, Jun 26",
            summary: "Philadelphia arrival and setup",
            steps: ["Drive in and check hotel timing.", "Keep the evening light so the next day stays clean."],
          },
          {
            day: "Sat, Jun 27",
            summary: "Statue of Liberty day",
            steps: ["Use the calendar anchor for departure.", "Leave buffer for entry timing and transit."],
          },
        ],
        confirmedItems: ["date: June 26", "location: Philadelphia"],
        missingItems: ["No direct ticket or reservation email was confirmed in the current reachable email results."],
        risks: ["Some reservation or entry details are still unverified."],
        contingencies: ["Search vendor portals directly if ticket emails are missing."],
      },
    },
  };

  assert.equal(findTravelPlanSkillResult([skill]).skillId, "travel-plan");

  const reply = renderTravelPlanReply(skill);
  assert.match(reply, /I pulled your calendar and the reachable ticket emails\./);
  assert.match(reply, /Trip plan:/);
  assert.match(reply, /Fri, Jun 26: Philadelphia arrival and setup/);
  assert.match(reply, /Still unverified:/);
  assert.match(reply, /Watchouts:/);

  console.log("Monday travel plan renderer test passed.");
}

main();
