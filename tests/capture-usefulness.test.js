const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.MONDAY_OLLAMA_ENABLED = "false";
process.env.MONDAY_CLOSED_LOOP_LEARNING = "false";
process.env.MONDAY_PERSONAL_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-capture-usefulness"
);

const {
  recordCapture,
  getDataDir,
  getMissionSummary,
  getRecentCaptures,
} = require("../src/engine/personal/personal-store");

function resetStore() {
  fs.rmSync(getDataDir(), { recursive: true, force: true });
}

function main() {
  resetStore();

  const byCandidateDomain = recordCapture({
    input: "Remember this: I want to take Caleb fishing next month.",
    finalState: {
      significance: "general_significance",
      situationClassification: "unclassified",
      candidateDomain: "family",
    },
    truth: {},
    context: {},
  });

  assert.equal(byCandidateDomain.missionId, "family");

  const byActiveMission = recordCapture({
    input: "Remember this: figure out what retirement could look like if I slowed down next year.",
    finalState: {
      significance: "general_significance",
      situationClassification: "unclassified",
      candidateDomain: "unknown",
    },
    truth: {},
    context: {
      activeMission: "Retirement",
    },
  });

  assert.equal(byActiveMission.missionId, "retirement");

  const missions = getMissionSummary();
  const family = missions.find((mission) => mission.id === "family");
  const retirement = missions.find((mission) => mission.id === "retirement");

  assert.ok(family.recentCaptures.some((capture) => capture.content.includes("Caleb fishing")));
  assert.ok(retirement.recentCaptures.some((capture) => capture.content.includes("retirement could look like")));

  recordCapture({
    input: "Remember this: I want to take Caleb fishing next month.",
    finalState: {
      significance: "general_significance",
      situationClassification: "unclassified",
      candidateDomain: "family",
    },
    truth: {},
    context: {},
  });

  const dedupedFamily = getMissionSummary().find((mission) => mission.id === "family");
  assert.equal(dedupedFamily.recentCaptures.length, 1);
  assert.equal(
    getRecentCaptures(20).filter((capture) => capture.missionId === "family").length,
    1
  );

  console.log("Monday capture usefulness tests passed.");
  resetStore();
}

main();
