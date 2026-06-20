const MONDAY_ROLES = Object.freeze([
  "keeper",
  "witness",
  "companion",
  "steward",
  "advisor",
  "operator",
]);

const MONDAY_OUTCOMES = Object.freeze([
  "stay_quiet",
  "preserve_quietly",
  "surface_gently",
  "explore_relationally",
  "guard_actively",
  "advise",
  "operate",
  "escalate_to_human_company",
  "surface_then_advise",
]);

function createEngineState(partial) {
  return {
    significance: partial.significance ?? "unknown_significance",
    situationClassification:
      partial.situationClassification ?? "unclassified",
    activeRole: partial.activeRole ?? "witness",
    secondaryRole: partial.secondaryRole ?? null,
    ripenessState: partial.ripenessState ?? "medium",
    interruptibility: partial.interruptibility ?? "conditional",
    humanCompanyRequired: partial.humanCompanyRequired ?? "false",
    recommendedOutcome:
      partial.recommendedOutcome ?? "explore_relationally",
    voiceMode: partial.voiceMode ?? null,
    workspaceMode: partial.workspaceMode ?? null,
    woundRisk: partial.woundRisk ?? null,
    shamePresent: partial.shamePresent ?? null,
    identityProximity: partial.identityProximity ?? null,
    healingVsExecution: partial.healingVsExecution ?? null,
    continuity: partial.continuity ?? null,
    threadInheritanceConfidence:
      partial.threadInheritanceConfidence ?? null,
    classificationFallback: partial.classificationFallback ?? false,
    fallbackReason: partial.fallbackReason ?? null,
    candidateDomain: partial.candidateDomain ?? null,
    candidateClassification: partial.candidateClassification ?? null,
    candidateConfidence: partial.candidateConfidence ?? null,
    explanation: partial.explanation ?? [],
  };
}

module.exports = {
  MONDAY_OUTCOMES,
  MONDAY_ROLES,
  createEngineState,
};
