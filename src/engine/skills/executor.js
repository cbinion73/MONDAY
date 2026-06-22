"use strict";
// Skill Executor — runs a skill through the full trust gate:
//   1. Registry check  — skill must exist in the hardcoded allowlist
//   2. Trust check     — skill.trusted must be true
//   3. Workspace check — skill must be in workspace tools.allowed
//   4. Autonomy tier   — skill tier must not exceed workspace tier
//   5. Execute         — call the handler
//   6. Log             — append to workspace log

const { getSkill, isSkillTrusted } = require("./registry");
const store = require("../workspace/workspace-store");

const TIER_NAMES = ["think", "research", "prepare", "send", "autonomous"];

// Handler dispatch — lazy require keeps startup fast.
// Phase 4 browser/notification skills use capability-abstracted connectors —
// swap the connector file to change the implementation without touching skill logic.
const HANDLERS = {
  "calendar-read":     (p) => require("../connectors/calendar").read(p),
  "documents-read":    (p) => require("../connectors/documents").read(p),
  "email-read":        (p) => require("../connectors/email").read(p),
  "travel-plan":       (p, ctx) => require("../connectors/travel-plan").planTrip({ ...p, ...ctx }),
  "financial-read":    (p) => require("../connectors/financial").read(p),
  "web-fetch":         (p) => require("../connectors/web").fetchUrl(p),
  "browser-search":    (p) => require("../connectors/browser-search").search(p),
  "browser-read":      (p) => require("../connectors/browser-read").readUrl(p),
  "browser-open":      (p) => require("../connectors/browser-open").openUrl(p),
  "summarize":         (p) => require("../connectors/llm-connector").summarize(p),
  "draft-reply":       (p) => require("../connectors/llm-connector").draftReply(p),
  "send-imessage":     (p) => require("../channels/imessage").sendViaiMessage(p.message, { phone: p.phone }),
  "notification-send": (p) => require("../connectors/notification").sendNotification(p),
};

/**
 * Execute a skill with full trust-gate enforcement.
 *
 * @param {string} skillId
 * @param {object} params      — skill-specific input params
 * @param {object} opts
 *   opts.workspaceId  — if provided, checks workspace allowed list + tier
 *   opts.domain       — domain string for logging context
 *   opts.channel      — channel string ("sandbox" | "http" | etc.)
 *   opts.bypassTier   — skip tier check (for sandbox test execution only)
 */
async function executeSkill(skillId, params = {}, { workspaceId = null, domain = null, channel = "sandbox", senderId = null, bypassTier = false } = {}) {
  // 1. Registry
  const skill = getSkill(skillId);
  if (!skill) {
    return { ok: false, error: `Unknown skill: ${skillId}. Add it to skills/registry.js to enable it.` };
  }

  // 2. Trust gate
  if (!isSkillTrusted(skillId)) {
    return { ok: false, error: `Skill "${skillId}" is not in the trusted allowlist.` };
  }

  // 3 & 4. Workspace checks (optional — if no workspace, only the registry gate applies)
  if (workspaceId) {
    const ws = store.getWorkspace(workspaceId);
    if (ws) {
      const allowed = ws.tools?.allowed || [];
      if (!allowed.includes(skillId)) {
        return {
          ok: false,
          error: `Skill "${skillId}" is not installed in workspace "${workspaceId}". Install it first.`,
          notInstalled: true,
        };
      }

      if (!bypassTier) {
        const workspaceTier = ws.tools?.autonomyTier ?? 1;
        if (skill.autonomyTier > workspaceTier) {
          return {
            ok: false,
            error: `Skill "${skillId}" requires autonomy tier ${skill.autonomyTier} (${TIER_NAMES[skill.autonomyTier]}) but workspace "${workspaceId}" is capped at tier ${workspaceTier} (${TIER_NAMES[workspaceTier]}).`,
            tierBlocked: true,
            requiredTier: skill.autonomyTier,
            workspaceTier,
          };
        }
      }
    }
  }

  // 5. Execute
  const handler = HANDLERS[skillId];
  if (!handler) {
    return { ok: false, error: `No handler registered for skill: ${skillId}` };
  }

  const startMs = Date.now();
  let result;
  try {
    result = await handler(params, { workspaceId, domain, channel, senderId });
  } catch (err) {
    result = { ok: false, error: err.message };
  }
  const ms = Date.now() - startMs;

  // 6. Log to workspace
  if (workspaceId && store.exists(workspaceId)) {
    store.appendLog(workspaceId, {
      type: "skill_executed",
      actor: "monday",
      data: {
        skillId,
        params: sanitizeParams(skillId, params),
        ms,
        ok: result?.ok !== false,
        channel,
      },
    });
  }

  return { ok: result?.ok !== false, skillId, result, ms };
}

function sanitizeParams(skillId, params) {
  const safe = { ...params };
  // Don't log full text bodies — truncate
  if (safe.text && safe.text.length > 200) safe.text = safe.text.slice(0, 200) + "…";
  if (safe.originalMessage && safe.originalMessage.length > 200) safe.originalMessage = safe.originalMessage.slice(0, 200) + "…";
  if (safe.message && skillId === "send-imessage" && safe.message.length > 100) safe.message = safe.message.slice(0, 100) + "…";
  return safe;
}

module.exports = { executeSkill, TIER_NAMES };
