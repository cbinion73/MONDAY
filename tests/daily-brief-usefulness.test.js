const assert = require("node:assert/strict");

process.env.MONDAY_OLLAMA_ENABLED = "false";

const { generateDailyBrief } = require("../src/engine/intelligence/monday-intelligence");

async function main() {
  const brief = await generateDailyBrief({
    missions: [
      {
        id: "family",
        name: "Family",
        recentCaptures: [
          {
            content: "Take Caleb fishing next month.",
            significance: "family_time_tension",
            createdAt: "2026-06-15T05:00:00.000Z",
          },
        ],
      },
      {
        id: "health",
        name: "Health",
        recentCaptures: [
          {
            content: "I want to lose weight.",
            significance: "weight_loss_goal",
            createdAt: "2026-06-15T05:01:00.000Z",
          },
        ],
      },
    ],
    captures: [
      {
        content: "Take Caleb fishing next month.",
        missionId: "family",
        significance: "family_time_tension",
      },
      {
        content: "I want to lose weight.",
        missionId: "health",
        significance: "weight_loss_goal",
      },
    ],
    calendar: null,
    documents: null,
    email: null,
    finances: null,
  });

  assert.equal(brief.enabled, false);
  assert.ok(
    brief.brief.includes("You do not need to rebuild context from zero this morning."),
    brief.brief
  );
  assert.ok(
    brief.brief.includes("taking Caleb fishing next month is still live") ||
      brief.brief.includes("wanting to lose weight is still live") ||
      brief.brief.includes("Taking Caleb fishing next month is still live") ||
      brief.brief.includes("Wanting to lose weight is still live"),
    brief.brief
  );
  assert.ok(
    brief.changed.some((item) => item.includes("Take Caleb fishing next month")),
    JSON.stringify(brief.changed)
  );
  assert.ok(
    brief.stillMatters.some((item) => item.includes("Still carrying: taking Caleb fishing next month")) ||
      brief.stillMatters.some((item) => item.includes("Still carrying: wanting to lose weight")) ||
      brief.stillMatters.some((item) => item.includes("Keep in view: taking Caleb fishing next month")) ||
      brief.stillMatters.some((item) => item.includes("Keep in view: wanting to lose weight")) ||
      brief.stillMatters.some((item) => item.includes("Family is still live and worth returning to.")),
    JSON.stringify(brief.stillMatters)
  );
  assert.ok(
    brief.needsAttention.some((item) => item.toLowerCase().includes("needs attention")) ||
      brief.needsAttention.some((item) => item.toLowerCase().includes("may need attention")),
    JSON.stringify(brief.needsAttention)
  );
  assert.ok(
    brief.deservesProtection.some((item) => item.includes("family")),
    JSON.stringify(brief.deservesProtection)
  );

  console.log("Monday daily brief usefulness tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
