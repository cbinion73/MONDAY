// Unified LLM router: OpenAI → Claude → Ollama (first key found wins).
// All use the same prompt format (system + user messages array).

const { chatWithOllama } = require("./ollama-provider");

const CLAUDE_BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const CLAUDE_MODEL = process.env.MONDAY_CLAUDE_MODEL || "claude-sonnet-4-6";
const CLAUDE_TIMEOUT_MS = Number(process.env.MONDAY_CLAUDE_TIMEOUT_MS || 30000);

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com";
const OPENAI_MODEL = process.env.MONDAY_OPENAI_MODEL || "gpt-4o";
const OPENAI_TIMEOUT_MS = Number(process.env.MONDAY_OPENAI_TIMEOUT_MS || 30000);

function activeProvider() {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return "ollama";
}

async function chatWithLLM({ messages, temperature, timeoutMs, model }) {
  if (process.env.OPENAI_API_KEY) {
    return chatWithOpenAI({ messages, temperature });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return chatWithClaude({ messages, temperature });
  }
  return chatWithOllama({ messages, temperature, timeoutMs, model });
}

async function chatWithOpenAI({ messages, temperature }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  const systemMsg = messages.find(m => m.role === "system");
  const conversationMsgs = messages.filter(m => m.role !== "system");

  // OpenAI expects system message as first message with role "system"
  const openaiMessages = systemMsg
    ? [{ role: "system", content: systemMsg.content }, ...conversationMsgs]
    : conversationMsgs;

  try {
    const body = {
      model: OPENAI_MODEL,
      max_tokens: 600,
      temperature: temperature ?? 0.7,
      messages: openaiMessages,
      response_format: { type: "json_object" },
    };

    const response = await fetch(`${OPENAI_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`OpenAI API failed: ${response.status} ${details}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned empty content.");

    return {
      model: OPENAI_MODEL,
      raw: payload,
      content,
      json: safeParseJson(content),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function chatWithClaude({ messages, temperature }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  // Split system message from user/assistant turns
  const systemMsg = messages.find(m => m.role === "system");
  const conversationMsgs = messages.filter(m => m.role !== "system");

  try {
    const body = {
      model: CLAUDE_MODEL,
      max_tokens: 600,
      messages: conversationMsgs,
    };
    if (systemMsg) body.system = systemMsg.content;

    const response = await fetch(`${CLAUDE_BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Claude API failed: ${response.status} ${details}`);
    }

    const payload = await response.json();
    const content = payload?.content?.[0]?.text;
    if (!content) throw new Error("Claude returned empty content.");

    return {
      model: CLAUDE_MODEL,
      raw: payload,
      content,
      json: safeParseJson(content),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function safeParseJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    const raw = String(content || "").trim();
    const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fencedMatch?.[1]?.trim() || raw;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1).trim());
    } catch {
      return null;
    }
  }
}

module.exports = { chatWithLLM, activeProvider, chatWithOpenAI, chatWithClaude };
