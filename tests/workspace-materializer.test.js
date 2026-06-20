const assert = require("node:assert/strict");
const { resolveMondayEngine } = require("../src/engine");
const { materializeWorkspace } = require("../src/engine/workspace/workspace-materializer");
const summerCampFixtures = require("../src/engine/fixtures/summer-camp");
const woundedFixtures = require("../src/engine/fixtures/wounded-significance");
const summerCampTruth = require("../src/engine/voice/templates/summer-camp");
const woundedTruth = require("../src/engine/voice/templates/wounded-significance");

function assertRegressionRules(workspace) {
  assert.equal(
    workspace.answerRequiredFirst,
    true,
    "workspace must never become the answer"
  );
  assert.equal(
    workspace.regressionChecks.workspaceMustNotBeAnswer,
    true,
    "workspace regression guard missing"
  );
  assert.equal(
    workspace.regressionChecks.canUnderstandAnswerWithoutWorkspace,
    true,
    "answer must stand without opening workspace"
  );
}

function main() {
  const summerReadiness = resolveMondayEngine(
    summerCampFixtures.readiness.input,
    summerCampFixtures.readiness.context
  );
  const summerReadinessWorkspace = materializeWorkspace({
    engineState: summerReadiness,
    truth: summerCampTruth.readiness,
  });
  assert.equal(summerReadinessWorkspace.workspaceMode, "evidence_support");
  assert.equal(
    summerReadinessWorkspace.supportIntent,
    "increase_confidence_in_answer"
  );
  assertRegressionRules(summerReadinessWorkspace);

  const summerDecision = resolveMondayEngine(
    summerCampFixtures.trailerDecision.input,
    summerCampFixtures.trailerDecision.context
  );
  const summerDecisionWorkspace = materializeWorkspace({
    engineState: summerDecision,
    truth: summerCampTruth.trailerDecision,
  });
  assert.equal(summerDecisionWorkspace.workspaceMode, "decision_support");
  assert.equal(
    summerDecisionWorkspace.supportIntent,
    "compare_meaningful_paths"
  );
  assertRegressionRules(summerDecisionWorkspace);

  const summerExecution = resolveMondayEngine(
    summerCampFixtures.commitment.input,
    summerCampFixtures.commitment.context
  );
  const summerExecutionWorkspace = materializeWorkspace({
    engineState: summerExecution,
    truth: summerCampTruth.commitment,
  });
  assert.equal(summerExecutionWorkspace.workspaceMode, "execution_workspace");
  assert.equal(
    summerExecutionWorkspace.supportIntent,
    "reduce_burden_after_commitment"
  );
  assertRegressionRules(summerExecutionWorkspace);

  const quietThread = resolveMondayEngine(
    woundedFixtures.quietSignificance.input,
    woundedFixtures.quietSignificance.context
  );
  const quietThreadWorkspace = materializeWorkspace({
    engineState: quietThread,
    truth: woundedTruth.quietSignificance,
  });
  assert.equal(quietThreadWorkspace.workspaceMode, "quiet_thread");
  assert.equal(
    quietThreadWorkspace.supportIntent,
    "preserve_significance_without_pressure"
  );
  assertRegressionRules(quietThreadWorkspace);

  const reflection = resolveMondayEngine(
    woundedFixtures.shameRevealed.input,
    woundedFixtures.shameRevealed.context
  );
  const reflectionWorkspace = materializeWorkspace({
    engineState: reflection,
    truth: woundedTruth.shameRevealed,
  });
  assert.equal(reflectionWorkspace.workspaceMode, "reflection_support");
  assert.equal(
    reflectionWorkspace.supportIntent,
    "help_meaning_emerge"
  );
  assertRegressionRules(reflectionWorkspace);

  const escalation = resolveMondayEngine(
    woundedFixtures.humanCompanyBoundary.input,
    woundedFixtures.humanCompanyBoundary.context
  );
  const escalationWorkspace = materializeWorkspace({
    engineState: escalation,
    truth: woundedTruth.humanCompanyBoundary,
  });
  assert.equal(escalationWorkspace.workspaceMode, "escalation_support");
  assert.equal(
    escalationWorkspace.supportIntent,
    "carry_significance_toward_human_company"
  );
  assertRegressionRules(escalationWorkspace);

  console.log("Monday workspace materializer tests passed.");
}

main();
