function classifySituation({ input, significance, context = {} }) {
  const text = (input || "").toLowerCase();

  if (significance === "summer_camp_mission_readiness") {
    return {
      situationClassification: "readiness_assessment",
      ripenessState: "high",
      interruptibility: "allowed",
      humanCompanyRequired: "false",
      woundRisk: "low",
      shamePresent: "false",
      identityProximity: "low",
      explanation: ["Classified as readiness assessment."],
    };
  }

  if (significance === "transportation_risk_reduction") {
    return {
      situationClassification: "execution_tradeoff_decision",
      ripenessState: "high",
      interruptibility: "allowed",
      humanCompanyRequired: "false",
      woundRisk: "low",
      shamePresent: "false",
      identityProximity: "low",
      explanation: ["Classified as execution tradeoff decision."],
    };
  }

  if (significance === "transportation_execution_thread") {
    return {
      situationClassification: "accepted_execution_commitment",
      ripenessState: "high",
      interruptibility: "allowed",
      humanCompanyRequired: "false",
      woundRisk: "low",
      shamePresent: "false",
      identityProximity: "low",
      explanation: ["Classified as accepted execution commitment."],
    };
  }

  if (significance === "book_project_quiet_significance") {
    return {
      situationClassification: "forgottenness_risk",
      ripenessState: "medium",
      interruptibility: "conditional",
      humanCompanyRequired: "false",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as forgottenness risk."],
    };
  }

  if (significance === "wounded_book_significance") {
    return {
      situationClassification: "wounded_significance",
      ripenessState: "medium",
      interruptibility: "allowed",
      humanCompanyRequired: "not_yet",
      woundRisk: "high",
      shamePresent: "true",
      identityProximity: "medium",
      explanation: ["Classified as wounded significance with shame present."],
    };
  }

  if (significance === "identity_adjacent_wound") {
    return {
      situationClassification: "human_company_boundary",
      ripenessState: "high_for_boundary",
      interruptibility: "allowed",
      humanCompanyRequired: "true",
      woundRisk: "high",
      shamePresent: text.includes("shame") ? "true" : "possible",
      identityProximity: "high",
      explanation: ["Classified as human-company boundary condition."],
    };
  }

  if (significance === "truthful_reapproach_needed") {
    return {
      situationClassification: "healing_threshold",
      ripenessState: "high_for_truth_low_for_operation",
      interruptibility: "allowed",
      humanCompanyRequired: "possible",
      woundRisk: "high",
      shamePresent: "true",
      identityProximity: "medium",
      explanation: ["Classified as healing threshold."],
    };
  }

  if (significance === "weight_loss_goal") {
    return {
      situationClassification: "goal_or_transformation",
      ripenessState: "medium",
      interruptibility: "allowed",
      humanCompanyRequired: "false",
      woundRisk: "low",
      shamePresent: "possible",
      identityProximity: "low",
      explanation: ["Classified as health goal or transformation."],
    };
  }

  if (significance === "energy_decline") {
    return {
      situationClassification: "drift_signal",
      ripenessState: "medium",
      interruptibility: "conditional",
      humanCompanyRequired: "false",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "low",
      explanation: ["Classified as energy decline drift signal."],
    };
  }

  if (significance === "exercise_commitment") {
    return {
      situationClassification: "goal_or_transformation",
      ripenessState: "medium",
      interruptibility: "allowed",
      humanCompanyRequired: "false",
      woundRisk: "low",
      shamePresent: "possible",
      identityProximity: "low",
      explanation: ["Classified as exercise commitment."],
    };
  }

  if (significance === "declared_family_value") {
    return {
      situationClassification: "value_statement",
      ripenessState: "medium",
      interruptibility: "conditional",
      humanCompanyRequired: "false",
      woundRisk: "low",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as declared family value."],
    };
  }

  if (significance === "relationship_concern") {
    return {
      situationClassification: "contradiction_surface",
      ripenessState: "medium",
      interruptibility: "allowed",
      humanCompanyRequired: "possible",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as relationship concern or contradiction."],
    };
  }

  if (significance === "family_time_tension") {
    return {
      situationClassification: "contradiction_surface",
      ripenessState: "medium",
      interruptibility: "conditional",
      humanCompanyRequired: "false",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as family time tension."],
    };
  }

  if (significance === "spiritual_drift") {
    return {
      situationClassification: "drift_signal",
      ripenessState: "medium",
      interruptibility: "conditional",
      humanCompanyRequired: "false",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as spiritual drift."],
    };
  }

  if (significance === "prayer_concern") {
    return {
      situationClassification: "goal_or_transformation",
      ripenessState: "medium",
      interruptibility: "conditional",
      humanCompanyRequired: "false",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as prayer concern."],
    };
  }

  if (significance === "calling_question") {
    return {
      situationClassification: "future_life_tradeoff",
      ripenessState: "medium",
      interruptibility: "allowed",
      humanCompanyRequired: "possible",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "high",
      explanation: ["Classified as calling question."],
    };
  }

  if (significance === "work_tradeoff") {
    return {
      situationClassification: "contradiction_surface",
      ripenessState: "medium",
      interruptibility: "conditional",
      humanCompanyRequired: "false",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as work tradeoff or tension."],
    };
  }

  if (significance === "burnout_risk") {
    return {
      situationClassification: "burnout_risk",
      ripenessState: "medium",
      interruptibility: "allowed",
      humanCompanyRequired: "possible",
      woundRisk: "high",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as burnout risk."],
    };
  }

  if (significance === "career_decision") {
    return {
      situationClassification: "future_life_tradeoff",
      ripenessState: "high",
      interruptibility: "allowed",
      humanCompanyRequired: "false",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as career decision."],
    };
  }

  if (significance === "publishing_decision") {
    return {
      situationClassification: "future_life_tradeoff",
      ripenessState: "medium",
      interruptibility: "allowed",
      humanCompanyRequired: "false",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as publishing decision."],
    };
  }

  if (significance === "creative_drift") {
    return {
      situationClassification: "drift_signal",
      ripenessState: "medium",
      interruptibility: "conditional",
      humanCompanyRequired: "false",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as creative drift."],
    };
  }

  if (significance === "future_life_transition") {
    return {
      situationClassification: "future_life_tradeoff",
      ripenessState: "medium",
      interruptibility: "allowed",
      humanCompanyRequired: "false",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as future life transition."],
    };
  }

  if (significance === "identity_transition") {
    return {
      situationClassification: "identity_transition",
      ripenessState: "medium",
      interruptibility: "allowed",
      humanCompanyRequired: "possible",
      woundRisk: "high",
      shamePresent: "possible",
      identityProximity: "high",
      explanation: ["Classified as identity transition."],
    };
  }

  if (significance === "legacy_question") {
    return {
      situationClassification: "future_life_tradeoff",
      ripenessState: "medium",
      interruptibility: "conditional",
      humanCompanyRequired: "false",
      woundRisk: "medium",
      shamePresent: "possible",
      identityProximity: "medium",
      explanation: ["Classified as legacy question."],
    };
  }

  return {
    situationClassification: "unclassified",
    ripenessState: "medium",
    interruptibility: "conditional",
    humanCompanyRequired: "false",
    woundRisk: "medium",
    shamePresent: "possible",
    identityProximity: "low",
    explanation: ["Fell back to generic classification."],
    classificationFallback: true,
    fallbackReason: "No matching situation classification found",
  };
}

module.exports = {
  classifySituation,
};
