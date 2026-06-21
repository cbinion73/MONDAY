function resolveContinuity({ input, context = {} }) {
  const text = (input || "").toLowerCase();
  const continuity = context.continuity || {};
  const explanation = [];

  const resolvedContext = { ...context };
  const hints = {};
  let threadInheritanceConfidence = 0;
  let threadBreakReason = null;

  const competingDomain = detectCompetingDomain(text);
  const currentThread = continuity.activeSignificanceThread || null;
  const activeDomain = inferDomainFromSignificance(continuity.activeSignificance);
  const sameDomainContinuation =
    Boolean(competingDomain) && Boolean(activeDomain) && competingDomain === activeDomain;

  if (currentThread && competingDomain && shouldBreakThread(currentThread, competingDomain)) {
    threadBreakReason = `Detected stronger new domain signal '${competingDomain}' than active thread '${currentThread}'.`;
    explanation.push(threadBreakReason);
    resolvedContext.activeMission = null;
    resolvedContext.threadKey = null;
    return {
      context: resolvedContext,
      hints,
      explanation,
      threadInheritanceConfidence: 0.08,
    };
  }

  if (context.activeMission || continuity.activeMission) {
    resolvedContext.activeMission =
      context.activeMission || continuity.activeMission;
  }

  if (context.threadKey || continuity.threadKey) {
    resolvedContext.threadKey = context.threadKey || continuity.threadKey;
  }

  if (
    continuity.activeMission === "Summer Camp" &&
    (text.includes("trailer") || text.includes("transport"))
  ) {
    resolvedContext.activeMission = "Summer Camp";
    resolvedContext.threadKey = "summer-camp";
    hints.significanceHint = "transportation_risk_reduction";
    threadInheritanceConfidence = 0.93;
    explanation.push(
      "Inherited Summer Camp transportation thread from continuity."
    );
  }

  if (
    continuity.activeSignificanceThread === "summer_camp_transportation" &&
    (text.includes("let's do it") ||
      text.includes("lets do it") ||
      text === "do it" ||
      text.includes("sounds good"))
  ) {
    resolvedContext.activeMission = "Summer Camp";
    resolvedContext.threadKey = "summer-camp";
    hints.significanceHint = "transportation_execution_thread";
    threadInheritanceConfidence = 0.97;
    explanation.push(
      "Resolved commitment against active Summer Camp transportation thread."
    );
  }

  if (
    continuity.threadKey === "wounded-significance" ||
    continuity.activeSignificanceThread === "book_wound"
  ) {
    resolvedContext.threadKey = "wounded-significance";
    resolvedContext.activeMission = continuity.activeMission || "Book";

    if (
      (text.includes("shame") && text.includes("book")) ||
      text.includes("bigger than the book") ||
      text.includes("who i thought i was supposed to become") ||
      text.includes("who i thought i was")
    ) {
      hints.significanceHint = "identity_adjacent_wound";
      threadInheritanceConfidence = 0.91;
      explanation.push(
        "Deepened wounded-significance thread into identity-adjacent wound."
      );
    } else if (
      (continuity.activeSignificanceThread === "book_wound" ||
        continuity.situationClassification === "wounded_significance" ||
        continuity.situationClassification === "human_company_boundary") &&
      (text.includes("still matters") ||
        text.includes("feel like i failed") ||
        text.includes("approach it"))
    ) {
      hints.significanceHint = "truthful_reapproach_needed";
      threadInheritanceConfidence = 0.86;
      explanation.push(
        "Progressed wounded-significance thread toward healing threshold."
      );
    }
  }

  const retirementCompatibleDomain = !competingDomain ||
    competingDomain === "retirement" ||
    competingDomain === "family" ||
    competingDomain === "work";

  if (
    !hints.significanceHint &&
    continuity.activeSignificance === "future_life_transition" &&
    isReflectiveContinuation(text) &&
    !isExplicitRelationshipShift(text) &&
    retirementCompatibleDomain
  ) {
    hints.significanceHint = continuity.activeSignificance;
    threadInheritanceConfidence = Math.max(threadInheritanceConfidence, 0.82);
    explanation.push(
      "Kept retirement meaning thread active through reflective follow-up, even with family or pressure language."
    );
  }

  if (
    !hints.significanceHint &&
    continuity.activeSignificance &&
    isGenericFollowUp(text) &&
    (!competingDomain || sameDomainContinuation)
  ) {
    hints.significanceHint = continuity.activeSignificance;
    threadInheritanceConfidence = Math.max(threadInheritanceConfidence, 0.84);
    explanation.push(
      `Inherited active significance '${continuity.activeSignificance}' through generic follow-up continuity.`
    );
  }

  if (
    !hints.significanceHint &&
    continuity.activeSignificance &&
    (continuity.activeRole === "companion" ||
      continuity.activeRole === "steward") &&
    isReflectiveContinuation(text) &&
    (!competingDomain || sameDomainContinuation)
  ) {
    hints.significanceHint = continuity.activeSignificance;
    threadInheritanceConfidence = Math.max(threadInheritanceConfidence, 0.78);
    explanation.push(
      `Inherited active significance '${continuity.activeSignificance}' through reflective continuation.`
    );
  }

  return {
    context: resolvedContext,
    hints,
    explanation,
    threadInheritanceConfidence,
  };
}

function buildContinuityState({ input, engineState, context = {} }) {
  const significance = engineState.significance;
  const classification = engineState.situationClassification;

  const continuity = {
    activeMission: context.activeMission || inferMission(significance),
    threadKey: context.threadKey || inferThreadKey(significance),
    activeSignificance: significance,
    activeRole: engineState.activeRole,
    situationClassification: classification,
    activeSignificanceThread: inferSignificanceThread(significance, classification),
    meaningProgression: inferMeaningProgression(classification),
    lastInput: input,
  };

  return continuity;
}

function inferMission(significance) {
  if (significance.startsWith("summer_camp") || significance.startsWith("transportation_")) {
    return "Summer Camp";
  }
  if (
    significance.includes("book") ||
    significance === "identity_adjacent_wound" ||
    significance === "truthful_reapproach_needed"
  ) {
    return "Book";
  }
  return null;
}

function inferThreadKey(significance) {
  if (significance.startsWith("summer_camp") || significance.startsWith("transportation_")) {
    return "summer-camp";
  }
  if (
    significance.includes("book") ||
    significance === "identity_adjacent_wound" ||
    significance === "truthful_reapproach_needed"
  ) {
    return "wounded-significance";
  }
  return null;
}

function inferSignificanceThread(significance, classification) {
  if (significance === "summer_camp_mission_readiness") {
    return "summer_camp_mission_readiness";
  }
  if (significance === "transportation_risk_reduction") {
    return "summer_camp_transportation";
  }
  if (significance === "transportation_execution_thread") {
    return "summer_camp_transportation";
  }
  if (
    significance === "wounded_book_significance" ||
    significance === "book_project_quiet_significance" ||
    significance === "truthful_reapproach_needed" ||
    significance === "identity_adjacent_wound"
  ) {
    return "book_wound";
  }
  return classification;
}

function inferMeaningProgression(classification) {
  switch (classification) {
    case "forgottenness_risk":
      return "surface";
    case "wounded_significance":
      return "deepen";
    case "healing_threshold":
      return "heal";
    case "human_company_boundary":
      return "escalate";
    default:
      return "steady";
  }
}

function detectCompetingDomain(text) {
  if (
    text.includes("weight") ||
    text.includes("exercis") ||
    text.includes("sleep") ||
    text.includes("tired all the time") ||
    text.includes("sleeping well")
  ) {
    return "health";
  }

  if (
    text.includes("prayer") ||
    text.includes("prayed") ||
    text.includes("spiritually") ||
    text.includes("faith") ||
    text.includes("god")
  ) {
    return "faith";
  }

  if (
    text.includes("family") ||
    text.includes("caleb") ||
    text.includes("rebekah") ||
    text.includes("wife") ||
    text.includes("marriage")
  ) {
    return "family";
  }

  if (
    text.includes("retire") ||
    text.includes("retirement") ||
    text.includes("without work")
  ) {
    return "retirement";
  }

  if (
    text.includes("thermo fisher") ||
    text.includes("burned out") ||
    text.includes("work") ||
    text.includes("job")
  ) {
    return "work";
  }

  if (
    text.includes("book") ||
    text.includes("publishing") ||
    text.includes("write")
  ) {
    return "publishing";
  }

  return null;
}

function shouldBreakThread(currentThread, competingDomain) {
  const threadDomainMap = {
    book_wound: "publishing",
    summer_camp_mission_readiness: "summer-camp",
    summer_camp_transportation: "summer-camp",
  };

  return threadDomainMap[currentThread] && threadDomainMap[currentThread] !== competingDomain;
}

function isGenericFollowUp(text) {
  return [
    "what do you think",
    "what should i do",
    "what should i do first",
    "how's that going",
    "hows that going",
    "what about that",
    "tell me more",
    "what now",
    "where should i start",
    "what should i do next",
  ].some((pattern) => text.includes(pattern));
}

function isReflectiveContinuation(text) {
  const trimmed = String(text || "").trim().toLowerCase();
  if (!trimmed) return false;

  if (trimmed.length < 12) return false;

  const starters = [
    "it ",
    "it'",
    "it’s",
    "we ",
    "we'",
    "we’re",
    "because ",
    "mostly ",
    "usually ",
    "lately ",
    "honestly ",
    "i think ",
    "i am ",
    "i'm ",
    "i feel ",
    "i keep ",
    "i have been ",
    "i've been ",
    "i want to ",
    "i want ",
    "i mostly ",
    "i mostly want ",
    "i just do not ",
    "i don't know ",
    "i do not know ",
    "i am afraid ",
    "i'm afraid ",
    "because i ",
    "i guess ",
    "i just ",
    "it makes me ",
    "it feels ",
    "what feels hardest is ",
    "every time i ",
    "every time ",
    "that's because ",
    "that is because ",
    "the problem is ",
    "the thing is ",
    "the issue is ",
    "whenever i ",
    "when i ",
    "what happens is ",
  ];

  return starters.some((starter) => trimmed.startsWith(starter));
}

function isExplicitRelationshipShift(text) {
  const trimmed = String(text || "").trim().toLowerCase();
  return (
    trimmed.includes("caleb") ||
    trimmed.includes("rebekah") ||
    trimmed.includes("my wife") ||
    trimmed.includes("my marriage") ||
    trimmed.includes("our marriage")
  );
}

function inferDomainFromSignificance(significance) {
  if (!significance) return null;

  const significanceDomainMap = {
    weight_loss_goal: "health",
    energy_decline: "health",
    exercise_commitment: "health",
    prayer_concern: "faith",
    spiritual_drift: "faith",
    calling_question: "faith",
    declared_family_value: "family",
    relationship_concern: "family",
    family_time_tension: "family",
    work_tradeoff: "work",
    burnout_risk: "work",
    career_decision: "work",
    publishing_decision: "publishing",
    creative_drift: "publishing",
    wounded_book_significance: "publishing",
    identity_adjacent_wound: "publishing",
    truthful_reapproach_needed: "publishing",
    future_life_transition: "retirement",
    identity_transition: "retirement",
    legacy_question: "retirement",
    summer_camp_mission_readiness: "summer-camp",
    transportation_risk_reduction: "summer-camp",
    transportation_execution_thread: "summer-camp",
  };

  return significanceDomainMap[significance] || null;
}

module.exports = {
  resolveContinuity,
  buildContinuityState,
};
