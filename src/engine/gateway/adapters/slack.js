"use strict";
// Slack adapter — handles Slack slash commands and Events API.
//
// Slack setup:
//   1. Create a Slack app at https://api.slack.com/apps
//   2. Add a slash command (e.g. /monday) pointing to:
//      http://your-public-url:4312/gateway/slack
//   3. Or enable Event Subscriptions → Request URL: same URL
//      Subscribe to: message.im (DMs to the bot)
//   4. Set env vars:
//      MONDAY_SLACK_SIGNING_SECRET=<signing secret from Slack app Basic Info>
//      MONDAY_ALLOWED_SENDERS=<your Slack user ID (starts with U)>
//   5. Install app to your workspace
//
// Supports:
//   - Slash commands: /monday what should I focus on today?
//   - DM messages via Events API (message.im event)
//
// Slack requires a 200 response within 3 seconds for slash commands.
// Monday's response is returned synchronously in the HTTP body.
// For responses > 3s, Slack provides a response_url for async delivery.

const { verifySlack, enforceSenderAllowlist } = require("../middleware/auth");

/**
 * Parse and verify an inbound Slack request.
 * Handles both slash commands and Events API payloads.
 * @returns {{ ok, ping?, event?, status?, error? }}
 */
async function parse(req, rawBody) {
  const authResult = verifySlack({ headers: req.headers, rawBody });
  if (!authResult.ok) return { ok: false, status: 401, error: authResult.reason };

  const contentType = req.headers["content-type"] || "";

  // Slash command: application/x-www-form-urlencoded
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    const senderId = params.get("user_id") || "unknown";
    const text = (params.get("text") || "").trim();
    const responseUrl = params.get("response_url") || null;
    const command = params.get("command") || "/monday";

    if (!text) {
      return {
        ok: false,
        status: 200,
        slackResponse: { text: "Say something. `/monday what should I focus on today?`" },
        error: "empty slash command",
      };
    }

    const senderCheck = enforceSenderAllowlist(senderId);
    if (!senderCheck.ok) {
      return {
        ok: false,
        status: 200,
        slackResponse: { text: "I only talk to Chris.", response_type: "ephemeral" },
        error: senderCheck.reason,
      };
    }

    return {
      ok: true,
      event: {
        channel: "slack",
        senderId,
        text,
        responseUrl,
        command,
        rawBody,
        reset: text.toLowerCase() === "reset",
        deliveryMode: "sync", // reply in the slash command response
      },
    };
  }

  // Events API: application/json
  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }

  // Slack URL verification challenge
  if (body.type === "url_verification") {
    return { ok: true, ping: true, challenge: body.challenge };
  }

  // Event callback
  if (body.type === "event_callback") {
    const event = body.event || {};

    // Only handle message events from real users (not bots)
    if (event.type !== "message" || event.bot_id || event.subtype) {
      return { ok: true, ignored: true };
    }

    const senderId = event.user || "unknown";
    const text = (event.text || "").trim();
    if (!text) return { ok: true, ignored: true };

    const senderCheck = enforceSenderAllowlist(senderId);
    if (!senderCheck.ok) return { ok: true, ignored: true }; // silently ignore non-Chris

    return {
      ok: true,
      event: {
        channel: "slack",
        senderId,
        slackChannel: event.channel,
        text,
        rawBody,
        reset: text.toLowerCase() === "reset",
        deliveryMode: "async", // must use Slack Web API to reply
      },
    };
  }

  return { ok: true, ignored: true };
}

/**
 * Format Monday's reply for a Slack slash command (sync response).
 */
function formatReply(reply, event) {
  return {
    response_type: "in_channel",
    text: reply.length > 3000 ? reply.slice(0, 2997) + "..." : reply,
  };
}

/**
 * Format an async Slack reply (for events API — post via response_url or Web API).
 * Returns the body to POST to event.responseUrl if available.
 */
function formatAsyncReply(reply) {
  return {
    text: reply.length > 3000 ? reply.slice(0, 2997) + "..." : reply,
  };
}

module.exports = { parse, formatReply, formatAsyncReply };
