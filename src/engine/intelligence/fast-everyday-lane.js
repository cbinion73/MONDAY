"use strict";

const GROCERY_RE = /\b(grocer(?:y|ies)|dinner|meal plan|meal|shopping list|grocery list|cook|cooking|recipe|what should i make|what should i eat)\b/i;
const BRAINSTORM_RE = /\b(ideas?|brainstorm|options|suggestions|recommend)\b/i;
const LOW_STAKES_RE = /\b(tonight|this week|for dinner|for lunch|for breakfast|quick|easy|simple)\b/i;

function shouldUseFastEverydayLane(input, result) {
  const text = String(input || "").trim();
  if (!text) return false;
  if (!result?.finalState?.classificationFallback) return false;
  if ((result.truth?.domain || result.finalState?.candidateDomain) && result.finalState?.candidateDomain !== "unknown") return false;
  return isFastEverydayPrompt(text);
}

function isFastEverydayPrompt(text) {
  return GROCERY_RE.test(text) || (BRAINSTORM_RE.test(text) && LOW_STAKES_RE.test(text));
}

function buildFastEverydayReply(input) {
  const text = String(input || "").trim();
  if (GROCERY_RE.test(text)) {
    return "Groceries plus dinner is straightforward. Pick one lane and I’ll tighten it: taco bowls, sheet-pan chicken sausage with peppers and potatoes, or a quick stir-fry with rice. If you want speed, start with protein, one vegetable, one carb, and one sauce and I’ll turn that into a clean list.";
  }

  if (BRAINSTORM_RE.test(text) && LOW_STAKES_RE.test(text)) {
    return "Let’s keep it simple and practical. Give me the constraint that matters most first, and I’ll narrow this to a short usable set instead of a big brainstorm dump.";
  }

  return null;
}

module.exports = {
  shouldUseFastEverydayLane,
  buildFastEverydayReply,
};
