const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function ensureDataDir() {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

function getDataDir() {
  return path.resolve(
    process.env.MONDAY_CONNECTORS_DATA_DIR ||
      path.resolve(__dirname, "../../../data/connectors")
  );
}

function getFinancialPath() {
  return path.join(getDataDir(), "financial.json");
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function defaultStore() {
  return {
    updatedAt: null,
    source: "manual",
    accounts: [],
  };
}

function readFinancialStore() {
  ensureDataDir();
  return readJson(getFinancialPath(), defaultStore());
}

function writeFinancialStore(store) {
  ensureDataDir();
  writeJson(getFinancialPath(), {
    ...defaultStore(),
    ...store,
    updatedAt: new Date().toISOString(),
  });
}

function normalizeAccount(account = {}) {
  const balance =
    typeof account.balance === "number"
      ? account.balance
      : Number(account.balance);

  return {
    id: account.id || crypto.randomUUID(),
    name: String(account.name || "Unnamed account"),
    type: account.type ? String(account.type) : "general",
    balance: Number.isFinite(balance) ? balance : null,
    watchLabel: account.watchLabel ? String(account.watchLabel) : null,
    source: account.source ? String(account.source) : "manual",
    updatedAt: account.updatedAt || new Date().toISOString(),
  };
}

function importFinancialAccounts(accounts = [], options = {}) {
  const normalized = (accounts || [])
    .map(normalizeAccount)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  const store = {
    source: options.source || "manual",
    accounts: normalized,
  };

  writeFinancialStore(store);
  return store;
}

function clearFinancialAccounts() {
  writeFinancialStore(defaultStore());
}

function getFinancialSummary({ limit = 8 } = {}) {
  const store = readFinancialStore();
  return {
    updatedAt: store.updatedAt,
    source: store.source || "manual",
    totalAccounts: store.accounts.length,
    accounts: store.accounts.slice(0, limit),
  };
}

module.exports = {
  clearFinancialAccounts,
  getFinancialSummary,
  importFinancialAccounts,
  readFinancialStore,
  getDataDir,
};
