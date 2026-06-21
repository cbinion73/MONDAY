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

function read({ query = null, missionId = null, limit = 10 } = {}) {
  const data = readFile("documents.json");
  let docs = data.documents || [];
  if (missionId) docs = docs.filter((d) => d.missionId === missionId);
  if (query) {
    const q = query.toLowerCase();
    docs = docs.filter(
      (d) =>
        d.title?.toLowerCase().includes(q) ||
        d.summary?.toLowerCase().includes(q) ||
        d.excerpt?.toLowerCase().includes(q)
    );
  }
  return { ok: true, data: docs.slice(0, limit), count: docs.length, source: data.source || "local" };
}

module.exports = { read };
