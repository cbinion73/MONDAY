"use strict";
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "../../../data/connectors");

function readFile(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
  } catch {
    return {};
  }
}

function read({ limit = 10, missionId = null, unreadOnly = false } = {}) {
  const data = readFile("email.json");
  let threads = data.threads || [];
  if (missionId) threads = threads.filter((t) => t.missionId === missionId);
  if (unreadOnly) threads = threads.filter((t) => t.unread);
  return {
    ok: true,
    data: threads.slice(0, limit),
    count: threads.length,
    unreadCount: threads.filter((t) => t.unread).length,
    source: data.source || "local",
  };
}

module.exports = { read };
