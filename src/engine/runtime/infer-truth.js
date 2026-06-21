function inferTruth(engineState, input) {
  const text = (input || "").toLowerCase();

  if (engineState.classificationFallback) {
    // Detect specific unclassified patterns before falling back to intake questions.
    if (
      /\bwho (am|are) i\b/i.test(text) ||
      /\bdon'?t know who i am\b/i.test(text) ||
      /\blose (my ?self|myself)\b/i.test(text)
    ) {
      return { humanCompanyBoundary: true };
    }
    if (
      /\bcrazy (idea|thought|plan)\b/i.test(text) ||
      /\bwild (idea|thought|plan)\b/i.test(text) ||
      /\bhave an idea\b/i.test(text) ||
      /\bgot an idea\b/i.test(text)
    ) {
      return { creativeSpark: true };
    }
    if (
      /\bplace to hide\b/i.test(text) ||
      /\bwork.{0,15}(gives me|is) (a place|somewhere) to hide\b/i.test(text) ||
      /\busing work to hide\b/i.test(text)
    ) {
      return { domain: "work", concern: "work_tradeoff", pattern: "avoidance_refuge" };
    }
    if (
      /\bstill want to build\b/i.test(text) ||
      /\bwant to (build things|keep building|create things)\b/i.test(text) ||
      /\b(still need to|still want to) (build|create|make)\b/i.test(text)
    ) {
      return { domain: "retirement", concern: "identity_transition" };
    }
    if (
      /\bfind (me|the best|a)\b.{0,30}\b(option|trailer|vendor|provider|service)\b/i.test(text) ||
      /\bbook (me|a|the)\b/i.test(text) ||
      /\bschedule\b.{0,20}\bfor me\b/i.test(text)
    ) {
      return { agentDelegation: true };
    }
    return {
      fallbackQuestion: buildFallbackQuestion(engineState),
    };
  }

  switch (engineState.significance) {
    case "summer_camp_mission_readiness":
      return { readiness: "high", risk: "transportation" };
    case "transportation_risk_reduction":
      return { decision: "rent_trailer" };
    case "transportation_execution_thread":
      return { executionThread: "transportation" };
    case "weight_loss_goal":
      if (
        text.includes("everything at once") ||
        text.includes("restart") ||
        text.includes("restarting") ||
        text.includes("change everything")
      ) {
        return {
          domain: "health",
          goal: "lose_weight",
          pattern: "overreach_restart",
        };
      }
      return { domain: "health", goal: "lose_weight" };
    case "energy_decline":
      return { domain: "health", concern: "energy_decline" };
    case "exercise_commitment":
      return { domain: "health", goal: "exercise_commitment" };
    case "declared_family_value":
      return { domain: "family", value: "family_matters_most" };
    case "relationship_concern":
      if (
        text.includes("pass each other") ||
        text.includes("end of the day") ||
        text.includes("mostly just pass")
      ) {
        return {
          domain: "family",
          concern: "relationship_concern",
          pattern: "daily_distance",
        };
      }
      return { domain: "family", concern: "relationship_concern" };
    case "family_time_tension":
      return { domain: "family", concern: "family_time_tension" };
    case "spiritual_drift":
      return { domain: "faith", concern: "spiritual_drift" };
    case "prayer_concern":
      if (
        text.includes("avoiding being quiet") ||
        text.includes("avoiding being still") ||
        text.includes("notice what is going on in me") ||
        text.includes("what is going on in me")
      ) {
        return {
          domain: "faith",
          goal: "prayer_concern",
          pattern: "quiet_avoidance",
        };
      }
      if (
        text.includes("what god might say") ||
        text.includes("want to hear what") ||
        text.includes("afraid of what") ||
        text.includes("what i might find") ||
        /\b(isn'?t|not) sure (i want|i'd want) to hear\b/i.test(text)
      ) {
        return {
          domain: "faith",
          goal: "prayer_concern",
          pattern: "fear_of_hearing",
        };
      }
      return { domain: "faith", goal: "prayer_concern" };
    case "calling_question":
      return { domain: "faith", concern: "calling_question" };
    case "work_tradeoff":
      if (
        text.includes("from thinking about") ||
        text.includes("keeps me from thinking") ||
        text.includes("distract") ||
        text.includes("avoid other things")
      ) {
        return {
          domain: "work",
          concern: "work_tradeoff",
          pattern: "avoidance_refuge",
        };
      }
      if (
        text.includes("useful") ||
        text.includes("control") ||
        text.includes("in control")
      ) {
        return {
          domain: "work",
          concern: "work_tradeoff",
          pattern: "control_refuge",
        };
      }
      return { domain: "work", concern: "work_tradeoff" };
    case "burnout_risk":
      return { domain: "work", concern: "burnout_risk" };
    case "career_decision":
      return { domain: "work", decision: "career_decision" };
    case "publishing_decision":
      if (
        text.includes("afraid") ||
        text.includes("not have much left to say") ||
        text.includes("nothing left to say") ||
        text.includes("prove i do not have much left to say") ||
        text.includes("prove i don't have much left to say")
      ) {
        return {
          domain: "publishing",
          decision: "publishing_decision",
          pattern: "fear_of_emptiness",
        };
      }
      return { domain: "publishing", decision: "publishing_decision" };
    case "creative_drift":
      return { domain: "publishing", concern: "creative_drift" };
    case "future_life_transition":
      if (
        (text.includes("family") && text.includes("pressure")) ||
        text.includes("more time with my family")
      ) {
        return {
          domain: "retirement",
          question: "future_life_transition",
          pattern: "family_relief",
        };
      }
      return { domain: "retirement", question: "future_life_transition" };
    case "identity_transition":
      return { domain: "retirement", concern: "identity_transition" };
    case "legacy_question":
      return { domain: "retirement", concern: "legacy_question" };
    case "book_project_quiet_significance":
      return { significance: "book", quiet: true };
    case "wounded_book_significance":
      return { significance: "book", shamePresent: true };
    case "truthful_reapproach_needed":
      return { goal: "truthful_approach" };
    case "identity_adjacent_wound":
      return { identityProximity: "high" };
    default:
      if (text.includes("failed") || text.includes("ashamed")) {
        return { goal: "truthful_approach" };
      }
      return {};
  }
}

function buildFallbackQuestion(engineState) {
  switch (engineState.candidateDomain) {
    case "retirement":
      return "What feels most significant about retirement to you right now?";
    case "family":
      return "What feels most important about your family situation right now?";
    case "faith":
      return "What feels most significant about your faith right now?";
    case "work":
      return "What feels most significant about work for you right now?";
    case "health":
      return "What feels most significant about your health right now?";
    case "publishing":
      return "What feels most important about the writing or publishing question right now?";
    case "finances":
      return "What feels most significant about the financial question right now?";
    case "home_or_workshop":
      return "What feels most significant about that home or workshop situation right now?";
    default:
      return "Help me understand what feels most important about it.";
  }
}

module.exports = {
  inferTruth,
};
