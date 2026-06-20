const assert = require("node:assert/strict");
const {
  summarizeReviewPayload,
  toFieldNotesMarkdown,
} = require("../src/sandbox/review-analysis");

function main() {
  const payload = {
    sessionId: "review-session",
    turnCount: 2,
    turns: [
      {
        id: 1,
        user: "I want to lose weight.",
        monday: "What feels most important about that right now?",
        significance: "general_significance",
        situationClassification: "unclassified",
        activeRole: "witness",
        secondaryRole: "companion",
        recommendedOutcome: "explore_relationally",
        continuityThread: "unclassified",
        progression: "steady",
        classificationFallback: true,
        candidateDomain: "health",
        candidateClassification: "goal_or_transformation",
        contractAdjustments: [],
        contractBlocked: [],
        workspaceMode: "reflection_support",
        supportIntent: "help_meaning_emerge",
        timestamp: "2026-06-15T00:00:00.000Z",
      },
      {
        id: 2,
        user: "I think I'm hiding in work.",
        monday: "That sounds worth paying attention to.",
        significance: "work_tradeoff",
        situationClassification: "contradiction_surface",
        activeRole: "companion",
        secondaryRole: "steward",
        recommendedOutcome: "explore_relationally",
        continuityThread: "work-tradeoff",
        progression: "deepening",
        classificationFallback: false,
        candidateDomain: null,
        candidateClassification: null,
        contractAdjustments: ["moved left"],
        contractBlocked: [],
        workspaceMode: "reflection_support",
        supportIntent: "help_meaning_emerge",
        timestamp: "2026-06-15T00:01:00.000Z",
      },
    ],
    tags: [
      {
        turnId: 1,
        category: "Ontology Failure",
        note: "Should have resolved to health goal immediately.",
        timestamp: "2026-06-15T00:02:00.000Z",
      },
      {
        turnId: 2,
        category: "Positive Surprise",
        note: "This one sounded much more like Monday.",
        timestamp: "2026-06-15T00:03:00.000Z",
      },
    ],
  };

  const summary = summarizeReviewPayload(payload);
  assert.equal(summary.taggedTurns, 2);
  assert.equal(summary.fallbackTurns, 1);
  assert.equal(summary.contractAdjustedTurns, 1);
  assert.equal(summary.categoryCounts[0].category, "Ontology Failure");
  assert.ok(summary.recentPatterns.length >= 2);

  const markdown = toFieldNotesMarkdown(payload);
  assert.ok(markdown.includes("# Monday Sandbox Field Notes Export"));
  assert.ok(markdown.includes("## Field Note: Turn 1 - Ontology Failure"));
  assert.ok(markdown.includes("- significance: general_significance"));
  assert.ok(markdown.includes("- support_intent: help_meaning_emerge"));
  assert.ok(markdown.includes("Should have resolved to health goal immediately."));

  console.log("Monday review analysis tests passed.");
}

main();
