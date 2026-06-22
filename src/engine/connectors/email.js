"use strict";
const { readEmailStore } = require("./email-context");
const { retrieveIntelligentEmail } = require("./email-intelligence");

async function read({ limit = 10, missionId = null, unreadOnly = false, query = "" } = {}) {
  if (query && String(query).trim()) {
    const result = await retrieveIntelligentEmail({
      query: String(query).trim(),
      limit,
      missionId,
      unreadOnly,
    });
    const store = readEmailStore();
    return {
      ...result,
      unreadCount: (store.threads || []).filter((thread) => thread.unread).length,
      usedIntelligence: true,
    };
  }

  const store = readEmailStore();
  let threads = store.threads || [];
  if (missionId) threads = threads.filter((t) => t.missionId === missionId);
  if (unreadOnly) threads = threads.filter((t) => t.unread);
  return {
    ok: true,
    data: threads.slice(0, limit),
    count: threads.length,
    unreadCount: threads.filter((t) => t.unread).length,
    source: store.source || "local",
    usedIntelligence: false,
  };
}

module.exports = { read };
