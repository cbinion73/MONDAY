const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  applyLearnedRecovery,
  getLearnedClassificationHints,
  recordTurnLearning,
  recordClarifiedLearning,
  getLearningSummary,
  getLearningInspection,
  getDataDir,
} = require("../src/engine/learning/closed-loop-learning");

function resetLearningData() {
  fs.rmSync(getDataDir(), { recursive: true, force: true });
}

function main() {
  process.env.MONDAY_CLOSED_LOOP_LEARNING = "true";
  process.env.MONDAY_LEARNING_DATA_DIR = path.resolve(
    __dirname,
    "../data/test-learning"
  );
  resetLearningData();

  const learnedTurn = {
    finalState: {
      significance: "weight_loss_goal",
      situationClassification: "goal_or_transformation",
      activeRole: "steward",
      secondaryRole: "companion",
      recommendedOutcome: "surface_then_advise",
      classificationFallback: false,
      threadInheritanceConfidence: 0,
      healingVsExecution: "mixed",
    },
    contract: {
      adjustments: [],
      blocked: [],
    },
    classificationAssist: null,
  };

  recordTurnLearning({
    input: "I want to get lighter and healthier.",
    sessionId: "test-session",
    result: learnedTurn,
  });

  const recovered = applyLearnedRecovery({
    input: "I want to get lighter and healthier.",
    context: {},
    engineState: {
      significance: "general_significance",
      situationClassification: "unclassified",
      activeRole: "witness",
      secondaryRole: "companion",
      recommendedOutcome: "explore_relationally",
      classificationFallback: true,
      explanation: [],
    },
  });

  assert.equal(recovered.engineState.learningRecovery.used, true);
  assert.equal(recovered.engineState.significance, "weight_loss_goal");
  assert.equal(
    recovered.engineState.situationClassification,
    "goal_or_transformation"
  );
  assert.equal(recovered.engineState.activeRole, "steward");

  const summary = getLearningSummary();
  assert.ok(summary.learnedExamples >= 1);
  assert.equal(summary.quarantinedExamples, 0);
  assert.deepEqual(summary.policy.learnable, [
    "candidate_domain",
    "candidate_significance",
    "situation_classification_hint",
    "continuity_association",
  ]);
  assert.ok(summary.policy.nonLearnable.includes("healing_vs_execution"));
  assert.ok(summary.ttlDays >= 1);
  assert.equal(summary.counters.clarifiedTurns, 0);

  const inspection = getLearningInspection();
  assert.ok(inspection.summary);
  assert.equal(inspection.examples.length, 1);
  assert.equal(inspection.quarantinedExamples.length, 0);
  assert.equal(inspection.examples[0].significance, "weight_loss_goal");
  assert.equal("healingVsExecution" in inspection.examples[0], false);
  assert.ok(Array.isArray(inspection.recentRecoveries));
  assert.ok(Array.isArray(inspection.recentFallbacks));
  assert.equal(inspection.summary.learnedExamples, summary.learnedExamples);
  assert.ok(Array.isArray(inspection.hypotheses));

  const clarified = recordClarifiedLearning({
    input: "How is camp prep coming?",
    finalState: {
      significance: "summer_camp_mission_readiness",
      situationClassification: "readiness_assessment",
      healingVsExecution: "execution",
      continuity: {
        activeSignificanceThread: "readiness_assessment",
      },
      classificationFallback: false,
    },
  });

  assert.ok(clarified);
  assert.equal(clarified.source, "session-clarified");
  assert.ok(clarified.sourceHistory.includes("session-clarified"));

  const clarifiedRecovery = applyLearnedRecovery({
    input: "How is camp prep coming?",
    context: {},
    engineState: {
      significance: "general_significance",
      situationClassification: "unclassified",
      activeRole: "witness",
      secondaryRole: "companion",
      recommendedOutcome: "explore_relationally",
      classificationFallback: true,
      explanation: [],
    },
  });

  assert.equal(clarifiedRecovery.engineState.learningRecovery.used, true);
  assert.equal(
    clarifiedRecovery.engineState.significance,
    "summer_camp_mission_readiness"
  );

  const clarifiedInspection = getLearningInspection();
  const clarifiedExample = clarifiedInspection.examples.find(
    (example) => example.sampleInput === "How is camp prep coming?"
  );
  assert.ok(clarifiedExample);
  assert.ok(clarifiedExample.sourceHistory.includes("session-clarified"));

  const learnedFromRecoveryTurn = {
    finalState: {
      significance: "weight_loss_goal",
      situationClassification: "goal_or_transformation",
      activeRole: "steward",
      secondaryRole: "companion",
      recommendedOutcome: "surface_then_advise",
      classificationFallback: false,
      threadInheritanceConfidence: 0,
      healingVsExecution: "mixed",
    },
    contract: {
      adjustments: [],
      blocked: [],
    },
    classificationAssist: null,
    learningRecovery: {
      used: true,
      sourceInput: "I want to get lighter and healthier.",
      matchedSignificance: "weight_loss_goal",
      similarity: 0.93,
    },
  };

  const beforeRecoveryLearning = getLearningInspection().examples.length;
  const recoveryStored = recordTurnLearning({
    input: "I want to get lighter and healthier soon.",
    sessionId: "recovery-session",
    result: learnedFromRecoveryTurn,
  });
  const afterRecoveryLearning = getLearningInspection().examples.length;
  const afterRecoveryInspection = getLearningInspection();

  assert.equal(recoveryStored.learnedExample, null);
  assert.equal(afterRecoveryLearning, beforeRecoveryLearning);
  assert.equal(afterRecoveryInspection.quarantinedExamples.length, 0);

  recordTurnLearning({
    input: "I want to travel to Spain.",
    sessionId: "fallback-session",
    result: {
      finalState: {
        significance: "general_significance",
        situationClassification: "unclassified",
        activeRole: "witness",
        secondaryRole: "companion",
        recommendedOutcome: "explore_relationally",
        classificationFallback: true,
        candidateDomain: "retirement",
        candidateClassification: "future_life_tradeoff",
        candidateConfidence: 0.62,
        threadInheritanceConfidence: 0,
      },
      contract: {
        adjustments: [],
        blocked: [],
      },
      classificationAssist: null,
    },
  });

  const inspectionAfterFallback = getLearningInspection();
  assert.ok(inspectionAfterFallback.hypotheses.length >= 1);
  assert.equal(
    inspectionAfterFallback.hypotheses[0].candidateDomain,
    "retirement"
  );

  const hintList = getLearnedClassificationHints({
    input: "I want to travel to Spain.",
  });
  assert.ok(hintList.length >= 1);
  assert.equal(hintList[0].candidateDomain, "retirement");

  const postFallbackSummary = getLearningSummary();
  assert.ok(postFallbackSummary.learnedHypotheses >= 1);
  assert.ok(postFallbackSummary.counters.fallbackHypotheses >= 1);

  console.log("Monday closed-loop learning tests passed.");
  resetLearningData();
}

main();
