const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.MONDAY_OLLAMA_ENABLED = "false";
process.env.MONDAY_PERSONAL_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-personalization"
);

const {
  recordCapture,
  getRelevantThreadContext,
  getDataDir,
} = require("../src/engine/personal/personal-store");
const { resolveMondayEngine } = require("../src/engine");
const { inferTruth } = require("../src/engine/runtime/infer-truth");
const { translateMondayVoice } = require("../src/engine/voice/voice-translator");
const { applyMondayIntelligence } = require("../src/engine/intelligence/monday-intelligence");

async function main() {
  const personalDir = getDataDir();
  fs.rmSync(personalDir, { recursive: true, force: true });

  recordCapture({
    input: "Remember this: I want to lose weight.",
    finalState: {
      significance: "weight_loss_goal",
      situationClassification: "goal_or_transformation",
    },
    truth: { domain: "health", goal: "lose_weight" },
  });

  const engineState = resolveMondayEngine("I want to lose weight.", {});
  const voice = translateMondayVoice({
    engineState,
    truth: inferTruth(engineState, "I want to lose weight."),
  });

  const result = await applyMondayIntelligence({
    result: {
      finalState: engineState,
      truth: inferTruth(engineState, "I want to lose weight."),
      voice,
      workspace: { workspaceMode: "reflection_support", supportIntent: "help_meaning_emerge" },
    },
    input: "I want to lose weight.",
    history: [],
    personalContext: {
      captureIntent: false,
      relevantThread: getRelevantThreadContext({
        significance: "weight_loss_goal",
      }),
    },
  });

  assert.ok(result.voice.text.includes("your health thread"));
  assert.ok(result.voice.text.includes("wanting to lose weight"));

  fs.rmSync(personalDir, { recursive: true, force: true });
  console.log("Monday personalization tests passed.");
}

main();
