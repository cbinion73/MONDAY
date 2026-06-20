const fs = require("node:fs");
const path = require("node:path");

const { resolveMondayEngine } = require("..");
const { inferTruth } = require("../runtime/infer-truth");
const { translateMondayVoice } = require("../voice/voice-translator");
const {
  applyMondayIntelligence,
} = require("../intelligence/monday-intelligence");
const {
  recordCapture,
  getRelevantThreadContext,
  getDataDir,
} = require("../personal/personal-store");

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

async function renderTurn(input, context = {}, history = []) {
  const engineState = resolveMondayEngine(input, context);
  const truth = inferTruth(engineState, input);
  const voice = translateMondayVoice({
    engineState,
    truth,
  });

  return applyMondayIntelligence({
    result: {
      finalState: engineState,
      truth,
      voice,
      workspace: {
        workspaceMode: "reflection_support",
        supportIntent: "help_meaning_emerge",
      },
    },
    input,
    history,
    personalContext: {
      captureIntent: false,
      relevantThread: getRelevantThreadContext({
        significance: engineState.significance,
      }),
    },
  });
}

async function runConversation(turns) {
  const outputs = [];
  let context = {};
  let history = [];

  for (const turn of turns) {
    const result = await renderTurn(turn.input, context, history);
    outputs.push(result);
    context = { continuity: result.finalState.continuity };
    history = [
      ...history,
      {
        user: turn.input,
        monday: result.voice.text,
      },
    ];
  }

  return outputs;
}

function includesAny(text, expected) {
  const lower = String(text || "").toLowerCase();
  return expected.some((item) => lower.includes(item.toLowerCase()));
}

function getCanonicalConversationSpecs() {
  return [
    {
      name: "health",
      turns: [
        {
          input: "I want to lose weight.",
          significance: "weight_loss_goal",
          role: "steward",
          includes: ["health is asking for attention here", "first sustainable change"],
        },
        {
          input:
            "Honestly I think I keep restarting because I try to change everything at once.",
          significance: "weight_loss_goal",
          role: "steward",
          includes: [
            "keeps resetting",
            "everything at once",
            "smaller than your ambition",
          ],
        },
      ],
    },
    {
      name: "retirement",
      turns: [
        {
          input: "I think I want to retire.",
          significance: "future_life_transition",
          role: "companion",
          includes: ["timing decision", "different shape of life"],
        },
        {
          input: "I want more time with my family and less pressure.",
          significance: "future_life_transition",
          role: "companion",
          includes: [
            "pointing less to escape and more to relief",
            "different way of carrying life",
            "pressure",
          ],
        },
      ],
    },
    {
      name: "faith",
      turns: [
        {
          input: "I haven't prayed in weeks.",
          significance: "prayer_concern",
          role: "steward",
          includes: ["faith is asking for attention here", "returning to prayer"],
        },
        {
          input:
            "I think I have been avoiding being quiet long enough to notice what is going on in me.",
          significance: "prayer_concern",
          role: "steward",
          includes: [
            "quiet itself may be part of what feels difficult",
            "returning to it might feel costly",
            "room for honesty",
          ],
        },
      ],
    },
    {
      name: "work",
      turns: [
        {
          input: "I think I am hiding in work.",
          significance: "work_tradeoff",
          role: "companion",
          includes: [
            "carrying more weight than usual",
            "what work is doing for you right now",
          ],
        },
        {
          input: "It makes me feel useful and in control.",
          significance: "work_tradeoff",
          role: "companion",
          includes: [
            "usefulness and control matters",
            "hard to loosen your grip",
            "protecting you from",
          ],
        },
      ],
    },
    {
      name: "publishing",
      turns: [
        {
          input: "I should write another book.",
          significance: "publishing_decision",
          role: "companion",
          includes: [
            "sounds worth taking seriously",
            "writing questions are rarely just about output",
          ],
        },
        {
          input:
            "I think I want to write it, but I am afraid it will prove I do not have much left to say.",
          significance: "publishing_decision",
          role: "companion",
          includes: [
            "what the book might reveal",
            "test of whether you still have something to say",
            "what the book would mean about you",
          ],
        },
      ],
    },
  ];
}

async function evaluateCanonicalConversations() {
  resetStore();
  seedCapturedThreads();

  const specs = getCanonicalConversationSpecs();
  const results = [];

  try {
    for (const conversation of specs) {
      const outputs = await runConversation(conversation.turns);

      for (let index = 0; index < conversation.turns.length; index += 1) {
        const spec = conversation.turns[index];
        const output = outputs[index];
        const checks = {
          significance: output.finalState.significance === spec.significance,
          role: output.finalState.activeRole === spec.role,
          noFallback: !output.finalState.classificationFallback,
          noGenericWitness: !output.voice.text.includes("I've noticed something."),
          noFallbackQuestion: !output.voice.text.includes(
            "I'm not sure what kind of situation this is yet."
          ),
          languageQuality: includesAny(output.voice.text, spec.includes),
        };

        results.push({
          conversation: conversation.name,
          turn: index + 1,
          prompt: spec.input,
          significance: output.finalState.significance,
          expectedSignificance: spec.significance,
          role: output.finalState.activeRole,
          expectedRole: spec.role,
          responseSource: output.voice.responseSource,
          reply: output.voice.text,
          checks,
          passed: Object.values(checks).every(Boolean),
        });
      }
    }
  } finally {
    resetStore();
  }

  return {
    generatedAt: new Date().toISOString(),
    passed: results.every((item) => item.passed),
    totalTurns: results.length,
    passedTurns: results.filter((item) => item.passed).length,
    failedTurns: results.filter((item) => !item.passed).length,
    results,
  };
}

module.exports = {
  evaluateCanonicalConversations,
  getCanonicalConversationSpecs,
};
