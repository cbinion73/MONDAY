"use strict";

function extractReplyText(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("{")) return text;

  try {
    const parsed = JSON.parse(text);
    if (parsed?.reply) return String(parsed.reply).trim();
  } catch {
    const match = text.match(/"reply"\s*:\s*"([\s\S]*)/);
    if (!match) return text;

    let extracted = match[1];
    extracted = extracted.replace(/"\s*,\s*"followUp"[\s\S]*$/, "");
    extracted = extracted.replace(/"\s*,\s*"sources"[\s\S]*$/, "");
    extracted = extracted.replace(/"\s*\}\s*$/, "");
    extracted = extracted
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\");
    return extracted.trim();
  }

  return text;
}

function findScienceAdvisorSkillResult(skillResults = []) {
  return (
    (skillResults || []).find(
      (item) => item.skillId === "science-advisor" && item.ok && item.raw?.data?.reply
    ) || null
  );
}

function renderScienceAdvisorReply(skillResult) {
  const data = skillResult?.raw?.data || {};
  const reply = extractReplyText(data.reply);
  if (!reply) return "Reed didn't return a scientific advisory reply.";

  const sources = Array.isArray(data.sources) ? data.sources : [];
  if (sources.length === 0) return reply;

  const sourceLine = sources
    .slice(0, 3)
    .map((source) => `[${source.label}] ${source.title} — ${source.url}`)
    .join("\n");

  return `${reply}\n\nSources:\n${sourceLine}`;
}

module.exports = {
  findScienceAdvisorSkillResult,
  renderScienceAdvisorReply,
};
