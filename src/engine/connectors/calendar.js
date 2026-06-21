"use strict";
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.MONDAY_CONNECTORS_DATA_DIR
  ? path.resolve(process.env.MONDAY_CONNECTORS_DATA_DIR)
  : path.resolve(__dirname, "../../../data/connectors");

function readFile(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
  } catch {
    return {};
  }
}

function read({ limit = 10, after = null } = {}) {
  const data = readFile("calendar-events.json");
  let events = data.events || [];
  if (after) {
    const afterMs = new Date(after).getTime();
    events = events.filter((e) => new Date(e.startAt).getTime() >= afterMs);
  }
  events = events.slice(0, limit);
  return { ok: true, data: events, count: events.length, source: data.source || "local" };
}

module.exports = { read };
