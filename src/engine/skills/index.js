"use strict";
const { getAllSkills, getSkill, getSkillsByCategory, isSkillTrusted } = require("./registry");
const { executeSkill, TIER_NAMES } = require("./executor");
const { installSkill, removeSkill, listSkillsForWorkspace, setAutonomyTier } = require("./installer");

module.exports = {
  // Registry
  getAllSkills,
  getSkill,
  getSkillsByCategory,
  isSkillTrusted,
  // Execution
  executeSkill,
  TIER_NAMES,
  // Workspace management
  installSkill,
  removeSkill,
  listSkillsForWorkspace,
  setAutonomyTier,
};
