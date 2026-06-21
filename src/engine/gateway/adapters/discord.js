"use strict";
// Discord adapter — handles Discord bot interactions via webhook.
//
// Discord setup:
//   1. Create a Discord application at https://discord.com/developers/applications
//   2. Add a Bot to the application
//   3. Under "Interactions Endpoint URL", set: http://your-public-url:4312/gateway/discord
//      (requires a public URL — use ngrok or Cloudflare Tunnel locally)
//   4. Set env vars:
//      MONDAY_DISCORD_PUBLIC_KEY=<application public key from Discord dev portal>
//      MONDAY_ALLOWED_SENDERS=<your Discord user ID>
//   5. Add the bot to your server with the "bot" and "applications.commands" scopes
//   6. Monday receives messages when someone (you) @mentions the bot or DMs it
//
// Message flow:
//   Discord sends POST → /gateway/discord
//   We verify ed25519 signature → parse message → run Monday → reply via Discord response
//
// Two interaction types we handle:
//   Type 1: PING — Discord health check, must return { type: 1 }
//   Type 2: APPLICATION_COMMAND — slash command (not used here)
//   Type 0 (MESSAGE_CREATE): regular message via bot gateway events
//   Note: For simplicity we support the Interactions webhook model here.
//         For real-time message events, you'd also need a WebSocket bot (discord.js).
//         This adapter handles the webhook/interaction path only.

const { verifyDiscord, enforceSenderAllowlist } = require("../middleware/auth");

const DISCORD_PING_TYPE = 1;
const DISCORD_MESSAGE_RESPONSE_TYPE = 4; // CHANNEL_MESSAGE_WITH_SOURCE

/**
 * Parse and verify an inbound Discord interaction webhook.
 * @returns {{ ok, ping?, event?, discordResponse?, status?, error? }}
 */
async function parse(req, rawBody) {
  const authResult = verifyDiscord({ headers: req.headers, rawBody });
  if (!authResult.ok) return { ok: false, status: 401, error: authResult.reason };

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }

  // Discord PING — must respond immediately with type 1
  if (body.type === DISCORD_PING_TYPE) {
    return { ok: true, ping: true };
  }

  // Extract user info and message text
  const user = body.member?.user || body.user || {};
  const senderId = String(user.id || "unknown");
  const username = user.username || senderId;

  // APPLICATION_COMMAND (slash command)
  const slashText = body.data?.options?.[0]?.value || body.data?.name || "";
  // MESSAGE: body.content for regular messages (not interactions)
  const messageText = body.content || slashText || "";
  const text = messageText.trim();

  if (!text) return { ok: false, status: 400, error: "Empty message" };

  const senderCheck = enforceSenderAllowlist(senderId);
  if (!senderCheck.ok) {
    // Return a Discord-formatted 403 response
    return {
      ok: false,
      status: 200, // Discord expects 200 even for denied
      discordResponse: {
        type: DISCORD_MESSAGE_RESPONSE_TYPE,
        data: { content: "I only talk to Chris.", flags: 64 }, // ephemeral
      },
      error: senderCheck.reason,
    };
  }

  const interactionToken = body.token;
  const interactionId = body.id;

  return {
    ok: true,
    event: {
      channel: "discord",
      senderId,
      username,
      text,
      interactionToken,
      interactionId,
      rawBody,
      reset: text.toLowerCase() === "/reset",
    },
  };
}

/**
 * Format Monday's reply as a Discord interaction response.
 * Returns the response body to send back synchronously.
 */
function formatReply(reply, event) {
  // Truncate to Discord's 2000-char limit
  const content = reply.length > 1990 ? reply.slice(0, 1987) + "..." : reply;
  return {
    type: DISCORD_MESSAGE_RESPONSE_TYPE,
    data: { content },
  };
}

/**
 * Format an error reply as Discord response.
 */
function formatError(message) {
  return {
    type: DISCORD_MESSAGE_RESPONSE_TYPE,
    data: { content: message, flags: 64 }, // ephemeral
  };
}

module.exports = { parse, formatReply, formatError, DISCORD_PING_TYPE };
