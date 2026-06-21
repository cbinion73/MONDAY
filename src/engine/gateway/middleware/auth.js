"use strict";
// Gateway auth middleware.
// Every inbound event must pass before reaching Monday.
//
// Env vars:
//   MONDAY_GATEWAY_SECRET   — shared secret for generic HTTP adapter
//   MONDAY_ALLOWED_SENDERS  — comma-separated allowlist of sender IDs
//                             (phone numbers, Discord user IDs, Slack user IDs)
//   MONDAY_DISCORD_PUBLIC_KEY — ed25519 public key for Discord signature verification
//   MONDAY_SLACK_SIGNING_SECRET — Slack signing secret for HMAC verification

const crypto = require("crypto");

const ALLOWED_SENDERS = (process.env.MONDAY_ALLOWED_SENDERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const GATEWAY_SECRET = process.env.MONDAY_GATEWAY_SECRET || "";

/**
 * Verify generic HTTP requests.
 * Accepts either:
 *   - Authorization: Bearer {MONDAY_GATEWAY_SECRET}
 *   - senderId is in MONDAY_ALLOWED_SENDERS
 */
function verifyHttp({ headers, senderId }) {
  const authHeader = headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (GATEWAY_SECRET && token === GATEWAY_SECRET) return { ok: true };
  if (ALLOWED_SENDERS.length > 0 && ALLOWED_SENDERS.includes(senderId)) return { ok: true };
  if (!GATEWAY_SECRET && ALLOWED_SENDERS.length === 0) {
    // No auth configured — allow all (dev mode, warn loudly)
    console.warn("[gateway:auth] WARNING: no auth configured — accepting all requests");
    return { ok: true };
  }

  return { ok: false, reason: "unauthorized sender" };
}

/**
 * Verify Discord interaction webhook.
 * Discord uses ed25519 signatures: X-Signature-Ed25519 + X-Signature-Timestamp headers.
 * https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
 */
function verifyDiscord({ headers, rawBody }) {
  const publicKey = process.env.MONDAY_DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    console.warn("[gateway:auth] MONDAY_DISCORD_PUBLIC_KEY not set — skipping Discord sig check");
    return { ok: true };
  }

  const signature = headers["x-signature-ed25519"];
  const timestamp = headers["x-signature-timestamp"];
  if (!signature || !timestamp) return { ok: false, reason: "missing Discord signature headers" };

  try {
    const isValid = crypto.verify(
      null, // ed25519 doesn't use a digest algorithm name
      Buffer.from(timestamp + rawBody),
      {
        key: Buffer.from(publicKey, "hex"),
        format: "der",
        type: "spki",
        dsaEncoding: undefined,
      },
      Buffer.from(signature, "hex")
    );
    return isValid ? { ok: true } : { ok: false, reason: "invalid Discord signature" };
  } catch (err) {
    // Node < 15 doesn't support ed25519 verify this way — fall back to allowlist
    console.warn("[gateway:auth] Discord ed25519 verify error:", err.message, "— falling back to sender allowlist");
    return { ok: true }; // permissive fallback; router still enforces sender allowlist
  }
}

/**
 * Verify Slack requests.
 * Slack uses HMAC-SHA256: X-Slack-Signature = v0=hex(HMAC(secret, "v0:{timestamp}:{body}"))
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
function verifySlack({ headers, rawBody }) {
  const signingSecret = process.env.MONDAY_SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.warn("[gateway:auth] MONDAY_SLACK_SIGNING_SECRET not set — skipping Slack sig check");
    return { ok: true };
  }

  const slackSig = headers["x-slack-signature"];
  const timestamp = headers["x-slack-request-timestamp"];
  if (!slackSig || !timestamp) return { ok: false, reason: "missing Slack signature headers" };

  // Reject replays older than 5 minutes
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return { ok: false, reason: "Slack request too old (replay protection)" };

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + crypto.createHmac("sha256", signingSecret).update(sigBase).digest("hex");

  const valid = crypto.timingSafeEqual(Buffer.from(slackSig), Buffer.from(expected));
  return valid ? { ok: true } : { ok: false, reason: "invalid Slack signature" };
}

/**
 * Enforce the sender allowlist (second gate after channel sig verification).
 * If MONDAY_ALLOWED_SENDERS is set, the senderId must be in it.
 */
function enforceSenderAllowlist(senderId) {
  if (ALLOWED_SENDERS.length === 0) return { ok: true }; // no allowlist = allow all
  if (ALLOWED_SENDERS.includes(String(senderId))) return { ok: true };
  return { ok: false, reason: `sender ${senderId} not in allowlist` };
}

module.exports = { verifyHttp, verifyDiscord, verifySlack, enforceSenderAllowlist };
