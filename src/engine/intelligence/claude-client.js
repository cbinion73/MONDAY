const DEFAULT_BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const DEFAULT_MODEL = process.env.MONDAY_CLAUDE_MODEL || "claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = Number(process.env.MONDAY_CLAUDE_TIMEOUT_MS || 30000);

function isEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function chatWithClaude({
  messages,
  system,
  model = DEFAULT_MODEL,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxTokens = 512,
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      model,
      max_tokens: maxTokens,
      messages,
    };
    if (system) body.system = system;

    const response = await fetch(`${baseUrl}/v1/messages`, {
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

module.exports = { chatWithClaude, isEnabled, DEFAULT_MODEL };
