const assert = require("node:assert/strict");
const { resolveMondayEngine } = require("../src/engine");

function assertNotFallback(prompt, expected) {
  const result = resolveMondayEngine(prompt, {});
  assert.equal(
    result.classificationFallback,
    false,
    `${prompt}: should not fall back`
  );
  assert.equal(result.significance, expected.significance, `${prompt}: significance`);
  assert.equal(
    result.situationClassification,
    expected.classification,
    `${prompt}: classification`
  );
  assert.equal(result.activeRole, expected.role, `${prompt}: role`);
}

function main() {
  assertNotFallback("I want to lose weight.", {
    significance: "weight_loss_goal",
    classification: "goal_or_transformation",
    role: "steward",
  });

  assertNotFallback("I'm tired all the time.", {
    significance: "energy_decline",
    classification: "drift_signal",
    role: "companion",
  });

  assertNotFallback("Family matters most.", {
    significance: "declared_family_value",
    classification: "value_statement",
    role: "witness",
  });

  assertNotFallback("I don't think Caleb and I are connecting.", {
    significance: "relationship_concern",
    classification: "contradiction_surface",
    role: "companion",
  });

  assertNotFallback("I haven't prayed in weeks.", {
    significance: "prayer_concern",
    classification: "goal_or_transformation",
    role: "steward",
  });

  assertNotFallback("I think God may be calling me to something.", {
    significance: "calling_question",
    classification: "future_life_tradeoff",
    role: "companion",
  });

  assertNotFallback("I think I'm hiding in work.", {
    significance: "work_tradeoff",
    classification: "contradiction_surface",
    role: "companion",
  });

  assertNotFallback("I'm burned out.", {
    significance: "burnout_risk",
    classification: "burnout_risk",
    role: "companion",
  });

  assertNotFallback("Should I leave Thermo Fisher?", {
    significance: "career_decision",
    classification: "future_life_tradeoff",
    role: "companion",
  });

  assertNotFallback("I think I should write another book.", {
    significance: "publishing_decision",
    classification: "future_life_tradeoff",
    role: "companion",
  });

  assertNotFallback("The book still hurts to think about.", {
    significance: "wounded_book_significance",
    classification: "wounded_significance",
    role: "companion",
  });

  assertNotFallback("I don't know if this project matters anymore.", {
    significance: "creative_drift",
    classification: "drift_signal",
    role: "companion",
  });

  assertNotFallback("I think I want to retire.", {
    significance: "future_life_transition",
    classification: "future_life_tradeoff",
    role: "companion",
  });

  assertNotFallback("I don't know who I am without work.", {
    significance: "identity_transition",
    classification: "identity_transition",
    role: "companion",
  });

  assertNotFallback("I can't stop thinking about retirement.", {
    significance: "legacy_question",
    classification: "future_life_tradeoff",
    role: "companion",
  });

  console.log("Monday ontology v1 tests passed.");
}

main();
