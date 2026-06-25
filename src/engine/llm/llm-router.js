// Unified LLM router: tier-based cloud routing (OpenAI) + local fallback (Ollama).
// Active layer (user-facing) routes by tier to the appropriate OpenAI model.
// Background workers always route to local Ollama regardless of API keys.

const { chatWithOllama } = require("./ollama-provider");
const { trackCall } = require("../db/cost-tracker");

// Cloud model IDs per tier (mirror model-router.js constants — kept in sync via env vars)
const TIER_MODELS = {
  utility:      process.env.MONDAY_MODEL_UTILITY      || "gpt-5.4-nano",
  conversation: process.env.MONDAY_MODEL_CONVERSATION || "gpt-5.4-mini",
  thinking:     process.env.MONDAY_MODEL_THINKING     || "gpt-5.4",
  strategic:    process.env.MONDAY_MODEL_STRATEGIC    || "o3",
  executive:    process.env.MONDAY_MODEL_EXECUTIVE    || "gpt-5.5",
};

const BACKGROUND_MODEL       = process.env.MONDAY_MODEL_BACKGROUND || "qwen3:30b-a3b";
const EMBEDDING_MODEL        = process.env.MONDAY_MODEL_EMBEDDINGS || "nomic-embed-text";
// Background workers run as long as they need — no practical limit.
// 24h cap exists only to prevent a hang if Ollama crashes mid-run.
// Uses its own env var so it's not coupled to the general Ollama timeout.
const BACKGROUND_TIMEOUT_MS  = Number(process.env.MONDAY_BACKGROUND_TIMEOUT_MS || 0) || 86_400_000;

const CLAUDE_BASE_URL   = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const CLAUDE_MODEL      = process.env.MONDAY_CLAUDE_MODEL || "claude-sonnet-4-6";
const CLAUDE_TIMEOUT_MS = Number(process.env.MONDAY_CLAUDE_TIMEOUT_MS || 30000);

const OPENAI_BASE_URL   = process.env.OPENAI_BASE_URL || "https://api.openai.com";
const OPENAI_TIMEOUT_MS = Number(process.env.MONDAY_OPENAI_TIMEOUT_MS || 30000);

// Token budget per tier — how many output tokens the model gets.
// This is the primary lever for matching model depth to request depth.
const TIER_TOKEN_BUDGETS = {
  utility:      250,   // 1-2 sentence voice reply or JSON tag (nano-as-voice needs a little room)
  conversation: 400,   // 2-4 sentences in Monday's voice (~100 words)
  thinking:     1000,  // deep synthesis — theory, pattern, strategy (~250 words)
  executive:    1500,  // substantial review-level response (~375 words)
  // strategic: o3 reasoning models use 8000, handled in the reasoning branch below
};
const DEFAULT_TOKEN_BUDGET = 400; // conversation-tier default

// Reasoning models (o1/o3/o4): no response_format, temperature must be 1
const REASONING_MODEL_PREFIXES = ["o1", "o3", "o4"];
function isReasoningModel(model) {
  if (!model) return false;
  return REASONING_MODEL_PREFIXES.some(p => model === p || model.startsWith(p + "-") || model.startsWith(p + "."));
}

// GPT-5+ models require max_completion_tokens instead of max_tokens
function requiresCompletionTokens(model) {
  if (!model) return false;
  return isReasoningModel(model) || /^gpt-5/.test(model);
}

function activeProvider() {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return "ollama";
}

/**
 * Route to the correct model.
 *
 * @param {object} opts
 *   opts.messages    - message array
 *   opts.temperature - temperature override
 *   opts.timeoutMs   - timeout override
 *   opts.model       - explicit model ID (cloud or Ollama name)
 *   opts.tier        - "utility"|"conversation"|"thinking"|"strategic"|"executive"|"background"|"embedding"
 *                      If provided, overrides model for cloud tier selection.
 *                      "background" and "embedding" always route to local Ollama.
 *   opts.purpose     - optional label for cost tracking (e.g. "daily-brief", "review", "theory")
 */
async function chatWithLLM({ messages, temperature, timeoutMs, model, tier, purpose }) {
  // Background and embedding always stay local — no cloud calls regardless of keys.
  // Use BACKGROUND_TIMEOUT_MS so a missing env var never silently drops to the 15s default.
  if (tier === "background") {
    return chatWithOllama({ messages, temperature, timeoutMs: timeoutMs || BACKGROUND_TIMEOUT_MS, model: model || BACKGROUND_MODEL });
  }
  if (tier === "embedding") {
    return chatWithOllama({ messages, temperature, timeoutMs: timeoutMs || BACKGROUND_TIMEOUT_MS, model: EMBEDDING_MODEL });
  }

  if (process.env.OPENAI_API_KEY) {
    // Resolve cloud model: tier → known ID, or use explicit model, or default to conversation tier
    const cloudModel = TIER_MODELS[tier] || model || TIER_MODELS.conversation;
    return chatWithOpenAI({ messages, temperature, model: cloudModel, tier, purpose });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return chatWithClaude({ messages, temperature });
  }

  // Local fallback — use model param as Ollama model name
  return chatWithOllama({ messages, temperature, timeoutMs, model });
}

async function chatWithOpenAI({ messages, temperature, model, tier, purpose }) {
  const resolvedModel = model || TIER_MODELS.conversation;
  const reasoning = isReasoningModel(resolvedModel);

  // Reasoning models (o3, o1, etc.) need longer timeouts and different params
  const effectiveTimeout = reasoning ? 120000 : OPENAI_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

  const systemMsg = messages.find(m => m.role === "system");
  const conversationMsgs = messages.filter(m => m.role !== "system");
  const openaiMessages = systemMsg
    ? [{ role: "system", content: systemMsg.content }, ...conversationMsgs]
    : conversationMsgs;

  const body = { model: resolvedModel, messages: openaiMessages };

  const tokenBudget = TIER_TOKEN_BUDGETS[tier] || DEFAULT_TOKEN_BUDGET;

  if (reasoning) {
    // o3/o1: temperature must be 1, no response_format (asks for JSON in prompt)
    body.temperature = 1;
    body.max_completion_tokens = 8000;
  } else if (requiresCompletionTokens(resolvedModel)) {
    // gpt-5.x: uses max_completion_tokens, supports response_format
    body.max_completion_tokens = tokenBudget;
    body.temperature = temperature ?? 0.7;
    body.response_format = { type: "json_object" };
  } else {
    // gpt-4o and older: use max_tokens
    body.max_tokens = tokenBudget;
    body.temperature = temperature ?? 0.7;
    body.response_format = { type: "json_object" };
  }

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`OpenAI API failed [${resolvedModel}]: ${response.status} ${details}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error(`OpenAI [${resolvedModel}] returned empty content.`);

    // Record cost — non-fatal if it fails
    const usage = payload?.usage;
    if (usage) {
      trackCall({
        model:        resolvedModel,
        tier:         tier || null,
        purpose:      purpose || tier || null,
        inputTokens:  usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      });
    }

    return {
      model: resolvedModel,
      raw: payload,
      content,
      json: safeParseJson(content),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function chatWithClaude({ messages, temperature }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

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
        "x-api-key": process.env.ANTHROPIC_API_KEY,
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

// ── Buffer mode ─────────────────────────────────────────────────────────────
// Two-call pattern for conversation tier: mini extracts facts/analysis as JSON,
// nano assembles the final prose reply. Cuts output tokens on the heavier model
// by ~80% while keeping Monday's voice on the cheaper model.
// Enable with MONDAY_BUFFER_MODE=true in .env.
const BUFFER_MODE = process.env.MONDAY_BUFFER_MODE === "true";

async function chatWithBuffer({ messages, purpose, leanMessages }) {
  // leanMessages: pre-built lean payload from buildLeanPrompt (fewer tokens).
  // Falls back to stripping system message from full messages if not provided.
  const otherMsgs = messages.filter(m => m.role !== "system");

  // ── Pass 1: mini reads context and extracts structured facts only ────────
  // No prose. No reply. Mini's only job here is to surface what matters
  // so nano has a clean signal to write from.
  const analysisSystem = `You are a context analyst. Read the conversation and extract structured facts only.
Return compact JSON (under 150 tokens total):
{
  "domain": "<Health|Publishing|Retirement|Family|Faith|Work|null>",
  "significance": "<one phrase or null>",
  "keyFacts": ["<fact1>", "<fact2>"],
  "tone": "<supportive|direct|celebratory|concerned|neutral>",
  "suggestedDomain": "<domain or null>",
  "conversationHypothesis": "<one sentence hypothesis or null>"
}
No reply text. No prose. Facts only.`;

  const analysisMessages = leanMessages
    ? [{ role: "system", content: analysisSystem }, ...leanMessages]
    : [{ role: "system", content: analysisSystem }, ...otherMsgs];

  const analysisResponse = await chatWithOpenAI({
    messages: analysisMessages,
    temperature: 0.5,
    model: TIER_MODELS.conversation, // mini
    tier: "conversation",
    purpose: purpose ? `${purpose}:buffer-analysis` : "buffer-analysis",
  });

  // ── Pass 2: nano writes the reply from the extracted facts ───────────────
  // Nano gets clean structured facts — not a wall of prose — so it has
  // a clear signal and doesn't pad or duplicate.
  const facts = analysisResponse.content;

  const voiceSystem = `You are Monday, an AI Life Operating Officer.
Use "boss" sparingly and naturally as a term of endearment, not in every reply.
Voice: warm, strategic, direct. Lead with the read. No hollow openers. No theater. No repeated questions.
Insight before inquiry. Contribute a pattern, connection, tension, or hypothesis before asking anything.
Do not sound like a therapist, intake form, or coach. Think out loud and contribute a real read before asking.
Avoid falling back on phrases like "tell me more", "can you share more", or repeating "the real question is" as a template.
For wins, launches, sales, breakthroughs, or answered prayer: celebrate first, protect the moment, and do not rush into analysis.
Use the facts below to write ONE complete reply of 2-4 sentences. End with at most ONE question naturally embedded — do NOT add a separate follow-up line after your reply.
Return JSON: {"reply":"<your complete reply>"}

Facts:
${facts}`;

  const voiceMessages = [{ role: "system", content: voiceSystem }, ...otherMsgs];

  const voiceResponse = await chatWithOpenAI({
    messages: voiceMessages,
    temperature: 0.8,
    model: TIER_MODELS.utility, // nano
    tier: "utility",
    purpose: purpose ? `${purpose}:buffer-voice` : "buffer-voice",
  });

  // Merge: use nano's reply as the voice, carry mini's structured facts forward
  const analysisParsed = safeParseJson(analysisResponse.content) || {};
  const voiceParsed = safeParseJson(voiceResponse.content) || {};
  const replyText = voiceParsed?.reply || voiceResponse.content;

  const merged = {
    ...analysisParsed,
    reply: replyText,
    followUp: null, // nano embeds the question in the reply — no separate field
    voice: { text: replyText },
  };

  return {
    model: `${TIER_MODELS.conversation}+${TIER_MODELS.utility}`,
    content: JSON.stringify(merged),
    json: merged,
    raw: { analysis: analysisResponse.raw, voice: voiceResponse.raw },
    buffered: true,
  };
}

module.exports = { chatWithLLM, chatWithBuffer, BUFFER_MODE, activeProvider, chatWithOpenAI, chatWithClaude, TIER_MODELS, TIER_TOKEN_BUDGETS };
