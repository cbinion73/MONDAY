const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.MONDAY_OLLAMA_ENABLED = "false";

process.env.MONDAY_CONNECTORS_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-connectors-documents"
);

const {
  importDocuments,
  getDocumentsSummary,
  clearDocuments,
  getDataDir,
} = require("../src/engine/connectors/documents-context");
const { generateDailyBrief } = require("../src/engine/intelligence/monday-intelligence");

async function main() {
  fs.rmSync(getDataDir(), { recursive: true, force: true });
  importDocuments(
    [
      {
        title: "Health Reset Notes",
        summary: "A simple plan for losing weight without turning it into another system.",
        excerpt: "Start with walking, protein, and sleep instead of chasing intensity.",
      },
      {
        title: "Retirement Questions",
        summary: "A live note about what retirement is really for.",
        excerpt: "Freedom, calling, and family time are all in tension here.",
      },
    ],
    { source: "test" }
  );

  const docs = getDocumentsSummary();
  assert.equal(docs.source, "test");
  assert.equal(docs.totalDocuments, 2);
  const byTitle = new Map(docs.documents.map((doc) => [doc.title, doc]));
  assert.equal(byTitle.get("Health Reset Notes").missionId, "health");
  assert.equal(byTitle.get("Retirement Questions").missionId, "retirement");

  const brief = await generateDailyBrief({
    missions: [],
    captures: [],
    calendar: null,
    documents: docs,
  });

  assert.equal(brief.enabled, false);
  const referencedTitle =
    brief.brief.includes("Health Reset Notes") ? "Health Reset Notes" : "Retirement Questions";
  assert.ok(brief.brief.includes(referencedTitle));
  assert.ok(brief.changed.some((item) => item.includes(referencedTitle)));
  assert.ok(brief.stillMatters.some((item) => item.includes(referencedTitle)));
  assert.ok(brief.needsAttention.some((item) => item.includes(referencedTitle)));

  clearDocuments();
  fs.rmSync(getDataDir(), { recursive: true, force: true });
  console.log("Monday documents context tests passed.");
}

main();
