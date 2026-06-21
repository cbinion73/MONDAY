"use strict";
// Workspace lifecycle — BMAD-inspired mission lifecycle states.
// Each workspace moves through stages with explicit transitions and artifact sets.

const STAGES = {
  intake:    { label: "Intake",    description: "Mission identified, not yet defined" },
  planning:  { label: "Planning",  description: "Goal and approach being established" },
  active:    { label: "Active",    description: "In progress, regular activity" },
  paused:    { label: "Paused",    description: "Intentionally paused — will resume" },
  complete:  { label: "Complete",  description: "Goal achieved, wrapping up" },
  archived:  { label: "Archived",  description: "Closed — no further activity expected" },
};

// Which transitions are valid
const VALID_TRANSITIONS = {
  intake:   ["planning", "active", "archived"],
  planning: ["active", "paused", "archived"],
  active:   ["paused", "complete", "archived"],
  paused:   ["active", "archived"],
  complete: ["archived", "active"],
  archived: [],
};

// BMAD artifact checklist per stage
const BMAD_ARTIFACTS = {
  intake:   [],
  planning: ["mission-brief"],
  active:   ["mission-brief", "goal-statement", "open-threads"],
  paused:   ["pause-note"],
  complete: ["mission-brief", "goal-statement", "retrospective"],
  archived: [],
};

// Which council agent is the primary steward per domain
const DOMAIN_AGENT = {
  Health:      "thor",
  Publishing:  "wanda",
  Retirement:  "vision",
  Family:      "steve",
  Faith:       "strange",
  Work:        "fury",
};

/**
 * Validate a lifecycle transition.
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateTransition(fromStatus, toStatus) {
  const allowed = VALID_TRANSITIONS[fromStatus];
  if (!allowed) return { ok: false, reason: `Unknown status: ${fromStatus}` };
  if (!allowed.includes(toStatus)) {
    return {
      ok: false,
      reason: `Cannot transition from '${fromStatus}' to '${toStatus}'. Allowed: ${allowed.join(", ") || "none"}`,
    };
  }
  return { ok: true };
}

/**
 * Return the artifacts expected (but not required) at this stage.
 */
function artifactsForStage(status) {
  return BMAD_ARTIFACTS[status] || [];
}

/**
 * Return the primary council agent for a domain.
 */
function agentForDomain(domain) {
  return DOMAIN_AGENT[domain] || null;
}

module.exports = {
  STAGES,
  VALID_TRANSITIONS,
  BMAD_ARTIFACTS,
  DOMAIN_AGENT,
  validateTransition,
  artifactsForStage,
  agentForDomain,
};
