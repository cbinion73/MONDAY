module.exports = {
  readiness: {
    input: "Am I ready for Summer Camp?",
    context: {
      activeMission: "Summer Camp",
      threadKey: "summer-camp",
    },
    expected: {
      significance: "summer_camp_mission_readiness",
      situationClassification: "readiness_assessment",
      activeRole: "steward",
      secondaryRole: "advisor",
      recommendedOutcome: "surface_then_advise",
    },
  },
  statusCheck: {
    input: "How's camp prep coming?",
    context: {
      activeMission: "Summer Camp",
      threadKey: "summer-camp",
    },
    expected: {
      significance: "summer_camp_mission_readiness",
      situationClassification: "readiness_assessment",
      activeRole: "steward",
      secondaryRole: "advisor",
      recommendedOutcome: "surface_then_advise",
    },
  },
  trailerDecision: {
    input: "Should I rent a trailer?",
    context: {
      activeMission: "Summer Camp",
      threadKey: "summer-camp",
    },
    expected: {
      significance: "transportation_risk_reduction",
      situationClassification: "execution_tradeoff_decision",
      activeRole: "advisor",
      secondaryRole: "steward",
      recommendedOutcome: "advise",
    },
  },
  commitment: {
    input: "Let's do it.",
    context: {
      activeMission: "Summer Camp",
      threadKey: "summer-camp",
    },
    expected: {
      significance: "transportation_execution_thread",
      situationClassification: "accepted_execution_commitment",
      activeRole: "operator",
      secondaryRole: "steward",
      recommendedOutcome: "operate",
    },
  },
};
