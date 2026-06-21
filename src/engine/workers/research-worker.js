"use strict";
// Research Worker — on-demand, invisible, reports to Monday.
// Implements the ReAct loop: Thought → Action → Observation.
// Multi-hop reasoning before returning. Never talks to the user directly.

const { chatWithLLM, activeProvider } = require("../llm/llm-router");

const MAX_HOPS = 4;
const WORKER_TIMEOUT_MS = Number(process.env.MONDAY_RESEARCH_TIMEOUT_MS || 30000);

const RESEARCH_SYSTEM_PROMPT = `You are an invisible research worker inside Monday, a personal AI for Chris Binion.

Your job: gather and synthesize information to answer a research query. You will never speak to the user directly. You return structured findings to Monday, who decides what to surface.

You operate using the ReAct pattern:
- Thought: reason about what you know and what you still need
- Action: describe what search or lookup you would perform
- Observation: what that action reveals
- Repeat until you have enough to synthesize
- Return: a concise synthesis ready for Monday to use

Rules:
- Be honest about confidence. Low confidence is better than false certainty.
- Synthesize findings into a recommendation, not a data dump.
- Cite the reasoning chain so Monday can evaluate quality.
- If you cannot find good information, say so clearly.`;

function buildReActPrompt(query, context, hops) {
  const contextStr = context ? `\nContext about Chris: ${JSON.stringify(context)}` : "";
  const hopStr = hops.map((h, i) =>
    `Hop ${i + 1}:\nThought: ${h.thought}\nAction: ${h.action}\nObservation: ${h.observation}`
  ).join("\n\n");

  if (hops.length === 0) {
    return [
      { role: "system", content: RESEARCH_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Research query: ${query}${contextStr}

Begin with Hop 1. Format exactly:
Thought: [your reasoning about what you need to find]
Action: [what you would search for or look up]
Observation: [what that search would likely reveal based on your knowledge]

After the observation, decide: do you need more hops, or can you synthesize now?
If synthesizing, add:
SYNTHESIS: [concise summary ready for Monday to use]
CONFIDENCE: [low|medium|high]
RECOMMENDATION: [what Monday should say or do with this]`,
      },
    ];
  }

  return [
    { role: "system", content: RESEARCH_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Research query: ${query}${contextStr}

Previous reasoning:
${hopStr}

Continue with Hop ${hops.length + 1}, or if you have enough information, synthesize:
If continuing: Thought / Action / Observation
If synthesizing:
SYNTHESIS: [concise summary]
CONFIDENCE: [low|medium|high]
RECOMMENDATION: [what Monday should say or do]`,
    },
  ];
}

function parseReActResponse(text) {
  const thoughtMatch = text.match(/Thought:\s*(.+?)(?=Action:|$)/s);
  const actionMatch = text.match(/Action:\s*(.+?)(?=Observation:|$)/s);
  const observationMatch = text.match(/Observation:\s*(.+?)(?=SYNTHESIS:|Thought:|$)/s);
  const synthesisMatch = text.match(/SYNTHESIS:\s*(.+?)(?=CONFIDENCE:|$)/s);
  const confidenceMatch = text.match(/CONFIDENCE:\s*(low|medium|high)/i);
  const recommendationMatch = text.match(/RECOMMENDATION:\s*(.+?)(?=$)/s);

  const hop = thoughtMatch && actionMatch && observationMatch
    ? {
        thought: thoughtMatch[1].trim(),
        action: actionMatch[1].trim(),
        observation: observationMatch[1].trim(),
      }
    : null;

  const synthesis = synthesisMatch
    ? {
        text: synthesisMatch[1].trim(),
        confidence: confidenceMatch ? confidenceMatch[1].toLowerCase() : "medium",
        recommendation: recommendationMatch ? recommendationMatch[1].trim() : synthesisMatch[1].trim(),
      }
    : null;

  return { hop, synthesis };
}

async function runWithTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Research worker timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute the research worker with a ReAct loop.
 * @param {object} opts
 *   opts.query   - string: what to research
 *   opts.context - optional object: domain context
 * @returns {object} { findings, recommendation, confidence, hops, synthesis }
 */
async function runResearchWorker({ query, context = null }) {
  if (!query || typeof query !== "string") {
    return {
      findings: [],
      recommendation: "No query provided.",
      confidence: "low",
      hops: 0,
      synthesis: "",
      error: "Missing query",
    };
  }

  const completedHops = [];
  let finalSynthesis = null;

  try {
    for (let i = 0; i < MAX_HOPS; i++) {
      const prompt = buildReActPrompt(query, context, completedHops);
      const response = await runWithTimeout(
        chatWithLLM({ messages: prompt, temperature: 0.4 }),
        WORKER_TIMEOUT_MS
      );

      const text = typeof response === "string" ? response : response?.reply || "";
      const { hop, synthesis } = parseReActResponse(text);

      if (hop) completedHops.push(hop);

      if (synthesis) {
        finalSynthesis = synthesis;
        break;
      }

      // If the LLM didn't produce a synthesis or a hop, stop
      if (!hop) break;
    }
  } catch (err) {
    return {
      findings: completedHops.map((h) => ({ source: "reasoning", summary: h.observation, relevance: "medium" })),
      recommendation: "Research incomplete due to timeout or error.",
      confidence: "low",
      hops: completedHops.length,
      synthesis: "",
      error: err.message,
    };
  }

  if (!finalSynthesis) {
    // Didn't reach synthesis — use last observation as fallback
    const lastHop = completedHops.at(-1);
    finalSynthesis = {
      text: lastHop?.observation || "No synthesis reached.",
      confidence: "low",
      recommendation: lastHop?.observation || "No findings.",
    };
  }

  return {
    findings: completedHops.map((h) => ({
      source: "reasoning",
      summary: h.observation,
      relevance: "medium",
    })),
    recommendation: finalSynthesis.recommendation,
    confidence: finalSynthesis.confidence,
    hops: completedHops.length,
    synthesis: finalSynthesis.text,
  };
}

module.exports = { runResearchWorker };
