const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.MONDAY_OLLAMA_ENABLED = "false";

process.env.MONDAY_CONNECTORS_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-connectors-email"
);

const {
  importEmailThreads,
  getEmailSummary,
  clearEmailThreads,
  getDataDir,
} = require("../src/engine/connectors/email-context");
const { generateDailyBrief } = require("../src/engine/intelligence/monday-intelligence");

async function main() {
  fs.rmSync(getDataDir(), { recursive: true, force: true });
  importEmailThreads(
    [
      {
        subject: "Camp forms still missing",
        from: "Scout Leader",
        snippet: "Can you send the remaining summer camp forms today?",
        unread: true,
      },
      {
        subject: "Retirement planning follow-up",
        from: "Advisor",
        snippet: "I pulled together a few questions about timing and cash flow.",
        unread: false,
      },
    ],
    { source: "test" }
  );

  const email = getEmailSummary();
  assert.equal(email.source, "test");
  assert.equal(email.totalThreads, 2);
  assert.equal(email.unreadCount, 1);

  const brief = await generateDailyBrief({
    missions: [],
    captures: [],
    calendar: null,
    documents: null,
    email,
  });

  assert.equal(brief.enabled, false);
  const referencedSubject = brief.brief.includes("Camp forms still missing")
    ? "Camp forms still missing"
    : "Retirement planning follow-up";
  assert.ok(brief.brief.includes(referencedSubject));
  assert.ok(brief.changed.some((item) => item.includes(referencedSubject)));
  if (referencedSubject === "Camp forms still missing") {
    assert.ok(
      brief.needsAttention.some((item) => item.includes("Camp forms still missing"))
    );
  }

  clearEmailThreads();
  fs.rmSync(getDataDir(), { recursive: true, force: true });
  console.log("Monday email context tests passed.");
}

main();
