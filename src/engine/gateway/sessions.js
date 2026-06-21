"use strict";
// Gateway session store — persistent conversation state per sender+channel.
// Each channel (imessage, discord, slack, http) gets its own session namespace.
// Sessions are written to data/state/gateway-sessions.json.

const fs = require("fs");
const path = require("path");

const STATE_DIR = process.env.MONDAY_STATE_DIR
  ? path.resolve(process.env.MONDAY_STATE_DIR)
  : path.resolve(__dirname, "../../../data/state");

const SESSION_FILE = path.join(STATE_DIR, "gateway-sessions.json");
const MAX_HISTORY = 40; // messages per session
const SESSION_TTL_HOURS = 72; // sessions older than this get pruned

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function readSessions() {
  ensureDir();
  if (!fs.existsSync(SESSION_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeSessions(sessions) {
  ensureDir();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
}

function sessionKey(channel, senderId) {
  return `${channel}:${senderId}`;
}

function pruneStale(sessions) {
  const cutoff = Date.now() - SESSION_TTL_HOURS * 60 * 60 * 1000;
  for (const key of Object.keys(sessions)) {
    const s = sessions[key];
    if (s.lastActiveAt && Date.parse(s.lastActiveAt) < cutoff) {
      delete sessions[key];
    }
  }
  return sessions;
}

/**
 * Get or create a gateway session.
 * @param {string} channel - "imessage" | "discord" | "slack" | "http"
 * @param {string} senderId - phone number, Discord user ID, Slack user ID, etc.
 * @returns {object} session object (mutable reference — call saveSession after changes)
 */
function getOrCreateSession(channel, senderId) {
  const sessions = pruneStale(readSessions());
  const key = sessionKey(channel, senderId);

  if (!sessions[key]) {
    sessions[key] = {
      key,
      channel,
      senderId,
      context: {},
      messages: [],       // [{ user, monday, timestamp }]
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    writeSessions(sessions);
  }

  return sessions[key];
}

/**
 * Persist session changes after a turn.
 */
function saveSession(channel, senderId, updates) {
  const sessions = readSessions();
  const key = sessionKey(channel, senderId);
  sessions[key] = {
    ...sessions[key],
    ...updates,
    lastActiveAt: new Date().toISOString(),
  };
  writeSessions(sessions);
  return sessions[key];
}

/**
 * Push a message pair to session history.
 */
function appendMessage(channel, senderId, { user, monday }) {
  const session = getOrCreateSession(channel, senderId);
  const messages = [
    ...session.messages,
    { user, monday, timestamp: new Date().toISOString() },
  ].slice(-MAX_HISTORY);
  return saveSession(channel, senderId, { messages });
}

/**
 * List all active sessions (for debugging).
 */
function listSessions() {
  const sessions = readSessions();
  return Object.values(sessions).map((s) => ({
    key: s.key,
    channel: s.channel,
    senderId: s.senderId,
    messageCount: s.messages?.length || 0,
    lastActiveAt: s.lastActiveAt,
  }));
}

/**
 * Clear a specific session (reset conversation).
 */
function clearSession(channel, senderId) {
  const sessions = readSessions();
  const key = sessionKey(channel, senderId);
  delete sessions[key];
  writeSessions(sessions);
}

module.exports = { getOrCreateSession, saveSession, appendMessage, listSessions, clearSession };
