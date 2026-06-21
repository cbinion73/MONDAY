"use strict";
// Agent contracts for Monday's invisible workers.
// Modeled on BMAD agent-contracts pattern.
// Workers are infrastructure — no names, no personalities, no direct user contact.

const CONTRACTS = {
  // ─── Research Worker ────────────────────────────────────────────────────────
  research: {
    id: "research",
    owns: "External information retrieval and synthesis",
    doesNotOwn: [
      "Deciding what to surface to the user",
      "Persisting memories",
      "Cross-domain synthesis",
      "Any direct user communication",
    ],
    requires: {
      query: "string — what to research",
      context: "optional object — domain context to focus the research",
    },
    returns: {
      findings: "array of { source, summary, relevance }",
      recommendation: "string — Monday-ready synthesis of the findings",
      confidence: "low | medium | high",
      hops: "number — how many ReAct iterations were needed",
    },
    qualityGates: [
      "Must complete at least one Thought-Action-Observation loop before returning",
      "Returns findings, not raw data — synthesize before surfacing",
      "Confidence must be honest — low if uncertain, not assumed high",
      "Never escalates beyond its brief without returning first",
    ],
    handoffTo: "synthesis",
    executionMode: "on-demand",
  },

  // ─── Memory Worker ─────────────────────────────────────────────────────────
  memory: {
    id: "memory",
    owns: "Persistent state: working theories, open threads, triage classification",
    doesNotOwn: [
      "Research or information retrieval",
      "Generating responses for the user",
      "Making significance judgments about new inputs (that is the engine's job)",
    ],
    requires: {
      operation: "read | write | upsert-thread | close-thread | classify-triage",
      domain: "optional — which of the six life domains",
      payload: "operation-specific data",
    },
    returns: {
      ok: "boolean",
      data: "the read result, or confirmation of write",
    },
    qualityGates: [
      "Writes are idempotent — writing the same data twice has no side effects",
      "Never deletes unless explicitly instructed with closeThread",
      "Triage classification uses the significance resolver rules, not heuristics",
      "Working theory revisions preserve the revision history (last 10)",
    ],
    handoffTo: null, // Memory Worker does not hand off; called by others
    executionMode: "on-demand",
  },

  // ─── Synthesis Worker ───────────────────────────────────────────────────────
  synthesis: {
    id: "synthesis",
    owns: "Cross-domain pattern detection and theory revision",
    doesNotOwn: [
      "Research or information retrieval",
      "Persisting findings (it returns them; Memory Worker persists)",
      "Direct user communication",
      "Deciding whether to interrupt the user",
    ],
    requires: {
      threads: "array of active threads from state-store",
      theories: "object of current working theories per domain",
      recentCaptures: "array of recent personal captures",
      triggerLoop: "which heartbeat loop triggered this — hourly | weekly | monthly",
    },
    returns: {
      observations: "array of { domain, observation, confidence, ripeness }",
      theoryRevisions: "array of { domain, oldTheory, newTheory, reason }",
      shouldSurface: "boolean — did any observation pass all ripeness gates?",
      surfacePayload: "the observation(s) to deliver if shouldSurface is true",
    },
    qualityGates: [
      "Returns observations, not certainties — mark confidence honestly",
      "Ripeness gate: an observation must pass evidence, time, context, and proportionality",
      "Never surfaces more than two observations at once — prioritize ruthlessly",
      "Theory revision must explain WHY the theory changed",
      "If nothing passes the ripeness gate, shouldSurface is false — silence is valid",
    ],
    handoffTo: "memory", // Synthesis results → Memory Worker persists them
    executionMode: "scheduled",
  },
};

const RIPENESS_GATES = {
  evidence: {
    description: "Has this pattern appeared enough times?",
    minimumOccurrences: 3,
  },
  time: {
    description: "Has enough time elapsed since the last observation?",
    minimumHoursBetweenSurfaces: 18,
  },
  context: {
    description: "Is now the right moment given what else is happening?",
    blockedDuring: ["high-urgency-thread-active", "user-in-conversation"],
  },
  proportionality: {
    description: "Is this level of intervention appropriate?",
    requiresHumanCompanyBoundary: false, // set true for identity/shame/grief topics
  },
};

const AUTONOMY_TIERS = {
  0: { name: "silent", description: "Observe, store, update internal state. No output." },
  1: { name: "notify", description: "Surface an observation. No action implied." },
  2: { name: "suggest", description: "Offer a concrete next step. Wait for confirmation." },
  3: { name: "delegate", description: "Execute after receiving explicit approval." },
  4: { name: "blocked", description: "Requires human initiation. Monday never starts this." },
};

function getContract(workerId) {
  return CONTRACTS[workerId] || null;
}

function getAllContracts() {
  return CONTRACTS;
}

function validateWorkerOutput(workerId, output) {
  const contract = CONTRACTS[workerId];
  if (!contract) return { valid: false, reason: `Unknown worker: ${workerId}` };

  const required = Object.keys(contract.returns);
  const missing = required.filter((key) => !(key in output));
  if (missing.length > 0) {
    return { valid: false, reason: `Missing required output fields: ${missing.join(", ")}` };
  }

  return { valid: true };
}

function checkRipeness(observation) {
  const issues = [];

  if ((observation.occurrences || 0) < RIPENESS_GATES.evidence.minimumOccurrences) {
    issues.push("evidence: insufficient occurrences");
  }

  const hoursSinceLast = observation.hoursSinceLastSurface;
  if (hoursSinceLast !== undefined && hoursSinceLast < RIPENESS_GATES.time.minimumHoursBetweenSurfaces) {
    issues.push(`time: only ${Math.round(hoursSinceLast)}h since last surface (need 18h)`);
  }

  return {
    passes: issues.length === 0,
    issues,
  };
}

module.exports = {
  CONTRACTS,
  RIPENESS_GATES,
  AUTONOMY_TIERS,
  getContract,
  getAllContracts,
  validateWorkerOutput,
  checkRipeness,
};
