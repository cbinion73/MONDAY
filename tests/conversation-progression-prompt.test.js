const assert = require("node:assert/strict");

const { resolveMondayEngine } = require("../src/engine");
const { inferTruth } = require("../src/engine/runtime/infer-truth");
const {
  buildConversationPrompt,
  buildConversationPayload,
} = require("../src/engine/llm/monday-prompt-builder");
const { translateMondayVoice } = require("../src/engine/voice/voice-translator");

function buildTurn(input, context = {}) {
  const finalState = resolveMondayEngine(input, context);
  const truth = inferTruth(finalState, input);
  const voice = translateMondayVoice({
    engineState: finalState,
    truth,
  });

  return {
    finalState,
    truth,
    voice,
    workspace: {
      workspaceMode: "reflection_support",
      supportIntent: "help_meaning_emerge",
    },
  };
}

function main() {
  const turn1Input = "I think I want to retire.";
  const turn1 = buildTurn(turn1Input);
  const history = [
    {
      user: turn1Input,
      monday: turn1.voice.text,
    },
    {
      user: "It's not really about money anymore.",
      monday:
        "It seems retirement is shifting away from being primarily about financial security. What other aspects of your life do you think might be influencing this decision?",
    },
    {
      user: "I don't know who I am without work.",
      monday:
        "It sounds like retirement may be becoming less about timing and more about identity. What feels hardest to imagine without work at the center?",
    },
    {
      user: "I still want to build things.",
      monday:
        "You keep returning to retirement, identity, and building together. My guess is you may be trying to retire from a role without giving up creation itself. Does that feel true to you?",
    },
  ];

  const turn5Input = "Work gives me a place to hide.";
  const turn5 = buildTurn(turn5Input, {
    continuity: turn1.finalState.continuity,
  });

  const payload = buildConversationPayload({
    result: turn5,
    input: turn5Input,
    history,
    personalContext: {},
  });
  const prompt = buildConversationPrompt({
    result: turn5,
    input: turn5Input,
    history,
    personalContext: {},
  });

  assert.ok(
    ["future_life_transition", "work_tradeoff", "general_significance"].includes(
      payload.engineState.significance
    ),
    payload.engineState.significance
  );
  assert.ok(
    ["companion", "witness"].includes(payload.engineState.activeRole),
    payload.engineState.activeRole
  );
  assert.ok(
    payload.progressionContext.currentUnderstanding
      .toLowerCase()
      .includes("different shape of life") ||
      payload.progressionContext.currentUnderstanding
        .toLowerCase()
        .includes("advanced rather than restarted") ||
      payload.progressionContext.currentUnderstanding
        .toLowerCase()
        .includes("ongoing meaning thread"),
    payload.progressionContext.currentUnderstanding
  );
  assert.ok(
    payload.progressionContext.conversationGoal
      .toLowerCase()
      .includes("beyond money") ||
      payload.progressionContext.conversationGoal
        .toLowerCase()
        .includes("advance the conversation from monday's last question"),
    payload.progressionContext.conversationGoal
  );
  assert.equal(payload.recentHistory.length, 4);
  assert.equal(payload.recentHistory[0].user, turn1Input);
  assert.equal(
    payload.progressionContext.priorMeaningSummary.lastUserMessage,
    "I still want to build things."
  );
  assert.ok(Array.isArray(payload.conversationSynthesis));
  assert.ok(payload.conversationSynthesis.length >= 3, payload.conversationSynthesis);
  assert.ok(
    typeof payload.conversationHypothesis === "string" &&
      payload.conversationHypothesis.toLowerCase().includes("may not actually want retirement"),
    payload.conversationHypothesis
  );
  assert.equal(payload.recommendationMode.stage, "recommend");
  assert.ok(
    payload.recommendationMode.guidance.toLowerCase().includes("recommend"),
    payload.recommendationMode.guidance
  );
  assert.ok(
    payload.conversationSynthesis.some((item) =>
      item.toLowerCase().includes("identity question")
    ),
    payload.conversationSynthesis
  );
  assert.ok(
    payload.conversationSynthesis.some((item) =>
      item.toLowerCase().includes("retirement and building")
    ),
    payload.conversationSynthesis
  );
  assert.ok(
    payload.conversationSynthesis.some((item) =>
      item.toLowerCase().includes("identity, structure, usefulness, and possible avoidance")
    ),
    payload.conversationSynthesis
  );
  assert.ok(Array.isArray(prompt));
  assert.equal(prompt.length, 2);

  const promptBody = JSON.parse(prompt[1].content);
  assert.equal(
    promptBody.progressionContext.latestUserInput,
    turn5Input
  );
  assert.ok(
    Array.isArray(promptBody.conversationSynthesis) &&
      promptBody.conversationSynthesis.some((item) =>
        item.toLowerCase().includes("possible avoidance")
      ),
    promptBody.conversationSynthesis
  );
  assert.ok(
    typeof promptBody.conversationHypothesis === "string" &&
      promptBody.conversationHypothesis.toLowerCase().includes("freedom from the parts of work"),
    promptBody.conversationHypothesis
  );
  assert.equal(promptBody.recommendationMode.stage, "recommend");
  assert.ok(
    promptBody.progressionContext.newInformation
      .toLowerCase()
      .includes("this turn adds"),
    promptBody.progressionContext.newInformation
  );

  console.log("Conversation progression prompt test passed.");
}

main();
