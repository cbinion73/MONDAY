"use strict";

const store = require("./mission-store");
const { getRequiredDocs, getGateMissingDocs, nextStage, getType } = require("./mission-types");

// ── ID generation ─────────────────────────────────────────────────────────────

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function generateId(title) {
  const base = slugify(title);
  const suffix = Date.now().toString(36).slice(-4);
  return `${base}-${suffix}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Document templates ────────────────────────────────────────────────────────

function missionBriefTemplate({ title, type, domain, seedTheory = "" }) {
  const typeLabel = getType(type)?.label || type;
  return `# Mission Brief: ${title}

**Type:** ${typeLabel}
**Domain:** ${domain}
**Stage:** Intake
**Created:** ${today()}

## Goal
${seedTheory || "[What this mission is trying to accomplish]"}

## Context
[Why this matters now]

## Success Looks Like
[How we'll know this mission is complete]

## Open Questions
[What needs to be resolved before we can plan]
`;
}

function workingTheoryTemplate({ title, seedTheory = "" }) {
  return `# Working Theory: ${title}

**Current Theory:**
${seedTheory || "[Monday's current best understanding of this mission]"}

**Confidence:** 0.50

**Evidence:**
- [No evidence collected yet]

**Last Updated:** ${today()}
`;
}

function contradictionsTemplate() {
  return `# Contradiction Log

*Tensions between stated values and observed behavior. Monday tracks these — not to judge, but to surface.*

*(No contradictions recorded yet)*
`;
}

function opportunitiesTemplate() {
  return `# Opportunity Log

*Ideas, possibilities, and emerging threads worth watching.*

*(No opportunities recorded yet)*
`;
}

function strategyTemplate({ title }) {
  return `# Strategy: ${title}

## Direction
[The overall approach]

## Key Decisions
[Decisions already made]

## Constraints
[What we're working within]

## Next Step
[The single most important thing to do right now]
`;
}

function decisionLogTemplate() {
  return `# Decision Log

*Record of significant decisions made during this mission.*

*(No decisions recorded yet)*
`;
}

function outlineTemplate({ title }) {
  return `# Outline: ${title}

## Core Argument / Premise
[What this is really about]

## Structure
1. [Chapter/Section 1]
2. [Chapter/Section 2]
3. [Chapter/Section 3]

## Key Ideas
- [Idea 1]
- [Idea 2]
`;
}

function draftPlanTemplate({ title }) {
  return `# Draft Plan: ${title}

## Target Reader
[Who this is for]

## Timeline
[When this will be drafted]

## Draft Milestones
- [ ] Outline complete
- [ ] First draft
- [ ] Revision
- [ ] Final
`;
}

function prdTemplate({ title }) {
  return `# Product Requirements: ${title}

## Problem
[What problem this solves]

## Users
[Who this is for]

## Requirements
- [Req 1]

## Non-Goals
[What this explicitly does not do]
`;
}

function archTemplate({ title }) {
  return `# Architecture: ${title}

## Components
[Key components and their responsibilities]

## Data Flow
[How data moves through the system]

## Key Decisions
[Architectural decisions and rationale]
`;
}

function implTemplate() {
  return `# Implementation Notes

## In Progress
- [ ] [Task 1]

## Completed
*(None yet)*

## Blocked
*(None)*
`;
}

function testTemplate() {
  return `# Test Plan

## Coverage Goals
[What needs to be tested]

## Test Cases
- [ ] [Test 1]

## Acceptance Criteria
[What "done" looks like]
`;
}

function retroTemplate({ title }) {
  return `# Retro: ${title}

## What Worked
[Things that went well]

## What Didn't
[Things that didn't go as expected]

## Lessons
[What to carry forward]

## Outcome
[Did this mission accomplish what it set out to do?]
`;
}

// ── Doc template registry ─────────────────────────────────────────────────────

const DOC_TEMPLATES = {
  "mission-brief.md": missionBriefTemplate,
  "working-theory.md": workingTheoryTemplate,
  "contradictions.md": () => contradictionsTemplate(),
  "opportunities.md": () => opportunitiesTemplate(),
  "strategy.md": strategyTemplate,
  "decision-log.md": () => decisionLogTemplate(),
  "outline.md": outlineTemplate,
  "draft-plan.md": draftPlanTemplate,
  "prd.md": prdTemplate,
  "arch.md": archTemplate,
  "impl.md": () => implTemplate(),
  "test.md": () => testTemplate(),
  "retro.md": retroTemplate,
};

function generateDoc(docName, context) {
  const tmpl = DOC_TEMPLATES[docName];
  if (!tmpl) return `# ${docName}\n\n[Document pending]\n`;
  return tmpl(context);
}

// ── Core operations ───────────────────────────────────────────────────────────

function createMission({ title, domain, type = "personal", seedTheory = "" }) {
  const id = generateId(title);
  const meta = store.createMission({ id, title, domain, type, stage: "intake" });

  const context = { title, type, domain, seedTheory };
  for (const docName of getRequiredDocs(type)) {
    store.setDoc(id, docName, generateDoc(docName, context));
  }

  console.log(`[mission-engine] created: ${id} (${type}/${domain})`);
  return meta;
}

function advanceMission(id) {
  const meta = store.getMeta(id);
  if (!meta) return { ok: false, reason: `Mission '${id}' not found` };

  const to = nextStage(meta.stage);
  if (!to) return { ok: false, reason: `Mission is already at final stage: ${meta.stage}` };

  const existingDocs = store.listDocs(id);
  const missing = getGateMissingDocs(meta.type, meta.stage, to, existingDocs);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Cannot advance — missing required documents: ${missing.join(", ")}`,
      missing,
    };
  }

  const updated = store.setMeta(id, { stage: to });
  console.log(`[mission-engine] advanced: ${id} → ${to}`);
  return { ok: true, meta: updated, from: meta.stage, to };
}

function updateWorkingTheory(id, { statement, confidence, evidence = [] }) {
  const meta = store.getMeta(id);
  if (!meta) return null;

  const evidenceBullets = evidence.length
    ? evidence.map((e) => `- ${e}`).join("\n")
    : "- [No evidence collected yet]";

  const content = `# Working Theory: ${meta.title}

**Current Theory:**
${statement}

**Confidence:** ${Number(confidence).toFixed(2)}

**Evidence:**
${evidenceBullets}

**Last Updated:** ${today()}
`;

  store.setDoc(id, "working-theory.md", content);
  return content;
}

function addContradiction(id, { claim, observed, status = "Unresolved" }) {
  const existing = store.getDoc(id, "contradictions.md") || "";
  const base = existing.includes("*(No contradictions recorded yet)*")
    ? existing.replace("\n*(No contradictions recorded yet)*", "")
    : existing;

  const entry = `\n## ${claim}\n- **Observed:** ${observed}\n- **Status:** ${status}\n- **Detected:** ${today()}\n\n---`;
  store.setDoc(id, "contradictions.md", base.trimEnd() + "\n" + entry + "\n");
}

function addOpportunity(id, { title, description, domain = "" }) {
  const existing = store.getDoc(id, "opportunities.md") || "";
  const base = existing.includes("*(No opportunities recorded yet)*")
    ? existing.replace("\n*(No opportunities recorded yet)*", "")
    : existing;

  const entry = `\n## [${today()}] ${title}\n- **Domain:** ${domain || "General"}\n- **Description:** ${description}\n- **Status:** Watching\n\n---`;
  store.setDoc(id, "opportunities.md", base.trimEnd() + "\n" + entry + "\n");
}

function updateDoc(id, docName, content) {
  if (!store.getMeta(id)) return { ok: false, reason: "Mission not found" };
  store.setDoc(id, docName, content);
  store.setMeta(id, {}); // touch updatedAt
  return { ok: true };
}

// ── Proactive mission detection ───────────────────────────────────────────────
// Looks at workspace turn history for recurring mission-level language.
// No LLM call — pure pattern counting.

const MISSION_SIGNALS = [
  /\b(mission|project|initiative|plan|goal|strategy|venture|campaign)\b/i,
  /\b(retirement|book|business|ministry|startup|launch|scout|curriculum)\b/i,
  /\b(building|starting|creating|launching|planning|developing|pursuing)\b/i,
  /\b(I want to|I need to|I've been thinking about|I keep coming back to)\b/i,
];

function detectMissionOpportunity(domain, turnHistory = []) {
  if (!turnHistory || turnHistory.length < 8) return { suggested: false };

  let hits = 0;
  const snippets = [];

  for (const turn of turnHistory.slice(-40)) {
    const text = (turn.data?.user || "") + " " + (turn.data?.monday || "");
    const matched = MISSION_SIGNALS.some((p) => p.test(text));
    if (matched) {
      hits++;
      if (snippets.length < 3 && turn.data?.user) {
        snippets.push(turn.data.user.slice(0, 100));
      }
    }
  }

  if (hits < 6) return { suggested: false };

  return {
    suggested: true,
    domain,
    hits,
    reason: `${hits} turns in the ${domain} domain carry mission-level signal`,
    snippets,
    suggestedTitle: `${domain} Mission`,
    suggestedType: domainToType(domain),
  };
}

function domainToType(domain) {
  const map = {
    Family: "family",
    Faith: "faith",
    Health: "personal",
    Publishing: "project",
    Retirement: "personal",
    Work: "business",
  };
  return map[domain] || "personal";
}

module.exports = {
  createMission,
  advanceMission,
  updateWorkingTheory,
  addContradiction,
  addOpportunity,
  updateDoc,
  detectMissionOpportunity,
};
