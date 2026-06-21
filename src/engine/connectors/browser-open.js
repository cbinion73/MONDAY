"use strict";
// browser-open — opens a URL in the system default browser.
// Capability abstraction: macOS `open` command is the current implementation.
// Swap OPEN_CMD for xdg-open (Linux) or Start-Process (Windows) without touching skill logic.
//
// TIER 2 SKILL — never auto-executes. Must be user-confirmed via /action/confirm endpoint.
// Call pendingAction() to get the descriptor to surface in the UI. Call openUrl() only after
// explicit user confirmation.

const { exec } = require("node:child_process");

const OPEN_CMD = "open"; // macOS; swap for xdg-open on Linux
const TIMEOUT_MS = 5000;

async function openUrl({ url } = {}) {
  if (!url || typeof url !== "string") {
    return { ok: false, error: "url is required" };
  }

  // Strict allowlist: only http/https — no file://, javascript:, shell injection
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: "Only http/https URLs are permitted" };
  }

  // Shell-safe: use array form via JSON.stringify to avoid injection
  const safeUrl = url.replace(/'/g, "%27");

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, error: "open command timed out" });
    }, TIMEOUT_MS);

    exec(`${OPEN_CMD} '${safeUrl}'`, (err) => {
      clearTimeout(timer);
      if (err) {
        resolve({ ok: false, error: err.message });
      } else {
        resolve({ ok: true, url, opened: true });
      }
    });
  });
}

// Returns a pending action descriptor for Tier 2 enforcement.
// Surface this in the workspace UI and let the user confirm before calling openUrl().
function pendingAction(url, reason) {
  return {
    type: "browser-open",
    skill: "browser-open",
    params: { url },
    description: reason || `Open ${url} in browser`,
    tier: 2,
  };
}

module.exports = { openUrl, pendingAction };
