"use strict";
// Generic HTTP adapter — for testing, Siri Shortcuts, Automator, and any webhook caller.
//
// POST /gateway/message
// Headers:
//   Authorization: Bearer {MONDAY_GATEWAY_SECRET}
//   Content-Type: application/json
// Body:
//   { "senderId": "chris", "text": "What should I focus on today?" }
//
// Response:
//   { "reply": "...", "channel": "http", "senderId": "chris" }
//
// Siri Shortcuts setup:
//   1. Create a Shortcut that accepts "Text input"
//   2. Add "Get Contents of URL" action:
//      URL: http://your-mac-ip:4312/gateway/message
//      Method: POST
//      Headers: Authorization: Bearer {your-secret}
//      Body (JSON): { "senderId": "chris", "text": [Shortcut Input] }
//   3. Show "Contents of URL" in Notification
//   That's it — iMessage received → Shortcut triggered → Monday responds → Shortcut shows reply.

const { verifyHttp, enforceSenderAllowlist } = require("../middleware/auth");

/**
 * Parse and verify an inbound generic HTTP request.
 * @returns {{ ok, event?, status?, error? }}
 *   event shape: { channel, senderId, text, rawBody, reset }
 */
async function parse(req, rawBody) {
  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }

  const senderId = String(body.senderId || body.sender_id || "unknown").trim();
  const text = String(body.text || body.message || body.input || "").trim();
  const reset = body.reset === true;

  if (!text) return { ok: false, status: 400, error: "Missing text" };

  const authResult = verifyHttp({ headers: req.headers, senderId });
  if (!authResult.ok) return { ok: false, status: 401, error: authResult.reason };

  const senderCheck = enforceSenderAllowlist(senderId);
  if (!senderCheck.ok) return { ok: false, status: 403, error: senderCheck.reason };

  return {
    ok: true,
    event: { channel: "http", senderId, text, rawBody, reset },
  };
}

/**
 * Format Monday's reply for the HTTP response.
 * The HTTP adapter just returns JSON — the caller (Shortcuts, curl, etc.) handles delivery.
 */
function formatReply(reply, event) {
  return {
    reply,
    channel: "http",
    senderId: event.senderId,
  };
}

module.exports = { parse, formatReply };
