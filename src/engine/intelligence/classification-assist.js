const { chatWithOllama, DEFAULT_MODEL, DEFAULT_BASE_URL } = require("./ollama-client");
const { classifySituation } = require("../resolvers/situation-classifier");
const { resolvePosture } = require("../resolvers/posture-resolver");
const { getLearnedClassificationHints } = require("../learning/closed-loop-learning");
const { shouldUseFastEverydayLane } = require("./fast-everyday-lane");

function classificationAssistEnabled() {
  return process.env.MONDAY_OLLAMA_CLASSIFICATION_ASSIST !== "false";
}

async function applyClassificationAssist({ input, context = {}, engineState }) {
  if (!classificationAssistEnabled()) {
    return attachAssist(engineState, {
      used: false,
      enabled: false,
      reason: "MONDAY_OLLAMA_CLASSIFICATION_ASSIST is false.",
    });
  }

  if (!engineState.classificationFallback) {
    return attachAssist(engineState, {
      used: false,
      enabled: true,
      reason: "Deterministic classification already resolved.",
    });
  }

  if (shouldUseFastEverydayLane(input, { finalState: engineState, truth: null })) {
    return attachAssist(engineState, {
      used: false,
      enabled: true,
      reason: "Fast everyday lane bypassed classification assist.",
    });
  }

  const knownOptions = getKnownOntologyOptions();
  const prompt = buildAssistPrompt({ input, context, engineState, knownOptions });
  const startedAt = Date.now();

  try {
    const response = await chatWithOllama({ messages: prompt, temperature: 0.1 });
    const parsed = normalizeAssistPayload(response.json);
    if (!parsed) {
      return attachAssist(engineState, {
        used: false,
        enabled: true,
        model: response.model,
        latencyMs: Date.now() - startedAt,
        reason: "Ollama classification assist returned invalid JSON.",
      });
    }

    const mapped = mapSuggestionToOntology(parsed, context);
    if (!mapped) {
      return attachAssist(engineState, {
        used: false,
        enabled: true,
        model: response.model,
        latencyMs: Date.now() - startedAt,
        suggestion: parsed,
        reason: "No safe ontology mapping available for Ollama suggestion.",
      });
    }

    const classificationResult = classifySituation({
      input,
      significance: mapped.significance,
      context,
    });
    const postureResult = resolvePosture({
      significance: mapped.significance,
      situationClassification: classificationResult.situationClassification,
      humanCompanyRequired: classificationResult.humanCompanyRequired,
      healingVsExecution: mapped.healingVsExecution,
      input,
      context,
    });

    return {
      ...engineState,
      significance: mapped.significance,
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
      healingVsExecution: mapped.healingVsExecution,
      classificationFallback: false,
      fallbackReason: null,
      candidateDomain: parsed.candidateDomain,
      candidateClassification: parsed.candidateClassification,
      candidateConfidence: normalizeConfidence(parsed.confidence),
      explanation: [
        ...(engineState.explanation || []),
        `Ollama classification assist mapped input to '${mapped.significance}'.`,
        ...classificationResult.explanation,
        ...postureResult.explanation,
      ],
      classificationAssist: {
        enabled: true,
        used: true,
        model: response.model,
        latencyMs: Date.now() - startedAt,
        suggestion: parsed,
        mappedSignificance: mapped.significance,
      },
    };
  } catch (error) {
    return attachAssist(engineState, {
      used: false,
      enabled: true,
      model: DEFAULT_MODEL,
      baseUrl: DEFAULT_BASE_URL,
      reason: error.message,
    });
  }
}

function buildAssistPrompt({ input, context, engineState, knownOptions }) {
  const learnedHints = getLearnedClassificationHints({ input, limit: 5 });
  const system = [
    "You are a bounded classification assistant for Monday.",
    "You help interpret natural language into an existing ontology.",
    "Do not invent new ontologies.",
    "Prefer mission continuity when the user refers to an active mission.",
    "Use learned hints only as weak evidence. They may help with domain detection, but they must not override the existing ontology or invent a new one.",
    "Return only valid JSON with this shape:",
    '{"candidateDomain":"string","candidateClassification":"string","knownSignificance":"string","confidence":"low|medium|high"}',
  ].join(" ");

  const user = {
    input,
    activeMission: context.activeMission || null,
    threadKey: context.threadKey || null,
    currentFallback: {
      significance: engineState.significance,
      situationClassification: engineState.situationClassification,
      candidateDomain: engineState.candidateDomain,
      candidateClassification: engineState.candidateClassification,
    },
    learnedHints,
    knownOntology: knownOptions,
  };

  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(user, null, 2) },
  ];
}

function normalizeAssistPayload(payload) {
  if (!payload || typeof payload.knownSignificance !== "string") {
    return null;
  }

  return {
    candidateDomain:
      typeof payload.candidateDomain === "string" ? payload.candidateDomain : "unknown",
    candidateClassification:
      typeof payload.candidateClassification === "string"
        ? payload.candidateClassification
        : "unknown",
    knownSignificance: payload.knownSignificance.trim(),
    confidence:
      payload.confidence === "high" ||
      payload.confidence === "medium" ||
      payload.confidence === "low"
        ? payload.confidence
        : "medium",
  };
}

function mapSuggestionToOntology(parsed, context) {
  const known = parsed.knownSignificance;

  const knownMappings = {
    summer_camp_mission_readiness: {
      significance: "summer_camp_mission_readiness",
      healingVsExecution: "execution",
    },
    transportation_risk_reduction: {
      significance: "transportation_risk_reduction",
      healingVsExecution: "execution",
    },
    transportation_execution_thread: {
      significance: "transportation_execution_thread",
      healingVsExecution: "execution",
    },
    weight_loss_goal: {
      significance: "weight_loss_goal",
      healingVsExecution: "mixed",
    },
    energy_decline: {
      significance: "energy_decline",
      healingVsExecution: "mixed",
    },
    exercise_commitment: {
      significance: "exercise_commitment",
      healingVsExecution: "mixed",
    },
    declared_family_value: {
      significance: "declared_family_value",
      healingVsExecution: "mixed",
    },
    relationship_concern: {
      significance: "relationship_concern",
      healingVsExecution: "healing",
    },
    family_time_tension: {
      significance: "family_time_tension",
      healingVsExecution: "mixed",
    },
    spiritual_drift: {
      significance: "spiritual_drift",
      healingVsExecution: "healing",
    },
    prayer_concern: {
      significance: "prayer_concern",
      healingVsExecution: "healing",
    },
    calling_question: {
      significance: "calling_question",
      healingVsExecution: "mixed",
    },
    work_tradeoff: {
      significance: "work_tradeoff",
      healingVsExecution: "mixed",
    },
    burnout_risk: {
      significance: "burnout_risk",
      healingVsExecution: "healing",
    },
    career_decision: {
      significance: "career_decision",
      healingVsExecution: "mixed",
    },
    publishing_decision: {
      significance: "publishing_decision",
      healingVsExecution: "mixed",
    },
    creative_drift: {
      significance: "creative_drift",
      healingVsExecution: "mixed",
    },
    wounded_book_significance: {
      significance: "wounded_book_significance",
      healingVsExecution: "healing",
    },
    future_life_transition: {
      significance: "future_life_transition",
      healingVsExecution: "mixed",
    },
    identity_transition: {
      significance: "identity_transition",
      healingVsExecution: "healing",
    },
    legacy_question: {
      significance: "legacy_question",
      healingVsExecution: "mixed",
    },
  };

  if (knownMappings[known]) {
    return knownMappings[known];
  }

  if (
    context.activeMission === "Summer Camp" &&
    parsed.candidateDomain.toLowerCase().includes("summer")
  ) {
    return knownMappings.summer_camp_mission_readiness;
  }

  const candidateDomain = String(parsed.candidateDomain || "").toLowerCase();
  const candidateClassification = String(
    parsed.candidateClassification || ""
  ).toLowerCase();
  const activeSignificance = String(
    context?.continuity?.activeSignificance || ""
  ).toLowerCase();

  if (candidateDomain === "work") {
    if (
      candidateClassification.includes("work_tradeoff") ||
      candidateClassification.includes("attention_allocation") ||
      candidateClassification.includes("identity_and_structure") ||
      candidateClassification.includes("identity_and_purpose")
    ) {
      return knownMappings.work_tradeoff;
    }

    if (
      activeSignificance === "future_life_transition" &&
      (candidateClassification.includes("identity") ||
        candidateClassification.includes("purpose"))
    ) {
      return knownMappings.work_tradeoff;
    }
  }

  return null;
}

function getKnownOntologyOptions() {
  return [
    "summer_camp_mission_readiness",
    "transportation_risk_reduction",
    "transportation_execution_thread",
    "weight_loss_goal",
    "energy_decline",
    "exercise_commitment",
    "declared_family_value",
    "relationship_concern",
    "family_time_tension",
    "spiritual_drift",
    "prayer_concern",
    "calling_question",
    "work_tradeoff",
    "burnout_risk",
    "career_decision",
    "publishing_decision",
    "creative_drift",
    "wounded_book_significance",
    "future_life_transition",
    "identity_transition",
    "legacy_question",
  ];
}

function normalizeConfidence(confidence) {
  switch (confidence) {
    case "high":
      return 0.82;
    case "medium":
      return 0.63;
    case "low":
      return 0.4;
    default:
      return null;
  }
}

function attachAssist(engineState, metadata) {
  return {
    ...engineState,
    classificationAssist: metadata,
  };
}

module.exports = {
  applyClassificationAssist,
  classificationAssistEnabled,
};
