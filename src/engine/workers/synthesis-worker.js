"use strict";
// Synthesis Worker — scheduled, invisible.
// Cross-domain pattern detection and theory revision.
// Reports to Monday. Never talks to the user directly.

const { chatWithLLM } = require("../llm/llm-router");
const { checkRipeness } = require("./agent-contracts");
const { writeDeliverable } = require("../db/deliverable-store");
const { runDeliverableReview } = require("./review-worker");

const SYNTHESIS_SYSTEM_PROMPT = `You are a synthesis worker inside Monday, a personal AI for Chris Binion.

Your job: look across Chris's six life domains (Health, Publishing, Retirement, Family, Faith, Work), detect patterns, revise working theories, and identify what deserves attention.

You never speak to Chris directly. You return structured observations that Monday evaluates before surfacing anything.

Chris's six domains:
- Health: physical wellbeing, energy, exercise, weight
- Publishing: book projects, writing, creative output
- Retirement: life transition, identity, financial planning
- Family: relationships, presence, attention
- Faith: prayer, spiritual practice, calling
- Work: professional role, tradeoffs, burnout, meaning

Your job is NOT to surface everything. Your job is to identify the one or two things that genuinely deserve attention right now — meaning they've been accumulating long enough and the timing is right.

Return JSON in this exact shape:
{
  "observations": [
    {
      "domain": "string",
      "observation": "string — what you noticed (max 2 sentences, Monday's voice)",
      "confidence": "low|medium|high",
      "occurrences": number,
      "significanceHigh": boolean
    }
  ],
  "theoryRevisions": [
    {
      "domain": "string",
      "oldTheory": "string",
      "newTheory": "string",
      "reason": "string — why the theory changed"
    }
  ],
  "shouldSurface": boolean,
  "surfacePayload": "string — the observation to deliver if shouldSurface is true (null if false)"
}`;

function buildSynthesisPrompt({ threads, theories, captures, triggerLoop }) {
  const threadSummary = threads.slice(0, 10).map((t) =>
    `- [${t.domain || "unknown"}] ${t.label || t.id}: last seen ${t.updatedAt?.slice(0, 10) || "unknown"}, occurrences: ${t.occurrences || 1}`
  ).join("\n");

  const theorySummary = Object.entries(theories).map(
    ([domain, t]) => `- ${domain}: "${t.text}" (updated ${t.updatedAt?.slice(0, 10)})`
  ).join("\n");

  const captureSummary = captures.slice(0, 8).map(
    (c) => `- [${c.domain || "general"}] ${c.content}`
  ).join("\n");

  return [
    { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Synthesis triggered by: ${triggerLoop} loop

ACTIVE THREADS:
${threadSummary || "None yet."}

CURRENT WORKING THEORIES:
${theorySummary || "None yet."}

RECENT CAPTURES:
${captureSummary || "None yet."}

Now synthesize. Look for:
1. Patterns that have appeared 3+ times across threads or captures
2. Working theories that need revision based on new evidence
3. Domains going quiet that should be watched
4. Tensions or contradictions between stated priorities and observed behavior

Ripeness rule: only set shouldSurface=true if a pattern has 3+ occurrences AND is genuinely significant (not just interesting). Be conservative. Silence is valid.

Return valid JSON only.`,
    },
  ];
}

function parseSynthesisResponse(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

function buildFallbackSynthesis(threads, theories) {
  const observations = [];

  // Simple heuristic: flag any thread with 3+ occurrences and high significance
  for (const thread of threads) {
    if ((thread.occurrences || 0) >= 3 && thread.significance === "high") {
      observations.push({
        domain: thread.domain || "general",
        observation: `${thread.label || thread.id} keeps returning.`,
        confidence: "medium",
        occurrences: thread.occurrences,
        significanceHigh: true,
      });
    }
  }

  return {
    observations: observations.slice(0, 2),
    theoryRevisions: [],
    shouldSurface: false,
    surfacePayload: null,
  };
}

/**
 * Run the synthesis worker.
 * @param {object} opts
 *   opts.threads      - active threads from state-store
 *   opts.theories     - current working theories per domain
 *   opts.captures     - recent personal captures
 *   opts.triggerLoop  - "hourly" | "daily" | "weekly" | "monthly"
 */
async function runSynthesisWorker({ threads = [], theories = {}, captures = [], triggerLoop = "hourly" }) {
  const { intelligenceEnabled } = require("../intelligence/monday-intelligence");

  if (!intelligenceEnabled()) {
    return buildFallbackSynthesis(threads, theories);
  }

  const prompt = buildSynthesisPrompt({ threads, theories, captures, triggerLoop });

  try {
    const response = await chatWithLLM({ messages: prompt, temperature: 0.5, tier: "background" });
    const text = typeof response === "string" ? response : response?.content || "";
    const parsed = parseSynthesisResponse(text);

    if (!parsed) return buildFallbackSynthesis(threads, theories);

    // Apply ripeness gate to each observation
    const gatedObservations = (parsed.observations || []).filter((obs) => {
      const { passes } = checkRipeness(obs);
      return passes;
    });

    const result = {
      observations: parsed.observations || [],
      theoryRevisions: parsed.theoryRevisions || [],
      shouldSurface: parsed.shouldSurface && gatedObservations.length > 0,
      surfacePayload: parsed.shouldSurface && gatedObservations.length > 0 ? parsed.surfacePayload : null,
    };

    // Write the deliverable — permanent record in Obsidian/deliverables folder
    // Monday's review layer decides what (if anything) reaches Chris
    const deliverableContent = buildDeliverableMarkdown(parsed, gatedObservations, triggerLoop);
    const { filePath } = writeDeliverable({
      source:     "synthesis",
      domain:     null, // cross-domain
      title:      `Synthesis — ${triggerLoop} loop`,
      content:    deliverableContent,
      confidence: gatedObservations.length > 0 ? 0.75 : 0.4,
    });

    // Review layer runs after the write — it decides surfacing, not the worker
    runDeliverableReview({ filePath, source: "synthesis" }).catch(err =>
      console.error("[synthesis-worker] review error:", err.message)
    );

    return result;
  } catch (err) {
    console.error("[synthesis-worker] error:", err.message);
    return buildFallbackSynthesis(threads, theories);
  }
}

function buildDeliverableMarkdown(parsed, gatedObservations, triggerLoop) {
  const sections = [];

  if ((parsed.observations || []).length > 0) {
    sections.push("## Observations\n");
    for (const obs of parsed.observations) {
      const gated = gatedObservations.find(g => g.domain === obs.domain && g.observation === obs.observation);
      sections.push(`### ${obs.domain} (${obs.confidence}, ${obs.occurrences || 1} occurrence(s)${gated ? "" : " — below ripeness threshold"})\n`);
      sections.push(obs.observation + "\n");
    }
  }

  if ((parsed.theoryRevisions || []).length > 0) {
    sections.push("## Theory Revisions\n");
    for (const rev of parsed.theoryRevisions) {
      sections.push(`### ${rev.domain}\n`);
      sections.push(`**Was:** ${rev.oldTheory}\n\n**Now:** ${rev.newTheory}\n\n**Reason:** ${rev.reason}\n`);
    }
  }

  if (parsed.surfacePayload) {
    sections.push(`## Surface Candidate\n\n${parsed.surfacePayload}\n`);
  }

  sections.push(`## Metadata\n\n- Trigger loop: ${triggerLoop}\n- Gated observations: ${gatedObservations.length}/${(parsed.observations || []).length}\n`);

  return sections.join("\n");
}

module.exports = { runSynthesisWorker };
