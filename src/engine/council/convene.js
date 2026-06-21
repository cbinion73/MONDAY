"use strict";
// Council Convener — assembles the relevant agents, runs them in parallel,
// and returns their reads to Monday for synthesis.
// Monday is NOT one of these agents. Monday is what emerges when they convene.

const { chatWithLLM } = require("../llm/llm-router");
const { selectAgents, COUNCIL } = require("./agents");
const store = require("../persistence/state-store");
const { getWorkspaceContext, syncAgentTheory } = require("../workspace/workspace-manager");

const COUNCIL_TIMEOUT_MS = Number(process.env.MONDAY_COUNCIL_TIMEOUT_MS || 20000);

/**
 * Build the prompt for a single agent read.
 */
function buildAgentPrompt(agent, { workingTheory, captures, threads, userInput }) {
  const recentCaptures = (captures || [])
    .filter((c) => !c.domain || c.domain === agent.domain || c.domain === "general")
    .slice(0, 6)
    .map((c) => `- ${c.content}`)
    .join("\n") || "No recent captures in this domain.";

  const domainThreads = (threads || [])
    .filter((t) => t.domain === agent.domain)
    .slice(0, 4)
    .map((t) => `- ${t.label || t.id} (occurrences: ${t.occurrences || 1}, last: ${t.updatedAt?.slice(0, 10) || "unknown"})`)
    .join("\n") || "No active threads in this domain.";

  // Pull workspace memory — accumulated facts, decisions, theory from prior sessions
  const workspaceContext = getWorkspaceContext(agent.domain);

  return [
    { role: "system", content: agent.systemPrompt },
    {
      role: "user",
      content: `CURRENT WORKING THEORY for ${agent.domain}:
${workingTheory?.text || "No theory established yet."}

${workspaceContext ? `WORKSPACE MEMORY (${agent.domain}):\n${workspaceContext}\n` : ""}RECENT CAPTURES (${agent.domain} domain):
${recentCaptures}

ACTIVE THREADS (${agent.domain} domain):
${domainThreads}

WHAT CHRIS JUST SAID:
"${userInput || "(no direct input — this is a background check)"}"

Give Monday your read on the ${agent.domain} domain right now. Return JSON only.`,
    },
  ];
}

/**
 * Parse an agent's JSON response, with fallback.
 */
function parseAgentResponse(text, agent) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON");
    return JSON.parse(match[0]);
  } catch {
    return {
      read: text.slice(0, 300) || `${agent.name} has no read at this time.`,
      concern: null,
      flag: false,
      confidence: "low",
      theory: null,
    };
  }
}

/**
 * Run a single agent with timeout.
 */
async function runAgent(agent, context) {
  const prompt = buildAgentPrompt(agent, context);

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${agent.name} timed out`)), COUNCIL_TIMEOUT_MS)
  );

  try {
    const response = await Promise.race([
      chatWithLLM({ messages: prompt, temperature: 0.4 }),
      timeoutPromise,
    ]);
    const text = typeof response === "string" ? response : response?.reply || "";
    const parsed = parseAgentResponse(text, agent);

    // Persist the agent's theory to both state-store and workspace
    if (parsed.theory) {
      store.setWorkingTheory(agent.domain, parsed.theory);
      syncAgentTheory(agent.domain, parsed.theory);
    }

    return {
      agent: agent.name,
      domain: agent.domain,
      emoji: agent.emoji,
      ...parsed,
      ok: true,
    };
  } catch (err) {
    console.error(`[council] ${agent.name} error:`, err.message);
    return {
      agent: agent.name,
      domain: agent.domain,
      emoji: agent.emoji,
      read: null,
      concern: null,
      flag: false,
      confidence: "low",
      theory: null,
      ok: false,
      error: err.message,
    };
  }
}

/**
 * Build Monday's synthesis prompt from council reads.
 */
function buildSynthesisPrompt(reads, userInput) {
  const agentReads = reads
    .filter((r) => r.ok && r.read)
    .map((r) => {
      const flagMark = r.flag ? " ⚑" : "";
      return `${r.emoji} ${r.agent} (${r.domain})${flagMark}: ${r.read}${r.concern ? `\n  → Concern: ${r.concern}` : ""}`;
    })
    .join("\n\n");

  const flaggedAgents = reads.filter((r) => r.flag && r.ok);

  return [
    {
      role: "system",
      content: `You are Monday — the single trusted voice that emerges when Chris Binion's domain council convenes.

Your council has just given you their reads on the domains relevant to this moment. Your job is to synthesize those reads into one response — in your own voice, not theirs.

You do not repeat what the agents said. You do not credit them. You speak as Monday: the integrated, faithful witness who has absorbed all the domain reads and is now responding to Chris directly.

Monday's voice rules:
- Short sentences. Direct. Declarative.
- No coaching language ("you should", "have you considered", "it might be worth").
- No setup phrases ("That's a great question", "I understand", "I want to help").
- Lead with insight, not observation.
- "I think" signals an interpretation. "My read is" signals a theory. Use them intentionally.
- Recommend when you have a recommendation. Don't hedge it.
- One response. Not a list of domain summaries.

The council flagged these domains as needing attention: ${flaggedAgents.length > 0 ? flaggedAgents.map((r) => r.domain).join(", ") : "none — this is a normal exchange"}.`,
    },
    {
      role: "user",
      content: `Chris said: "${userInput}"

Council reads:
${agentReads || "No council reads available — respond directly to Chris."}

Now respond as Monday. Synthesize the reads into one voice. Do not list domains. Do not attribute to agents. Speak.`,
    },
  ];
}

/**
 * Convene the council for the given domains and input.
 * Runs relevant agents in parallel, synthesizes their reads.
 *
 * @param {object} opts
 *   opts.domains    - string[] domain names from ontology
 *   opts.userInput  - raw user input
 *   opts.captures   - recent personal captures
 *   opts.threads    - active threads from state-store
 *   opts.synthesize - if true, run LLM synthesis; if false, just return reads
 * @returns {object} { reads, synthesis, flagged, agentsConvened }
 */
async function conveneCouncil({ domains = [], userInput = "", captures = [], threads = [], synthesize = true }) {
  const theories = store.getWorkingTheories();
  const agents = selectAgents(domains, userInput);

  if (agents.length === 0) {
    return { reads: [], synthesis: null, flagged: [], agentsConvened: [] };
  }

  console.log(`[council] convening: ${agents.map((a) => a.name).join(", ")}`);

  // Run all relevant agents in parallel
  const reads = await Promise.all(
    agents.map((agent) =>
      runAgent(agent, {
        workingTheory: theories[agent.domain],
        captures,
        threads,
        userInput,
      })
    )
  );

  const flagged = reads.filter((r) => r.flag && r.ok).map((r) => r.domain);

  let synthesis = null;
  if (synthesize && reads.some((r) => r.ok && r.read)) {
    try {
      const synthPrompt = buildSynthesisPrompt(reads, userInput);
      const response = await chatWithLLM({ messages: synthPrompt, temperature: 0.7 });
      synthesis = typeof response === "string" ? response : response?.reply || null;
    } catch (err) {
      console.error("[council] synthesis error:", err.message);
    }
  }

  return {
    reads,
    synthesis,
    flagged,
    agentsConvened: agents.map((a) => ({ name: a.name, domain: a.domain, emoji: a.emoji })),
  };
}

/**
 * Run a background council check across all six domains.
 * Used by the heartbeat loops — no user input, just domain health check.
 */
async function councilHealthCheck() {
  const theories = store.getWorkingTheories();
  const threads = store.getActiveThreads();

  // Check all six agents
  const allAgents = Object.values(COUNCIL);
  const reads = await Promise.all(
    allAgents.map((agent) =>
      runAgent(agent, {
        workingTheory: theories[agent.domain],
        captures: [],
        threads,
        userInput: "",
      })
    )
  );

  const flagged = reads.filter((r) => r.flag && r.ok);
  return { reads, flagged };
}

module.exports = { conveneCouncil, councilHealthCheck };
