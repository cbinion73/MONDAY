"use strict";
// Skill Planner — LLM-backed fallback for ambiguous skill selection.
// Called ONLY when rule-based intent detection returns nothing with sufficient confidence.
// Rule first. LLM second. Never the reverse.
//
// This is a stub for Phase 1. The planner interface is established so it can be
// wired in Phase 2 without changing the invoker. For now it always returns empty,
// letting the rule-based detector carry the full load.

async function planSkillsWithLLM(input, { domain } = {}) {
  // Phase 1 stub — returns empty so rule-based is the sole path.
  // Phase 2 will make a structured Ollama call here:
  //   Ask: "Given this user message, which of these skills should I invoke?"
  //   Return JSON: [{ skillId, params, reason, confidence }]
  return [];
}

module.exports = { planSkillsWithLLM };
