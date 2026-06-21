"use strict";
// LLM-backed skill connectors.
// Uses the existing llm-router so model selection (Ollama/Claude) is automatic.

const { chatWithLLM } = require("../llm/llm-router");

async function summarize({ text, style = "bullets" } = {}) {
  if (!text) return { ok: false, error: "text is required" };

  const styleInstr =
    style === "bullets"
      ? "exactly three concise bullet points"
      : style === "brief"
      ? "one sentence"
      : "one short paragraph";

  const messages = [
    {
      role: "system",
      content:
        "You are Monday, a precise summarizer. Return only the summary with no preamble or explanation.",
    },
    {
      role: "user",
      content: `Summarize the following in ${styleInstr}:\n\n${text.slice(0, 4000)}`,
    },
  ];

  try {
    const reply = await chatWithLLM({ messages, temperature: 0.3 });
    return { ok: true, data: reply.trim() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function draftReply({ originalMessage, context = "" } = {}) {
  if (!originalMessage) return { ok: false, error: "originalMessage is required" };

  const contextLine = context ? `\n\nAdditional context: ${context}` : "";
  const messages = [
    {
      role: "system",
      content:
        "You are Monday, drafting a reply for Chris Binion. Write in first person as Chris. Be direct, warm, and brief — 2–4 sentences max. No subject line.",
    },
    {
      role: "user",
      content: `Draft a reply to this message:\n\n${originalMessage.slice(0, 2000)}${contextLine}`,
    },
  ];

  try {
    const reply = await chatWithLLM({ messages, temperature: 0.6 });
    return { ok: true, data: reply.trim() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { summarize, draftReply };
