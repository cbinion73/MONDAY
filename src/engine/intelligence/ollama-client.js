const DEFAULT_BASE_URL = process.env.MONDAY_OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.MONDAY_OLLAMA_MODEL || "qwen2.5:7b";
const DEFAULT_TIMEOUT_MS = Number(process.env.MONDAY_OLLAMA_TIMEOUT_MS || 15000);
const DEFAULT_TEMPERATURE = Number(process.env.MONDAY_OLLAMA_TEMPERATURE || 0.85);

async function chatWithOllama({
  messages,
  model = DEFAULT_MODEL,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  temperature = DEFAULT_TEMPERATURE,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: {
          temperature,
        },
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Ollama chat failed: ${response.status} ${details}`);
    }

    const payload = await response.json();
    const content = payload?.message?.content;
    if (!content) {
      throw new Error("Ollama returned an empty message.");
    }

    return {
      model,
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
  } catch (error) {
    const extracted = extractJsonObject(content);
    if (!extracted) return null;

    try {
      return JSON.parse(extracted);
    } catch {
      return null;
    }
  }
}

function extractJsonObject(content) {
  const raw = String(content || "").trim();
  if (!raw) return null;

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1]?.trim() || raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return candidate.slice(start, end + 1).trim();
}

module.exports = {
  chatWithOllama,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
};
