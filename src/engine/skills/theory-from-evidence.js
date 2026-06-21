"use strict";
// Theory-from-Evidence — deterministic synthesis step between skill execution and LLM call.
// No extra LLM call. Takes the prior working theory + skill observations/patterns
// and produces an evidence-enriched context string the prompt builder injects directly.
//
// The skill result is not the answer. It is evidence.
// This module synthesizes that evidence into language the LLM can reason from.

function updateTheoryFromEvidence(priorTheory, skillResults) {
  if (!skillResults || skillResults.length === 0) return null;

  // workingTheory may be stored as an object { statement, status, ... } — normalize to string
  const priorTheoryStr = priorTheory?.statement || (typeof priorTheory === "string" ? priorTheory : null);

  const allObservations = skillResults.flatMap((s) => s.observations || []);
  const allPatterns = skillResults.flatMap((s) => s.patterns || []);

  const sections = [];

  if (priorTheoryStr) {
    sections.push(`Prior understanding: ${priorTheoryStr}`);
  }

  if (allObservations.length > 0) {
    sections.push(`New evidence from tools:\n${allObservations.map((o) => `  — ${o}`).join("\n")}`);
  }

  if (allPatterns.length > 0) {
    sections.push(`Patterns detected:\n${allPatterns.map((p) => `  — ${p}`).join("\n")}`);
  }

  const synthesis = buildSynthesis(priorTheory, skillResults, allPatterns);
  if (synthesis) {
    sections.push(`Evidence synthesis: ${synthesis}`);
  }

  return sections.join("\n\n");
}

function buildSynthesis(priorTheory, skillResults, allPatterns) {
  if (allPatterns.length === 0 && skillResults.length === 0) return null;

  const priorTheoryStr = priorTheory?.statement || (typeof priorTheory === "string" ? priorTheory : "");
  const theory = priorTheoryStr.toLowerCase();

  // Pattern-theory confirmation and tension detection
  const workDominant = allPatterns.some((p) => p.includes("work") && p.includes("dominate"));
  const noFamily = allPatterns.some((p) => p.includes("no family"));
  const familyPresent = allPatterns.some((p) => p.includes("family-prioritized"));
  const heavy = allPatterns.some((p) => p.includes("heavy"));
  const inboxBacklog = allPatterns.some((p) => p.includes("accumulating"));
  const lowBalance = allPatterns.some((p) => p.includes("balance is low"));

  // Work-family tension — the most important pattern for Monday
  if (workDominant && noFamily && (theory.includes("family") || theory.includes("work"))) {
    return "Live data confirms the pattern — work is dominating the schedule while family is absent from it. If family attention has been a concern, this week's data is relevant evidence.";
  }
  if (workDominant && noFamily) {
    return "Calendar is showing work-heavy, family-absent scheduling this period. Worth surfacing if that's a live tension.";
  }
  if (familyPresent && theory.includes("family")) {
    return "Live data shows family is present in the schedule this period — consistent with the current theory.";
  }
  if (familyPresent && theory.includes("work")) {
    return "Interesting: calendar shows family-prioritized scheduling despite work being the dominant theme recently.";
  }

  // Financial signal
  if (lowBalance) {
    return "Financial data shows a low balance signal — may be worth a direct mention.";
  }

  // Email signal
  if (inboxBacklog) {
    return "Email is accumulating — inbox attention may be overdue.";
  }

  // Heavy schedule
  if (heavy) {
    return "Schedule is heavy this period. Capacity may be a relevant frame.";
  }

  // Generic — just note that evidence was gathered
  const sources = [...new Set(skillResults.map((s) => s.source).filter(Boolean))];
  return sources.length > 0
    ? `Live ${sources.join(" and ")} data is available. Use it to ground the response in actual current state, not memory or assumption.`
    : null;
}

module.exports = { updateTheoryFromEvidence };
