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
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const httpAdapter = require("./adapters/http");
const discordAdapter = require("./adapters/discord");
const slackAdapter = require("./adapters/slack");
const { dispatch, replyViaiMessage, replyViaSlackResponseUrl } = require("./router");
const { listSessions, clearSession } = require("./sessions");
const { getVaultRoot } = require("../obsidian/vault-manager");

const PORT = Number(process.env.MONDAY_GATEWAY_PORT || 4312);
const GATEWAY_SECRET = process.env.MONDAY_GATEWAY_SECRET || "";
const PUBLIC_DIR = path.join(__dirname, "public");
const PRESENCE_SENDER_ID = process.env.MONDAY_PRESENCE_SENDER_ID || "presence-web";

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

function serveFile(res, filePath, contentType) {
  const fullPath = path.join(PUBLIC_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(fullPath).pipe(res);
}

function mimeTypeForPublicPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml; charset=utf-8";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function tryServePublicPath(res, pathname) {
  const normalized = path.posix.normalize(pathname);
  if (!normalized.startsWith("/")) return false;
  if (normalized.includes("..")) return false;
  const relative = normalized.slice(1);
  if (!relative) return false;
  const fullPath = path.join(PUBLIC_DIR, relative);
  if (!fullPath.startsWith(PUBLIC_DIR)) return false;
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return false;
  serveFile(res, relative, mimeTypeForPublicPath(relative));
  return true;
}

function normalizeWikiTarget(rawTarget) {
  return rawTarget.split("|")[0].split("#")[0].trim();
}

async function listMarkdownFiles(root) {
  const collected = [];

  async function walk(directory) {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        collected.push(fullPath);
      }
    }
  }

  await walk(root);
  return collected;
}

function buildLookupKeys(relativePath) {
  const noExt = relativePath.replace(/\.md$/i, "");
  const basename = path.basename(noExt);
  const normalized = noExt.replace(/\\/g, "/");
  const withoutLeadingFolder = normalized.includes("/") ? normalized.slice(normalized.indexOf("/") + 1) : normalized;
  return new Set([
    normalized,
    basename,
    withoutLeadingFolder,
    normalized.toLowerCase(),
    basename.toLowerCase(),
    withoutLeadingFolder.toLowerCase(),
  ]);
}

async function parseVaultGraph() {
  const vaultRoot = getVaultRoot();
  const files = await listMarkdownFiles(vaultRoot);
  const nodes = [];
  const lookup = new Map();

  for (const file of files) {
    const relativePath = path.relative(vaultRoot, file).replace(/\\/g, "/");
    const id = relativePath.replace(/\.md$/i, "");
    const label = path.basename(relativePath, ".md");
    const node = { id, label, path: relativePath, degree: 0 };
    nodes.push(node);
    for (const key of buildLookupKeys(relativePath)) {
      if (!lookup.has(key)) lookup.set(key, id);
    }
  }

  const links = [];
  const seenLinks = new Set();
  const wikiPattern = /\[\[([^\]]+)\]\]/g;

  for (const node of nodes) {
    const raw = await fsp.readFile(path.join(vaultRoot, `${node.id}.md`), "utf8");
    for (const match of raw.matchAll(wikiPattern)) {
      const target = normalizeWikiTarget(match[1]);
      if (!target) continue;
      const resolved = lookup.get(target) || lookup.get(target.toLowerCase());
      if (!resolved || resolved === node.id) continue;
      const a = node.id < resolved ? node.id : resolved;
      const b = node.id < resolved ? resolved : node.id;
      const signature = `${a}::${b}`;
      if (seenLinks.has(signature)) continue;
      seenLinks.add(signature);
      links.push({ source: a, target: b });
    }
  }

  const degreeById = new Map(nodes.map((node) => [node.id, 0]));
  for (const link of links) {
    degreeById.set(link.source, (degreeById.get(link.source) || 0) + 1);
    degreeById.set(link.target, (degreeById.get(link.target) || 0) + 1);
  }

  for (const node of nodes) {
    node.degree = degreeById.get(node.id) || 0;
  }

  nodes.sort((left, right) => right.degree - left.degree || left.label.localeCompare(right.label));
  return {
    generatedAt: new Date().toISOString(),
    vaultRoot,
    nodes,
    links,
  };
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

async function handlePresenceMessage(req, res, rawBody) {
  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const text = String(body.text || "").trim();
  if (!text) {
    return sendJson(res, 400, { error: "Missing text" });
  }

  try {
    const { reply, surfacingPlan } = await dispatch({
      channel: "presence-web",
      senderId: PRESENCE_SENDER_ID,
      text,
      rawBody,
      reset: body.reset === true,
    });
    sendJson(res, 200, {
      reply,
      surfacingPlan: surfacingPlan || null,
      senderId: PRESENCE_SENDER_ID,
      channel: "presence-web",
    });
  } catch (err) {
    console.error("[gateway] presence dispatch error:", err.message);
    sendJson(res, 500, { error: "Monday encountered an error.", details: err.message });
  }
}

async function handlePresenceGraph(req, res) {
  try {
    const payload = await parseVaultGraph();
    sendJson(res, 200, payload);
  } catch (err) {
    console.error("[gateway] presence graph error:", err.message);
    sendJson(res, 500, { error: err.message });
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

async function handleCosts(req, res) {
  const auth = req.headers["authorization"] || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (GATEWAY_SECRET && token !== GATEWAY_SECRET) {
    return sendJson(res, 401, { error: "unauthorized" });
  }
  const { getCostSummary, getRecentCalls } = require("../db/cost-tracker");
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.searchParams.get("recent")) {
    const limit = Math.min(Number(url.searchParams.get("limit") || 20), 200);
    return sendJson(res, 200, { calls: getRecentCalls({ limit }) });
  }
  sendJson(res, 200, getCostSummary());
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

    if (req.method === "GET" && pathname === "/") {
      return serveFile(res, "index.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && tryServePublicPath(res, pathname)) {
      return;
    }
    if (req.method === "POST" && pathname === "/api/presence/message") {
      return handlePresenceMessage(req, res, rawBody);
    }
    if (req.method === "GET" && pathname === "/api/presence/graph") {
      return handlePresenceGraph(req, res);
    }

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
    if (req.method === "GET" && pathname === "/gateway/costs") {
      return handleCosts(req, res);
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
