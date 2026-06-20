const assert = require("node:assert/strict");
const path = require("node:path");

process.env.MONDAY_OLLAMA_ENABLED = "false";
process.env.MONDAY_PERSONAL_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-capture-response"
);

const {
  applyMondayIntelligence,
} = require("../src/engine/intelligence/monday-intelligence");

async function main() {
  const result = await applyMondayIntelligence({
    result: {
      finalState: {
        significance: "family_time_tension",
        candidateDomain: "family",
      },
      voice: {
        text: "It sounds like family and attention are pulling against each other.",
        lines: ["It sounds like family and attention are pulling against each other."],
        voiceMode: "curious-companion",
      },
      workspace: {
        workspaceMode: "reflection_support",
        supportIntent: "help_meaning_emerge",
      },
    },
    input: "Remember this: I want to take Caleb fishing next month.",
    history: [],
    personalContext: {
      captureIntent: true,
      relevantThread: null,
    },
  });

  assert.equal(result.voice.responseSource, "capture-confirmed");
  assert.ok(
    result.voice.text.includes("I'll keep that in your family thread."),
    result.voice.text
  );
  assert.ok(
    result.voice.text.includes("The note about take Caleb fishing next month") ||
      result.voice.text.includes("The note about taking Caleb fishing next month") ||
      result.voice.text.includes("Caleb fishing next month"),
    result.voice.text
  );
  assert.ok(!result.voice.text.includes("What feels most"));
  assert.ok(!result.voice.text.includes("?"));

  console.log("Monday capture response tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
