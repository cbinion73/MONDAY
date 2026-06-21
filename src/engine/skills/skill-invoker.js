"use strict";
// Skill Invoker — orchestrates the full JARVIS loop for a single turn:
//
//   1. Intent detection (rule-based, no LLM)
//   2. Trust gate (workspace allowed list)
//   3. Parallel skill execution (with timeout)
//   4. Result normalization (observations + patterns, not raw JSON)
//
// Returns { used, skills, failed, detectedCount, gatedCount }
// Each entry in skills: { skillId, reason, confidence, observations, patterns, summary, source, ms }

const { detectIntents } = require("./intent-detector");
const { executeSkill } = require("./executor");
const { normalizeSkillResult } = require("./skill-result-normalizer");
const store = require("../workspace/workspace-store");

const SKILL_TIMEOUT_MS = 8000;
const MAX_SKILLS_PER_TURN = 3; // cap to keep latency predictable

async function invokeSkillsForTurn(input, { workspaceId = null, domain = null, channel = "turn" } = {}) {
  // 1. Rule-based intent detection
  const intents = detectIntents(input);
  if (intents.length === 0) {
    return { used: false, skills: [], failed: [], detectedCount: 0, gatedCount: 0 };
  }

  // 2. Trust gate — filter by workspace allowed list
  let gated = intents;
  if (workspaceId && store.exists(workspaceId)) {
    const tools = store.getTools(workspaceId);
    const allowed = tools.allowed || [];
    gated = intents.filter((i) => allowed.includes(i.skillId));
  }
  // Cap at MAX_SKILLS_PER_TURN (highest confidence first)
  gated = gated.slice(0, MAX_SKILLS_PER_TURN);

  if (gated.length === 0) {
    return {
      used: false,
      skills: [],
      failed: [],
      detectedCount: intents.length,
      gatedCount: 0,
      gateBlocked: true,
    };
  }

  // 3. Execute skills in parallel with timeout
  const executions = await Promise.all(
    gated.map(async (intent) => {
      try {
        const execution = await Promise.race([
          executeSkill(intent.skillId, intent.params, {
            workspaceId,
            domain,
            channel,
            bypassTier: false,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Skill timeout after ${SKILL_TIMEOUT_MS}ms`)), SKILL_TIMEOUT_MS)
          ),
        ]);

        if (!execution.ok) {
          return {
            skillId: intent.skillId,
            reason: intent.reason,
            ok: false,
            error: execution.error || "Execution failed",
            observations: [],
            patterns: [],
          };
        }

        // 4. Normalize result — observations + patterns, not raw JSON
        const normalized = normalizeSkillResult(intent.skillId, execution.result);

        return {
          skillId: intent.skillId,
          reason: intent.reason,
          // Confidence is the lower of: how sure we were it was needed + how good the data is
          intentConfidence: intent.confidence,
          resultConfidence: normalized.confidence,
          confidence: Math.round(Math.min(intent.confidence, normalized.confidence) * 100) / 100,
          observations: normalized.observations,
          patterns: normalized.patterns,
          summary: normalized.summary,
          source: normalized.source,
          raw: execution.result,
          ok: true,
          ms: execution.ms,
        };
      } catch (err) {
        return {
          skillId: intent.skillId,
          reason: intent.reason,
          ok: false,
          error: err.message,
          observations: [],
          patterns: [],
        };
      }
    })
  );

  const skills = executions.filter((e) => e.ok);
  const failed = executions.filter((e) => !e.ok);

  return {
    used: skills.length > 0,
    skills,
    failed,
    detectedCount: intents.length,
    gatedCount: gated.length,
  };
}

module.exports = { invokeSkillsForTurn };
