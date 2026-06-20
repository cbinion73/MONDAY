const summerCamp = require("../fixtures/summer-camp");
const wounded = require("../fixtures/wounded-significance");
const summerCampTruth = require("../voice/templates/summer-camp");
const woundedTruth = require("../voice/templates/wounded-significance");

const scenarios = {
  "summer-camp": {
    title: "Summer Camp",
    steps: [
      {
        label: "Readiness Check",
        input: summerCamp.readiness.input,
        context: summerCamp.readiness.context,
        truth: summerCampTruth.readiness,
      },
      {
        label: "Trailer Decision",
        input: summerCamp.trailerDecision.input,
        context: summerCamp.trailerDecision.context,
        truth: summerCampTruth.trailerDecision,
      },
      {
        label: "Execution Commitment",
        input: summerCamp.commitment.input,
        context: summerCamp.commitment.context,
        truth: summerCampTruth.commitment,
      },
    ],
  },
  "wounded-significance": {
    title: "Wounded Significance",
    steps: [
      {
        label: "Quiet Significance",
        input: wounded.quietSignificance.input,
        context: wounded.quietSignificance.context,
        truth: woundedTruth.quietSignificance,
      },
      {
        label: "Shame Revealed",
        input: wounded.shameRevealed.input,
        context: wounded.shameRevealed.context,
        truth: woundedTruth.shameRevealed,
      },
      {
        label: "Healing Threshold",
        input:
          "I think it still matters. I just do not know how to approach it without feeling like I failed.",
        context: wounded.shameRevealed.context,
        truth: woundedTruth.healingThreshold,
        overrideState: {
          significance: "truthful_reapproach_needed",
          situationClassification: "healing_threshold",
          activeRole: "steward",
          secondaryRole: "companion",
          ripenessState: "high_for_truth_low_for_operation",
          interruptibility: "allowed",
          humanCompanyRequired: "possible",
          recommendedOutcome: "guard_actively",
          woundRisk: "high",
          shamePresent: "true",
          identityProximity: "medium",
          healingVsExecution: "healing",
          explanation: ["Manual scenario state for healing threshold."],
        },
      },
      {
        label: "Human Company Boundary",
        input: wounded.humanCompanyBoundary.input,
        context: wounded.humanCompanyBoundary.context,
        truth: woundedTruth.humanCompanyBoundary,
      },
    ],
  },
};

module.exports = {
  scenarios,
};
