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
const sessions = require("./sessions");
const { processAfterTurn } = require("../workspace/workspace-manager");

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

  // Build context from session + personal store
  const mergedContext = {
    ...session.context,
    channel,
    senderId,
  };

  const personalContext = {
    ...buildPersonalContext(),
    captureIntent: detectCaptureIntent(text),
    calendar: getCalendarSummary(),
    documents: getDocumentsSummary({ limit: 4 }),
    email: getEmailSummary({ limit: 4 }),
    finances: getFinancialSummary({ limit: 4 }),
    priorWorkingTheory: session.context?.workingTheory || null,
  };

  // Run the Monday engine
  const result = await runMondayTurn({
    input: text,
    context: mergedContext,
    councilEnabled: false, // council reserved for sandbox dev; too slow for real-time channels
  });

  const enrichedPersonalContext = {
    ...personalContext,
    relevantThread: getRelevantThreadContext({
      significance: result.finalState.significance,
    }),
  };

  // Apply intelligence layer (Ollama/Claude refinement)
  const intelligentResult = await applyMondayIntelligence({
    result,
    input: text,
    history: session.messages,
    personalContext: enrichedPersonalContext,
  });

  const reply = intelligentResult.voice.text;
  const domain = result.finalState?.domain || intelligentResult.truth?.domain || null;

  // Append to domain workspace log and sync working theory
  processAfterTurn({
    domain,
    userText: text,
    mondayReply: reply,
    workingTheory: intelligentResult.workingTheory || null,
    channel,
  });

  // Persist session
  sessions.saveSession(channel, senderId, {
    context: {
      ...intelligentResult.nextContext,
      workingTheory: intelligentResult.workingTheory || null,
    },
  });
  sessions.appendMessage(channel, senderId, { user: text, monday: reply });

  // Record learning + capture
  recordTurnLearning({ input: text, sessionId: `${channel}:${senderId}`, result: intelligentResult });
  if (personalContext.captureIntent) {
    recordCapture({
      input: text,
      finalState: intelligentResult.finalState,
      truth: intelligentResult.truth,
      context: mergedContext,
    });
  }

  return { reply, truth: intelligentResult.truth, domain: result.finalState.domain };
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
