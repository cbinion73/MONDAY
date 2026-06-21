"use strict";
// Monday Gateway Server — always-on inbound listener.
// Receives events from iMessage (Shortcuts), Discord, Slack, and generic HTTP.
// Dispatches to Monday's engine. Returns replies through the originating channel.
//
// Runs on port 4312 (separate from sandbox on 4311).
// Start with: npm run gateway
// Or started automatically by: npm run daemon
//
// Routes:
//   POST /gateway/message   — generic HTTP / Siri Shortcuts
//   POST /gateway/discord   — Discord interactions webhook
//   POST /gateway/slack     — Slack slash commands + Events API
//   GET  /gateway/health    — health check
//   GET  /gateway/sessions  — active session list (debug, requires secret)
//   POST /gateway/reset     — clear a session

const http = require("http");
const { URL } = require("url");

const httpAdapter = require("./adapters/http");
const discordAdapter = require("./adapters/discord");
const slackAdapter = require("./adapters/slack");
const { dispatch, replyViaiMessage, replyViaSlackResponseUrl } = require("./router");
const { listSessions, clearSession } = require("./sessions");

const PORT = Number(process.env.MONDAY_GATEWAY_PORT || 4312);
const GATEWAY_SECRET = process.env.MONDAY_GATEWAY_SECRET || "";

// ── Helpers ──────────────────────────────────────────────────────────────────

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function matchRoute(method, pathname, expectedMethod, expectedPath) {
  return req.method === expectedMethod && pathname === expectedPath;
}

// ── Route Handlers ────────────────────────────────────────────────────────────

async function handleGenericMessage(req, res, rawBody) {
  const parsed = await httpAdapter.parse(req, rawBody);

  if (!parsed.ok) {
    return sendJson(res, parsed.status || 400, { error: parsed.error });
  }

  const { event } = parsed;
  try {
    const { reply } = await dispatch(event);

    // If caller is Chris's phone via Shortcuts and wants iMessage reply-back
    if (event.senderId === process.env.MONDAY_IMESSAGE_PHONE) {
      replyViaiMessage(event.senderId, reply).catch(() => {});
    }

    sendJson(res, 200, httpAdapter.formatReply(reply, event));
  } catch (err) {
    console.error("[gateway] dispatch error:", err.message);
    sendJson(res, 500, { error: "Monday encountered an error.", details: err.message });
  }
}

async function handleDiscord(req, res, rawBody) {
  const parsed = await discordAdapter.parse(req, rawBody);

  if (!parsed.ok) {
    if (parsed.discordResponse) {
      return sendJson(res, parsed.status || 200, parsed.discordResponse);
    }
    return sendJson(res, parsed.status || 400, { error: parsed.error });
  }

  // Discord PING — respond immediately
  if (parsed.ping) {
    return sendJson(res, 200, { type: 1 });
  }

  if (parsed.ignored) {
    return sendJson(res, 200, { type: 1 }); // ack
  }

  const { event } = parsed;
  try {
    const { reply } = await dispatch(event);
    sendJson(res, 200, discordAdapter.formatReply(reply, event));
  } catch (err) {
    console.error("[gateway] Discord dispatch error:", err.message);
    sendJson(res, 200, discordAdapter.formatError("Monday encountered an error. Try again."));
  }
}

async function handleSlack(req, res, rawBody) {
  const parsed = await slackAdapter.parse(req, rawBody);

  if (!parsed.ok) {
    if (parsed.slackResponse) {
      return sendJson(res, parsed.status || 200, parsed.slackResponse);
    }
    return sendJson(res, parsed.status || 400, { error: parsed.error });
  }

  // Slack URL verification
  if (parsed.ping) {
    return sendJson(res, 200, { challenge: parsed.challenge });
  }

  // Silently ack ignored events (bots, subtypes, non-Chris)
  if (parsed.ignored) {
    return sendJson(res, 200, {});
  }

  const { event } = parsed;

  // Slash command: respond synchronously (Slack requires reply within 3s)
  if (event.deliveryMode === "sync") {
    try {
      const { reply } = await dispatch(event);
      sendJson(res, 200, slackAdapter.formatReply(reply, event));
    } catch (err) {
      console.error("[gateway] Slack sync dispatch error:", err.message);
      sendJson(res, 200, { text: "Monday encountered an error. Try again." });
    }
    return;
  }

  // Events API: ack immediately, then dispatch and deliver async
  sendJson(res, 200, {});
  try {
    const { reply } = await dispatch(event);
    if (event.responseUrl) {
      replyViaSlackResponseUrl(event.responseUrl, slackAdapter.formatAsyncReply(reply));
    }
    // If no responseUrl (Events API DM), would need Slack Web API — log for now
    if (!event.responseUrl) {
      console.log(`[gateway] Slack async reply (no responseUrl): "${reply.slice(0, 80)}"`);
    }
  } catch (err) {
    console.error("[gateway] Slack async dispatch error:", err.message);
  }
}

async function handleHealth(req, res) {
  const { getJobs } = require("../daemon/scheduler");
  sendJson(res, 200, {
    ok: true,
    port: PORT,
    gateway: "Monday Gateway",
    schedulerJobs: getJobs().length,
    uptime: process.uptime(),
  });
}

async function handleSessions(req, res) {
  // Require gateway secret to list sessions
  const auth = req.headers["authorization"] || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (GATEWAY_SECRET && token !== GATEWAY_SECRET) {
    return sendJson(res, 401, { error: "unauthorized" });
  }
  sendJson(res, 200, { sessions: listSessions() });
}

async function handleReset(req, res, rawBody) {
  const auth = req.headers["authorization"] || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (GATEWAY_SECRET && token !== GATEWAY_SECRET) {
    return sendJson(res, 401, { error: "unauthorized" });
  }

  let body;
  try { body = JSON.parse(rawBody || "{}"); } catch { body = {}; }
  const { channel, senderId } = body;
  if (!channel || !senderId) return sendJson(res, 400, { error: "Missing channel or senderId" });

  clearSession(channel, senderId);
  sendJson(res, 200, { ok: true, cleared: `${channel}:${senderId}` });
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS for local dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const rawBody = req.method !== "GET" ? await readBody(req) : "";

    if (req.method === "GET" && pathname === "/gateway/health") {
      return handleHealth(req, res);
    }
    if (req.method === "GET" && pathname === "/gateway/sessions") {
      return handleSessions(req, res);
    }
    if (req.method === "POST" && pathname === "/gateway/message") {
      return handleGenericMessage(req, res, rawBody);
    }
    if (req.method === "POST" && pathname === "/gateway/discord") {
      return handleDiscord(req, res, rawBody);
    }
    if (req.method === "POST" && pathname === "/gateway/slack") {
      return handleSlack(req, res, rawBody);
    }
    if (req.method === "POST" && pathname === "/gateway/reset") {
      return handleReset(req, res, rawBody);
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (err) {
    console.error("[gateway] unhandled error:", err.message);
    sendJson(res, 500, { error: "Internal gateway error" });
  }
});

function start() {
  server.listen(PORT, () => {
    console.log(`[gateway] Monday Gateway listening on port ${PORT}`);
    console.log(`[gateway] routes: /gateway/message, /gateway/discord, /gateway/slack`);
    console.log(`[gateway] auth: ${process.env.MONDAY_GATEWAY_SECRET ? "secret configured" : "⚠️  no secret set (dev mode)"}`);
    console.log(`[gateway] allowed senders: ${process.env.MONDAY_ALLOWED_SENDERS || "⚠️  none set (all allowed)"}`);
  });
  return server;
}

function stop() {
  server.close(() => console.log("[gateway] stopped"));
}

// Standalone mode: node src/engine/gateway/server.js
if (require.main === module) {
  process.on("SIGINT", () => { stop(); process.exit(0); });
  process.on("SIGTERM", () => { stop(); process.exit(0); });
  start();
}

module.exports = { start, stop };
