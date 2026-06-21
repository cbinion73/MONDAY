"use strict";
// JARVIS four-stage pipeline: Planning → Selection → Execution → Synthesis.
// On-demand execution when Chris delegates a task.
// Workers are invisible. Monday returns the final result.

const { chatWithLLM } = require("../llm/llm-router");
const { runResearchWorker } = require("./research-worker");
const { runMemoryWorker } = require("./memory-worker");
const { runSynthesisWorker } = require("./synthesis-worker");
const { validateWorkerOutput } = require("./agent-contracts");

const PLAN_SYSTEM = `You are a task planner inside Monday, a personal AI for Chris Binion.
Given a delegated task from Chris, decompose it into subtasks for the available workers.
Workers available: research, memory, synthesis.
Return JSON only:
{
  "tasks": [
    { "id": "t1", "worker": "research|memory|synthesis", "input": { ...worker-specific }, "dependsOn": [] }
  ],
  "intent": "one sentence: what Chris is trying to accomplish"
}`;

const SYNTHESIZE_SYSTEM = `You are the final synthesis stage in Monday's pipeline.
You receive the outputs of all worker tasks and produce a single, direct Monday-style response.
Monday's voice: short sentences, declarative, no coaching language, no setup phrases.
Return the response text only — no JSON, no headers.`;

async function planTasks({ input, context, personalContext }) {
  const prompt = [
    { role: "system", content: PLAN_SYSTEM },
    {
      role: "user",
      content: `Task from Chris: "${input}"
Context: ${JSON.stringify({ domain: context?.activeMission, personalContext: personalContext?.missions?.slice(0, 3) }, null, 2)}

Decompose into worker tasks. Use "research" for external information needs, "memory" for state reads/writes, "synthesis" for cross-domain pattern work.
Return JSON only.`,
    },
  ];

  try {
    const response = await chatWithLLM({ messages: prompt, temperature: 0.3, tier: "background" });
    const text = typeof response === "string" ? response : response?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in plan response");
    return JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback: single research task
    return {
      tasks: [{ id: "t1", worker: "research", input: { query: input, context }, dependsOn: [] }],
      intent: input,
    };
  }
}

function selectWorker(workerId) {
  switch (workerId) {
    case "research":
      return runResearchWorker;
    case "memory":
      return (input) => Promise.resolve(runMemoryWorker(input));
    case "synthesis":
      return runSynthesisWorker;
    default:
      return null;
  }
}

async function executeTasks(tasks) {
  const results = {};

  // Resolve dependency order (simple topological sort)
  const pending = [...tasks];
  const maxIterations = tasks.length * 2;
  let iterations = 0;

  while (pending.length > 0 && iterations < maxIterations) {
    iterations++;
    for (let i = pending.length - 1; i >= 0; i--) {
      const task = pending[i];
      const depsComplete = (task.dependsOn || []).every((depId) => depId in results);
      if (!depsComplete) continue;

      const worker = selectWorker(task.worker);
      if (!worker) {
        results[task.id] = { error: `Unknown worker: ${task.worker}` };
        pending.splice(i, 1);
        continue;
      }

      // Inject results from dependencies into input
      const enrichedInput = {
        ...task.input,
        ...(task.dependsOn || []).reduce((acc, depId) => {
          acc[`dep_${depId}`] = results[depId];
          return acc;
        }, {}),
      };

      try {
        results[task.id] = await worker(enrichedInput);
      } catch (err) {
        results[task.id] = { error: err.message };
      }

      pending.splice(i, 1);
      break; // restart the scan after each completion
    }
  }

  return results;
}

async function synthesizeResults({ intent, taskResults, input }) {
  const resultSummary = Object.entries(taskResults)
    .map(([id, result]) => `Task ${id}: ${JSON.stringify(result).slice(0, 400)}`)
    .join("\n\n");

  const prompt = [
    { role: "system", content: SYNTHESIZE_SYSTEM },
    {
      role: "user",
      content: `Chris asked: "${input}"
Intent: ${intent}

Worker results:
${resultSummary}

Write Monday's response. Direct, short, no coaching language. Lead with the useful thing.`,
    },
  ];

  try {
    const response = await chatWithLLM({ messages: prompt, temperature: 0.7, tier: "background" });
    return typeof response === "string" ? response : response?.content || "";
  } catch {
    // Fallback: use best research finding
    const researchResult = Object.values(taskResults).find((r) => r.recommendation);
    return researchResult?.recommendation || "I ran into a problem completing that research.";
  }
}

/**
 * Run the full JARVIS pipeline for a delegated task.
 * @param {object} opts
 *   opts.input          - user input string
 *   opts.context        - session context
 *   opts.personalContext - personal store data
 * @returns {object} { response, intent, taskCount, pipeline }
 */
async function runPipeline({ input, context = {}, personalContext = {} }) {
  const startedAt = Date.now();

  // Stage 1: Planning
  const plan = await planTasks({ input, context, personalContext });

  // Stage 2 + 3: Selection + Execution (done together in executeTasks)
  const taskResults = await executeTasks(plan.tasks || []);

  // Stage 4: Synthesis
  const response = await synthesizeResults({
    intent: plan.intent,
    taskResults,
    input,
  });

  return {
    response,
    intent: plan.intent,
    taskCount: (plan.tasks || []).length,
    latencyMs: Date.now() - startedAt,
    pipeline: {
      plan,
      taskResults,
    },
  };
}

/**
 * Detect whether a user input is a delegation request.
 * Monday runs the pipeline for these; engine handles the rest.
 */
function isDelegationRequest(input) {
  const text = (input || "").toLowerCase().trim();
  return (
    /^(find|search|look up|research|get me|show me|book|schedule|buy|order|compare)\b/i.test(text) ||
    /\bfind (me|the|a|an|some)\b/i.test(text) ||
    /\blet'?s? do it\b/i.test(text) ||
    /\bgo ahead\b/i.test(text) ||
    /^(handle|do|execute|run)\b/i.test(text)
  );
}

module.exports = { runPipeline, isDelegationRequest };
