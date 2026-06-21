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

function read({ section = "all" } = {}) {
  const data = readFile("financial.json");
  const result = {};

  if (section === "all" || section === "accounts") {
    result.accounts = (data.accounts || []).map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: a.balance,
      watchLabel: a.watchLabel,
    }));
  }
  if (section === "all" || section === "transactions") {
    result.transactions = data.transactions || [];
  }
  if (section === "all" || section === "summary") {
    const accounts = data.accounts || [];
    result.summary = {
      accountCount: accounts.length,
      totalBalance: accounts.reduce((sum, a) => sum + (a.balance || 0), 0),
      source: data.source || "local",
      updatedAt: data.updatedAt,
    };
  }

  return { ok: true, data: result };
}

module.exports = { read };
