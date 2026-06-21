"use strict";
// Deliverable Store — workers write .md files here; Monday reviews them before surfacing.
// Primary location: Obsidian vault /Deliverables/ (auto-visible in Obsidian).
// Fallback: Monday drive or project data/ dir.

const fs = require("fs");
const path = require("path");

function getDeliverablesDir() {
  const vaultRoot = process.env.MONDAY_VAULT_ROOT;
  if (vaultRoot && fs.existsSync(vaultRoot)) {
    const dir = path.join(vaultRoot, "Deliverables");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dataDir = process.env.MONDAY_DATA_DIR;
  if (dataDir && fs.existsSync(dataDir)) {
    const dir = path.join(dataDir, "deliverables");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dir = path.join(process.cwd(), "data", "deliverables");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Write a worker deliverable as a .md file.
 *
 * @param {object} opts
 *   opts.source     - "synthesis" | "monitor" | "morning-digest" | "research"
 *   opts.domain     - "Retirement" | "Work" | etc. (null for cross-domain)
 *   opts.title      - short human-readable title
 *   opts.content    - full markdown body (no frontmatter — added here)
 *   opts.confidence - 0–1
 *   opts.metadata   - extra key/value pairs added to frontmatter
 * @returns {{ id, filePath }}
 */
function writeDeliverable({ source, domain = null, title = null, content, confidence = 0.5, metadata = {} }) {
  const dir = getDeliverablesDir();
  const now = new Date().toISOString();
  const slug = now.replace(/[:.]/g, "-").slice(0, 19);
  const id = `${source}-${slug}`;
  const filename = `${id}.md`;
  const filePath = path.join(dir, filename);

  const resolvedTitle = title || `${source} — ${slug}`;
  const extraLines = Object.entries(metadata)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");

  const frontmatter = [
    "---",
    `id: "${id}"`,
    `source: "${source}"`,
    `domain: "${domain || "general"}"`,
    `title: "${resolvedTitle}"`,
    `confidence: ${confidence}`,
    `created_at: "${now}"`,
    `reviewed: false`,
    extraLines || null,
    "---",
  ].filter(Boolean).join("\n");

  fs.writeFileSync(filePath, `${frontmatter}\n\n# ${resolvedTitle}\n\n${content.trim()}\n`, "utf8");
  console.log(`[deliverable-store] wrote: ${filename}`);
  return { id, filePath };
}

/**
 * Read a deliverable file. Returns { content, metadata } or null.
 */
function readDeliverable(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { content: raw, metadata: {} };

    const metadata = {};
    for (const line of match[1].split("\n")) {
      const colonIdx = line.indexOf(": ");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 2).trim().replace(/^"|"$/g, "");
      metadata[key] = val;
    }
    return { content: match[2].trim(), metadata };
  } catch {
    return null;
  }
}

/**
 * List unreviewed deliverables, oldest first.
 */
function listPendingDeliverables({ limit = 10 } = {}) {
  try {
    const dir = getDeliverablesDir();
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(".md"))
      .map(f => {
        const filePath = path.join(dir, f);
        const parsed = readDeliverable(filePath);
        return { filePath, filename: f, metadata: parsed?.metadata || {} };
      })
      .filter(({ metadata }) => metadata.reviewed !== "true")
      .sort((a, b) => (a.metadata.created_at || "") < (b.metadata.created_at || "") ? -1 : 1)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Mark a deliverable as reviewed (updates frontmatter in place).
 */
function markDeliverableReviewed(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (raw.includes("reviewed: true")) return true; // idempotent — already marked
    const now = new Date().toISOString();
    // Replace the reviewed flag, then append reviewed_at on the next line
    const updated = raw.replace(
      /^reviewed: false$/m,
      `reviewed: true\nreviewed_at: "${now}"`
    );
    fs.writeFileSync(filePath, updated, "utf8");
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  writeDeliverable,
  readDeliverable,
  listPendingDeliverables,
  markDeliverableReviewed,
  getDeliverablesDir,
};
