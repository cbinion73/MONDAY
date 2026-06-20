const assert = require("node:assert/strict");
const { createEngineState } = require("../src/engine/schema");
const {
  enforceRuntimeContract,
} = require("../src/engine/contract/runtime-contract-enforcer");

function main() {
  const woundedPlanProposal = createEngineState({
    significance: "wounded_book_significance",
    situationClassification: "wounded_significance",
    activeRole: "advisor",
    secondaryRole: "steward",
    ripenessState: "medium",
    interruptibility: "allowed",
    humanCompanyRequired: "not_yet",
    recommendedOutcome: "advise",
    woundRisk: "high",
    shamePresent: "true",
    identityProximity: "medium",
    healingVsExecution: "healing",
  });

  const woundedPlanResult = enforceRuntimeContract({
    engineState: woundedPlanProposal,
  });
  assert.equal(woundedPlanResult.engineState.activeRole, "companion");
  assert.equal(
    woundedPlanResult.engineState.recommendedOutcome,
    "explore_relationally"
  );

  const identityProposal = createEngineState({
    significance: "identity_adjacent_wound",
    situationClassification: "human_company_boundary",
    activeRole: "advisor",
    secondaryRole: "steward",
    ripenessState: "high_for_boundary",
    interruptibility: "allowed",
    humanCompanyRequired: "true",
    recommendedOutcome: "advise",
    woundRisk: "high",
    shamePresent: "possible",
    identityProximity: "high",
    healingVsExecution: "healing",
  });

  const identityResult = enforceRuntimeContract({
    engineState: identityProposal,
  });
  assert.equal(identityResult.engineState.activeRole, "witness");
  assert.equal(
    identityResult.engineState.recommendedOutcome,
    "escalate_to_human_company"
  );
  assert.ok(identityResult.blocked.length > 0);

  const sacredPresenceProposal = createEngineState({
    significance: "summer_camp_mission_readiness",
    situationClassification: "readiness_assessment",
    activeRole: "steward",
    secondaryRole: "advisor",
    ripenessState: "high",
    interruptibility: "allowed",
    humanCompanyRequired: "false",
    recommendedOutcome: "surface_then_advise",
    woundRisk: "low",
    shamePresent: "false",
    identityProximity: "low",
    healingVsExecution: "execution",
  });

  const sacredPresenceResult = enforceRuntimeContract({
    engineState: sacredPresenceProposal,
    context: { presenceMode: "family_time" },
  });
  assert.equal(sacredPresenceResult.engineState.recommendedOutcome, "stay_quiet");

  const unripeAdvisorProposal = createEngineState({
    significance: "general_significance",
    situationClassification: "contradiction_surface",
    activeRole: "advisor",
    secondaryRole: "steward",
    ripenessState: "medium",
    interruptibility: "conditional",
    humanCompanyRequired: "false",
    recommendedOutcome: "advise",
    woundRisk: "medium",
    shamePresent: "possible",
    identityProximity: "medium",
    healingVsExecution: "mixed",
  });

  const unripeAdvisorResult = enforceRuntimeContract({
    engineState: unripeAdvisorProposal,
  });
  assert.equal(unripeAdvisorResult.engineState.activeRole, "companion");
  assert.equal(
    unripeAdvisorResult.engineState.recommendedOutcome,
    "explore_relationally"
  );

  console.log("Monday runtime contract enforcer tests passed.");
}

main();
