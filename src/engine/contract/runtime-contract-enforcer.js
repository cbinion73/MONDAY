function enforceRuntimeContract({ engineState, context = {} }) {
  const adjustments = [];
  const blocked = [];

  let nextState = { ...engineState };

  if (
    nextState.healingVsExecution === "healing" &&
    nextState.woundRisk === "high" &&
    (nextState.recommendedOutcome === "advise" ||
      nextState.recommendedOutcome === "operate" ||
      nextState.recommendedOutcome === "surface_then_advise")
  ) {
    nextState = moveLeft(nextState, "companion", "witness", "explore_relationally");
    adjustments.push(
      "Blocked premature execution because healing is primary and wound risk is high."
    );
  }

  if (
    nextState.identityProximity === "high" &&
    nextState.humanCompanyRequired === "true"
  ) {
    blocked.push(
      "Direct standalone interpretation blocked because identity-adjacent truth requires human company."
    );
    nextState = {
      ...nextState,
      activeRole: "witness",
      secondaryRole: "companion",
      recommendedOutcome: "escalate_to_human_company",
    };
    adjustments.push(
      "Escalated to human company because identity proximity is high."
    );
  }

  if (
    context.presenceMode &&
    ["family_time", "worship", "recovery", "deep_work"].includes(
      context.presenceMode
    ) &&
    nextState.interruptibility !== "required"
  ) {
    nextState = {
      ...nextState,
      recommendedOutcome: "stay_quiet",
    };
    adjustments.push(
      `Suppressed interruption because presence mode '${context.presenceMode}' should be protected.`
    );
  }

  if (
    nextState.ripenessState === "medium" &&
    (nextState.activeRole === "advisor" || nextState.activeRole === "operator")
  ) {
    nextState = moveLeft(nextState, "companion", "witness", "explore_relationally");
    adjustments.push(
      "Moved left because truth is not ripe enough for advice or operation."
    );
  }

  if (
    nextState.recommendedOutcome === "advise" &&
    nextState.humanCompanyRequired === "true"
  ) {
    blocked.push("Advice blocked because human company is required.");
    nextState = {
      ...nextState,
      recommendedOutcome: "escalate_to_human_company",
      activeRole: "witness",
      secondaryRole: "companion",
    };
  }

  return {
    engineState: {
      ...nextState,
      explanation: [
        ...(nextState.explanation || []),
        ...adjustments,
        ...blocked,
      ],
    },
    adjustments,
    blocked,
  };
}

function moveLeft(state, activeRole, secondaryRole, recommendedOutcome) {
  return {
    ...state,
    activeRole,
    secondaryRole,
    recommendedOutcome,
  };
}

module.exports = {
  enforceRuntimeContract,
};
