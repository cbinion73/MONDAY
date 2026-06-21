"use strict";

// Mission types — each domain of life has different artifacts and gate criteria.
// Do NOT force every mission through enterprise paperwork.

const MISSION_TYPES = {
  personal: {
    label: "Personal",
    description: "Individual growth, habits, identity, and personal goals",
    requiredDocs: ["mission-brief.md", "strategy.md", "decision-log.md"],
    gateRules: {
      "intake→planning": ["mission-brief.md"],
      "planning→active": ["mission-brief.md", "strategy.md"],
      "active→complete": ["mission-brief.md", "strategy.md", "retro.md"],
    },
  },
  family: {
    label: "Family",
    description: "Family relationships, parenting, marriage, extended family",
    requiredDocs: ["mission-brief.md", "strategy.md", "decision-log.md"],
    gateRules: {
      "intake→planning": ["mission-brief.md"],
      "planning→active": ["mission-brief.md", "strategy.md"],
      "active→complete": ["mission-brief.md", "retro.md"],
    },
  },
  faith: {
    label: "Faith",
    description: "Spiritual growth, ministry, calling, and practices",
    requiredDocs: ["mission-brief.md"],
    gateRules: {
      "intake→planning": ["mission-brief.md"],
      "planning→active": ["mission-brief.md"],
      "active→complete": ["mission-brief.md"],
    },
  },
  business: {
    label: "Business",
    description: "Ventures, consulting, products, and commercial initiatives",
    requiredDocs: ["mission-brief.md", "strategy.md", "decision-log.md"],
    gateRules: {
      "intake→planning": ["mission-brief.md"],
      "planning→active": ["mission-brief.md", "strategy.md"],
      "active→complete": ["mission-brief.md", "strategy.md", "retro.md"],
    },
  },
  product: {
    label: "Product",
    description: "Software products, apps, platforms, and technical systems",
    requiredDocs: ["mission-brief.md", "prd.md", "arch.md", "impl.md", "test.md", "retro.md"],
    gateRules: {
      "intake→planning": ["mission-brief.md"],
      "planning→active": ["mission-brief.md", "prd.md", "arch.md"],
      "active→complete": ["mission-brief.md", "prd.md", "arch.md", "impl.md", "test.md", "retro.md"],
    },
  },
  project: {
    label: "Project",
    description: "Books, creative works, publications, and one-time endeavors",
    requiredDocs: ["mission-brief.md", "outline.md", "draft-plan.md", "retro.md"],
    gateRules: {
      "intake→planning": ["mission-brief.md"],
      "planning→active": ["mission-brief.md", "outline.md"],
      "active→complete": ["mission-brief.md", "outline.md", "draft-plan.md", "retro.md"],
    },
  },
};

// Every mission gets these regardless of type — they are Monday's institutional memory
const UNIVERSAL_DOCS = ["working-theory.md", "contradictions.md", "opportunities.md"];

const LIFECYCLE_STAGES = ["intake", "planning", "active", "complete", "archived"];

function getType(typeId) {
  return MISSION_TYPES[typeId] || null;
}

function getRequiredDocs(typeId) {
  const type = MISSION_TYPES[typeId];
  if (!type) return [...UNIVERSAL_DOCS];
  return [...UNIVERSAL_DOCS, ...type.requiredDocs];
}

function getGateMissingDocs(typeId, fromStage, toStage, existingDocs) {
  const type = MISSION_TYPES[typeId];
  if (!type) return [];
  const key = `${fromStage}→${toStage}`;
  const required = type.gateRules[key] || [];
  const allRequired = [...UNIVERSAL_DOCS, ...required];
  return allRequired.filter((doc) => !existingDocs.includes(doc));
}

function nextStage(currentStage) {
  const idx = LIFECYCLE_STAGES.indexOf(currentStage);
  if (idx < 0 || idx >= LIFECYCLE_STAGES.length - 1) return null;
  return LIFECYCLE_STAGES[idx + 1];
}

module.exports = {
  MISSION_TYPES,
  UNIVERSAL_DOCS,
  LIFECYCLE_STAGES,
  getType,
  getRequiredDocs,
  getGateMissingDocs,
  nextStage,
};
