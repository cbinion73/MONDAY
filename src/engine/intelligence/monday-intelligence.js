const fs = require("node:fs");
const path = require("node:path");
const {
  chatWithOllama,
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
} = require("../llm/ollama-provider");
const { chatWithLLM, activeProvider } = require("../llm/llm-router");
const { routeModel } = require("../llm/model-router");
const {
  buildConversationPrompt,
  buildConversationPayload,
  buildDailyBriefPrompt,
  extractWorkingTheory,
} = require("../llm/monday-prompt-builder");
const {
  normalizeConfidence,
  validateConversationResponse,
  validateDailyBriefResponse,
} = require("../llm/response-validator");
const { extractCaptureText } = require("../personal/personal-store");
const { enrichPersonalContext } = require("../memory/personal-context");

const DAILY_BRIEF_CACHE_TTL_MS = Number(
  process.env.MONDAY_DAILY_BRIEF_CACHE_TTL_MS || 18 * 60 * 60 * 1000
);

function intelligenceEnabled() {
  return process.env.MONDAY_OLLAMA_ENABLED !== "false";
}

async function applyMondayIntelligence({
  result,
  input,
  history = [],
  personalContext = {},
}) {
  // Enrich with vault memory recall before building the prompt.
  // Graceful — returns original personalContext if vault is unavailable or times out.
  personalContext = await enrichPersonalContext(input, personalContext, {
    domain: result.truth?.domain || result.finalState?.candidateDomain || null,
  });

  const priorWorkingTheory = personalContext.priorWorkingTheory || null;

  // Always compute working theory so it persists regardless of Ollama availability.
  const promptPayload = buildConversationPayload({ result, input, history, personalContext });
  const workingTheory = extractWorkingTheory(promptPayload, priorWorkingTheory);

  // Route to the right model — computed early so all return paths carry it.
  const modelDecision = routeModel({
    domain: result.truth?.domain || result.finalState?.candidateDomain || null,
    significance: result.finalState?.significance || null,
    identityProximity: result.finalState?.identityProximity || null,
    woundRisk: result.finalState?.woundRisk || null,
    input,
  });

  const recallRequest = detectThreadRecallRequest(input, personalContext);
  if (recallRequest) {
    if (shouldUseDailyOrientation(recallRequest, personalContext)) {
      const r = await finalizeDailyOrientationResult(result, recallRequest, personalContext);
      return { ...r, workingTheory: workingTheory || priorWorkingTheory, modelDecision };
    }
    const r = finalizeThreadRecallResult(result, recallRequest);
    return { ...r, workingTheory: workingTheory || priorWorkingTheory, modelDecision };
  }

  if (!intelligenceEnabled()) {
    const attached = attachIntelligence(result, {
        enabled: false,
        provider: activeProvider(),
        used: false,
        reason: "MONDAY_OLLAMA_ENABLED is false.",
      });
    const r = personalContext.captureIntent
      ? finalizeCaptureResult(attached, input)
      : personalizeResult(attached, personalContext);
    return { ...r, workingTheory, modelDecision };
  }

  const prompt = buildConversationPrompt({
    result,
    input,
    history,
    personalContext,
  });
  const startedAt = Date.now();

  try {
    const response = await getValidConversationResponse(prompt, modelDecision.model);

    const latencyMs = Date.now() - startedAt;
    const parsed = validateConversationResponse(response.json);

    if (!parsed) {
      const attached = attachIntelligence(result, {
          enabled: true,
          provider: activeProvider(),
          model: response.model,
          used: false,
          latencyMs,
          reason: "Ollama response was not valid JSON.",
          promptDebug: buildPromptDebug({ prompt, promptPayload }),
          rawResponse: response.json || response.raw || null,
        });
      const r = personalContext.captureIntent
        ? finalizeCaptureResult(attached, input)
        : personalizeResult(attached, personalContext);
      return { ...r, workingTheory, modelDecision };
    }

    const adjustedParsed =
      personalContext.captureIntent &&
      !/\b(keep|carry|remember|return to it|come back to it)\b/i.test(parsed.reply)
        ? {
            ...parsed,
            reply: buildCaptureFallback(result),
            followUp: null,
          }
        : parsed;

    if (!shouldAcceptRefinement({
      result,
      parsed: adjustedParsed,
      input,
      history,
      promptPayload,
    })) {
      const rescued = buildThreadAwareFallbackRefinement({
        promptPayload,
        parsed: adjustedParsed,
        input,
      });

      if (rescued) {
        const merged = mergeThreadAwareFallback(result, rescued, {
          enabled: true,
          provider: activeProvider(),
          model: response.model,
          used: false,
          latencyMs,
          reason: "Refinement was generic; used thread-aware synthesis fallback.",
          promptDebug: buildPromptDebug({ prompt, promptPayload }),
          rawResponse: response.json || response.raw || null,
          suggestedDomain: adjustedParsed?.suggestedDomain || null,
          suggestedClassification: adjustedParsed?.suggestedClassification || null,
          confidence: adjustedParsed?.confidence || null,
        });
        const r = personalContext.captureIntent
          ? finalizeCaptureResult(merged, input)
          : personalizeResult(merged, personalContext);
        return { ...r, workingTheory, modelDecision };
      }

      const attached = attachIntelligence(result, {
          enabled: true,
          provider: activeProvider(),
          model: response.model,
          used: false,
          latencyMs,
          reason: "Refinement was more generic than Monday's deterministic voice.",
          promptDebug: buildPromptDebug({ prompt, promptPayload }),
          rawResponse: response.json || response.raw || null,
        });
      const r = personalContext.captureIntent
        ? finalizeCaptureResult(attached, input)
        : personalizeResult(attached, personalContext);
      return { ...r, workingTheory, modelDecision };
    }

    const merged = mergeIntelligence(result, adjustedParsed, {
        enabled: true,
        provider: "ollama",
        model: response.model,
        used: true,
        latencyMs,
        promptKind: "refinement",
        promptDebug: buildPromptDebug({ prompt, promptPayload }),
        rawResponse: response.json || response.raw || null,
      });
    const r = personalContext.captureIntent
      ? finalizeCaptureResult(merged, input)
      : personalizeResult(merged, personalContext);
    return { ...r, workingTheory, modelDecision };
  } catch (error) {
    const attached = attachIntelligence(result, {
        enabled: true,
        provider: activeProvider(),
        model: DEFAULT_MODEL,
        used: false,
        reason: error.message,
        promptDebug: buildPromptDebug({ prompt, promptPayload }),
        rawResponse: null,
      });
    const r = personalContext.captureIntent
      ? finalizeCaptureResult(attached, input)
      : personalizeResult(attached, personalContext);
    return { ...r, workingTheory: priorWorkingTheory, modelDecision };
  }
}

async function getValidConversationResponse(prompt, model = null) {
  const provider = activeProvider();
  const isClaude = provider === "claude";

  // Claude doesn't benefit from temperature retries; one attempt is enough.
  const attempts = isClaude
    ? [{ temperature: 1.0 }]
    : [
        { temperature: Number(process.env.MONDAY_OLLAMA_TEMPERATURE || 0.85), timeoutMs: Math.max(DEFAULT_TIMEOUT_MS, 15000) },
        { temperature: 0.5, timeoutMs: Math.max(DEFAULT_TIMEOUT_MS + 10000, 30000) },
      ];

  let lastResponse = null;
  let lastError = null;

  for (const attempt of attempts) {
    try {
      const response = await chatWithLLM({
        messages: prompt,
        temperature: attempt.temperature,
        timeoutMs: attempt.timeoutMs,
        model: model || undefined,
      });
      lastResponse = response;

      if (validateConversationResponse(response.json)) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError || new Error(`${provider} conversation refinement failed.`);
}

function detectThreadRecallRequest(input, personalContext = {}) {
  const text = String(input || "").trim().toLowerCase();
  if (!text) return null;

  const intent = resolveRecallIntent(text);
  const looksLikeRecall =
    /\bwhat am i carrying\b/.test(text) ||
    /\bwhat(?:'s| is) still live\b/.test(text) ||
    /\bwhat(?:'s| is) live\b/.test(text) ||
    /\bwhat do i have going on\b/.test(text) ||
    /\bwhat matters right now\b/.test(text) ||
    /\bwhat still matters\b/.test(text) ||
    /\bwhat should i keep in view\b/.test(text) ||
    /\bwhat am i holding\b/.test(text) ||
    /\bwhat(?:'s| is) going on in (health|family|faith|work|publishing|retirement)\b/.test(
      text
    ) ||
    intent !== "live";

  if (!looksLikeRecall) {
    return null;
  }

  const missions = personalContext.missionThreads || [];
  const captures = personalContext.recentCaptures || [];
  const mission = resolveMissionFromRecall(text, missions);

  if (mission) {
    const missionCaptures = captures
      .filter((capture) => capture.missionId === mission.id)
      .slice(0, 3);
    return {
      scope: "mission",
      intent,
      mission,
      captures: missionCaptures,
    };
  }

  return {
    scope: "general",
    intent,
    missions: missions.filter((item) => item.significanceThreads?.length || item.lastTouchedAt),
    captures: captures.slice(0, 4),
    calendar: personalContext.calendar || null,
    documents: personalContext.documents || null,
    email: personalContext.email || null,
    finances: personalContext.finances || null,
  };
}

function shouldUseDailyOrientation(recallRequest, personalContext = {}) {
  if (!recallRequest || recallRequest.scope !== "general") {
    return false;
  }

  const hasLiveContext =
    Boolean(personalContext.calendar?.nextEvent) ||
    (personalContext.documents?.documents || []).length > 0 ||
    (personalContext.email?.threads || []).length > 0 ||
    (personalContext.finances?.accounts || []).length > 0;

  return hasLiveContext || recallRequest.intent !== "live";
}

function resolveRecallIntent(text) {
  if (
    /\bwhat should i keep in view\b/.test(text) ||
    /\bwhat should stay in view\b/.test(text) ||
    /\bwhat should i keep visible\b/.test(text)
  ) {
    return "keep_in_view";
  }

  if (
    /\bwhat changed\b/.test(text) ||
    /\bwhat has changed\b/.test(text) ||
    /\bwhat's changed\b/.test(text)
  ) {
    return "changed";
  }

  if (
    /\bneeds attention\b/.test(text) ||
    /\bwhat needs attention\b/.test(text) ||
    /\bwhere should i look first\b/.test(text) ||
    /\bwhat needs me\b/.test(text)
  ) {
    return "attention";
  }

  if (
    /\bdeserves protection\b/.test(text) ||
    /\bwhat should i protect\b/.test(text) ||
    /\bwhat needs protecting\b/.test(text)
  ) {
    return "protection";
  }

  return "live";
}

function resolveMissionFromRecall(text, missions = []) {
  const aliasMap = {
    health: ["health", "weight", "exercise"],
    publishing: ["publishing", "book", "writing"],
    retirement: ["retirement", "retire"],
    family: ["family", "caleb", "rebekah", "wife", "marriage", "son"],
    faith: ["faith", "prayer", "god", "spiritual"],
    work: ["work", "job", "career", "thermo fisher"],
  };

  for (const mission of missions) {
    const aliases = aliasMap[mission.id] || [mission.id];
    if (aliases.some((alias) => text.includes(alias))) {
      return mission;
    }
  }

  return null;
}

function finalizeThreadRecallResult(result, recallRequest) {
  const text =
    recallRequest.scope === "mission"
      ? buildMissionRecallResponse(recallRequest)
      : buildGeneralRecallResponse(recallRequest);
  const missionSignificance =
    recallRequest.scope === "mission"
      ? recallRequest.mission?.significanceThreads?.[0] || null
      : null;
  const nextFinalState =
    recallRequest.scope === "mission"
      ? {
          ...result.finalState,
          significance: missionSignificance || result.finalState?.significance,
          candidateDomain: recallRequest.mission?.id || result.finalState?.candidateDomain,
          continuity: {
            ...(result.finalState?.continuity || {}),
            activeMission:
              recallRequest.mission?.id ||
              result.finalState?.continuity?.activeMission ||
              null,
            activeSignificance:
              missionSignificance ||
              result.finalState?.continuity?.activeSignificance ||
              result.finalState?.significance ||
              null,
            activeSignificanceThread:
              missionSignificance ||
              result.finalState?.continuity?.activeSignificanceThread ||
              null,
          },
        }
      : result.finalState;
  return {
    ...result,
    finalState: nextFinalState,
    voice: {
      ...result.voice,
      baseText: result.voice?.text || "",
      lines: splitReply(text),
      text,
      responseSource: "thread-recall",
    },
  };
}

async function finalizeDailyOrientationResult(result, recallRequest, personalContext = {}) {
  const briefCaptures = getRecentCapturesAsBriefCaptures(personalContext.recentCaptures || []);
  const brief = await generateDailyBrief({
    missions: getMissionThreadsAsBriefMissions(
      personalContext.missionThreads || [],
      briefCaptures
    ),
    captures: briefCaptures,
    calendar: personalContext.calendar || null,
    documents: personalContext.documents || null,
    email: personalContext.email || null,
    finances: personalContext.finances || null,
  });

  const text = buildGeneralOrientationResponse({
    intent: recallRequest.intent,
    brief,
    missions: recallRequest.missions || [],
    captures: recallRequest.captures || [],
  });

  return {
    ...result,
    voice: {
      ...result.voice,
      baseText: result.voice?.text || "",
      lines: splitReply(text),
      text,
      responseSource: "daily-orientation",
    },
    intelligence: {
      ...(result.intelligence || {}),
      enabled: brief.enabled,
      provider: brief.provider || "ollama",
      used: brief.source === "live",
      promptKind: "daily-orientation",
      source: brief.source || "deterministic",
      model: brief.model || null,
      latencyMs: brief.latencyMs || null,
      cached: Boolean(brief.cached),
    },
  };
}

function buildMissionRecallResponse({ mission, captures, intent = "live" }) {
  const missionName = String(mission?.name || "that thread");
  const recent = dedupeRecallItems(
    (captures || []).map((capture) =>
      humanizeCaptureContent(capture.content, capture.missionId)
    )
  );

  if (!recent.length) {
    if (intent === "keep_in_view") {
      return `Your ${missionName.toLowerCase()} thread is quiet right now. I am not seeing a specific live capture there that needs to stay in view today.`;
    }

    if (intent === "attention") {
      return `Your ${missionName.toLowerCase()} thread is quiet right now. I am not seeing a recent capture there that clearly needs immediate attention.`;
    }

    if (intent === "protection") {
      return `Your ${missionName.toLowerCase()} thread is quiet right now. I am not seeing a recent capture there that needs active protection at the moment.`;
    }

    if (intent === "changed") {
      return `Your ${missionName.toLowerCase()} thread is still live, but I am not seeing a recent shift there yet.`;
    }

    return `Your ${missionName.toLowerCase()} thread is still live, but it is quiet right now. I am not seeing a recent capture there that needs immediate re-entry.`;
  }

  if (intent === "keep_in_view") {
    return `In your ${missionName.toLowerCase()} thread, the thing I would keep in view is ${recent[0]}. That feels important enough to stay visible even if it is not urgent yet.`;
  }

  if (intent === "attention") {
    return `In your ${missionName.toLowerCase()} thread, the thing most likely to need attention is ${recent[0]}. That feels like the thread most likely to slip if it stays quiet.`;
  }

  if (intent === "protection") {
    return `In your ${missionName.toLowerCase()} thread, what deserves protection most right now is ${recent[0]}. I would keep that from getting crowded out.`;
  }

  if (intent === "changed") {
    return `In your ${missionName.toLowerCase()} thread, the clearest recent change is ${recent[0]} coming back into view. That feels like the newest movement there.`;
  }

  if (recent.length === 1) {
    return `In your ${missionName.toLowerCase()} thread, the clearest live thing is ${recent[0]}. That still seems worth carrying forward.`;
  }

  const [first, second] = recent;
  return `In your ${missionName.toLowerCase()} thread, the clearest live things are ${first} and ${second}. Those are the threads I would keep visible right now.`;
}

function buildGeneralRecallResponse({ missions, captures, intent = "live" }) {
  const liveMissions = (missions || [])
    .filter((mission) => mission.significanceThreads?.length)
    .slice(0, 3)
    .map((mission) => mission.name.toLowerCase());
  const recent = dedupeRecallItems(
    (captures || [])
      .slice(0, 4)
      .map((capture) => humanizeCaptureContent(capture.content, capture.missionId))
  ).slice(0, 2);

  if (!liveMissions.length && !recent.length) {
    return "Nothing especially active is surfacing yet. Once more live threads are captured, I can help you rejoin them without reconstruction.";
  }

  if (intent === "keep_in_view") {
    if (recent.length) {
      return `The clearest thing to keep in view right now is ${recent[0]}. That feels important enough to stay visible even if something louder shows up.`;
    }

    return `The livest areas right now are ${joinNaturalList(liveMissions)}. Those are the threads I would keep visible first.`;
  }

  if (intent === "attention") {
    if (recent.length) {
      return `The thread most likely to need attention first is ${recent[0]}. That is where I would re-enter before the others.`;
    }

    return `The livest areas right now are ${joinNaturalList(liveMissions)}. I would start there if you want to see what needs attention first.`;
  }

  if (intent === "protection") {
    if (recent.length) {
      return `What deserves protection most right now is ${recent[0]}. I would keep it from being crowded out by whatever is louder today.`;
    }

    return `The livest areas right now are ${joinNaturalList(liveMissions)}. Those are the threads I would protect from disappearing into the background.`;
  }

  if (intent === "changed") {
    if (recent.length) {
      return `The clearest recent change is that ${joinNaturalList(recent)} has come back into view. That is where the movement is right now.`;
    }

    return `The livest areas right now are ${joinNaturalList(liveMissions)}. I am not seeing a sharper recent shift than that yet.`;
  }

  if (recent.length) {
    const missionsText = liveMissions.length
      ? `The livest areas right now are ${joinNaturalList(liveMissions)}.`
      : "A few live threads are already waiting for you.";
    const recentText = `The clearest things I am still carrying are ${joinNaturalList(recent)}.`;
    return `${missionsText} ${recentText}`;
  }

  return `The livest areas right now are ${joinNaturalList(liveMissions)}. Those are the threads I would keep in view first.`;
}

function buildGeneralOrientationResponse({ intent = "live", brief, missions = [], captures = [] }) {
  const changed = brief?.changed || [];
  const stillMatters = brief?.stillMatters || [];
  const needsAttention = brief?.needsAttention || [];
  const deservesProtection = brief?.deservesProtection || [];

  if (intent === "attention") {
    const lead = needsAttention[0] || deriveFallbackOrientationItem({ intent, missions, captures });
    if (lead) {
      return `The clearest thing that needs attention right now is ${normalizeOrientationItem(lead, intent)}.`;
    }
  }

  if (intent === "protection") {
    const lead = deservesProtection[0] || deriveFallbackOrientationItem({ intent, missions, captures });
    if (lead) {
      return `What deserves protection most right now is ${normalizeOrientationItem(lead, intent)}.`;
    }
  }

  if (intent === "changed") {
    const lead = changed[0] || deriveFallbackOrientationItem({ intent, missions, captures });
    if (lead) {
      return `The clearest change right now is ${normalizeOrientationItem(lead, intent)}.`;
    }
  }

  if (intent === "keep_in_view") {
    const lead = stillMatters[0] || deriveFallbackOrientationItem({ intent, missions, captures });
    if (lead) {
      return `The clearest thing to keep in view right now is ${normalizeOrientationItem(lead, intent)}.`;
    }
  }

  const stillLead = stillMatters[0];
  const attentionLead = needsAttention[0];

  if (stillLead && attentionLead) {
    return `What still matters right now is ${normalizeOrientationItem(stillLead, "live")}. The next thing most likely to need attention is ${normalizeOrientationItem(attentionLead, "attention")}.`;
  }

  if (stillLead) {
    return `What still matters right now is ${normalizeOrientationItem(stillLead, "live")}.`;
  }

  if (brief?.brief) {
    return String(brief.brief).trim();
  }

  return buildGeneralRecallResponse({ missions, captures, intent: "live" });
}

function normalizeOrientationItem(item, intent = "live") {
  const raw = String(item || "").trim().replace(/[.]+$/g, "").trim();
  if (!raw) return "something significant that should stay visible";

  if (intent === "attention" && /^the day already has shape around\s+/i.test(raw)) {
    return raw.replace(/^the day already has shape around\s+/i, "").trim();
  }

  if (intent === "attention" && /^.+ may need attention around\s+/i.test(raw)) {
    return raw.replace(/^.+ may need attention around\s+/i, "").trim();
  }

  if (/^keep in view:\s*/i.test(raw)) {
    return raw.replace(/^keep in view:\s*/i, "").trim();
  }

  if (/^still carrying:\s*/i.test(raw)) {
    return raw.replace(/^still carrying:\s*/i, "").trim();
  }

  if (intent === "protection" && /^protect\s+/i.test(raw)) {
    return raw.replace(/^protect\s+/i, "").trim();
  }

  if (intent === "changed" && /^relevant document:\s*/i.test(raw)) {
    return `the document ${raw.replace(/^relevant document:\s*/i, "").trim()}`;
  }

  if (intent === "changed" && /^inbox thread:\s*/i.test(raw)) {
    return `the inbox thread ${raw.replace(/^inbox thread:\s*/i, "").trim()}`;
  }

  if (intent === "changed" && /^financial context:\s*/i.test(raw)) {
    return raw.replace(/^financial context:\s*/i, "").trim();
  }

  if (intent === "changed" && /^the\s+/i.test(raw)) {
    return raw.replace(/^the\s+/i, "").trim();
  }

  return raw;
}

function deriveFallbackOrientationItem({ intent = "live", missions = [], captures = [] }) {
  const recent = dedupeRecallItems(
    (captures || [])
      .slice(0, 3)
      .map((capture) => humanizeCaptureContent(capture.content, capture.missionId))
  );

  if (recent.length) {
    return recent[0];
  }

  const liveMissions = (missions || [])
    .filter((mission) => mission.significanceThreads?.length)
    .map((mission) => mission.name.toLowerCase());

  if (!liveMissions.length) {
    return null;
  }

  if (intent === "protection") {
    return `${joinNaturalList(liveMissions)} from slipping into the background`;
  }

  return joinNaturalList(liveMissions);
}

function getMissionThreadsAsBriefMissions(missionThreads = [], captures = []) {
  return (missionThreads || []).map((mission) => ({
    id: mission.id,
    name: mission.name,
    lastTouchedAt: mission.lastTouchedAt || null,
    significanceThreads: mission.significanceThreads || [],
    recentCaptures: (captures || [])
      .filter((capture) => capture.missionId === mission.id)
      .slice(0, 4),
  }));
}

function getRecentCapturesAsBriefCaptures(captures = []) {
  return (captures || []).map((capture) => ({
    content: capture.content,
    missionId: capture.missionId,
    significance: capture.significance,
    createdAt: capture.createdAt,
  }));
}

function dedupeRecallItems(items = []) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const value = String(item || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function shouldAcceptRefinement({
  result,
  parsed,
  input,
  history = [],
  promptPayload = null,
}) {
  const reply = String(parsed?.reply || "").trim();
  if (!reply) return false;

  const significance = result.finalState?.significance;
  const deterministic = String(result.voice?.text || "").trim();
  const theoryRevision = promptPayload?.theoryRevision || null;
  const recommendationRequired = shouldRequireRecommendation({
    significance,
    userInput: String(input || "").trim(),
    history,
  });

  if (!deterministic) return true;

  // Too short to be a real reply
  if (reply.length < Math.max(36, deterministic.length * 0.45)) return false;

  // Generic wellness/coaching speak — Monday should never sound like a wellness app
  const genericCoachingPatterns = [
    /\bsmall,\s*sustainable changes\b/i,
    /\blead to\b.+\bweight loss\b/i,
    /\blet'?s focus on\b/i,
    /\byou can do this\b/i,
    /\bone step at a time\b/i,
  ];
  if (genericCoachingPatterns.some((p) => p.test(reply)) && !hasThinkingPartnerMove(reply)) {
    return false;
  }

  // Over-hedged — stacking weak qualifiers with no actual view
  if (isOverHedgedReply(reply)) return false;

  // Publishing gloss — cheerleader mode is wrong for a thinking-partner turn
  if (
    significance === "publishing_decision" &&
    /\bthat'?s a great idea\b|\bwriting can be a powerful way\b|\bexciting project\b|\bshare insights\b/i.test(reply)
  ) {
    return false;
  }

  // Cross-domain contamination — don't inject work/career into a prayer conversation
  if (
    significance === "prayer_concern" &&
    /\bwork\b|\bcareer\b|\bjob\b/i.test(reply) &&
    !/\bwork\b|\bcareer\b|\bjob\b/i.test(String(input || ""))
  ) {
    return false;
  }

  // Theory revision active — the reply must engage with what changed, not ask an intake question
  if (
    theoryRevision &&
    (theoryRevision.status === "revise" || theoryRevision.status === "replace") &&
    !reflectsTheoryRevision(reply.toLowerCase(), theoryRevision)
  ) {
    return false;
  }

  // Recommendation required — if the engine says it's time to move, the reply must move
  if (recommendationRequired && !hasRecommendationMove(reply)) return false;

  return true;
}

function isRetirementFollowUpDeepeningResponse({
  significance,
  activeRole,
  lastMondayMessage,
  userInput,
  inputLower,
  replyLower,
}) {
  if (significance !== "future_life_transition") return false;
  if (activeRole !== "companion") return false;
  if (!extractLastQuestion(lastMondayMessage)) return false;
  if (!userInput || userInput.includes("?")) return false;

  return (
    hasThinkingPartnerMove(replyLower) &&
    (replyLower.includes("that changes the theory") ||
      replyLower.includes("my guess") ||
      replyLower.includes("the real question") ||
      replyLower.includes("the real issue") ||
      replyLower.includes("i would")) &&
    ((inputLower.includes("money") &&
      (replyLower.includes("money") || replyLower.includes("financial"))) ||
      (inputLower.includes("family") && replyLower.includes("family")) ||
      (inputLower.includes("work") && replyLower.includes("work")) ||
      (inputLower.includes("identity") && replyLower.includes("identity")) ||
      (inputLower.includes("purpose") && replyLower.includes("purpose")) ||
      replyLower.includes("after work") ||
      replyLower.includes("life"))
  );
}

function isInterpretiveAdvanceResponse({
  activeRole,
  lastMondayMessage,
  userInput,
  reply,
  replyLower,
}) {
  if (activeRole !== "companion") return false;
  if (!extractLastQuestion(lastMondayMessage)) return false;
  if (!userInput || userInput.includes("?")) return false;
  if (!hasTentativeInterpretation(reply)) return false;

  return (
    replyLower.includes("tension") ||
    replyLower.includes("role") ||
    replyLower.includes("creating") ||
    replyLower.includes("identity") ||
    replyLower.includes("protecting") ||
    replyLower.includes("refuge") ||
    replyLower.includes("control")
  );
}

function hasTentativeInterpretation(reply) {
  const text = String(reply || "").toLowerCase();

  const interpretationMarkers = [
    "it sounds like",
    "it seems like",
    "i think",
    "my guess is",
    "may be",
    "may not be",
    "might be",
    "could be",
    "part of what",
    "the tension may be",
    "it feels like",
    "it looks like",
    "i wonder if",
    "one possibility is",
  ];

  return interpretationMarkers.some((marker) => text.includes(marker));
}

function hasThinkingPartnerMove(reply) {
  const text = String(reply || "").toLowerCase();

  const synthesisMarkers = [
    "may be connected",
    "seem connected",
    "keep appearing together",
    "you've mentioned",
    "you have mentioned",
    "this isn't the first time",
    "not the first time",
    "keeps returning",
    "shows up again",
    "the pattern may be",
  ];

  const contradictionMarkers = [
    "at the same time",
    "but you also",
    "those aren't necessarily",
    "those are not necessarily",
    "the tension may be",
    "pulled in two directions",
    "not necessarily pointing in the same direction",
    "part of the tension",
    "contradiction",
  ];

  const meaningMarkers = [
    "this feels less like",
    "more like",
    "what's underneath",
    "what is underneath",
    "what this may really be about",
    "question about identity",
    "question about meaning",
    "question about purpose",
    "question about who you are",
    "what work has been carrying",
    "what you want work to stop holding",
  ];

  return (
    hasTentativeInterpretation(reply) ||
    synthesisMarkers.some((marker) => text.includes(marker)) ||
    contradictionMarkers.some((marker) => text.includes(marker)) ||
    meaningMarkers.some((marker) => text.includes(marker))
  );
}

function hasNonObviousContribution(reply) {
  const text = String(reply || "").toLowerCase();

  const contributionMarkers = [
    "my guess is",
    "i wonder if",
    "one possibility is",
    "i may be wrong, but",
    "it sounds like",
    "it seems like",
    "the pattern i think i'm seeing is",
    "the pattern i think i am seeing is",
    "you keep returning to",
    "this isn't the first time",
    "those aren't necessarily",
    "that is a different problem",
    "less about",
    "more about",
    "may not actually",
    "part of what",
    "the tension may be",
    "what work has been carrying",
    "what you want work to stop holding",
  ];

  return contributionMarkers.some((marker) => text.includes(marker));
}

function hasInsightContribution(reply) {
  const text = String(reply || "").toLowerCase();

  const insightMarkers = [
    "the pattern",
    "pattern i think i'm seeing",
    "pattern i think i am seeing",
    "the tension",
    "the contradiction",
    "you don't need a perfect overhaul first",
    "you do not need a perfect overhaul first",
    "perfect overhaul",
    "first sustainable change",
    "this feels less like",
    "this is less about",
    "this is more about",
    "more than",
    "less about",
    "question about identity",
    "question about meaning",
    "question about purpose",
    "what work has been carrying",
    "what you want work to stop holding",
    "that introduces a different tension",
    "that changes the theory",
    "the real issue",
    "the real question",
    "the problem is",
    "not motivation",
    "scope",
    "protecting what you say matters most",
    "what is actually receiving your life",
  ];

  return hasNonObviousContribution(reply) || insightMarkers.some((marker) => text.includes(marker));
}

function hasRecommendationMove(reply) {
  const text = String(reply || "").toLowerCase();

  const recommendationMarkers = [
    "i would",
    "the next move",
    "the next step",
    "start by",
    "before you",
    "separate",
    "reduce",
    "define",
    "explore reducing responsibility",
    "what i'd do next",
    "what i would do next",
    "different problem",
  ];

  return recommendationMarkers.some((marker) => text.includes(marker));
}

function isOverHedgedReply(reply) {
  const text = String(reply || "").toLowerCase();
  const hedges = [
    "i wonder if",
    "perhaps",
    "maybe",
    "could it be",
    "it might be",
    "it may be",
    "one possibility is",
  ];

  const matches = hedges.filter((marker) => text.includes(marker));
  return matches.length >= 3;
}

function reflectsTheoryRevision(replyLower, theoryRevision) {
  const revised = String(theoryRevision?.revisedTheory || "").toLowerCase();
  if (!revised) return true;

  const keywordGroups = [];

  if (revised.includes("attention")) {
    keywordGroups.push(["attention", "hours", "week", "absorbing"]);
  }

  if (revised.includes("family")) {
    keywordGroups.push(["family", "matters most", "what matters most"]);
  }

  if (revised.includes("freedom")) {
    keywordGroups.push(["freedom", "retirement"]);
  }

  if (revised.includes("identity")) {
    keywordGroups.push(["identity", "who you are", "work"]);
  }

  if (keywordGroups.length === 0) {
    return true;
  }

  return keywordGroups.every((group) =>
    group.some((keyword) => replyLower.includes(keyword))
  );
}

function shouldRequireRecommendation({ significance, userInput, history = [] }) {
  const allUserText = [
    ...(history || []).map((entry) => String(entry.user || "")),
    String(userInput || ""),
  ]
    .join(" ")
    .toLowerCase();

  if (
    allUserText.includes("retire") &&
    allUserText.includes("build") &&
    (allUserText.includes("hide") || allUserText.includes("without work"))
  ) {
    return true;
  }

  if (
    significance === "future_life_transition" &&
    allUserText.includes("not really about money") &&
    allUserText.includes("without work")
  ) {
    return true;
  }

  return false;
}

function isQuestionHeavyReply(reply) {
  const text = String(reply || "").trim();
  if (!text.includes("?")) return false;

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length === 0) return false;

  const questionCount = sentences.filter((sentence) => sentence.includes("?")).length;
  return questionCount >= 1 && questionCount >= sentences.length / 2;
}

function extractLastQuestion(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const matches = raw.match(/[^.?!]*\?/g);
  if (!matches || !matches.length) return null;
  return matches[matches.length - 1].trim();
}

function tokenizeForContinuity(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .slice(0, 8);
}

function mergeIntelligence(result, parsed, metadata) {
  const text = parsed.followUp ? `${parsed.reply} ${parsed.followUp}` : parsed.reply;
  const lines = splitReply(text);

  return {
    ...result,
    finalState: {
      ...result.finalState,
      candidateDomain:
        shouldReplaceFallbackCandidate(result.finalState.candidateDomain) &&
        result.finalState.classificationFallback
          ? parsed.suggestedDomain || result.finalState.candidateDomain
          : result.finalState.candidateDomain,
      candidateClassification:
        shouldReplaceFallbackCandidate(result.finalState.candidateClassification) &&
        result.finalState.classificationFallback
          ? parsed.suggestedClassification || result.finalState.candidateClassification
          : result.finalState.candidateClassification,
      candidateConfidence:
        result.finalState.candidateConfidence ??
        (result.finalState.classificationFallback
          ? normalizeConfidence(parsed.confidence)
          : null),
    },
    voice: {
      ...result.voice,
      baseText: result.voice.text,
      lines,
      text,
      responseSource: "ollama-refined",
    },
    intelligence: {
      ...metadata,
      suggestedDomain: parsed.suggestedDomain,
      suggestedClassification: parsed.suggestedClassification,
      confidence: parsed.confidence,
      followUp: parsed.followUp,
    },
  };
}

function mergeThreadAwareFallback(result, parsed, metadata) {
  const text = parsed.followUp ? `${parsed.reply} ${parsed.followUp}` : parsed.reply;
  const lines = splitReply(text);

  return {
    ...result,
    finalState: {
      ...result.finalState,
      candidateDomain:
        shouldReplaceFallbackCandidate(result.finalState.candidateDomain) &&
        result.finalState.classificationFallback
          ? parsed.suggestedDomain || result.finalState.candidateDomain
          : result.finalState.candidateDomain,
      candidateClassification:
        shouldReplaceFallbackCandidate(result.finalState.candidateClassification) &&
        result.finalState.classificationFallback
          ? parsed.suggestedClassification || result.finalState.candidateClassification
          : result.finalState.candidateClassification,
      candidateConfidence:
        result.finalState.candidateConfidence ??
        (result.finalState.classificationFallback
          ? normalizeConfidence(parsed.confidence)
          : null),
    },
    voice: {
      ...result.voice,
      baseText: result.voice.text,
      lines,
      text,
      responseSource: "thread-aware-fallback",
    },
    intelligence: metadata,
  };
}

function shouldReplaceFallbackCandidate(value) {
  return value == null || value === "" || value === "unknown";
}

function attachIntelligence(result, metadata) {
  return {
    ...result,
    voice: {
      ...result.voice,
      baseText: result.voice.text,
      responseSource: "deterministic",
    },
    intelligence: metadata,
  };
}

function buildThreadAwareFallbackRefinement({ promptPayload, parsed, input }) {
  const recommendationMode = promptPayload?.recommendationMode;
  const conversationMomentum = promptPayload?.conversationMomentum;
  const synthesis = Array.isArray(promptPayload?.conversationSynthesis)
    ? promptPayload.conversationSynthesis
    : [];
  const hypothesis = String(promptPayload?.conversationHypothesis || "").trim();
  const theoryRevision = promptPayload?.theoryRevision || null;
  const workingTheory = String(
    theoryRevision?.revisedTheory || hypothesis || ""
  ).trim();
  const inputLower = String(input || "").toLowerCase();
  const suggestedDomain =
    parsed?.suggestedDomain ||
    promptPayload?.engineState?.candidateDomain ||
    null;
  const suggestedClassification =
    parsed?.suggestedClassification ||
    promptPayload?.engineState?.candidateClassification ||
    null;
  const confidence = parsed?.confidence || "medium";

  if (recommendationMode?.stage !== "recommend") {
    return null;
  }

  if (!conversationMomentum?.likelyAnsweringPriorQuestion) {
    return null;
  }

  if (!workingTheory) {
    return null;
  }

  const threadLooksRetirementLike = synthesis.some((item) =>
    /\bretirement\b|\bidentity\b|\bafter work\b|\bcreation\b|\bbuilding\b/i.test(
      String(item || "")
    )
  );

  if (
    inputLower.includes("hide") &&
    threadLooksRetirementLike
  ) {
    return {
      reply:
        "That makes the pattern clearer. " +
        workingTheory +
        " I would separate the responsibilities you want to lay down from the creating you still want to keep before making any retirement decision.",
      followUp: "Does that feel closer to the real problem?",
      suggestedDomain,
      suggestedClassification,
      confidence,
    };
  }

  if (
    theoryRevision?.status === "revise" ||
    theoryRevision?.status === "replace"
  ) {
    const revisionRecommendation = buildRecommendationSentence({
      synthesis,
      inputLower,
      theoryRevision,
    });

    if (revisionRecommendation) {
      return {
        reply: `That's interesting. ${workingTheory} ${revisionRecommendation}`,
        followUp: "Does that feel closer to what this is really about?",
        suggestedDomain,
        suggestedClassification,
        confidence,
      };
    }
  }

  const fallbackRecommendation = buildRecommendationSentence({
    synthesis,
    inputLower,
    theoryRevision,
  });

  if (!fallbackRecommendation) {
    return null;
  }

  return {
    reply: `That makes the thread clearer. ${workingTheory} ${fallbackRecommendation}`,
    followUp: "Does that feel true to what is surfacing here?",
    suggestedDomain,
    suggestedClassification,
    confidence,
  };
}

function buildRecommendationSentence({
  synthesis = [],
  inputLower = "",
  theoryRevision = null,
}) {
  const joined = synthesis.join(" ").toLowerCase();

  if (
    theoryRevision?.status &&
    (theoryRevision.status === "revise" || theoryRevision.status === "replace")
  ) {
    const revised = String(theoryRevision.revisedTheory || "").toLowerCase();
    if (
      revised.includes("attention") ||
      revised.includes("matters most")
    ) {
      return "I would look at where your hours are actually going before treating this as a retirement decision, because the tension may be attention before it is escape.";
    }
  }

  if (joined.includes("retirement") || joined.includes("after work")) {
    return "I would name the parts of work you want freedom from before treating this as a retirement decision.";
  }

  if (joined.includes("work") && inputLower.includes("hide")) {
    return "I would separate what work is giving you from what it is helping you avoid before making a bigger change.";
  }

  return null;
}

function personalizeResult(result, personalContext = {}) {
  const relevantThread = personalContext.relevantThread;
  if (!relevantThread) {
    return result;
  }

  if (personalContext.captureIntent) {
    return result;
  }

  const missionName = relevantThread.missionName;
  const matchingCount = relevantThread.matchingCaptureCount || 0;
  const recentReference = relevantThread.mostRecentMatchingCapture;
  const sourceText = String(result.voice?.text || "");

  if (matchingCount === 0) {
    return result;
  }

  const specificReference = buildSpecificReference({
    missionName,
    recentReference,
    significance: relevantThread.significance,
  });

  const carryLine =
    matchingCount > 1
      ? specificReference
        ? `This has been live in your ${missionName.toLowerCase()} thread for a while, most recently around ${specificReference}.`
        : `This has been live in your ${missionName.toLowerCase()} thread for a while.`
      : specificReference
        ? `You've already been carrying this in your ${missionName.toLowerCase()} thread, especially around ${specificReference}.`
        : `This is already live in your ${missionName.toLowerCase()} thread.`;

  if (sourceText.toLowerCase().includes("already been carrying this")) {
    return result;
  }
  if (sourceText.toLowerCase().includes(`your ${missionName.toLowerCase()} thread`)) {
    return result;
  }

  const lines = [...(result.voice?.lines || [])];
  if (lines.length >= 2) {
    lines.splice(1, 0, carryLine);
  } else {
    lines.push(carryLine);
  }

  return {
    ...result,
    voice: {
      ...result.voice,
      lines,
      text: lines.join(" "),
    },
  };
}

function finalizeCaptureResult(result, input) {
  const text = buildCaptureResponse(result, input);
  const lines = splitReply(text);
  return {
    ...result,
    voice: {
      ...result.voice,
      baseText: result.voice?.text || "",
      lines,
      text,
      responseSource: "capture-confirmed",
    },
  };
}

function buildCaptureResponse(result, input) {
  const missionName = inferMissionName(
    result.finalState?.significance,
    result.finalState?.candidateDomain
  );
  const content = extractCaptureText(input) || String(input || "").trim();
  const specificReference = buildCaptureReference({ missionName, content });

  if (missionName && specificReference) {
    return `I'll keep that in your ${missionName.toLowerCase()} thread. ${specificReference} will stay live there, and we can come back to it when you need it.`;
  }

  if (missionName) {
    return `I'll keep that in your ${missionName.toLowerCase()} thread. It still matters, and we can come back to it without rebuilding it from scratch.`;
  }

  return "I'll keep that live for you. It still matters, and we can return to it without losing it in the noise.";
}

function buildCaptureReference({ missionName, content }) {
  const cleaned = String(content || "")
    .trim()
    .replace(/[.?!]+$/g, "")
    .trim();

  if (!cleaned || cleaned.length > 90) {
    return null;
  }

  const missionLower = String(missionName || "").toLowerCase();
  const normalized = cleaned.toLowerCase();

  if (missionLower === "family" && normalized.includes("caleb")) {
    const stripped = cleaned.replace(/^i want to\s+/i, "").trim();
    const softened = stripped.replace(/^take\b/i, "taking");
    return softened ? `The note about ${softened}` : cleaned;
  }

  if (missionLower === "health" && normalized.includes("weight")) {
    return "Wanting to lose weight";
  }

  if (missionLower === "retirement" && normalized.includes("retire")) {
    return "The retirement question";
  }

  if (missionLower === "faith" && normalized.includes("pray")) {
    return "Your return to prayer";
  }

  if (missionLower === "work" && normalized.includes("work")) {
    return cleaned;
  }

  if (missionLower === "publishing" && normalized.includes("book")) {
    return cleaned;
  }

  return cleaned;
}

function buildSpecificReference({ missionName, recentReference, significance }) {
  const raw = String(recentReference || "").trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/^remember this[:,-]?\s*/i, "")
    .replace(/^i (want|think|should|need|feel)\s+/i, "")
    .trim()
    .replace(/[.?!]+$/g, "")
    .trim();

  if (!cleaned) return null;
  if (cleaned.length > 90) return null;

  const missionLower = String(missionName || "").toLowerCase();
  const normalized = cleaned.toLowerCase();

  if (missionLower === "health" && significance === "weight_loss_goal") {
    return normalized.includes("lose weight") ? "wanting to lose weight" : cleaned;
  }

  if (missionLower === "faith" && significance === "prayer_concern") {
    return normalized.includes("prayed in weeks")
      ? "not having prayed in weeks"
      : cleaned;
  }

  if (missionLower === "work" && significance === "work_tradeoff") {
    return normalized.includes("hiding in work") ? "feeling like you're hiding in work" : cleaned;
  }

  if (missionLower === "publishing" && significance === "publishing_decision") {
    return normalized.includes("write another book")
      ? "wanting to write another book"
      : cleaned;
  }

  if (missionLower === "retirement" && significance === "future_life_transition") {
    return normalized.includes("want to retire") ? "wanting to retire" : cleaned;
  }

  if (missionLower === "family" && significance === "declared_family_value") {
    return normalized.includes("family matters most")
      ? "family mattering most"
      : cleaned;
  }

  return cleaned;
}

function splitReply(reply) {
  return reply
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildPromptDebug({ prompt, promptPayload }) {
  return {
    conversationHistory: promptPayload.recentHistory || [],
    continuityThread:
      promptPayload.progressionContext?.currentThread ||
      promptPayload.engineState?.significance ||
      null,
    progression:
      promptPayload.progressionContext?.progression ||
      promptPayload.engineState?.situationClassification ||
      null,
    significance: promptPayload.engineState?.significance || null,
    classification: promptPayload.engineState?.situationClassification || null,
    activeRole: promptPayload.engineState?.activeRole || null,
    secondaryRole: promptPayload.engineState?.secondaryRole || null,
    conversationSynthesis: promptPayload.conversationSynthesis || [],
    conversationHypothesis: promptPayload.conversationHypothesis || null,
    theoryRevision: promptPayload.theoryRevision || null,
    recommendationMode: promptPayload.recommendationMode || null,
    progressionContext: promptPayload.progressionContext || null,
    finalPrompt: prompt || [],
  };
}

function buildCaptureFallback(result) {
  const missionName = inferMissionName(result.finalState.significance);
  const threadLabel = missionName
    ? `your ${missionName.toLowerCase()} thread`
    : "the right thread";
  return `I'll keep that with ${threadLabel}. It still matters, and we can return to it without losing it in the noise.`;
}

function inferMissionName(significance, candidateDomain = null) {
  const mapping = {
    weight_loss_goal: "Health",
    energy_decline: "Health",
    exercise_commitment: "Health",
    declared_family_value: "Family",
    relationship_concern: "Family",
    family_time_tension: "Family",
    spiritual_drift: "Faith",
    prayer_concern: "Faith",
    calling_question: "Faith",
    work_tradeoff: "Work",
    burnout_risk: "Work",
    career_decision: "Work",
    publishing_decision: "Publishing",
    creative_drift: "Publishing",
    wounded_book_significance: "Publishing",
    future_life_transition: "Retirement",
    identity_transition: "Retirement",
    legacy_question: "Retirement",
  };

  if (mapping[significance]) {
    return mapping[significance];
  }

  const fallback = String(candidateDomain || "").trim().toLowerCase();
  if (!fallback) return null;

  const byDomain = {
    health: "Health",
    publishing: "Publishing",
    retirement: "Retirement",
    family: "Family",
    faith: "Faith",
    work: "Work",
  };

  return byDomain[fallback] || null;
}

async function generateDailyBrief({
  missions = [],
  captures = [],
  calendar = null,
  documents = null,
  email = null,
  finances = null,
}) {
  if (!intelligenceEnabled()) {
    return normalizeBriefLists(applyContextGrounding({
      enabled: false,
      source: "deterministic",
      provider: "ollama",
      brief: buildDeterministicBriefIntro({ missions, captures, calendar }),
      changed: [
        ...captures.slice(0, 2).map((capture) => capture.content),
        ...(calendar?.upcomingEvents || []).slice(0, 2).map(formatCalendarEvent),
      ].slice(0, 4),
      stillMatters: missions
        .filter((mission) => mission.recentCaptures?.length)
        .slice(0, 4)
        .map((mission) => mission.name),
      needsAttention: [],
      deservesProtection: buildDeterministicProtection({ missions, calendar }),
    }, { missions, captures, calendar, documents, email, finances }));
  }

  const prompt = buildDailyBriefPrompt({
    missions,
    captures,
    calendar,
    documents,
    email,
    finances,
  });
  const startedAt = Date.now();

  try {
    const response = await getValidDailyBriefResponse(prompt);
    const parsed = validateDailyBriefResponse(response.json);
    if (!parsed) {
      throw new Error("Daily brief response was not valid JSON.");
    }

    const groundedBrief = normalizeBriefLists(applyContextGrounding({
      enabled: true,
      source: "live",
      provider: "ollama",
      model: response.model,
      latencyMs: Date.now() - startedAt,
      ...parsed,
    }, { missions, captures, calendar, documents, email, finances }));
    writeDailyBriefCache(groundedBrief);
    return groundedBrief;
  } catch (error) {
    const cachedBrief = readDailyBriefCache();
    if (cachedBrief) {
      return {
        ...cachedBrief,
        source: "cached",
        cached: true,
        cacheAgeMs: Date.now() - Date.parse(cachedBrief.cachedAt || cachedBrief.generatedAt || 0),
        error: error.message,
      };
    }

    const fallbackBrief = normalizeBriefLists(applyContextGrounding({
      enabled: true,
      source: "fallback",
      provider: "ollama",
      model: DEFAULT_MODEL,
      latencyMs: Date.now() - startedAt,
      brief: buildDeterministicBriefIntro({ missions, captures, calendar }),
      changed: [
        ...captures.slice(0, 2).map((capture) => capture.content),
        ...(calendar?.upcomingEvents || []).slice(0, 2).map(formatCalendarEvent),
      ].slice(0, 4),
      stillMatters: missions
        .filter((mission) => mission.recentCaptures?.length)
        .slice(0, 4)
        .map((mission) => mission.name),
      needsAttention: calendar?.upcomingEvents?.length
        ? [`Today already has shape. Protect attention around ${formatCalendarEvent(calendar.upcomingEvents[0])}.`]
        : [],
      deservesProtection: buildDeterministicProtection({ missions, calendar }),
      error: error.message,
    }, { missions, captures, calendar, documents, email, finances }));
    writeDailyBriefCache(fallbackBrief);
    return fallbackBrief;
  }
}

async function getValidDailyBriefResponse(prompt) {
  const attempts = [
    {
      temperature: 0.15,
      timeoutMs: Math.max(DEFAULT_TIMEOUT_MS, 30000),
    },
    {
      temperature: 0.05,
      timeoutMs: Math.max(DEFAULT_TIMEOUT_MS + 5000, 45000),
    },
  ];

  let lastResponse = null;

  for (const attempt of attempts) {
    const response = await chatWithOllama({
      messages: prompt,
      temperature: attempt.temperature,
      timeoutMs: attempt.timeoutMs,
    });
    lastResponse = response;

    if (validateDailyBriefResponse(response.json)) {
      return response;
    }
  }

  return lastResponse;
}

function getIntelligenceDataDir() {
  return path.resolve(
    process.env.MONDAY_INTELLIGENCE_DATA_DIR ||
      path.resolve(__dirname, "../../../data/intelligence")
  );
}

function ensureIntelligenceDir() {
  fs.mkdirSync(getIntelligenceDataDir(), { recursive: true });
}

function getDailyBriefCachePath() {
  return path.join(getIntelligenceDataDir(), "daily-brief-cache.json");
}

function writeDailyBriefCache(brief) {
  ensureIntelligenceDir();
  const payload = {
    ...brief,
    cachedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    getDailyBriefCachePath(),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
}

function readDailyBriefCache() {
  try {
    const filePath = getDailyBriefCachePath();
    if (!fs.existsSync(filePath)) return null;
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const cachedAt = Date.parse(payload.cachedAt || payload.generatedAt || "");
    if (Number.isNaN(cachedAt)) return null;
    if (Date.now() - cachedAt > DAILY_BRIEF_CACHE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

function buildDeterministicBriefIntro({ missions = [], captures = [], calendar = null }) {
  const liveMission = missions.find((mission) => mission.recentCaptures?.length);

  if (captures.length && liveMission) {
    return `A few live threads are already waiting for you, especially around ${liveMission.name.toLowerCase()}. You do not need to rebuild context from zero this morning.`;
  }

  if (calendar?.upcomingEvents?.length) {
    return "The day already has shape. Monday should help you re-enter it with continuity instead of reconstruction.";
  }

  if (liveMission) {
    return `A few important threads are still alive, especially in ${liveMission.name.toLowerCase()}. The goal now is to keep what matters visible enough to return to.`;
  }

  return "Nothing new has been gathered yet. The important thing now is to keep a few live threads visible and worth returning to.";
}

function buildDeterministicProtection({ missions = [], calendar = null }) {
  const items = [];

  if (calendar?.nextEvent) {
    items.push(`Make room for ${formatCalendarEvent(calendar.nextEvent)}.`);
  }

  const familyMission = missions.find(
    (mission) => mission.name === "Family" && mission.recentCaptures?.length
  );
  if (familyMission) {
    items.push("Protect enough margin for family to receive more than your leftovers.");
  }

  return items.slice(0, 4);
}

function formatCalendarEvent(event) {
  if (!event) return "an upcoming event";
  const date = new Date(event.startAt);
  const time = Number.isNaN(date.getTime())
    ? "later"
    : date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
  return `${event.title} at ${time}`;
}

function applyContextGrounding(
  brief,
  { missions = [], captures = [], calendar, documents, email, finances }
) {
  const missionGrounded = applyMissionGrounding(brief, missions);
  const captureGrounded = applyCaptureGrounding(missionGrounded, captures);
  const calendarGrounded = applyCalendarGrounding(captureGrounded, calendar);
  const documentsGrounded = applyDocumentGrounding(calendarGrounded, documents);
  const emailGrounded = applyEmailGrounding(documentsGrounded, email);
  return applyFinancialGrounding(emailGrounded, finances);
}

function applyMissionGrounding(brief, missions) {
  const liveMissions = (missions || []).filter(
    (mission) => mission.recentCaptures?.length
  );
  if (!liveMissions.length) {
    return brief;
  }

  const firstMission = liveMissions[0];
  const briefText = String(brief.brief || "");
  const stillMatters = [...(brief.stillMatters || [])];
  const needsAttention = [...(brief.needsAttention || [])];
  const deservesProtection = [...(brief.deservesProtection || [])];
  const leadCapture = firstMission.recentCaptures?.[0] || null;
  const leadLabel = leadCapture
    ? humanizeCaptureContent(leadCapture.content, firstMission.id)
    : null;

  if (
    !stillMatters.some((item) =>
      leadLabel
        ? String(item).toLowerCase().includes(leadLabel.toLowerCase())
        : String(item).toLowerCase().includes(firstMission.name.toLowerCase())
    )
  ) {
    stillMatters.unshift(
      leadLabel
        ? `Keep in view: ${leadLabel}`
        : `${firstMission.name} is still live and worth returning to.`
    );
  }

  if (
    leadLabel &&
    !needsAttention.some((item) =>
      String(item).toLowerCase().includes(leadLabel.toLowerCase())
    )
  ) {
    needsAttention.unshift(
      `${firstMission.name} may need attention around ${leadLabel}.`
    );
  }

  if (
    firstMission.name === "Family" &&
    !deservesProtection.some((item) =>
      String(item).toLowerCase().includes("family")
    )
  ) {
    deservesProtection.unshift(
      "Protect enough attention for family to feel chosen, not merely fitted in."
    );
  }

  const nextBrief = briefText.toLowerCase().includes(firstMission.name.toLowerCase())
    ? briefText
    : `${briefText} ${firstMission.name} is still a live thread.`.trim();

  return {
    ...brief,
    brief: nextBrief,
    stillMatters: stillMatters.slice(0, 4),
    needsAttention: needsAttention.slice(0, 4),
    deservesProtection: deservesProtection.slice(0, 4),
  };
}

function applyCaptureGrounding(brief, captures) {
  const recentCaptures = (captures || []).slice(0, 2);
  if (!recentCaptures.length) {
    return brief;
  }

  const briefText = String(brief.brief || "");
  const changed = [...(brief.changed || [])];
  const stillMatters = [...(brief.stillMatters || [])];
  const needsAttention = [...(brief.needsAttention || [])];
  const deservesProtection = [...(brief.deservesProtection || [])];
  const firstCapture = recentCaptures[0];
  const captureLabel = humanizeCaptureContent(
    firstCapture.content,
    firstCapture.missionId
  );
  const missionName = inferMissionName(
    firstCapture.significance,
    firstCapture.missionId
  );

  for (const capture of recentCaptures) {
    if (!changed.some((item) => String(item).includes(capture.content))) {
      changed.push(capture.content);
    }
  }

  if (
    !stillMatters.some((item) =>
      String(item).toLowerCase().includes(captureLabel.toLowerCase())
    )
  ) {
    stillMatters.unshift(`Keep in view: ${captureLabel}`);
  }

  if (
    missionName &&
    !needsAttention.some((item) =>
      String(item).toLowerCase().includes(captureLabel.toLowerCase())
    )
  ) {
    needsAttention.unshift(
      `${missionName} may need attention around ${captureLabel}.`
    );
  }

  if (
    missionName &&
    (firstCapture.missionId === "family" || firstCapture.missionId === "faith") &&
    !deservesProtection.some((item) =>
      String(item).toLowerCase().includes(captureLabel.toLowerCase())
    )
  ) {
    deservesProtection.unshift(`Protect ${captureLabel} from getting crowded out.`);
  }

  const nextBrief = briefText.toLowerCase().includes(captureLabel.toLowerCase())
    ? briefText
    : `${briefText} ${capitalizeFragment(captureLabel)} is still live.`.trim();

  return {
    ...brief,
    brief: nextBrief,
    changed: changed.slice(0, 4),
    stillMatters: stillMatters.slice(0, 4),
    needsAttention: needsAttention.slice(0, 4),
    deservesProtection: deservesProtection.slice(0, 4),
  };
}

function capitalizeFragment(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;
}

function humanizeCaptureContent(content, missionId = null) {
  const cleaned = String(content || "")
    .trim()
    .replace(/[.?!]+$/g, "")
    .trim();

  if (!cleaned) {
    return "";
  }

  const normalized = cleaned.toLowerCase();
  const mission = String(missionId || "").toLowerCase();

  if (mission === "health" && normalized.includes("lose weight")) {
    return "wanting to lose weight";
  }

  if (mission === "family" && normalized.includes("caleb")) {
    return cleaned
      .replace(/^take\b/i, "taking")
      .replace(/^i want to\s+/i, "")
      .trim();
  }

  if (mission === "faith" && normalized.includes("pray")) {
    return "returning to prayer";
  }

  if (mission === "retirement" && normalized.includes("retire")) {
    return "the retirement question";
  }

  if (mission === "publishing" && normalized.includes("book")) {
    return "the writing question";
  }

  if (mission === "work" && normalized.includes("work")) {
    return cleaned.replace(/^i think i am\s+/i, "").trim();
  }

  return cleaned;
}

function joinNaturalList(items = []) {
  const values = (items || []).filter(Boolean);
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function applyCalendarGrounding(brief, calendar) {
  if (!calendar?.upcomingEvents?.length) {
    return brief;
  }

  const nextEventLabel = formatCalendarEvent(calendar.upcomingEvents[0]);
  const upcomingLabels = calendar.upcomingEvents
    .slice(0, 2)
    .map(formatCalendarEvent);
  const briefText = String(brief.brief || "");
  const alreadyMentionedInBrief = briefText.toLowerCase();

  const changed = [...(brief.changed || [])];
  for (const label of upcomingLabels) {
    if (!changed.some((item) => String(item).includes(label))) {
      changed.push(label);
    }
  }

  const needsAttention = [...(brief.needsAttention || [])];
  if (!alreadyMentionedInBrief.includes(nextEventLabel.toLowerCase())) {
    needsAttention.unshift(`The day already has shape around ${nextEventLabel}.`);
  }

  const deservesProtection = [...(brief.deservesProtection || [])];
  if (
    !deservesProtection.some((item) =>
      String(item).toLowerCase().includes(nextEventLabel.toLowerCase())
    )
  ) {
    deservesProtection.unshift(`Protect margin around ${nextEventLabel}.`);
  }

  const calendarSentence = `The day already has shape, beginning with ${nextEventLabel}.`;
  const nextBrief = alreadyMentionedInBrief.includes(nextEventLabel.toLowerCase())
    ? briefText
    : `${calendarSentence} ${briefText}`.trim();

  return {
    ...brief,
    brief: nextBrief,
    changed: changed.slice(0, 4),
    needsAttention: needsAttention.slice(0, 4),
    deservesProtection: deservesProtection.slice(0, 4),
  };
}

function applyDocumentGrounding(brief, documents) {
  const docs = documents?.documents || [];
  if (!docs.length) {
    return brief;
  }

  const firstDoc = docs[0];
  const docLabel = firstDoc.title;
  const briefText = String(brief.brief || "");
  const changed = [...(brief.changed || [])];
  const stillMatters = [...(brief.stillMatters || [])];
  const needsAttention = [...(brief.needsAttention || [])];

  if (!changed.some((item) => String(item).includes(docLabel))) {
    changed.push(`Relevant document: ${docLabel}`);
  }

  if (
    firstDoc.summary &&
    !stillMatters.some((item) =>
      String(item).toLowerCase().includes(docLabel.toLowerCase())
    )
  ) {
    stillMatters.push(`${docLabel}: ${firstDoc.summary}`);
  }

  if (
    firstDoc.excerpt &&
    !needsAttention.some((item) =>
      String(item).toLowerCase().includes(docLabel.toLowerCase())
    )
  ) {
    needsAttention.push(`${docLabel} is carrying context worth revisiting.`);
  }

  const nextBrief = briefText.toLowerCase().includes(docLabel.toLowerCase())
    ? briefText
    : `${briefText} A live document is also in play: ${docLabel}.`.trim();

  return {
    ...brief,
    brief: nextBrief,
    changed: changed.slice(0, 4),
    stillMatters: stillMatters.slice(0, 4),
    needsAttention: needsAttention.slice(0, 4),
  };
}

function applyEmailGrounding(brief, email) {
  const threads = email?.threads || [];
  if (!threads.length) {
    return brief;
  }

  const firstThread = threads[0];
  const subject = firstThread.subject;
  const briefText = String(brief.brief || "");
  const changed = [...(brief.changed || [])];
  const needsAttention = [...(brief.needsAttention || [])];
  const deservesProtection = [...(brief.deservesProtection || [])];

  if (!changed.some((item) => String(item).includes(subject))) {
    changed.push(`Inbox thread: ${subject}`);
  }

  if (
    firstThread.unread &&
    !needsAttention.some((item) =>
      String(item).toLowerCase().includes(subject.toLowerCase())
    )
  ) {
    needsAttention.push(`${subject} is still waiting in the inbox.`);
  }

  if (
    firstThread.missionId === "family" &&
    !deservesProtection.some((item) =>
      String(item).toLowerCase().includes("family")
    )
  ) {
    deservesProtection.push("Family-related communication deserves careful attention.");
  }

  const nextBrief = briefText.toLowerCase().includes(subject.toLowerCase())
    ? briefText
    : `${briefText} An inbox thread is also in play: ${subject}.`.trim();

  return {
    ...brief,
    brief: nextBrief,
    changed: changed.slice(0, 4),
    needsAttention: needsAttention.slice(0, 4),
    deservesProtection: deservesProtection.slice(0, 4),
  };
}

function applyFinancialGrounding(brief, finances) {
  const accounts = finances?.accounts || [];
  if (!accounts.length) {
    return brief;
  }

  const account = accounts[0];
  const accountLabel = `${account.name}${account.balance != null ? ` (${formatCurrency(account.balance)})` : ""}`;
  const briefText = String(brief.brief || "");
  const changed = [...(brief.changed || [])];
  const stillMatters = [...(brief.stillMatters || [])];
  const needsAttention = [...(brief.needsAttention || [])];

  if (!changed.some((item) => String(item).includes(account.name))) {
    changed.push(`Financial context: ${accountLabel}`);
  }

  if (
    !stillMatters.some((item) =>
      String(item).toLowerCase().includes(account.name.toLowerCase())
    )
  ) {
    stillMatters.push(`${account.name} remains part of the current financial picture.`);
  }

  if (
    account.watchLabel &&
    !needsAttention.some((item) =>
      String(item).toLowerCase().includes(account.watchLabel.toLowerCase())
    )
  ) {
    needsAttention.push(`${account.watchLabel} deserves attention in the financial picture.`);
  }

  const nextBrief = briefText.toLowerCase().includes(account.name.toLowerCase())
    ? briefText
    : `${briefText} Financial context is also in play through ${account.name}.`.trim();

  return {
    ...brief,
    brief: nextBrief,
    changed: changed.slice(0, 4),
    stillMatters: stillMatters.slice(0, 4),
    needsAttention: needsAttention.slice(0, 4),
  };
}

function normalizeBriefLists(brief) {
  return {
    ...brief,
    changed: dedupeSignals(brief.changed),
    stillMatters: dedupeSignals(brief.stillMatters),
    needsAttention: dedupeSignals(brief.needsAttention),
    deservesProtection: dedupeSignals(brief.deservesProtection),
  };
}

function dedupeSignals(items = []) {
  const seen = new Set();
  const result = [];

  for (const item of items || []) {
    const value = String(item || "").trim();
    if (!value) continue;
    const normalized = normalizeSignalKey(value);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }

  return result.slice(0, 4);
}

function normalizeSignalKey(value) {
  return value
    .toLowerCase()
    .replace(/^the day already has shape(?:,| around)?\s*/i, "")
    .replace(/^today already has shape(?:,| around)?\s*/i, "")
    .replace(/^[.:,\s-]+/, "")
    .replace(/^protect attention around\s*/i, "")
    .replace(/^protect margin around\s*/i, "")
    .replace(/^leave margin around\s*/i, "")
    .replace(/^make room for\s*/i, "")
    .replace(/^[.:,\s-]+/, "")
    .replace(/[.!]$/g, "")
    .trim();
}

function formatCurrency(amount) {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "unknown";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

module.exports = {
  applyMondayIntelligence,
  generateDailyBrief,
  intelligenceEnabled,
  shouldAcceptRefinement,
};
