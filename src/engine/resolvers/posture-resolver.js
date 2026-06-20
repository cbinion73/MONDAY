function resolvePosture({
  significance,
  situationClassification,
  humanCompanyRequired,
  healingVsExecution,
  input,
}) {
  const text = (input || "").toLowerCase();

  if (situationClassification === "goal_or_transformation") {
    return {
      activeRole: "steward",
      secondaryRole: "companion",
      recommendedOutcome: "surface_then_advise",
      explanation: [
        "Explicit goals resolve to stewardship before broader exploration.",
      ],
    };
  }

  if (situationClassification === "future_life_tradeoff") {
    return {
      activeRole: "companion",
      secondaryRole: "advisor",
      recommendedOutcome: "explore_relationally",
      explanation: [
        "Future life tradeoffs resolve to companion posture before advice.",
      ],
    };
  }

  if (situationClassification === "contradiction_surface") {
    return {
      activeRole: "companion",
      secondaryRole: "steward",
      recommendedOutcome: "explore_relationally",
      explanation: [
        "Contradictions and tensions resolve to companion posture first.",
      ],
    };
  }

  if (situationClassification === "drift_signal") {
    return {
      activeRole: "companion",
      secondaryRole: "witness",
      recommendedOutcome: "explore_relationally",
      explanation: [
        "Drift signals resolve to companion posture for understanding first.",
      ],
    };
  }

  if (situationClassification === "readiness_assessment") {
    return {
      activeRole: "steward",
      secondaryRole: "advisor",
      recommendedOutcome: "surface_then_advise",
      explanation: ["Readiness questions resolve to stewardship with advice."],
    };
  }

  if (situationClassification === "execution_tradeoff_decision") {
    return {
      activeRole: "advisor",
      secondaryRole: "steward",
      recommendedOutcome: "advise",
      explanation: ["Decision request resolves to advisor with stewardship."],
    };
  }

  if (situationClassification === "accepted_execution_commitment") {
    return {
      activeRole: "operator",
      secondaryRole: "steward",
      recommendedOutcome: "operate",
      explanation: ["Accepted commitment resolves to operator posture."],
    };
  }

  if (situationClassification === "forgottenness_risk") {
    return {
      activeRole: "keeper",
      secondaryRole: "witness",
      recommendedOutcome: "surface_gently",
      explanation: ["Quiet significance resolves to keeper then witness."],
    };
  }

  if (situationClassification === "wounded_significance") {
    if (text.includes("what do you think") || text.includes("help me understand")) {
      return {
        activeRole: "companion",
        secondaryRole: "witness",
        recommendedOutcome: "explore_relationally",
        explanation: [
          "Meaning exploration around shame resolves to companion posture.",
        ],
      };
    }

    return {
      activeRole: "companion",
      secondaryRole: "witness",
      recommendedOutcome: "explore_relationally",
      explanation: ["Wounded significance resolves to companion posture."],
    };
  }

  if (situationClassification === "healing_threshold") {
    return {
      activeRole: "steward",
      secondaryRole: "companion",
      recommendedOutcome: "guard_actively",
      explanation: [
        "Healing threshold resolves to steward with companion support.",
      ],
    };
  }

  if (situationClassification === "human_company_boundary") {
    return {
      activeRole: "witness",
      secondaryRole: "companion",
      recommendedOutcome:
        humanCompanyRequired === "true"
          ? "escalate_to_human_company"
          : "explore_relationally",
      explanation: [
        "Identity-adjacent wound resolves to witness with human-company escalation.",
      ],
    };
  }

  if (healingVsExecution === "healing") {
    return {
      activeRole: "companion",
      secondaryRole: "witness",
      recommendedOutcome: "explore_relationally",
      explanation: ["Healing-biased fallback resolves leftward."],
    };
  }

  if (healingVsExecution === "execution") {
    return {
      activeRole: "steward",
      secondaryRole: "advisor",
      recommendedOutcome: "surface_then_advise",
      explanation: ["Execution-biased fallback resolves rightward."],
    };
  }

  return {
    activeRole: "witness",
    secondaryRole: "companion",
    recommendedOutcome: "explore_relationally",
    explanation: ["Defaulted to witness/companion due to uncertainty."],
  };
}

module.exports = {
  resolvePosture,
};
