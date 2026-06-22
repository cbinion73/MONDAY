"use strict";
// Gateway router — the bridge between inbound channel events and Monday's engine.
// Takes a normalized event, runs the full Monday turn pipeline, returns the reply.
// Owns session continuity across channels. Invisible to the user.

const { runMondayTurn } = require("../runtime/run-turn");
const {
  applyMondayIntelligence,
} = require("../intelligence/monday-intelligence");
const {
  buildPersonalContext,
  detectCaptureIntent,
  getRelevantThreadContext,
  recordCapture,
} = require("../personal/personal-store");
const {
  getCalendarSummary,
} = require("../connectors/calendar-context");
const {
  getDocumentsSummary,
} = require("../connectors/documents-context");
const {
  getEmailSummary,
} = require("../connectors/email-context");
const {
  getFinancialSummary,
} = require("../connectors/financial-context");
const {
  recordTurnLearning,
} = require("../learning/closed-loop-learning");
const { sendViaiMessage } = require("../channels/imessage");
const { routeModel } = require("../llm/model-router");
const {
  buildApprovalRequest,
  buildDeclineMessage,
  classifyApprovalInput,
  isExpensiveTier,
} = require("../llm/expensive-model-approval");
const sessions = require("./sessions");
const { processAfterTurn } = require("../workspace/workspace-manager");
const {
  findTravelPlanSkillResult,
  renderTravelPlanReply,
} = require("../skills/travel-plan-renderer");

const CHANNEL_LABEL = {
  http: "HTTP",
  discord: "Discord",
  slack: "Slack",
  imessage: "iMessage",
};

/**
 * Dispatch a normalized event through Monday's full turn pipeline.
 *
 * @param {object} event
 *   event.channel    — "http" | "discord" | "slack" | "imessage"
 *   event.senderId   — channel-specific user identifier
 *   event.text       — the message text
 *   event.reset      — if true, clear the session before processing
 * @returns {Promise<{ reply: string, session: object, truth: object }>}
 */
async function dispatch(event) {
  const { channel, senderId, text, reset = false } = event;

  console.log(`[gateway:router] ${CHANNEL_LABEL[channel] || channel} from ${senderId}: "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`);

  if (reset) {
    sessions.clearSession(channel, senderId);
    console.log(`[gateway:router] session reset for ${channel}:${senderId}`);
  }

  const session = sessions.getOrCreateSession(channel, senderId);
  const pendingApproval = session.context?.pendingExpensiveApproval || null;
  const approvalDecision = pendingApproval
    ? classifyApprovalInput(text)
    : "other";

  if (pendingApproval) {
    if (approvalDecision === "decline") {
      sessions.saveSession(channel, senderId, {
        context: {
          ...session.context,
          pendingExpensiveApproval: null,
        },
      });
      return { reply: buildDeclineMessage(), truth: null, domain: null };
    }
  }

  const pendingTravelIntake = session.context?.pendingTravelIntake || null;
  const travelContinuation =
    !pendingApproval &&
    pendingTravelIntake &&
    shouldContinuePendingTravel(text);

  const effectiveInput =
    pendingApproval && approvalDecision === "approve"
      ? pendingApproval.originalInput
      : travelContinuation
        ? `${pendingTravelIntake.originalQuery}\nTrip details: ${text}`
        : text;
  const effectiveHistory =
    pendingApproval && approvalDecision === "approve"
      ? pendingApproval.historySnapshot || []
      : session.messages;

  // Build context from session + personal store
  const mergedContext = {
    ...session.context,
    channel,
    senderId,
  };
  delete mergedContext.pendingExpensiveApproval;

  const personalContext = {
    ...buildPersonalContext(),
    captureIntent: detectCaptureIntent(effectiveInput),
    calendar: getCalendarSummary(),
    documents: getDocumentsSummary({ limit: 4 }),
    email: getEmailSummary({ limit: 4 }),
    finances: getFinancialSummary({ limit: 4 }),
    priorWorkingTheory: session.context?.workingTheory || null,
  };

  // Run the Monday engine
  const result = await runMondayTurn({
    input: effectiveInput,
    context: mergedContext,
    councilEnabled: false, // council reserved for sandbox dev; too slow for real-time channels
  });

  const preflightDecision = routeModel({
    domain: result.truth?.domain || result.finalState?.candidateDomain || null,
    significance: result.finalState?.significance || null,
    identityProximity: result.finalState?.identityProximity || null,
    woundRisk: result.finalState?.woundRisk || null,
    classificationFallback: result.finalState?.classificationFallback || false,
    input: effectiveInput,
  });

  if (approvalDecision !== "approve" && isExpensiveTier(preflightDecision.tier)) {
    const approvalRequest = buildApprovalRequest(preflightDecision, effectiveInput);
    sessions.saveSession(channel, senderId, {
      context: {
        ...session.context,
        pendingExpensiveApproval: {
          ...approvalRequest,
          originalInput: effectiveInput,
          historySnapshot: session.messages,
        },
      },
    });
    return { reply: approvalRequest.warning, truth: result.truth, domain: result.finalState.domain };
  }

  const enrichedPersonalContext = {
    ...personalContext,
    relevantThread: getRelevantThreadContext({
      significance: result.finalState.significance,
    }),
  };

  // ── JARVIS loop: skill invocation ──────────────────────────────────────────
  // Intent detection → trust gate → parallel execution → normalization → theory update.
  // Runs between engine resolution and LLM call so Monday answers from live data.
  const { invokeSkillsForTurn } = require("../skills/skill-invoker");
  const { updateTheoryFromEvidence } = require("../skills/theory-from-evidence");
  const { buildArtifactPlan } = require("../surfacing/artifact-planner");

  const turnDomain = result.truth?.domain || result.finalState?.domain || null;
  const turnWorkspaceId = turnDomain ? turnDomain.toLowerCase() : null;

  let skillInvocation = { used: false, skills: [], failed: [] };
  try {
    skillInvocation = await invokeSkillsForTurn(effectiveInput, {
      workspaceId: turnWorkspaceId,
      domain: turnDomain,
      channel,
      senderId,
    });
  } catch (err) {
    console.warn("[gateway:router] skill invocation error:", err.message);
  }

  const theoryEvidence = skillInvocation.used
    ? updateTheoryFromEvidence(personalContext.priorWorkingTheory, skillInvocation.skills)
    : null;

  const surfacingPlan =
    buildArtifactPlan({
      input: effectiveInput,
      domain: turnDomain,
      recommendedOutcome: result.finalState?.recommendedOutcome || null,
      skillResults: skillInvocation.skills,
    }) || skillInvocation.surfacingPlan || null;

  const finalPersonalContext = {
    ...enrichedPersonalContext,
    skillResults: skillInvocation.skills,
    theoryEvidence,
    surfacingPlan,
  };
  // ── end JARVIS loop ────────────────────────────────────────────────────────

  // Apply intelligence layer (Ollama/Claude refinement)
  const intelligentResult = await applyMondayIntelligence({
    result,
    input: effectiveInput,
    history: effectiveHistory,
    personalContext: finalPersonalContext,
  });

  const travelPlanSkill = findTravelPlanSkillResult(skillInvocation.skills);
  const travelPlanStatus = travelPlanSkill?.raw?.data?.status || null;
  const reply = travelPlanSkill
    ? renderTravelPlanReply(travelPlanSkill)
    : intelligentResult.voice.text;
  const domain = result.finalState?.domain || intelligentResult.truth?.domain || null;

  // ── Mission detection ──────────────────────────────────────────────────────
  if (domain) {
    try {
      const { detectMissionOpportunity } = require("../missions/mission-engine");
      const workspaceStore = require("../workspace/workspace-store");
      const wsLog = workspaceStore.getLog(domain.toLowerCase(), { limit: 40 });
      const suggestion = detectMissionOpportunity(domain, wsLog);
      if (suggestion.suggested) {
        console.log(`[gateway:router] mission suggestion: ${domain} — ${suggestion.reason}`);
      }
    } catch (err) {
      console.warn("[gateway:router] mission detection error:", err.message);
    }
  }

  // ── Voice memory ───────────────────────────────────────────────────────────
  if (channel === "imessage" || channel === "voice") {
    try {
      const { logVoiceTurn } = require("../voice/voice-memory");
      logVoiceTurn(text, intelligentResult.finalState, intelligentResult.truth);
    } catch (err) {
      console.warn("[gateway:router] voice memory error:", err.message);
    }
  }

  // Append to domain workspace log and sync working theory
  processAfterTurn({
    domain,
    userText: effectiveInput,
    mondayReply: reply,
    workingTheory: intelligentResult.workingTheory || null,
    skillsUsed: skillInvocation.skills.map((s) => s.skillId),
    channel,
  });

  // Persist session
  sessions.saveSession(channel, senderId, {
    context: {
      ...intelligentResult.nextContext,
      workingTheory: intelligentResult.workingTheory || null,
      pendingExpensiveApproval: null,
      pendingTravelIntake:
        travelPlanStatus === "needs_input"
          ? {
              originalQuery: travelContinuation
                ? effectiveInput
                : text,
              requestedAt: new Date().toISOString(),
            }
          : null,
    },
  });
  sessions.appendMessage(channel, senderId, { user: effectiveInput, monday: reply });

  // Record learning + capture
  recordTurnLearning({ input: effectiveInput, sessionId: `${channel}:${senderId}`, result: intelligentResult });
  if (personalContext.captureIntent) {
    recordCapture({
      input: effectiveInput,
      finalState: intelligentResult.finalState,
      truth: intelligentResult.truth,
      context: mergedContext,
    });
  }

  return {
    reply,
    truth: intelligentResult.truth,
    domain: result.finalState.domain,
    surfacingPlan,
  };
}

/**
 * Route a reply back through the iMessage channel.
 * Used when the event originated from an iMessage Shortcut
 * and we want to send the reply as an iMessage (not just return JSON).
 */
async function replyViaiMessage(senderId, reply) {
  if (!process.env.MONDAY_IMESSAGE_PHONE) return;
  return sendViaiMessage(reply, { phone: senderId }).catch((err) =>
    console.error("[gateway:router] iMessage reply failed:", err.message)
  );
}

/**
 * Send an async Slack reply via response_url.
 * Used for Events API messages (where the 3s window may have closed).
 */
async function replyViaSlackResponseUrl(responseUrl, body) {
  if (!responseUrl) return;
  try {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[gateway:router] Slack response_url delivery failed:", err.message);
  }
}

module.exports = { dispatch, replyViaiMessage, replyViaSlackResponseUrl };

function shouldContinuePendingTravel(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  return /\b(mon|monday|tue|tuesday|wed|wednesday|thu|thursday|fri|friday|sat|saturday|sun|sunday)\b/i.test(value) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i.test(value) ||
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(value) ||
    /\b(leaving|arriving|staying|hotel|reservation|tickets?|philadelphia|washington|statue of liberty|new york)\b/i.test(value);
}
