"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.MONDAY_DB_PATH = ":memory:";
process.env.MONDAY_MEMORY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "monday-katy-memory-"));

function fresh(mod) {
  delete require.cache[require.resolve(mod)];
  return require(mod);
}

const embedder = fresh("../src/engine/memory/embedder");
embedder.embed = async () => Array(768).fill(0.01);

const {
  shouldPreserveCorrespondence,
  preserveCorrespondenceThread,
} = fresh("../src/engine/correspondence/katy-stampwhistle");
const { getEmailMemoryRecord } = fresh("../src/engine/db/email-memory-store");
const { upsertEmailThread } = fresh("../src/engine/db/email-intelligence-store");
const { searchCorrespondence } = fresh("../src/engine/memory/memory-search");

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    fail++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    fail++;
  }
}

console.log("\nKaty Stampwhistle");

test("junk correspondence is not preserved", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "promo",
    providerCategory: "promotions",
    significanceScore: 0.1,
    relationshipScore: 0.1,
    actionability: 0.05,
    structuredFacts: [],
    userParticipated: false,
  });
  assert.equal(verdict.preserve, false);
});

test("transactional travel correspondence is preserved", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "travel",
    providerCategory: "updates",
    significanceScore: 0.92,
    relationshipScore: 0.45,
    actionability: 0.85,
    structuredFacts: [{ type: "reservation", value: "ABC123" }],
    entities: ["Philadelphia"],
    userParticipated: false,
    domain: "Family",
  });
  assert.equal(verdict.preserve, true);
  assert.ok(verdict.score >= 0.45);
});

test("promotional embroidery email misclassified as faith is not preserved", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "faith",
    providerCategory: "updates",
    significanceScore: 0.64,
    relationshipScore: 0.18,
    junkScore: 0.76,
    actionability: 0.22,
    structuredFacts: [],
    entities: ["Faith"],
    userParticipated: false,
    from: "dawn@creativeappliques.com",
    subject: "Last Day! 37 Patriotic ITH Designs for Just $14.99 - Ends Tonight!",
    snippet: "Limited time patriotic offer. Unsubscribe anytime.",
    bodyText: "Shop now. Sale ends tonight. Manage preferences or unsubscribe.",
    domain: "Faith",
  });
  assert.equal(verdict.preserve, false);
});

test("marketing wellness blast misclassified as family logistics is not preserved", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "family_logistics",
    providerCategory: "updates",
    significanceScore: 0.58,
    relationshipScore: 0.2,
    junkScore: 0.71,
    actionability: 0.18,
    structuredFacts: [],
    entities: ["Family"],
    userParticipated: false,
    from: "support@myhumehealth.com",
    subject: "Happy Father's Day",
    snippet: "A smarter week ahead. Limited time savings.",
    bodyText: "Special Father's Day offer. Save big. View in browser or unsubscribe.",
    domain: "Family",
  });
  assert.equal(verdict.preserve, false);
});

test("travel webinar without reservation evidence is not preserved", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "travel",
    providerCategory: "updates",
    significanceScore: 0.59,
    relationshipScore: 0.28,
    junkScore: 0.43,
    actionability: 0.18,
    structuredFacts: [
      { type: "date", value: "July 7, 2027" },
      { type: "time", value: "Noon EDT" },
    ],
    entities: ["Travel"],
    userParticipated: false,
    from: "memberbenefits@ausa.org",
    subject: "AUSA Member Only Savings on Travel",
    snippet: "Upcoming travel webinar July 7, 2027 at Noon EDT.",
    bodyText: "Join our webinar to learn more about upcoming group tours.",
    domain: "Family",
  });
  assert.equal(verdict.preserve, false);
});

test("one-way publishing newsletter without action is not preserved", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "work",
    providerCategory: "updates",
    significanceScore: 0.52,
    relationshipScore: 0.4,
    junkScore: 0.39,
    actionability: 0.08,
    structuredFacts: [{ type: "date", value: "June 21, 2026" }],
    entities: ["Publishing"],
    userParticipated: false,
    from: "post+the-weekender@substack.com",
    subject: "This week in writing",
    snippet: "Read online. Weekend edition.",
    bodyText: "View in browser. Weekend roundup for writers everywhere.",
    domain: "Work",
  });
  assert.equal(verdict.preserve, false);
});

test("wallet boilerplate does not count as durable transactional evidence", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "financial",
    providerCategory: "other",
    significanceScore: 0.49,
    relationshipScore: 0.3,
    junkScore: 0.45,
    actionability: 0,
    structuredFacts: [
      {
        type: "entry_instruction",
        value: "Sign in to your wallet to view your balance and expiration dates.",
      },
    ],
    entities: ["Publishing"],
    userParticipated: false,
    from: "Kohls@s.kohls.com",
    subject: "Psst, don’t forget your $5 Kohl’s Cash",
    snippet: "Now is the time for something new.",
    bodyText: "Your available Kohl's Cash balance is ready. Sign in to your wallet to view full details.",
    domain: "Retirement",
  });
  assert.equal(verdict.preserve, false);
});

test("newsletter-style military roundup is not preserved just because it has dated content", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "transactional",
    providerCategory: "focused",
    significanceScore: 0.47,
    relationshipScore: 0.4,
    junkScore: 0.22,
    actionability: 0,
    structuredFacts: [
      { type: "date", value: "Monday, April 13, 2026" },
      { type: "time", value: "8:00 AM" },
    ],
    userParticipated: false,
    from: "communications@ausa.org",
    subject: "AUSA's 5 Things",
    snippet: "View in browser. A weekly tipsheet for members.",
    bodyText: "AUSA's Five Things weekly tipsheet. View online. Forward to a friend.",
    domain: "Family",
  });
  assert.equal(verdict.preserve, false);
});

test("promotional museum blast is not preserved just because it looks event-shaped", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "transactional",
    providerCategory: "focused",
    significanceScore: 0.61,
    relationshipScore: 0.3,
    junkScore: 0.18,
    actionability: 0.7,
    structuredFacts: [
      { type: "date", value: "April 28, 2026" },
      { type: "time", value: "7:00 PM" },
      { type: "location", value: "Cincinnati Museum Center" },
    ],
    userParticipated: false,
    from: "information@cincymuseum.org",
    subject: "April 28 | An Evening with The Shroomery",
    snippet: "Discover the world of mushrooms with The Shroomery.",
    bodyText: "View online for event details. Forward to a friend. Join us for a special evening.",
    domain: "Family",
  });
  assert.equal(verdict.preserve, false);
});

test("cozi family agenda is preserved as real continuity value", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "transactional",
    providerCategory: "focused",
    significanceScore: 0.7,
    relationshipScore: 0.3,
    junkScore: 0.05,
    actionability: 0.4,
    structuredFacts: [
      { type: "date", value: "April 19, 2026" },
      { type: "time", value: "7:30 PM" },
      { type: "traveler", value: "Caleb" },
    ],
    userParticipated: false,
    from: "no-reply@cozi.com",
    subject: "Your agenda for Apr 19-26",
    snippet: "Your family's agenda for Apr 19–26.",
    bodyText: "Agenda for the week. Sunday church. Tuesday meeting. Wednesday baseball.",
    domain: "Family",
  });
  assert.equal(verdict.preserve, true);
});

test("gift-guide promo is not preserved even when misclassified as transactional", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "transactional",
    providerCategory: "focused",
    significanceScore: 0.36,
    relationshipScore: 0.3,
    junkScore: 0.14,
    actionability: 0.7,
    structuredFacts: [{ type: "traveler", value: "Chris" }],
    userParticipated: false,
    from: "email@em.kay.com",
    subject: "Graduation Gifts They'll Love",
    snippet: "Gifts under $300 to celebrate their next chapter!",
    bodyText: "View in browser. Gift guide. Shop now for graduation jewelry.",
    domain: "Retirement",
  });
  assert.equal(verdict.preserve, false);
});

test("retail percent-off blast is not preserved even when classified as transactional", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "transactional",
    providerCategory: "other",
    significanceScore: 0.51,
    relationshipScore: 0.4,
    junkScore: 0.18,
    actionability: 0.7,
    structuredFacts: [
      { type: "date", value: "Tomorrow" },
      { type: "traveler", value: "Chris" },
    ],
    userParticipated: false,
    from: "duluthtrading@mail.duluthtrading.com",
    subject: "Ends Tomorrow! 20% OFF Everything",
    snippet: "Extra 10% OFF gear for your getaway.",
    bodyText: "Today only. 20% off. Shop now and save big.",
    domain: "Family",
  });
  assert.equal(verdict.preserve, false);
});

test("one-way faith newsletter is not preserved just because it mentions news or culture", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "faith",
    providerCategory: "focused",
    significanceScore: 0.22,
    relationshipScore: 0.3,
    junkScore: 0.08,
    actionability: 0,
    structuredFacts: [{ type: "traveler", value: "Women" }],
    userParticipated: false,
    from: "mail@answersingenesis.org",
    subject: "Infallible Proofs for the Resurrection",
    snippet: "Get the latest science, Bible, and culture news.",
    bodyText: "Weekly edition. Read online for the latest science, Bible, and culture news.",
    domain: "Faith",
  });
  assert.equal(verdict.preserve, false);
});

test("bogus reservation fact does not preserve retail promo mail", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "transactional",
    providerCategory: "focused",
    significanceScore: 0.36,
    relationshipScore: 0.3,
    junkScore: 0.14,
    actionability: 0.7,
    structuredFacts: [
      { type: "reservation", value: "cut-off" },
      { type: "traveler", value: "Buy Online Pick" },
    ],
    userParticipated: false,
    from: "email@em.kay.com",
    subject: "Single or Taken? Let KAY Know!",
    snippet: "Unlock gift ideas handpicked just for you! View Email in Browser.",
    bodyText: "",
    domain: "Retirement",
  });
  assert.equal(verdict.preserve, false);
});

test("single weak time fact does not preserve newsletter-style mail", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "transactional",
    providerCategory: "focused",
    significanceScore: 0.51,
    relationshipScore: 0.4,
    junkScore: 0.12,
    actionability: 0.7,
    structuredFacts: [{ type: "time", value: "9 pm" }],
    userParticipated: false,
    from: "hello@jeffersonfisher.com",
    subject: "3 things: good boundaries, responding to a liar, and sparkling lemonade",
    snippet: "2 min read",
    bodyText: "",
    domain: "Family",
  });
  assert.equal(verdict.preserve, false);
});

test("genuine relational work thread with participation is preserved", () => {
  const verdict = shouldPreserveCorrespondence({
    threadType: "work",
    providerCategory: "personal",
    significanceScore: 0.62,
    relationshipScore: 0.82,
    junkScore: 0.08,
    actionability: 0.7,
    structuredFacts: [],
    entities: ["Thermo Fisher"],
    userParticipated: true,
    from: "manager@thermofisher.com",
    subject: "Need your input before tomorrow's client meeting",
    snippet: "Can you review the deck and send your edits tonight?",
    bodyText: "Need your thoughts before tomorrow morning. Please reply with the redlines.",
    domain: "Work",
  });
  assert.equal(verdict.preserve, true);
});

testAsync("preserved correspondence writes ledger and vector recall", async () => {
  upsertEmailThread({
    threadId: "travel-42",
    source: "gmail",
    subject: "Statue of Liberty Ticket Confirmation",
    fromAddress: "tickets@example.com",
    providerCategory: "updates",
    providerLabels: ["CATEGORY_UPDATES"],
    folder: "inbox",
    receivedAt: "2026-06-21T12:00:00.000Z",
    unread: true,
    starred: false,
    hasAttachments: false,
    relationshipScore: 0.34,
    junkScore: 0.05,
    significanceScore: 0.91,
    domain: "Family",
    threadType: "travel",
    actionability: 0.88,
    entities: ["Statue of Liberty"],
    structuredFacts: [
      { type: "reservation", value: "ABC12345" },
      { type: "date", value: "June 26, 2026" },
      { type: "time", value: "10:00 AM" },
    ],
    localClassification: { threadType: "travel", domain: "Family" },
    classificationConfidence: 0.9,
    userParticipated: false,
    messageCount: 1,
    bodyHash: "hash-1",
    updatedAt: "2026-06-21T12:00:00.000Z",
  });

  const result = await preserveCorrespondenceThread({
    id: "travel-42",
    source: "gmail",
    subject: "Statue of Liberty Ticket Confirmation",
    from: "tickets@example.com",
    snippet: "Reservation number ABC12345",
    bodyText: "Reservation number ABC12345. Visit date June 26, 2026 at 10:00 AM. Arrive 30 minutes early.",
    bodyHash: "hash-1",
    providerCategory: "updates",
    threadType: "travel",
    significanceScore: 0.91,
    relationshipScore: 0.34,
    actionability: 0.88,
    structuredFacts: [
      { type: "reservation", value: "ABC12345" },
      { type: "date", value: "June 26, 2026" },
      { type: "time", value: "10:00 AM" },
    ],
    entities: ["Statue of Liberty"],
    userParticipated: false,
    domain: "Family",
    updatedAt: "2026-06-21T12:00:00.000Z",
  });

  assert.equal(result.preserved, true);
  const record = getEmailMemoryRecord("travel-42");
  assert.equal(record.threadId, "travel-42");
  assert.ok(record.vectorDocId);

  const recall = await searchCorrespondence("statue of liberty ticket", { limit: 3 });
  assert.equal(recall.ok, true);
  assert.ok(recall.results.some((row) => row.id === "corr_travel-42"));
});

console.log(`\nkaty-stampwhistle: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
