"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.MONDAY_DB_PATH = ":memory:";

const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "monday-email-intel-"));
process.env.MONDAY_CONNECTORS_DATA_DIR = TEMP_DIR;

function fresh(mod) {
  delete require.cache[require.resolve(mod)];
  return require(mod);
}

const llmRouterPath = "../src/engine/llm/llm-router";
const llmRouter = fresh(llmRouterPath);
llmRouter.chatWithLLM = async ({ messages }) => {
  const payload = JSON.parse(messages[1].content);
  const threads = payload.threads.map((thread) => ({
    id: thread.id,
    threadType: /statue of liberty|philadelphia|washington/i.test(`${thread.subject} ${thread.body}`)
      ? "travel"
      : /sale|discount/i.test(`${thread.subject} ${thread.body}`)
        ? "promo"
        : "personal",
    domain: /statue of liberty|philadelphia|washington/i.test(`${thread.subject} ${thread.body}`) ? "Family" : null,
    significanceScore: /statue of liberty|philadelphia|washington/i.test(`${thread.subject} ${thread.body}`) ? 0.94 : 0.22,
    actionability: /statue of liberty|philadelphia|washington/i.test(`${thread.subject} ${thread.body}`) ? 0.88 : 0.1,
    entities: /statue of liberty|philadelphia|washington/i.test(`${thread.subject} ${thread.body}`)
      ? ["Philadelphia", "Washington, DC", "Statue of Liberty"]
      : [],
    confidence: 0.91,
  }));
  return { json: { threads } };
};

const {
  retrieveIntelligentEmail,
  buildIntelligenceRecord,
  extractStructuredFacts,
} = fresh("../src/engine/connectors/email-intelligence");
const { importEmailThreads } = fresh("../src/engine/connectors/email-context");
const { getEmailThreadFacts } = fresh("../src/engine/db/email-intelligence-store");
const { getEmailMemoryRecord } = fresh("../src/engine/db/email-memory-store");

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    fail++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    fail++;
  }
}

console.log("\nEmail Intelligence");

importEmailThreads([
  {
    id: "promo-1",
    source: "gmail",
    subject: "Last chance to save 25% off sitewide",
    from: "offers@example.com",
    snippet: "Use code GOAL25 at checkout",
    bodyText: "Use code GOAL25 at checkout. Manage preferences. Sale ends tonight.",
    unread: true,
    labelIds: ["INBOX", "CATEGORY_PROMOTIONS"],
    updatedAt: "2026-06-20T12:00:00.000Z",
  },
  {
    id: "travel-1",
    source: "gmail",
    subject: "Statue of Liberty Reserve Ticket Confirmation",
    from: "tickets@reserve.example.com",
    snippet: "Your visit is confirmed for June 26 at 10:00 AM.",
    bodyText: "Reservation number ABC12345. Statue of Liberty Reserve Ticket Confirmation. Visit date June 26, 2026 at 10:00 AM. Arrive 30 minutes early at Battery Park. Philadelphia hotel check-in is June 25. Washington, DC museum tickets are June 27. https://tickets.example.com/manage",
    unread: true,
    labelIds: ["INBOX", "CATEGORY_UPDATES"],
    updatedAt: "2026-06-21T08:00:00.000Z",
  },
  {
    id: "false-travel-1",
    source: "outlook",
    subject: "Exclusive briefing in Washington, DC",
    from: "contact@campaigns.example.com",
    snippet: "Join us for an urgent update from Washington.",
    bodyText: "Important movement in Washington, DC. Read the latest update and share your response today.",
    unread: true,
    inferenceClassification: "focused",
    updatedAt: "2026-06-21T09:00:00.000Z",
  },
], { source: "multi" });

test("buildIntelligenceRecord marks promotions as junk-heavy", () => {
  const record = buildIntelligenceRecord({
    subject: "Last chance to save 25% off sitewide",
    from: "offers@example.com",
    snippet: "Use code GOAL25 at checkout",
    bodyText: "Manage preferences sale ends tonight",
    labelIds: ["CATEGORY_PROMOTIONS"],
    updatedAt: "2026-06-20T12:00:00.000Z",
  }, "tickets in my email");
  assert.ok(record.junkScore >= 0.75, `junk score too low: ${record.junkScore}`);
});

test("extractStructuredFacts pulls travel details", () => {
  const facts = extractStructuredFacts({
    subject: "Statue of Liberty Reserve Ticket Confirmation",
    bodyText: "Reservation number ABC12345. Visit date June 26, 2026 at 10:00 AM. Arrive 30 minutes early at Battery Park. https://tickets.example.com/manage",
  });
  assert.ok(facts.some((fact) => fact.type === "reservation" && fact.value === "ABC12345"));
  assert.ok(facts.some((fact) => fact.type === "time" && /10:00 AM/i.test(fact.value)));
  assert.ok(facts.some((fact) => fact.type === "date" && /June 26/i.test(fact.value)));
});

testAsync("retrieveIntelligentEmail suppresses promos and ranks travel email first", async () => {
  const result = await retrieveIntelligentEmail({
    query: "plan my trip next week to Philadelphia, the Statue of Liberty, and Washington, DC. I have tickets in my email.",
    limit: 3,
  });
  assert.equal(result.ok, true);
  assert.ok(result.data.length >= 1, "expected at least one result");
  assert.equal(result.data[0].id, "travel-1");
  assert.ok(result.data.every((thread) => thread.id !== "promo-1"), "promo thread should have been filtered");
  assert.ok(result.data.every((thread) => thread.id !== "false-travel-1"), "travel-shaped campaign email should have been filtered");
  const facts = getEmailThreadFacts("travel-1");
  assert.ok(facts.some((fact) => fact.type === "reservation"), "expected reservation fact written to sqlite");
  const memoryRecord = getEmailMemoryRecord("travel-1");
  assert.ok(memoryRecord, "expected preserved correspondence record");
  assert.ok(memoryRecord.vectorDocId, "expected vector correspondence record");
});

console.log(`\nemail-intelligence: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
