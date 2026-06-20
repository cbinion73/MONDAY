const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.MONDAY_PERSONAL_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-personal-store"
);

const {
  detectCaptureIntent,
  extractCaptureText,
  getDataDir,
  inferMissionIdForCapture,
  recordCapture,
  getMissionSummary,
  getRecentCaptures,
} = require("../src/engine/personal/personal-store");

function resetStore() {
  fs.rmSync(getDataDir(), { recursive: true, force: true });
}

function main() {
  resetStore();
  assert.equal(detectCaptureIntent("Remember this: I want to lose weight."), true);
  assert.equal(extractCaptureText("Remember this: I want to lose weight."), "I want to lose weight.");

  const capture = recordCapture({
    input: "Remember this: I want to lose weight.",
    finalState: {
      significance: "weight_loss_goal",
      situationClassification: "goal_or_transformation",
    },
    truth: { domain: "health", goal: "lose_weight" },
  });

  assert.equal(capture.missionId, "health");
  assert.equal(getRecentCaptures(5).length, 1);
  const missions = getMissionSummary();
  const health = missions.find((mission) => mission.id === "health");
  assert.ok(health);
  assert.equal(health.recentCaptures.length, 1);
  assert.ok(health.significanceThreads.includes("weight_loss_goal"));

  const duplicateCapture = recordCapture({
    input: "Remember this: I want to lose weight.",
    finalState: {
      significance: "weight_loss_goal",
      situationClassification: "goal_or_transformation",
    },
    truth: { domain: "health", goal: "lose_weight" },
  });

  assert.equal(duplicateCapture.id, capture.id);
  assert.equal(getRecentCaptures(5).length, 1);
  const updatedHealth = getMissionSummary().find((mission) => mission.id === "health");
  assert.equal(updatedHealth.recentCaptures.length, 1);

  assert.equal(
    inferMissionIdForCapture({
      finalState: {
        significance: "general_significance",
        candidateDomain: "family",
      },
      truth: {},
      context: {},
    }),
    "family"
  );

  const fallbackCapture = recordCapture({
    input: "Remember this: I want to take Caleb fishing next month.",
    finalState: {
      significance: "general_significance",
      situationClassification: "unclassified",
      candidateDomain: "family",
    },
    truth: {},
    context: {},
  });

  assert.equal(fallbackCapture.missionId, "family");
  const family = getMissionSummary().find((mission) => mission.id === "family");
  assert.ok(family);
  assert.equal(family.recentCaptures.length, 1);

  fs.writeFileSync(
    path.join(getDataDir(), "captures.json"),
    JSON.stringify(
      [
        {
          id: "a",
          content: "Take Caleb fishing next month.",
          significance: "family_time_tension",
          missionId: "family",
          createdAt: "2026-06-15T00:00:00.000Z",
        },
        {
          id: "b",
          content: "Take Caleb fishing next month.",
          significance: "family_time_tension",
          missionId: "family",
          createdAt: "2026-06-14T00:00:00.000Z",
        },
      ],
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(getDataDir(), "missions.json"),
    JSON.stringify(
      [
        {
          id: "family",
          name: "Family",
          status: "active",
          significanceThreads: ["family_time_tension", "family_time_tension"],
          recentCaptures: [
            {
              content: "Take Caleb fishing next month.",
              significance: "family_time_tension",
              createdAt: "2026-06-15T00:00:00.000Z",
            },
            {
              content: "Take Caleb fishing next month.",
              significance: "family_time_tension",
              createdAt: "2026-06-14T00:00:00.000Z",
            },
          ],
          lastTouchedAt: "2026-06-15T00:00:00.000Z",
        },
      ],
      null,
      2
    )
  );

  assert.equal(getRecentCaptures(10).filter((capture) => capture.missionId === "family").length, 1);
  const normalizedFamily = getMissionSummary().find((mission) => mission.id === "family");
  assert.equal(normalizedFamily.recentCaptures.length, 1);
  assert.equal(normalizedFamily.significanceThreads.length, 1);

  console.log("Monday personal store tests passed.");
}

main();
