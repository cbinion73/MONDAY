"use strict";
// Workspace Manager — higher-level operations on top of workspace-store.
// Handles: initialization from missions, post-turn enrichment,
// theory sync from council agents, lifecycle transitions.

const store = require("./workspace-store");
const { validateTransition, agentForDomain, artifactsForStage } = require("./lifecycle");

const DOMAIN_NAMES = ["Health", "Publishing", "Retirement", "Family", "Faith", "Work"];

// Tier 1 skills that every workspace gets by default — research-safe, auto-run.
// New Phase 4 skills included. installSkill is idempotent so this is safe every startup.
const DEFAULT_SKILLS = [
  "calendar-read",
  "documents-read",
  "email-read",
  "financial-read",
  "browser-search",
  "browser-read",
  "summarize",
];

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Ensure every personal-store mission domain has a workspace.
 * Also ensures default Tier 1 skills are installed in every workspace.
 * Called at daemon startup. Idempotent.
 */
function initFromMissions() {
  const { installSkill } = require("../skills/installer");

  for (const domain of DOMAIN_NAMES) {
    const id = domain.toLowerCase();
    if (!store.exists(id)) {
      store.createWorkspace(id, {
        name: domain,
        domain,
        goal: `Ongoing attention to the ${domain} life domain.`,
        tags: [domain.toLowerCase()],
        agent: agentForDomain(domain),
        status: "active",
      });
      console.log(`[workspace] initialized: ${id}`);
    }

    // Idempotent: install default skills if not already present
    for (const skillId of DEFAULT_SKILLS) {
      installSkill(id, skillId);
    }
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Transition a workspace to a new lifecycle status.
 * @returns {{ ok, meta?, reason? }}
 */
function transitionLifecycle(id, toStatus) {
  const meta = store.getMeta(id);
  if (!meta.id) return { ok: false, reason: `Workspace '${id}' not found` };

  const check = validateTransition(meta.status, toStatus);
  if (!check.ok) return check;

  const updated = store.setMeta(id, { status: toStatus });
  store.appendLog(id, {
    type: "lifecycle_transition",
    actor: "system",
    data: { from: meta.status, to: toStatus },
  });

  return { ok: true, meta: updated };
}

// ── Post-turn enrichment ──────────────────────────────────────────────────────

/**
 * Called after every Monday turn that has a known domain.
 * Logs the exchange, syncs working theory, updates workspace memory.
 *
 * @param {object} opts
 *   opts.domain        - domain string ("Work", "Publishing", etc.)
 *   opts.userText      - Chris's input
 *   opts.mondayReply   - Monday's response text
 *   opts.workingTheory - current working theory from session
 *   opts.channel       - "sandbox" | "http" | "discord" | "slack"
 */
function theoryToString(theory) {
  if (!theory) return null;
  if (typeof theory === "string") return theory;
  return theory.statement || JSON.stringify(theory);
}

function processAfterTurn({ domain, userText, mondayReply, workingTheory, skillsUsed = [], channel = "sandbox" }) {
  if (!domain) return;

  const id = domain.toLowerCase();
  if (!store.exists(id)) {
    store.createWorkspace(id, {
      name: domain,
      domain,
      goal: `Ongoing attention to the ${domain} life domain.`,
      agent: agentForDomain(domain),
    });
  }

  // Log the exchange
  store.appendLog(id, {
    type: "turn",
    actor: "chris",
    channel,
    data: {
      user: userText?.slice(0, 300),
      monday: mondayReply?.slice(0, 600),
      skillsUsed: skillsUsed.length > 0 ? skillsUsed : undefined,
    },
  });

  // Sync working theory if updated
  const theoryStr = theoryToString(workingTheory);
  if (theoryStr) {
    const memory = store.getMemory(id);
    if (memory.workingTheory !== theoryStr) {
      store.setWorkingTheory(id, theoryStr);
      store.appendLog(id, {
        type: "theory_updated",
        actor: "monday",
        data: { theory: theoryStr },
      });
    }
  }
}

// ── Council sync ──────────────────────────────────────────────────────────────

/**
 * After a council agent produces a read, persist their theory to the workspace.
 * Called by convene.js after each agent run.
 */
function syncAgentTheory(domain, agentTheory) {
  if (!domain || !agentTheory) return;
  const id = domain.toLowerCase();
  if (!store.exists(id)) return;
  store.setWorkingTheory(id, theoryToString(agentTheory));
}

/**
 * Get workspace memory for an agent to use as context.
 * Returns a summary string suitable for inclusion in the agent's prompt.
 */
function getWorkspaceContext(domain) {
  if (!domain) return null;
  const id = domain.toLowerCase();
  if (!store.exists(id)) return null;

  const ws = store.getWorkspace(id);
  if (!ws) return null;

  const parts = [];

  if (ws.memory.workingTheory) {
    parts.push(`Working theory: ${theoryToString(ws.memory.workingTheory)}`);
  }
  if (ws.memory.context) {
    parts.push(`Context: ${ws.memory.context}`);
  }
  if (ws.memory.facts?.length) {
    parts.push(`Known facts:\n${ws.memory.facts.map((f) => `- ${f.key}: ${f.value}`).join("\n")}`);
  }
  if (ws.memory.decisions?.length) {
    parts.push(`Decisions made:\n${ws.memory.decisions.map((d) => `- ${d.key}: ${d.value}`).join("\n")}`);
  }
  if (ws.threads?.length) {
    parts.push(`Open threads:\n${ws.threads.slice(0, 4).map((t) => `- ${t.label || t.id} (${t.status})`).join("\n")}`);
  }

  return parts.length ? parts.join("\n\n") : null;
}

// ── Thread management ─────────────────────────────────────────────────────────

/**
 * Add or update a thread within a domain workspace.
 */
function upsertWorkspaceThread(domain, thread) {
  const id = domain.toLowerCase();
  if (!store.exists(id)) return null;
  return store.upsertThread(id, thread);
}

/**
 * Close a thread within a domain workspace.
 */
function closeWorkspaceThread(domain, threadId) {
  const id = domain.toLowerCase();
  if (!store.exists(id)) return;
  store.closeThread(id, threadId);
  store.appendLog(id, { type: "thread_closed", actor: "monday", data: { threadId } });
}

// ── Summary ───────────────────────────────────────────────────────────────────

/**
 * Get a lightweight summary of all active workspaces for the sandbox.
 */
function getWorkspaceSummaries() {
  return store.listWorkspaces({ status: "active" }).map((meta) => {
    const memory = store.getMemory(meta.id);
    const threads = store.getActiveThreads(meta.id);
    return {
      id: meta.id,
      name: meta.name,
      domain: meta.domain,
      status: meta.status,
      goal: meta.goal,
      agent: meta.agent,
      updatedAt: meta.updatedAt,
      workingTheory: memory.workingTheory || null,
      openThreadCount: threads.length,
      artifacts: artifactsForStage(meta.status),
    };
  });
}

module.exports = {
  initFromMissions,
  transitionLifecycle,
  processAfterTurn,
  syncAgentTheory,
  getWorkspaceContext,
  upsertWorkspaceThread,
  closeWorkspaceThread,
  getWorkspaceSummaries,
};
