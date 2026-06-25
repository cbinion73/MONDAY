"use strict";

const PRESET_KEYS = new Set(["website", "health", "travel", "denver", "transport", "quantum"]);

function attachArtifactPresentation(plan, { input = "", domain = null, skillResults = [] } = {}) {
  if (!plan?.shouldSurface) return plan;

  if (PRESET_KEYS.has(plan.artifactKey)) {
    return {
      ...plan,
      artifactRuntime: {
        mode: "preset",
        key: plan.artifactKey,
      },
    };
  }

  return {
    ...plan,
    artifactKey: plan.artifactKey || "dynamic-model",
    artifactRuntime: {
      mode: "dynamic",
      key: "dynamic-model",
      payload: buildDynamicArtifactPayload({ plan, input, domain, skillResults }),
    },
  };
}

function buildDynamicArtifactPayload({ plan, input = "", domain = null, skillResults = [] } = {}) {
  const topic = deriveTopic(input, domain, plan.sourceDomain);
  const sourceDomain = String(plan.sourceDomain || domain || "general").toLowerCase();
  const evidence = collectEvidence(skillResults);
  const insights = collectInsights(skillResults, plan);
  const focusCards = buildFocusCards(skillResults, sourceDomain);
  const metricCards = buildMetricCards(skillResults);

  const blocks = [];

  if (metricCards.length > 0) {
    blocks.push({
      type: "metric_strip",
      metrics: metricCards.slice(0, 4),
    });
  }

  blocks.push({
    type: "focus_grid",
    title: focusCards.length > 0 ? "Model Structure" : "What Monday Is Showing",
    cards: (focusCards.length > 0 ? focusCards : fallbackCards(sourceDomain, topic)).slice(0, 4),
  });

  if (insights.length > 0) {
    blocks.push({
      type: "insight_chips",
      title: "Key Insights",
      chips: insights.slice(0, 6),
    });
  }

  if (evidence.length > 0) {
    blocks.push({
      type: "evidence_list",
      title: "Source Evidence",
      items: evidence.slice(0, 8),
    });
  }

  blocks.push({
    type: "recommendation",
    title: "Why This Surface",
    body: plan.rationale || "Monday surfaced this because the structure makes the signal easier to see than prose alone.",
  });

  return {
    version: 1,
    kind: "adaptive-model",
    theme: "gold",
    title: titleCase(topic),
    eyebrow: `${titleCase(sourceDomain)} model`,
    summary: buildSummary(plan, sourceDomain, insights, skillResults),
    layout: "stack",
    blocks,
  };
}

function deriveTopic(input, domain, sourceDomain) {
  const cleaned = String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?.!]+$/, "");
  if (cleaned.length >= 6) return cleaned;
  if (domain) return `${domain} overview`;
  if (sourceDomain) return `${sourceDomain} overview`;
  return "Structured model";
}

function buildSummary(plan, sourceDomain, insights, skillResults) {
  const firstSummary = skillResults.find((item) => item.summary)?.summary;
  if (firstSummary) return firstSummary;
  if (insights.length > 0) return insights[0];
  return `Monday assembled a reusable ${sourceDomain} surface from the available evidence so the structure can be seen before it is explained.`;
}

function collectEvidence(skillResults) {
  const lines = [];
  for (const skill of skillResults || []) {
    for (const observation of skill.observations || []) {
      lines.push(cleanLine(observation));
    }
  }
  return unique(lines).filter(Boolean);
}

function collectInsights(skillResults, plan) {
  const lines = [];
  for (const skill of skillResults || []) {
    for (const pattern of skill.patterns || []) {
      lines.push(cleanLine(pattern));
    }
  }
  if (plan?.rationale) lines.push(cleanLine(plan.rationale));
  return unique(lines).filter(Boolean);
}

function buildFocusCards(skillResults, sourceDomain) {
  const cards = [];
  for (const skill of skillResults || []) {
    const label = humanizeSkillId(skill.skillId);
    const lead = skill.patterns?.[0] || skill.observations?.[0] || skill.summary;
    if (!lead) continue;
    cards.push({
      title: label,
      body: cleanLine(lead),
      meta: `${Math.round((skill.confidence || 0) * 100)}% confidence`,
    });
  }
  return cards.length > 0 ? cards : fallbackCards(sourceDomain);
}

function fallbackCards(sourceDomain, topic = "this thread") {
  switch (sourceDomain) {
    case "financial":
      return [
        { title: "Source", body: "Financial records and account activity", meta: "trusted inputs" },
        { title: "Signal", body: "Balances, spending drift, and rate of change", meta: "primary read" },
        { title: "Comparison", body: "Baseline against current movement", meta: "what changed" },
        { title: "Decision", body: "What Monday recommends next", meta: "action frame" },
      ];
    case "calendar":
      return [
        { title: "Source", body: "Calendar events and open windows", meta: "trusted inputs" },
        { title: "Signal", body: "Time load, conflict, and focus fragmentation", meta: "primary read" },
        { title: "Comparison", body: "What is fixed versus what can move", meta: "tradeoff frame" },
        { title: "Decision", body: "Schedule move or protection recommendation", meta: "action frame" },
      ];
    case "email":
      return [
        { title: "Source", body: "Message threads and extracted facts", meta: "trusted inputs" },
        { title: "Signal", body: "Commitments, risks, and pending replies", meta: "primary read" },
        { title: "Comparison", body: "Urgent versus merely noisy", meta: "sorting frame" },
        { title: "Decision", body: "What needs action now", meta: "action frame" },
      ];
    default:
      return [
        { title: "Source", body: `Monday gathered the most relevant evidence for ${topic}.`, meta: "trusted inputs" },
        { title: "Signal", body: "The model isolates the strongest signal first.", meta: "primary read" },
        { title: "Comparison", body: "Supporting factors are arranged beside the main claim.", meta: "explanatory order" },
        { title: "Decision", body: "The final block states the practical implication.", meta: "action frame" },
      ];
  }
}

function buildMetricCards(skillResults) {
  const cards = [];
  for (const skill of skillResults || []) {
    const pool = [...(skill.observations || []), ...(skill.patterns || [])];
    for (const line of pool) {
      const metric = extractMetricFromLine(line);
      if (metric) cards.push(metric);
      if (cards.length >= 4) return uniqueMetrics(cards);
    }
  }
  return uniqueMetrics(cards);
}

function uniqueMetrics(cards) {
  const seen = new Set();
  const results = [];
  for (const card of cards) {
    const key = `${card.value}|${card.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(card);
  }
  return results;
}

function extractMetricFromLine(line) {
  const text = cleanLine(line);
  const match = text.match(/(\$?\d[\d,]*(?:\.\d+)?%?)(?:\s+([A-Za-z][A-Za-z /-]{1,22}))?/);
  if (!match) return null;
  const value = match[1];
  const label = match[2] ? match[2].trim().replace(/[.,]+$/, "") : "Observed signal";
  return {
    value,
    label,
  };
}

function humanizeSkillId(value) {
  return String(value || "source")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(items) {
  return [...new Set(items)];
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

module.exports = {
  attachArtifactPresentation,
  buildDynamicArtifactPayload,
};
