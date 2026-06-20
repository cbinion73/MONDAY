function analyzeFallback({ input, context = {} }) {
  const text = (input || "").toLowerCase();

  const result = {
    candidateDomain: "unknown",
    candidateClassification: "unknown",
    candidateConfidence: 0.2,
    explanation: ["No fallback analysis match found."],
  };

  if (text.includes("retire") || text.includes("retirement")) {
    return {
      candidateDomain: "retirement",
      candidateClassification: "future_life_tradeoff",
      candidateConfidence: 0.63,
      explanation: ["Fallback analysis suggests retirement planning tradeoff."],
    };
  }

  if (text.includes("family") || text.includes("caleb") || text.includes("rebekah") || text.includes("marriage")) {
    return {
      candidateDomain: "family",
      candidateClassification: "declared_value_or_relationship_tension",
      candidateConfidence: 0.68,
      explanation: ["Fallback analysis suggests family or relationship significance."],
    };
  }

  if (
    text.includes("prayed") ||
    text.includes("prayer") ||
    text.includes("faith") ||
    text.includes("church") ||
    text.includes("god")
  ) {
    return {
      candidateDomain: "faith",
      candidateClassification: "spiritual_continuity_or_drift",
      candidateConfidence: 0.67,
      explanation: ["Fallback analysis suggests faith domain."],
    };
  }

  if (
    text.includes("worked") ||
    text.includes("job") ||
    text.includes("thermo fisher") ||
    text.includes("work") ||
    text.includes("hours this week")
  ) {
    return {
      candidateDomain: "work",
      candidateClassification: "attention_allocation_or_work_tradeoff",
      candidateConfidence: 0.7,
      explanation: ["Fallback analysis suggests work domain."],
    };
  }

  if (
    text.includes("health") ||
    text.includes("weight") ||
    text.includes("exercise") ||
    text.includes("sleep")
  ) {
    return {
      candidateDomain: "health",
      candidateClassification: "health_alignment_or_neglect",
      candidateConfidence: 0.69,
      explanation: ["Fallback analysis suggests health domain."],
    };
  }

  if (
    text.includes("book") ||
    text.includes("write") ||
    text.includes("publishing")
  ) {
    return {
      candidateDomain: "publishing",
      candidateClassification: "creative_significance_or_wounded_progress",
      candidateConfidence: 0.73,
      explanation: ["Fallback analysis suggests publishing or book domain."],
    };
  }

  if (
    text.includes("money") ||
    text.includes("finances") ||
    text.includes("invest") ||
    text.includes("income")
  ) {
    return {
      candidateDomain: "finances",
      candidateClassification: "financial_tradeoff_or_planning",
      candidateConfidence: 0.65,
      explanation: ["Fallback analysis suggests financial domain."],
    };
  }

  if (
    text.includes("home") ||
    text.includes("house") ||
    text.includes("garage") ||
    text.includes("workshop")
  ) {
    return {
      candidateDomain: "home_or_workshop",
      candidateClassification: "stewardship_or_project_domain",
      candidateConfidence: 0.6,
      explanation: ["Fallback analysis suggests home or workshop domain."],
    };
  }

  if (context.activeMission) {
    return {
      candidateDomain: String(context.activeMission).toLowerCase().replace(/\s+/g, "_"),
      candidateClassification: "mission_related_significance",
      candidateConfidence: 0.55,
      explanation: ["Fallback analysis inherited the active mission as candidate domain."],
    };
  }

  return result;
}

module.exports = {
  analyzeFallback,
};
