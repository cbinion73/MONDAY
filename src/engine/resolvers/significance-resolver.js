const SIGNIFICANCE_HINT_MAP = Object.freeze({
  transportation_risk_reduction: {
    significance: "transportation_risk_reduction",
    healingVsExecution: "execution",
    explanation: ["Used continuity hint for transportation risk reduction."],
  },
  transportation_execution_thread: {
    significance: "transportation_execution_thread",
    healingVsExecution: "execution",
    explanation: ["Used continuity hint for transportation execution thread."],
  },
  identity_adjacent_wound: {
    significance: "identity_adjacent_wound",
    healingVsExecution: "healing",
    explanation: ["Used continuity hint for identity-adjacent wound."],
  },
  truthful_reapproach_needed: {
    significance: "truthful_reapproach_needed",
    healingVsExecution: "healing",
    explanation: ["Used continuity hint for healing-threshold significance."],
  },
  weight_loss_goal: {
    significance: "weight_loss_goal",
    healingVsExecution: "mixed",
    explanation: ["Used continuity hint for health goal significance."],
  },
  energy_decline: {
    significance: "energy_decline",
    healingVsExecution: "mixed",
    explanation: ["Used continuity hint for energy-decline significance."],
  },
  exercise_commitment: {
    significance: "exercise_commitment",
    healingVsExecution: "mixed",
    explanation: ["Used continuity hint for exercise-commitment significance."],
  },
  declared_family_value: {
    significance: "declared_family_value",
    healingVsExecution: "mixed",
    explanation: ["Used continuity hint for family-value significance."],
  },
  relationship_concern: {
    significance: "relationship_concern",
    healingVsExecution: "healing",
    explanation: ["Used continuity hint for relationship-concern significance."],
  },
  family_time_tension: {
    significance: "family_time_tension",
    healingVsExecution: "mixed",
    explanation: ["Used continuity hint for family-time significance."],
  },
  spiritual_drift: {
    significance: "spiritual_drift",
    healingVsExecution: "healing",
    explanation: ["Used continuity hint for spiritual-drift significance."],
  },
  prayer_concern: {
    significance: "prayer_concern",
    healingVsExecution: "healing",
    explanation: ["Used continuity hint for prayer-concern significance."],
  },
  calling_question: {
    significance: "calling_question",
    healingVsExecution: "mixed",
    explanation: ["Used continuity hint for calling-question significance."],
  },
  work_tradeoff: {
    significance: "work_tradeoff",
    healingVsExecution: "mixed",
    explanation: ["Used continuity hint for work-tradeoff significance."],
  },
  burnout_risk: {
    significance: "burnout_risk",
    healingVsExecution: "healing",
    explanation: ["Used continuity hint for burnout-risk significance."],
  },
  career_decision: {
    significance: "career_decision",
    healingVsExecution: "mixed",
    explanation: ["Used continuity hint for career-decision significance."],
  },
  publishing_decision: {
    significance: "publishing_decision",
    healingVsExecution: "mixed",
    explanation: ["Used continuity hint for publishing-decision significance."],
  },
  creative_drift: {
    significance: "creative_drift",
    healingVsExecution: "mixed",
    explanation: ["Used continuity hint for creative-drift significance."],
  },
  wounded_book_significance: {
    significance: "wounded_book_significance",
    healingVsExecution: "healing",
    explanation: ["Used continuity hint for wounded-book significance."],
  },
  future_life_transition: {
    significance: "future_life_transition",
    healingVsExecution: "mixed",
    explanation: ["Used continuity hint for retirement-transition significance."],
  },
  identity_transition: {
    significance: "identity_transition",
    healingVsExecution: "healing",
    explanation: ["Used continuity hint for retirement-identity significance."],
  },
  legacy_question: {
    significance: "legacy_question",
    healingVsExecution: "mixed",
    explanation: ["Used continuity hint for retirement-legacy significance."],
  },
});

function resolveSignificance({ input, context = {} }) {
  const text = (input || "").toLowerCase();
  const mission = (context.activeMission || "").toLowerCase();
  const hint = context.significanceHint;

  if (hint) {
    return resolveHint(hint);
  }

  if (text.includes("summer camp") || mission.includes("summer camp")) {
    if (text.includes("trailer")) {
      return {
        significance: "transportation_risk_reduction",
        healingVsExecution: "execution",
        explanation: [
          "Detected Summer Camp transportation decision language.",
        ],
      };
    }

    if (
      text.includes("ready") ||
      text.includes("readiness") ||
      text.includes("status") ||
      text.includes("prep") ||
      text.includes("coming") ||
      text.includes("how's camp") ||
      text.includes("hows camp") ||
      text.includes("camp prep")
    ) {
      return {
        significance: "summer_camp_mission_readiness",
        healingVsExecution: "execution",
        explanation: [
          "Detected Summer Camp readiness or status language.",
        ],
      };
    }

    if (
      text.includes("let's do it") ||
      text.includes("lets do it") ||
      text.includes("do it")
    ) {
      return {
        significance: "transportation_execution_thread",
        healingVsExecution: "execution",
        explanation: ["Detected accepted Summer Camp execution thread."],
      };
    }

    return {
      significance: "summer_camp_mission_readiness",
      healingVsExecution: "execution",
      explanation: ["Detected explicit Summer Camp mission reference."],
    };
  }

  if (
    text.includes("weight") ||
    text.includes("lose weight") ||
    /\blose\s+\d+\s*(pounds?|lbs?)\b/.test(text) ||
    /\b\d+\s*(pounds?|lbs?)\b/.test(text) ||
    text.includes("pounds") ||
    text.includes("lbs") ||
    text.includes("exercis") ||
    text.includes("sleep") ||
    text.includes("tired all the time") ||
    text.includes("energy")
  ) {
    if (text.includes("tired") || text.includes("energy") || text.includes("sleep")) {
      return {
        significance: "energy_decline",
        healingVsExecution: "mixed",
        explanation: ["Detected health significance around energy decline."],
      };
    }

    if (text.includes("exercis")) {
      return {
        significance: "exercise_commitment",
        healingVsExecution: "mixed",
        explanation: ["Detected health significance around exercise commitment."],
      };
    }

    return {
      significance: "weight_loss_goal",
      healingVsExecution: "mixed",
      explanation: ["Detected health significance around weight or health goals."],
    };
  }

  if (
    text.includes("family") ||
    text.includes("caleb") ||
    text.includes("rebekah") ||
    text.includes("wife") ||
    text.includes("marriage") ||
    text.includes("son")
  ) {
    if (
      text.includes("connecting") ||
      text.includes("need more time") ||
      text.includes("aren't connecting") ||
      text.includes("not connecting")
    ) {
      return {
        significance: "relationship_concern",
        healingVsExecution: "healing",
        explanation: ["Detected family significance around relationship concern."],
      };
    }

    if (text.includes("matters most")) {
      return {
        significance: "declared_family_value",
        healingVsExecution: "mixed",
        explanation: ["Detected family significance around declared family value."],
      };
    }

    return {
      significance: "family_time_tension",
      healingVsExecution: "mixed",
      explanation: ["Detected family significance around time or parenting tension."],
    };
  }

  if (
    text.includes("prayed") ||
    text.includes("prayer") ||
    text.includes("spiritually") ||
    text.includes("god") ||
    text.includes("calling")
  ) {
    if (text.includes("calling")) {
      return {
        significance: "calling_question",
        healingVsExecution: "mixed",
        explanation: ["Detected faith significance around calling question."],
      };
    }

    if (
      text.includes("haven't prayed") ||
      text.includes("havent prayed") ||
      text.includes("have not prayed")
    ) {
      return {
        significance: "prayer_concern",
        healingVsExecution: "healing",
        explanation: ["Detected faith significance around prayer concern."],
      };
    }

    if (
      text.includes("dry")
    ) {
      return {
        significance: "spiritual_drift",
        healingVsExecution: "healing",
        explanation: ["Detected faith significance around spiritual drift."],
      };
    }

    return {
      significance: "prayer_concern",
      healingVsExecution: "healing",
      explanation: ["Detected faith significance around prayer concern."],
    };
  }

  if (
    text.includes("thermo fisher") ||
    text.includes("burned out") ||
    text.includes("burnt out") ||
    text.includes("hiding in work") ||
    text.includes("quit my job") ||
    text.includes("leave thermo fisher") ||
    text.includes("worked") ||
    text.includes("hours this week") ||
    text.includes("leadership")
  ) {
    if (text.includes("burned out") || text.includes("burnt out")) {
      return {
        significance: "burnout_risk",
        healingVsExecution: "healing",
        explanation: ["Detected work significance around burnout risk."],
      };
    }

    if (
      text.includes("quit my job") ||
      text.includes("leave thermo fisher")
    ) {
      return {
        significance: "career_decision",
        healingVsExecution: "mixed",
        explanation: ["Detected work significance around career decision."],
      };
    }

    if (text.includes("hiding in work")) {
      return {
        significance: "work_tradeoff",
        healingVsExecution: "mixed",
        explanation: ["Detected work significance around work tradeoff or avoidance."],
      };
    }

    return {
      significance: "work_tradeoff",
      healingVsExecution: "mixed",
      explanation: ["Detected work significance around work allocation or challenge."],
    };
  }

  if (
    text.includes("retire") ||
    text.includes("retirement") ||
    text.includes("without work")
  ) {
    if (text.includes("who i am without work")) {
      return {
        significance: "identity_transition",
        healingVsExecution: "healing",
        explanation: ["Detected retirement significance around identity transition."],
      };
    }

    if (text.includes("can't stop thinking") || text.includes("cant stop thinking")) {
      return {
        significance: "legacy_question",
        healingVsExecution: "mixed",
        explanation: ["Detected retirement significance around recurring legacy question."],
      };
    }

    return {
      significance: "future_life_transition",
      healingVsExecution: "mixed",
      explanation: ["Detected retirement significance around future life transition."],
    };
  }

  if (
    text.includes("write another book") ||
    text.includes("project matters anymore") ||
    text.includes("project matter anymore") ||
    text.includes("book still hurts") ||
    text.includes("book hurts") ||
    text.includes("hurts to think about") ||
    text.includes("publish") ||
    text.includes("publishing")
  ) {
    if (
      text.includes("hurts") ||
      text.includes("still hurts") ||
      text.includes("hurts to think about")
    ) {
      return {
        significance: "wounded_book_significance",
        healingVsExecution: "healing",
        explanation: ["Detected publishing significance around wounded book meaning."],
      };
    }

    if (
      text.includes("matters anymore") ||
      text.includes("matter anymore")
    ) {
      return {
        significance: "creative_drift",
        healingVsExecution: "mixed",
        explanation: ["Detected publishing significance around creative drift."],
      };
    }

    return {
      significance: "publishing_decision",
      healingVsExecution: "mixed",
      explanation: ["Detected publishing significance around book or publishing decision."],
    };
  }

  if (context.threadKey === "wounded-significance" || text.includes("book")) {
    if (text.includes("ashamed") || text.includes("tired")) {
      return {
        significance: "wounded_book_significance",
        healingVsExecution: "healing",
        explanation: ["Detected shame-adjacent wounded significance."],
      };
    }

    if (
      text.includes("who i thought i was supposed to become") ||
      text.includes("who i thought i was")
    ) {
      return {
        significance: "identity_adjacent_wound",
        healingVsExecution: "healing",
        explanation: ["Detected identity-adjacent wound around significance."],
      };
    }

    return {
      significance: "book_project_quiet_significance",
      healingVsExecution: "healing",
      explanation: ["Detected quiet significance around the book thread."],
    };
  }

  return {
    significance: "general_significance",
    healingVsExecution: "mixed",
    explanation: ["Fell back to general significance."],
    classificationFallback: true,
    fallbackReason: "No matching significance domain found",
  };
}

function resolveHint(hint) {
  if (SIGNIFICANCE_HINT_MAP[hint]) {
    return SIGNIFICANCE_HINT_MAP[hint];
  }

  return {
    significance: "general_significance",
    healingVsExecution: "mixed",
    explanation: ["Continuity hint was unrecognized; fell back to general significance."],
    classificationFallback: true,
    fallbackReason: "Unrecognized continuity hint",
  };
}

function getHealingVsExecutionForSignificance(significance) {
  return SIGNIFICANCE_HINT_MAP[significance]?.healingVsExecution ?? "mixed";
}

module.exports = {
  getHealingVsExecutionForSignificance,
  resolveSignificance,
};
