"use strict";
// notification — sends a macOS system notification via osascript.
// Capability abstraction: osascript is the current implementation.
// Swap for node-notifier or a different OS without touching skill logic.
//
// TIER 3 SKILL — requires standing authority. Never auto-executes from the JARVIS loop.
// Standing authority = user has explicitly enabled notification-send in workspace
// AND workspace autonomy tier is set to 3 or higher.

const { exec } = require("node:child_process");
const TIMEOUT_MS = 5000;

async function sendNotification({ title, message, subtitle } = {}) {
  if (!title || typeof title !== "string") {
    return { ok: false, error: "title is required" };
  }
  if (!message || typeof message !== "string") {
    return { ok: false, error: "message is required" };
  }

  // Sanitize: strip quotes and backticks that could escape the osascript string
  const safe = (s) => String(s || "").replace(/["`\\]/g, "").slice(0, 200);

  const safeTitle = safe(title);
  const safeMessage = safe(message);
  const safeSubtitle = subtitle ? safe(subtitle) : null;

  let script = `display notification "${safeMessage}" with title "${safeTitle}"`;
  if (safeSubtitle) script += ` subtitle "${safeSubtitle}"`;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, error: "osascript timed out" });
    }, TIMEOUT_MS);

    exec(`osascript -e '${script}'`, (err) => {
      clearTimeout(timer);
      if (err) {
        resolve({ ok: false, error: err.message });
      } else {
        resolve({ ok: true, title: safeTitle, message: safeMessage, delivered: true });
      }
    });
  });
}

module.exports = { sendNotification };
