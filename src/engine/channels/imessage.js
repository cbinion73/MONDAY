"use strict";
// iMessage delivery via AppleScript + child_process.
// No npm deps. macOS only. Requires Messages.app to be configured.
//
// Usage:
//   MONDAY_IMESSAGE_PHONE="+15551234567" node daemon.js
//
// The phone number (or Apple ID email) is read from env: MONDAY_IMESSAGE_PHONE

const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const MAX_MESSAGE_LENGTH = 1000;
const DELIVERY_TIMEOUT_MS = 15000;

function buildAppleScript(phone, message) {
  // Escape backslashes and double-quotes for AppleScript string literals
  const escaped = message
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");

  return `
tell application "Messages"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy "${phone}" of targetService
  send "${escaped}" to targetBuddy
end tell
  `.trim();
}

/**
 * Send a message via iMessage.
 * @param {string} text  - message body (will be truncated at 1000 chars)
 * @param {object} opts
 *   opts.phone  - override phone number (defaults to MONDAY_IMESSAGE_PHONE env)
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendViaiMessage(text, opts = {}) {
  const phone = opts.phone || process.env.MONDAY_IMESSAGE_PHONE;

  if (!phone) {
    const msg = "MONDAY_IMESSAGE_PHONE not set — iMessage delivery skipped";
    console.warn("[imessage]", msg);
    return { ok: false, error: msg };
  }

  if (!text || typeof text !== "string") {
    return { ok: false, error: "No message text provided" };
  }

  const body = text.length > MAX_MESSAGE_LENGTH
    ? text.slice(0, MAX_MESSAGE_LENGTH - 3) + "..."
    : text;

  const script = buildAppleScript(phone, body);

  try {
    await execFileAsync("osascript", ["-e", script], {
      timeout: DELIVERY_TIMEOUT_MS,
    });
    console.log(`[imessage] delivered to ${phone} (${body.length} chars)`);
    return { ok: true };
  } catch (err) {
    const error = err.stderr || err.message || "unknown osascript error";
    console.error("[imessage] delivery failed:", error);
    return { ok: false, error };
  }
}

/**
 * Check whether iMessage delivery is configured and plausibly available.
 */
function isConfigured() {
  return !!process.env.MONDAY_IMESSAGE_PHONE && process.platform === "darwin";
}

module.exports = { sendViaiMessage, isConfigured };
