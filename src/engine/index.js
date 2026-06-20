const { createEngineState } = require("./schema");
const { resolveSignificance } = require("./resolvers/significance-resolver");
const { classifySituation } = require("./resolvers/situation-classifier");
const { resolvePosture } = require("./resolvers/posture-resolver");
const {
  resolveContinuity,
  buildContinuityState,
} = require("./resolvers/continuity-resolver");
const {
  analyzeFallback,
} = require("./resolvers/fallback-analysis-resolver");

function resolveMondayEngine(input, context = {}) {
  const continuityResult = resolveContinuity({ input, context });
  const enrichedContext = {
    ...continuityResult.context,
    ...(continuityResult.hints.significanceHint
      ? { significanceHint: continuityResult.hints.significanceHint }
      : {}),
  };
  const significanceResult = resolveSignificance({ input, context: enrichedContext });
  const classificationResult = classifySituation({
    input,
    significance: significanceResult.significance,
    context: enrichedContext,
  });
  const postureResult = resolvePosture({
    significance: significanceResult.significance,
    situationClassification: classificationResult.situationClassification,
    humanCompanyRequired: classificationResult.humanCompanyRequired,
    healingVsExecution: significanceResult.healingVsExecution,
    input,
    context,
  });
  const fallbackAnalysis =
    significanceResult.classificationFallback ||
    classificationResult.classificationFallback
      ? analyzeFallback({ input, context: enrichedContext })
      : null;

  return createEngineState({
    significance: significanceResult.significance,
    situationClassification: classificationResult.situationClassification,
    activeRole: postureResult.activeRole,
    secondaryRole: postureResult.secondaryRole,
    ripenessState: classificationResult.ripenessState,
    interruptibility: classificationResult.interruptibility,
    humanCompanyRequired: classificationResult.humanCompanyRequired,
    recommendedOutcome: postureResult.recommendedOutcome,
    woundRisk: classificationResult.woundRisk,
    shamePresent: classificationResult.shamePresent,
    identityProximity: classificationResult.identityProximity,
    healingVsExecution: significanceResult.healingVsExecution,
    continuity: buildContinuityState({
      input,
      engineState: {
        significance: significanceResult.significance,
        situationClassification: classificationResult.situationClassification,
        activeRole: postureResult.activeRole,
      },
      context: enrichedContext,
    }),
    threadInheritanceConfidence:
      continuityResult.threadInheritanceConfidence ?? null,
    classificationFallback:
      Boolean(significanceResult.classificationFallback) ||
      Boolean(classificationResult.classificationFallback),
    fallbackReason:
      significanceResult.fallbackReason ||
      classificationResult.fallbackReason ||
      null,
    candidateDomain: fallbackAnalysis?.candidateDomain || null,
    candidateClassification: fallbackAnalysis?.candidateClassification || null,
    candidateConfidence: fallbackAnalysis?.candidateConfidence ?? null,
    explanation: [
      ...continuityResult.explanation,
      ...significanceResult.explanation,
      ...classificationResult.explanation,
      ...postureResult.explanation,
      ...(fallbackAnalysis ? fallbackAnalysis.explanation : []),
    ],
  });
}

module.exports = {
  resolveMondayEngine,
};
