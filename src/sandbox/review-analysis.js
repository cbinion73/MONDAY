function summarizeReviewPayload(payload) {
  const turns = payload?.turns || [];
  const tags = payload?.tags || [];
  const tagsByTurn = new Map();
  const categoryCounts = new Map();

  for (const tag of tags) {
    const turnId = Number(tag.turnId);
    const current = tagsByTurn.get(turnId) || [];
    current.push(tag);
    tagsByTurn.set(turnId, current);
    categoryCounts.set(tag.category, (categoryCounts.get(tag.category) || 0) + 1);
  }

  const fallbackTurns = turns.filter((turn) => turn.classificationFallback);
  const contractAdjustedTurns = turns.filter(
    (turn) => Array.isArray(turn.contractAdjustments) && turn.contractAdjustments.length > 0
  );
  const contractBlockedTurns = turns.filter(
    (turn) => Array.isArray(turn.contractBlocked) && turn.contractBlocked.length > 0
  );

  return {
    taggedTurns: tagsByTurn.size,
    totalTags: tags.length,
    fallbackTurns: fallbackTurns.length,
    contractAdjustedTurns: contractAdjustedTurns.length,
    contractBlockedTurns: contractBlockedTurns.length,
    categoryCounts: [...categoryCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([category, count]) => ({ category, count })),
    recentPatterns: buildRecentPatterns({ turns, tagsByTurn }),
  };
}

function buildRecentPatterns({ turns, tagsByTurn }) {
  return turns
    .slice()
    .reverse()
    .filter((turn) => {
      return (
        tagsByTurn.has(turn.id) ||
        turn.classificationFallback ||
        (turn.contractAdjustments || []).length > 0 ||
        (turn.contractBlocked || []).length > 0
      );
    })
    .slice(0, 8)
    .map((turn) => ({
      turnId: turn.id,
      prompt: turn.user,
      significance: turn.significance || "unknown",
      activeRole: turn.activeRole || "unknown",
      categories: (tagsByTurn.get(turn.id) || []).map((tag) => tag.category),
      classificationFallback: Boolean(turn.classificationFallback),
      candidateDomain: turn.candidateDomain || null,
      candidateClassification: turn.candidateClassification || null,
      contractAdjusted: (turn.contractAdjustments || []).length > 0,
      contractBlocked: (turn.contractBlocked || []).length > 0,
    }));
}

function toFieldNotesMarkdown(payload) {
  const turns = payload?.turns || [];
  const tags = payload?.tags || [];
  const turnsById = new Map(turns.map((turn) => [Number(turn.id), turn]));
  const selected = tags
    .map((tag) => ({
      tag,
      turn: turnsById.get(Number(tag.turnId)),
    }))
    .filter((item) => item.turn);

  const lines = [
    "# Monday Sandbox Field Notes Export",
    "",
    `Session: ${payload.sessionId}`,
    `Turns: ${payload.turnCount}`,
    `Tagged observations: ${selected.length}`,
    "",
  ];

  if (!selected.length) {
    lines.push("No tagged turns yet.");
    lines.push("");
    lines.push("Use the sandbox review panel to tag failures or positive surprises first.");
    return `${lines.join("\n")}\n`;
  }

  for (const { tag, turn } of selected) {
    lines.push(`## Field Note: Turn ${turn.id} - ${tag.category}`);
    lines.push("");
    lines.push("Date:");
    lines.push(`- ${tag.timestamp || turn.timestamp || "Unknown"}`);
    lines.push("");
    lines.push("Surface:");
    lines.push("- Sandbox");
    lines.push("");
    lines.push("Prompt:");
    lines.push(`- ${turn.user}`);
    lines.push("");
    lines.push("Engine State:");
    lines.push(`- significance: ${turn.significance || "unknown"}`);
    lines.push(`- situation_classification: ${turn.situationClassification || "unknown"}`);
    lines.push(`- active_role: ${turn.activeRole || "unknown"}`);
    lines.push(`- secondary_role: ${turn.secondaryRole || "unknown"}`);
    lines.push(`- recommended_outcome: ${turn.recommendedOutcome || "unknown"}`);
    lines.push(`- continuity_thread: ${turn.continuityThread || "unknown"}`);
    lines.push(`- progression: ${turn.progression || "unknown"}`);
    lines.push(`- classification_fallback: ${String(Boolean(turn.classificationFallback))}`);
    lines.push(`- candidate_domain: ${turn.candidateDomain || "unknown"}`);
    lines.push(`- candidate_classification: ${turn.candidateClassification || "unknown"}`);
    lines.push("");
    lines.push("Response:");
    lines.push(`- ${turn.monday}`);
    lines.push("");
    lines.push("Workspace:");
    lines.push(`- workspace_mode: ${turn.workspaceMode || "unknown"}`);
    lines.push(`- support_intent: ${turn.supportIntent || "unknown"}`);
    lines.push("");
    lines.push("Category:");
    lines.push(`- ${tag.category}`);
    lines.push("");
    lines.push("Diagnosis:");
    lines.push(`- ${buildDiagnosisHint(turn, tag)}`);
    lines.push("");
    lines.push("Why It Felt Wrong Or Right:");
    lines.push(`- ${tag.note || "Add observed feel here."}`);
    lines.push("");
    lines.push("Candidate Fix:");
    lines.push("- ");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function buildDiagnosisHint(turn, tag) {
  if (tag.category === "Ontology Failure" && turn.classificationFallback) {
    return `The turn fell back instead of resolving cleanly. Candidate domain was '${turn.candidateDomain || "unknown"}'.`;
  }

  if (tag.category === "Contract Failure" && (turn.contractAdjustments || []).length) {
    return `The contract adjusted the turn, which suggests the initial posture or outcome may have outrun Monday's guardrails.`;
  }

  if (tag.category === "Continuity Failure") {
    return `The turn appears to have lost the active thread or progression too early.`;
  }

  if (tag.category === "Voice Failure") {
    return `The classification may have been correct, but the language did not land like Monday.`;
  }

  if (tag.category === "Workspace Failure") {
    return `The workspace likely supported the wrong thing or competed with the answer.`;
  }

  if (tag.category === "Positive Surprise") {
    return `This turn felt unusually faithful in posture, voice, or continuity.`;
  }

  return `Review the turn for the mismatch between significance, posture, and response.`;
}

module.exports = {
  summarizeReviewPayload,
  toFieldNotesMarkdown,
};
