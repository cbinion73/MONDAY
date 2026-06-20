const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.MONDAY_OLLAMA_ENABLED = "false";
process.env.MONDAY_CLOSED_LOOP_LEARNING = "false";
process.env.MONDAY_PERSONAL_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-usefulness-personal"
);

const { resolveMondayEngine } = require("../src/engine");
const { inferTruth } = require("../src/engine/runtime/infer-truth");
const { translateMondayVoice } = require("../src/engine/voice/voice-translator");
const {
  applyMondayIntelligence,
} = require("../src/engine/intelligence/monday-intelligence");
const {
  recordCapture,
  getRelevantThreadContext,
  getDataDir,
} = require("../src/engine/personal/personal-store");

const BEST_RESPONSE_STANDARDS = {
  "I want to lose weight.": [
    "health is asking for attention here",
    "first sustainable change",
  ],
  "I think I want to retire.": [
    "money or timing",
    "identity, freedom",
    "what work has been carrying",
  ],
  "I have not prayed in weeks.": [
    "faith is asking for attention here",
    "returning to prayer",
  ],
  "I think I am hiding in work.": [
    "work seems to be carrying more weight than usual here",
    "what work is doing for you right now",
  ],
  "I should write another book.": [
    "that sounds worth taking seriously",
    "writing questions are rarely just about output",
  ],
};

function resetStore() {
  fs.rmSync(getDataDir(), { recursive: true, force: true });
}

function seedCapturedThreads() {
  const fixtures = [
    {
      input: "Remember this: I want to lose weight.",
      significance: "weight_loss_goal",
      classification: "goal_or_transformation",
      truth: { domain: "health", goal: "lose_weight" },
    },
    {
      input: "Remember this: I think I want to retire.",
      significance: "future_life_transition",
      classification: "future_life_tradeoff",
      truth: { domain: "retirement", question: "future_life_transition" },
    },
    {
      input: "Remember this: I have not prayed in weeks.",
      significance: "prayer_concern",
      classification: "goal_or_transformation",
      truth: { domain: "faith", goal: "prayer_concern" },
    },
    {
      input: "Remember this: I think I am hiding in work.",
      significance: "work_tradeoff",
      classification: "contradiction_surface",
      truth: { domain: "work", concern: "work_tradeoff" },
    },
    {
      input: "Remember this: I should write another book.",
      significance: "publishing_decision",
      classification: "future_life_tradeoff",
      truth: { domain: "publishing", decision: "publishing_decision" },
    },
    {
      input: "Remember this: Family matters most.",
      significance: "declared_family_value",
      classification: "value_statement",
      truth: { domain: "family", value: "family_matters_most" },
    },
  ];

  for (const fixture of fixtures) {
    recordCapture({
      input: fixture.input,
      finalState: {
        significance: fixture.significance,
        situationClassification: fixture.classification,
      },
      truth: fixture.truth,
    });
  }
}

async function renderReply(input) {
  return renderReplyWithContext(input, {});
}

async function renderReplyWithContext(input, context = {}) {
  const engineState = resolveMondayEngine(input, {});
  const resolvedEngineState =
    context && Object.keys(context).length
      ? resolveMondayEngine(input, context)
      : engineState;
  const truth = inferTruth(resolvedEngineState, input);
  const voice = translateMondayVoice({
    engineState: resolvedEngineState,
    truth,
  });

  const result = await applyMondayIntelligence({
    result: {
      finalState: resolvedEngineState,
      truth,
      voice,
      workspace: {
        workspaceMode: "reflection_support",
        supportIntent: "help_meaning_emerge",
      },
    },
    input,
    history: [],
    personalContext: {
      captureIntent: false,
      relevantThread: getRelevantThreadContext({
        significance: resolvedEngineState.significance,
      }),
    },
  });

  return {
    engineState: resolvedEngineState,
    text: result.voice.text,
  };
}

async function main() {
  resetStore();
  seedCapturedThreads();

  const cases = [
    {
      input: "I want to lose weight.",
      significance: "weight_loss_goal",
      role: "steward",
      includes: [
        "health thread",
        "wanting to lose weight",
        "first sustainable change",
      ],
    },
    {
      input: "I think I want to retire.",
      significance: "future_life_transition",
      role: "companion",
      includes: [
        "retirement thread",
        "wanting to retire",
        "identity, freedom",
        "what work has been carrying",
      ],
    },
    {
      input: "I have not prayed in weeks.",
      significance: "prayer_concern",
      role: "steward",
      includes: [
        "faith thread",
        "not having prayed in weeks",
        "returning to prayer",
      ],
    },
    {
      input: "I think I am hiding in work.",
      significance: "work_tradeoff",
      role: "companion",
      includes: [
        "work thread",
        "hiding in work",
      ],
    },
    {
      input: "I should write another book.",
      significance: "publishing_decision",
      role: "companion",
      includes: [
        "publishing thread",
        "write another book",
      ],
    },
    {
      input: "Family matters most.",
      significance: "declared_family_value",
      role: "witness",
      includes: [
        "family thread",
        "family mattering most",
      ],
    },
    {
      input: "I do not think Caleb and I are connecting.",
      significance: "relationship_concern",
      role: "companion",
      includes: [
        "relationship matters",
        "feels off",
      ],
    },
  ];

  for (const testCase of cases) {
    const { engineState, text } = await renderReply(testCase.input);

    assert.equal(engineState.classificationFallback, false, testCase.input);
    assert.equal(engineState.significance, testCase.significance, testCase.input);
    assert.equal(engineState.activeRole, testCase.role, testCase.input);
    assert.ok(!text.includes("I've noticed something."), testCase.input);
    assert.ok(!text.includes("I think it may matter"), testCase.input);

    for (const expected of testCase.includes) {
      assert.ok(
        text.toLowerCase().includes(expected.toLowerCase()),
        `${testCase.input} missing '${expected}' in '${text}'`
      );
    }

    const standards = BEST_RESPONSE_STANDARDS[testCase.input];
    if (standards) {
      for (const standard of standards) {
        assert.ok(
          text.toLowerCase().includes(standard.toLowerCase()),
          `${testCase.input} missed best-response standard '${standard}' in '${text}'`
        );
      }
    }
  }

  const workTurn1 = resolveMondayEngine("I think I am hiding in work.", {});
  const healthTurn1 = resolveMondayEngine("I want to lose weight.", {});
  const healthTurn2 = await renderReplyWithContext(
    "Honestly I think I keep restarting because I try to change everything at once.",
    { continuity: healthTurn1.continuity }
  );
  assert.equal(healthTurn2.engineState.significance, "weight_loss_goal");
  assert.equal(healthTurn2.engineState.activeRole, "steward");
  assert.ok(
    healthTurn2.text.toLowerCase().includes("everything at once") ||
      healthTurn2.text.toLowerCase().includes("keeps resetting") ||
      healthTurn2.text.toLowerCase().includes("too heavy to carry") ||
      healthTurn2.text.toLowerCase().includes("smaller than your ambition"),
    healthTurn2.text
  );
  assert.ok(!healthTurn2.text.includes("I'm not sure what kind of situation this is yet."));

  const faithTurn1 = resolveMondayEngine("I have not prayed in weeks.", {});
  const faithTurn2 = await renderReplyWithContext(
    "I think I have been avoiding being quiet long enough to notice what is going on in me.",
    { continuity: faithTurn1.continuity }
  );
  assert.equal(faithTurn2.engineState.significance, "prayer_concern");
  assert.equal(faithTurn2.engineState.activeRole, "steward");
  assert.ok(
    faithTurn2.text.toLowerCase().includes("quiet") ||
      faithTurn2.text.toLowerCase().includes("what is going on in you") ||
      faithTurn2.text.toLowerCase().includes("returning to it") ||
      faithTurn2.text.toLowerCase().includes("room for honesty"),
    faithTurn2.text
  );
  assert.ok(!faithTurn2.text.includes("I'm not sure what kind of situation this is yet."));

  const publishingTurn1 = resolveMondayEngine("I should write another book.", {});
  const publishingTurn2 = await renderReplyWithContext(
    "I think I want to write it, but I am afraid it will prove I do not have much left to say.",
    { continuity: publishingTurn1.continuity }
  );
  assert.equal(publishingTurn2.engineState.significance, "publishing_decision");
  assert.equal(publishingTurn2.engineState.activeRole, "companion");
  assert.ok(
    publishingTurn2.text.toLowerCase().includes("book") ||
      publishingTurn2.text.toLowerCase().includes("write") ||
      publishingTurn2.text.toLowerCase().includes("afraid") ||
      publishingTurn2.text.toLowerCase().includes("left to say") ||
      publishingTurn2.text.toLowerCase().includes("what the book might reveal") ||
      publishingTurn2.text.toLowerCase().includes("test of whether you still have something to say"),
    publishingTurn2.text
  );
  assert.ok(!publishingTurn2.text.includes("I'm not sure what kind of situation this is yet."));

  const workTurn2 = await renderReplyWithContext(
    "It makes me feel useful and in control.",
    { continuity: workTurn1.continuity }
  );
  assert.equal(workTurn2.engineState.significance, "work_tradeoff");
  assert.equal(workTurn2.engineState.activeRole, "companion");
  assert.ok(
    workTurn2.text.toLowerCase().includes("work") ||
      workTurn2.text.toLowerCase().includes("tradeoff") ||
      workTurn2.text.toLowerCase().includes("control") ||
      workTurn2.text.toLowerCase().includes("protecting"),
    workTurn2.text
  );
  assert.ok(!workTurn2.text.includes("I'm not sure what kind of situation this is yet."));

  const workTurn3 = await renderReplyWithContext(
    "It keeps me from thinking about other things.",
    { continuity: workTurn1.continuity }
  );
  assert.equal(workTurn3.engineState.significance, "work_tradeoff");
  assert.equal(workTurn3.engineState.activeRole, "companion");
  assert.ok(
    workTurn3.text.toLowerCase().includes("refuge") ||
      workTurn3.text.toLowerCase().includes("avoid") ||
      workTurn3.text.toLowerCase().includes("other things"),
    workTurn3.text
  );

  const familyTurn1 = resolveMondayEngine(
    "I do not think Caleb and I are connecting.",
    {}
  );
  const familyTurn2 = await renderReplyWithContext(
    "We mostly just pass each other at the end of the day.",
    { continuity: familyTurn1.continuity }
  );
  assert.equal(familyTurn2.engineState.significance, "relationship_concern");
  assert.equal(familyTurn2.engineState.activeRole, "companion");
  assert.ok(
    familyTurn2.text.toLowerCase().includes("relationship") ||
      familyTurn2.text.toLowerCase().includes("caleb") ||
      familyTurn2.text.toLowerCase().includes("connection") ||
      familyTurn2.text.toLowerCase().includes("distance"),
    familyTurn2.text
  );
  assert.ok(!familyTurn2.text.includes("I'm not sure what kind of situation this is yet."));

  const retirementTurn1 = resolveMondayEngine("I think I want to retire.", {});
  const retirementTurn2 = await renderReplyWithContext(
    "I want more time with my family and less pressure.",
    { continuity: retirementTurn1.continuity }
  );
  assert.equal(retirementTurn2.engineState.significance, "future_life_transition");
  assert.equal(retirementTurn2.engineState.activeRole, "companion");
  assert.ok(
    retirementTurn2.text.toLowerCase().includes("retirement") ||
      retirementTurn2.text.toLowerCase().includes("family") ||
      retirementTurn2.text.toLowerCase().includes("pressure") ||
      retirementTurn2.text.toLowerCase().includes("different way of carrying life"),
    retirementTurn2.text
  );

  resetStore();
  console.log("Monday usefulness regression tests passed.");
}

main();
