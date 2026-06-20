const fs = require("node:fs");

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

const BEST_RESPONSE_STANDARDS = {
  "I want to lose weight.": [
    "health is asking for attention here",
    "first sustainable change",
  ],
  "I think I want to retire.": [
    "more than a timing decision",
    "different shape of life",
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
    result,
  };
}

function includesAll(text, fragments = []) {
  const lower = String(text || "").toLowerCase();
  return fragments.every((fragment) => lower.includes(fragment.toLowerCase()));
}

function includesAny(text, fragments = []) {
  const lower = String(text || "").toLowerCase();
  return fragments.some((fragment) => lower.includes(fragment.toLowerCase()));
}

function getPrimaryPromptSpecs() {
  return [
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
        "different shape of life",
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
  ];
}

function getContinuationSpecs() {
  return [
    {
      name: "health_continuation",
      start: "I want to lose weight.",
      followUp:
        "Honestly I think I keep restarting because I try to change everything at once.",
      significance: "weight_loss_goal",
      role: "steward",
      includesAny: [
        "everything at once",
        "keeps resetting",
        "too heavy to carry",
        "smaller than your ambition",
      ],
    },
    {
      name: "faith_continuation",
      start: "I have not prayed in weeks.",
      followUp:
        "I think I have been avoiding being quiet long enough to notice what is going on in me.",
      significance: "prayer_concern",
      role: "steward",
      includesAny: [
        "quiet",
        "what is going on in you",
        "returning to it",
        "room for honesty",
      ],
    },
    {
      name: "publishing_continuation",
      start: "I should write another book.",
      followUp:
        "I think I want to write it, but I am afraid it will prove I do not have much left to say.",
      significance: "publishing_decision",
      role: "companion",
      includesAny: [
        "book",
        "write",
        "afraid",
        "left to say",
        "what the book might reveal",
        "test of whether you still have something to say",
      ],
    },
    {
      name: "work_continuation",
      start: "I think I am hiding in work.",
      followUp: "It makes me feel useful and in control.",
      significance: "work_tradeoff",
      role: "companion",
      includesAny: ["work", "tradeoff", "control", "protecting"],
    },
    {
      name: "relationship_continuation",
      start: "I do not think Caleb and I are connecting.",
      followUp: "We mostly just pass each other at the end of the day.",
      significance: "relationship_concern",
      role: "companion",
      includesAny: ["relationship", "caleb", "connection", "distance"],
    },
    {
      name: "retirement_continuation",
      start: "I think I want to retire.",
      followUp: "I want more time with my family and less pressure.",
      significance: "future_life_transition",
      role: "companion",
      includesAny: [
        "retirement",
        "family",
        "pressure",
        "different way of carrying life",
      ],
    },
  ];
}

async function evaluateUsefulness() {
  resetStore();
  seedCapturedThreads();

  const primaryResults = [];
  const continuationResults = [];

  try {
    for (const spec of getPrimaryPromptSpecs()) {
      const { engineState, text, result } = await renderReplyWithContext(spec.input);
      const standards = BEST_RESPONSE_STANDARDS[spec.input] || [];
      const checks = {
        significance: engineState.significance === spec.significance,
        role: engineState.activeRole === spec.role,
        noFallback: engineState.classificationFallback === false,
        noGenericWitness:
          !text.includes("I've noticed something.") &&
          !text.includes("I think it may matter") &&
          !text.includes("I'm not sure what kind of situation this is yet."),
        threadContinuity: includesAll(text, spec.includes),
        bestResponseStandard: includesAll(text, standards),
      };

      primaryResults.push({
        kind: "primary",
        prompt: spec.input,
        significance: engineState.significance,
        expectedSignificance: spec.significance,
        role: engineState.activeRole,
        expectedRole: spec.role,
        reply: text,
        responseSource: result.voice.responseSource,
        checks,
        passed: Object.values(checks).every(Boolean),
      });
    }

    for (const spec of getContinuationSpecs()) {
      const startState = resolveMondayEngine(spec.start, {});
      const { engineState, text, result } = await renderReplyWithContext(spec.followUp, {
        continuity: startState.continuity,
      });
      const checks = {
        significance: engineState.significance === spec.significance,
        role: engineState.activeRole === spec.role,
        noFallback: engineState.classificationFallback === false,
        noGenericWitness: !text.includes("I'm not sure what kind of situation this is yet."),
        continuityQuality: includesAny(text, spec.includesAny),
      };

      continuationResults.push({
        kind: "continuation",
        name: spec.name,
        prompt: spec.followUp,
        significance: engineState.significance,
        expectedSignificance: spec.significance,
        role: engineState.activeRole,
        expectedRole: spec.role,
        reply: text,
        responseSource: result.voice.responseSource,
        checks,
        passed: Object.values(checks).every(Boolean),
      });
    }
  } finally {
    resetStore();
  }

  const results = [...primaryResults, ...continuationResults];
  return {
    generatedAt: new Date().toISOString(),
    passed: results.every((item) => item.passed),
    totalTurns: results.length,
    passedTurns: results.filter((item) => item.passed).length,
    failedTurns: results.filter((item) => !item.passed).length,
    primaryPromptResults: primaryResults,
    continuationResults,
    results,
  };
}

module.exports = {
  evaluateUsefulness,
  getPrimaryPromptSpecs,
  getContinuationSpecs,
};
