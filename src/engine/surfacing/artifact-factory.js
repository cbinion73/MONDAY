"use strict";

const PRESET_KEYS = new Set(["website", "health", "travel", "denver", "transport", "quantum"]);

function attachArtifactPresentation(plan, { input = "", domain = null, skillResults = [] } = {}) {
  if (!plan?.shouldSurface) return plan;

  if (plan.artifactKey === "website") {
    const websitePayload = buildWebsitePayload({ plan, input, domain, skillResults });
    if (!websitePayload) {
      return {
        ...plan,
        artifactRuntime: null,
      };
    }
    return {
      ...plan,
      artifactRuntime: {
        mode: "dynamic",
        key: "website",
        payload: websitePayload,
      },
    };
  }

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
  const sources = collectResearchSources(skillResults);
  const confidence = summarizeConfidence(skillResults);
  const recommendation = buildRecommendation(plan, skillResults, sourceDomain);
  const kind = inferDynamicKind({ sourceDomain, skillResults, sources, plan });

  const blocks = [];

  if (kind === "research") {
    if (sources.length > 0) {
      blocks.push({
        type: "source_list",
        title: "Sources",
        items: sources.slice(0, 6),
      });
    }
    if (insights.length > 0) {
      blocks.push({
        type: "insight_chips",
        title: "What surfaced",
        chips: insights.slice(0, 6),
      });
    }
    if (evidence.length > 0) {
      blocks.push({
        type: "evidence_list",
        title: "Supporting evidence",
        items: evidence.slice(0, 8),
      });
    }
    blocks.push({
      type: "recommendation",
      title: "Recommendation",
      body: recommendation,
    });
  } else {
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
      title: kind === "deliverable" ? "Why this brief" : "Why This Surface",
      body: recommendation,
    });
  }

  return {
    version: 1,
    kind,
    theme: "gold",
    title: titleCase(topic),
    eyebrow: `${titleCase(sourceDomain)} ${kind === "research" ? "research" : "model"}`,
    summary: buildSummary(plan, sourceDomain, insights, skillResults),
    confidence,
    recommendation,
    sources,
    layout: "stack",
    blocks,
  };
}

function buildWebsitePayload({ plan, input = "", domain = null, skillResults = [] } = {}) {
  const browserRead = skillResults.find((skill) => skill.skillId === "browser-read" && skill.raw?.ok && skill.raw?.url);
  const browserSearch = skillResults.find(
    (skill) => skill.skillId === "browser-search" && skill.raw?.ok && Array.isArray(skill.raw?.data) && skill.raw.data.length > 0
  );

  const primary =
    (browserRead
      ? {
          title: browserRead.raw.title || browserRead.summary || "Surfaced website",
          url: browserRead.raw.url,
          snippet: browserRead.summary || truncateText(browserRead.raw.data, 220),
        }
      : null) ||
    (browserSearch
      ? {
          title: browserSearch.raw.data[0].title || "Surfaced website",
          url: browserSearch.raw.data[0].url,
          snippet: browserSearch.raw.data[0].snippet || browserSearch.summary || "",
        }
      : null);

  if (!primary?.url) return null;

  return {
    version: 1,
    kind: "website",
    title: primary.title,
    url: primary.url,
    reason: plan?.rationale || "Monday found a live source worth putting on the table.",
    summary: cleanLine(primary.snippet || ""),
    nextAction: buildWebsiteNextAction(input, domain),
    sources: collectResearchSources(skillResults).slice(0, 4),
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

function inferDynamicKind({ sourceDomain, skillResults, sources, plan }) {
  const skillIds = new Set((skillResults || []).map((skill) => skill.skillId));
  if (sources.length > 0 || skillIds.has("browser-search") || skillIds.has("browser-read")) return "research";
  if (sourceDomain === "documents" || sourceDomain === "travel") return "deliverable";
  if (plan?.artifactType === "model_display") return "evidence";
  return "adaptive-model";
}

function summarizeConfidence(skillResults) {
  const values = (skillResults || [])
    .map((skill) => Number(skill.confidence || skill.resultConfidence || 0))
    .filter(Boolean);
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function buildRecommendation(plan, skillResults, sourceDomain) {
  const bestPattern = (skillResults || []).flatMap((skill) => skill.patterns || []).find(Boolean);
  const bestSummary = (skillResults || []).map((skill) => skill.summary).find(Boolean);
  if (plan?.rationale && bestPattern) return `${cleanLine(bestPattern)} ${cleanLine(plan.rationale)}`;
  if (plan?.rationale) return cleanLine(plan.rationale);
  if (bestPattern) return cleanLine(bestPattern);
  if (bestSummary) return cleanLine(bestSummary);
  return `Monday surfaced this ${sourceDomain} material because the evidence is easier to judge when it is visible.`;
}

function buildWebsiteNextAction(input = "", domain = null) {
  const text = `${input} ${domain || ""}`.toLowerCase();
  if (/\b(book|reserve|buy|rent|checkout|vendor|compare)\b/.test(text)) {
    return "Check the details, then decide whether Monday should help you act on it.";
  }
  if (/\b(map|route|travel|trip|itinerary)\b/.test(text)) {
    return "Confirm the relevant details, then fold them into the live plan.";
  }
  return "Review the source directly, then decide whether it changes the next move.";
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

function collectResearchSources(skillResults) {
  const items = [];
  for (const skill of skillResults || []) {
    if (skill.skillId === "browser-search" && Array.isArray(skill.raw?.data)) {
      for (const result of skill.raw.data) {
        if (!result?.url) continue;
        items.push({
          title: result.title || result.url,
          url: result.url,
          snippet: cleanLine(result.snippet || ""),
          source: "Search result",
        });
      }
    }

    if (skill.skillId === "browser-read" && skill.raw?.url) {
      items.push({
        title: skill.raw.title || skill.raw.url,
        url: skill.raw.url,
        snippet: cleanLine(skill.summary || truncateText(skill.raw.data, 220)),
        source: "Read source",
      });
    }
  }

  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.url}|${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function truncateText(value, limit = 220) {
  const text = cleanLine(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
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
