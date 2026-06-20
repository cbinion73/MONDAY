const { WORKSPACE_INTENTS } = require("./intents");

function resolveWorkspaceMode(engineState) {
  const { activeRole, recommendedOutcome, humanCompanyRequired } = engineState;

  if (
    recommendedOutcome === "escalate_to_human_company" ||
    humanCompanyRequired === "true"
  ) {
    return "escalation_support";
  }

  if (activeRole === "operator" || recommendedOutcome === "operate") {
    return "execution_workspace";
  }

  if (activeRole === "advisor" || recommendedOutcome === "advise") {
    return "decision_support";
  }

  if (
    activeRole === "steward" &&
    recommendedOutcome === "surface_then_advise"
  ) {
    return "evidence_support";
  }

  if (activeRole === "steward" || recommendedOutcome === "guard_actively") {
    return "reflection_support";
  }

  if (activeRole === "companion" || recommendedOutcome === "explore_relationally") {
    return "reflection_support";
  }

  if (
    activeRole === "keeper" ||
    activeRole === "witness" ||
    recommendedOutcome === "surface_gently" ||
    recommendedOutcome === "preserve_quietly"
  ) {
    return "quiet_thread";
  }

  return "evidence_support";
}

function resolveWorkspaceIntent(workspaceMode) {
  switch (workspaceMode) {
    case "quiet_thread":
      return WORKSPACE_INTENTS.QUIET_THREAD;
    case "evidence_support":
      return WORKSPACE_INTENTS.EVIDENCE_SUPPORT;
    case "decision_support":
      return WORKSPACE_INTENTS.DECISION_SUPPORT;
    case "execution_workspace":
      return WORKSPACE_INTENTS.EXECUTION_SUPPORT;
    case "reflection_support":
      return WORKSPACE_INTENTS.REFLECTION_SUPPORT;
    case "escalation_support":
      return WORKSPACE_INTENTS.ESCALATION_SUPPORT;
    default:
      return WORKSPACE_INTENTS.EVIDENCE_SUPPORT;
  }
}

function materializeWorkspace({ engineState, truth = {} }) {
  const workspaceMode = resolveWorkspaceMode(engineState);
  const supportIntent = resolveWorkspaceIntent(workspaceMode);

  return {
    workspaceMode,
    supportIntent,
    answerRequiredFirst: true,
    sections: buildSections({ workspaceMode, truth }),
    regressionChecks: {
      workspaceMustNotBeAnswer: true,
      workspaceMustSupportAnswer: true,
      canUnderstandAnswerWithoutWorkspace: true,
    },
  };
}

function buildSections({ workspaceMode, truth }) {
  switch (workspaceMode) {
    case "quiet_thread":
      return [
        {
          key: "significance-thread",
          purpose: "preserve significance without requiring action",
          summary:
            truth.significance === "book"
              ? "A quiet thread preserving the significance of the book."
              : "A quiet thread preserving an important but quiet significance.",
        },
      ];
    case "evidence_support":
      return [
        {
          key: "readiness-overview",
          purpose: "reinforce the answer with evidence",
          summary: "Support the answer with the current readiness picture.",
        },
        {
          key: "primary-risk",
          purpose: "show the one meaningful risk clearly",
          summary:
            truth.risk === "transportation"
              ? "Transportation remains the meaningful open risk."
              : "Highlight the most meaningful unresolved risk.",
        },
      ];
    case "decision_support":
      return [
        {
          key: "decision-tradeoffs",
          purpose: "compare meaningful paths after clarity",
          summary: "Show the major tradeoffs behind the decision.",
        },
      ];
    case "execution_workspace":
      return [
        {
          key: "execution-thread",
          purpose: "reduce burden after commitment",
          summary: "Track the accepted execution thread and next concrete steps.",
        },
      ];
    case "reflection_support":
      return [
        {
          key: "reflection-prompts",
          purpose: "help meaning emerge without pressure toward execution",
          summary: "Support reflection, dignity, and understanding.",
        },
      ];
    case "escalation_support":
      return [
        {
          key: "human-company-handoff",
          purpose: "help carry significance toward human relationship",
          summary: "Support preparation for a conversation Monday should not carry alone.",
        },
      ];
    default:
      return [
        {
          key: "support",
          purpose: "support the answer",
          summary: "General supporting workspace.",
        },
      ];
  }
}

module.exports = {
  materializeWorkspace,
  resolveWorkspaceIntent,
  resolveWorkspaceMode,
};
