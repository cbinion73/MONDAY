"use strict";
// Skill Installer — manages which skills are installed per workspace.
// Only skills in the registry can be installed. There is no way to install
// an unlisted or untrusted skill.

const { getSkill, getAllSkills, isSkillTrusted } = require("./registry");
const store = require("../workspace/workspace-store");

/**
 * Install a skill into a workspace's allowed list.
 * Idempotent — calling install on an already-installed skill is a no-op.
 */
function installSkill(workspaceId, skillId) {
  const skill = getSkill(skillId);
  if (!skill) return { ok: false, error: `Unknown skill: ${skillId}` };
  if (!isSkillTrusted(skillId)) return { ok: false, error: `Skill "${skillId}" is not trusted` };
  if (!store.exists(workspaceId)) return { ok: false, error: `Workspace "${workspaceId}" not found` };

  const tools = store.getTools(workspaceId);
  if (tools.allowed.includes(skillId)) {
    return { ok: true, alreadyInstalled: true };
  }

  tools.allowed.push(skillId);
  store.setTools(workspaceId, tools);
  store.appendLog(workspaceId, {
    type: "skill_installed",
    actor: "monday",
    data: { skillId, skillName: skill.name, category: skill.category },
  });
  return { ok: true };
}

/**
 * Remove a skill from a workspace's allowed list.
 * Idempotent — removing a skill that isn't installed is a no-op.
 */
function removeSkill(workspaceId, skillId) {
  if (!store.exists(workspaceId)) return { ok: false, error: `Workspace "${workspaceId}" not found` };

  const tools = store.getTools(workspaceId);
  const idx = tools.allowed.indexOf(skillId);
  if (idx === -1) return { ok: true, notInstalled: true };

  tools.allowed.splice(idx, 1);
  store.setTools(workspaceId, tools);
  store.appendLog(workspaceId, {
    type: "skill_removed",
    actor: "monday",
    data: { skillId },
  });
  return { ok: true };
}

/**
 * List all registry skills with install status for a given workspace.
 */
function listSkillsForWorkspace(workspaceId) {
  const allSkills = getAllSkills();
  if (!workspaceId || !store.exists(workspaceId)) {
    return allSkills.map((s) => ({ ...s, installed: false, blocked: false }));
  }

  const tools = store.getTools(workspaceId);
  const allowed = tools.allowed || [];
  const blocked = tools.blocked || [];

  return allSkills.map((s) => ({
    ...s,
    installed: allowed.includes(s.id),
    blocked: blocked.includes(s.id),
  }));
}

/**
 * Set the autonomy tier for a workspace (0–3).
 * Tier 4 is blocked; don't set it manually — block individual skills instead.
 */
function setAutonomyTier(workspaceId, tier) {
  if (!store.exists(workspaceId)) return { ok: false, error: `Workspace "${workspaceId}" not found` };
  const n = Number(tier);
  if (isNaN(n) || n < 0 || n > 3) {
    return { ok: false, error: `Invalid tier ${tier}. Must be 0–3.` };
  }

  const tools = store.getTools(workspaceId);
  const prev = tools.autonomyTier;
  tools.autonomyTier = n;
  store.setTools(workspaceId, tools);
  store.appendLog(workspaceId, {
    type: "autonomy_tier_changed",
    actor: "monday",
    data: { from: prev, to: n },
  });
  return { ok: true, tier: n };
}

module.exports = { installSkill, removeSkill, listSkillsForWorkspace, setAutonomyTier };
