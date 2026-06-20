const fs = require("node:fs");
const path = require("node:path");

function loadSandboxEnv(rootDir) {
  const candidates = [
    path.join(rootDir, ".env"),
    path.join(rootDir, ".env.local"),
    path.join(rootDir, ".env.example"),
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    loadEnvFile(filePath);
  }
}

function loadEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (!key) continue;
    if (process.env[key] != null && process.env[key] !== "") continue;

    process.env[key] = stripWrappingQuotes(value);
  }
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

module.exports = {
  loadSandboxEnv,
};
