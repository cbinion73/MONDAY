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
llmRouter.chatWithLLM = async ({ messages, purpose }) => {
  if (purpose === "email-intelligence-interpretation") {
    const payload = JSON.parse(messages[1].content);
    const text = `${payload.subject} ${payload.body}`;
    if (/air and space museum/i.test(text)) {
      return {
        json: {
          artifactType: "reservation_confirmation",
          title: "National Air and Space Museum reservation",
          summary: "Museum pass confirmation with QR-code entry instructions.",
          facts: {
            scheduled_date: "June 26, 2026",
            scheduled_time: "10:00 AM",
            location_name: "National Air and Space Museum",
            location_address: "600 Independence Ave SW, Washington, DC 20560",
            confirmation_number: "NASM12345",
            entry_instruction: "Bring the QR code or digital pass for scanning at entry.",
          },
        },
      };
    }
    if (/statue of liberty/i.test(text)) {
      return {
        json: {
          artifactType: "reservation_confirmation",
          title: "Statue of Liberty reservation",
          summary: "Reserve ticket confirmation for the Statue of Liberty.",
          facts: {
            scheduled_date: "June 26, 2026",
            scheduled_time: "10:00 AM",
            location_name: "Statue of Liberty",
            location_address: "Battery Park, New York, NY",
            confirmation_number: "ABC12345",
            entry_instruction: "Arrive 30 minutes early at Battery Park.",
          },
        },
      };
    }
    return { json: { artifactType: "", title: "", summary: "", facts: {} } };
  }

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
  interpretStructuredFactsLocally,
  enrichFactsFromTrustedReservationLinks,
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

test("extractStructuredFacts parses Etix JSON-LD reservation details", () => {
  const facts = extractStructuredFacts({
    subject: "Thank You For Reserving Tickets to the Archives",
    bodyText: `<!DOCTYPE html><html><head><script type="application/ld+json">{\n      "@context":"http://schema.org",\n      "@type":"EventReservation",\n      "reservationNumber":"458534353",\n      "reservationFor":{\n        "@type":"Event",\n        "name":"1:30pm - 1:45pm National Archives Museum Timed-Entry Ticket",\n        "startDate":"2026-07-04T13:30:00",\n        "location":{\n          "@type":"Place",\n          "name":"National Archives Museum - Timed-Entry",\n          "address":{\n            "@type":"PostalAddress",\n            "streetAddress":"701 Constitution Avenue Northwest",\n            "addressLocality":"Washington",\n            "addressRegion":"DC",\n            "postalCode":"20408"\n          }\n        }\n      }\n    }</script></head><body>Order ID: 458534353</body></html>`,
  });

  assert.ok(facts.some((fact) => fact.type === "confirmation_number" && fact.value === "458534353"));
  assert.ok(facts.some((fact) => fact.type === "scheduled_date" && /Saturday, July 4, 2026/.test(fact.value)));
  assert.ok(facts.some((fact) => fact.type === "scheduled_time" && /1:30 PM/.test(fact.value)));
  assert.ok(facts.some((fact) => fact.type === "location_name" && /National Archives Museum/.test(fact.value)));
  assert.ok(facts.some((fact) => fact.type === "location_address" && /701 Constitution Avenue Northwest, Washington, DC, 20408/.test(fact.value)));
  assert.ok(!facts.some((fact) => fact.type === "reservation"), "canonical ticket facts should drop generic reservation aliases");
  assert.ok(!facts.some((fact) => fact.type === "time" && fact.key === "scheduled"), "canonical ticket facts should drop scheduled time aliases");
  assert.ok(!facts.some((fact) => fact.type === "location" && fact.key === "name"), "canonical ticket facts should drop location aliases");
});

test("extractStructuredFacts parses Smithsonian order metadata", () => {
  const facts = extractStructuredFacts({
    subject: "Your confirmation from National Air and Space Museum",
    bodyText: "Order details Order code: 368-W3T-LVHD Reserved on: Sunday, Jun 14 2026 - 2:01pm Total: $0.00 Please have your pass available when you arrive.",
  });

  assert.ok(facts.some((fact) => fact.type === "confirmation_number" && fact.value === "368-W3T-LVHD"));
  assert.ok(facts.some((fact) => fact.type === "email_received_at" && /Sunday, Jun 14 2026 - 2:01pm/.test(fact.value)));
});

testAsync("enrichFactsFromTrustedReservationLinks upgrades Smithsonian reservation page facts", async () => {
  const https = require("node:https");
  const originalGet = https.get;
  https.get = (url, cb) => {
    const { EventEmitter } = require("node:events");
    const res = new EventEmitter();
    res.statusCode = 200;
    process.nextTick(() => {
      cb(res);
      res.emit("data", Buffer.from(`
        <html><body>
        Your Passes 3 x Individual Free Timed Entry Passes Friday, July 3, 2026
        Entry Time: 10:00am - No Early Entry
        Order # 368*W3TLVHD*
        Plan Your Visit National Air and Space Museum
        650 Jefferson Drive SW
        Washington DC
        20560
        Entry is via the north side of the Museum only, at 650 Jefferson Drive, SW (the National Mall side of the building).
        </body></html>
      `));
      res.emit("end");
    });
    return { setTimeout() {}, on() {}, destroy() {} };
  };

  try {
    const facts = await enrichFactsFromTrustedReservationLinks([
      { type: "link", value: "https://tickets.si.edu/ticket_order/abc-123", confidence: 0.72 },
    ]);
    assert.ok(facts.some((fact) => fact.type === "scheduled_date" && /Friday, July 3, 2026/.test(fact.value)));
    assert.ok(facts.some((fact) => fact.type === "scheduled_time" && /10:00 AM/.test(fact.value)));
    assert.ok(facts.some((fact) => fact.type === "location_name" && /National Air and Space Museum/.test(fact.value)));
    assert.ok(facts.some((fact) => fact.type === "location_address" && /650 Jefferson Drive SW, Washington, DC 20560/.test(fact.value)));
    assert.ok(facts.some((fact) => fact.type === "confirmation_number" && /368-W3TLVHD/.test(fact.value)));
  } finally {
    https.get = originalGet;
  }
});

testAsync("enrichFactsFromTrustedReservationLinks still sanitizes canonical facts without trusted links", async () => {
  const facts = await enrichFactsFromTrustedReservationLinks([
    { type: "confirmation_number", value: "458534353", confidence: 0.96 },
    { type: "reservation", key: "confirmation_number", value: "458534353", confidence: 0.96 },
    { type: "scheduled_date", value: "Saturday, July 4, 2026", confidence: 0.95 },
    { type: "date", key: "scheduled", value: "Saturday, July 4, 2026", confidence: 0.95 },
    { type: "scheduled_time", value: "1:30 PM", confidence: 0.95 },
    { type: "time", key: "scheduled", value: "1:30 PM", confidence: 0.95 },
    { type: "location_name", value: "National Archives Museum - Timed-Entry", confidence: 0.94 },
    { type: "location", key: "name", value: "National Archives Museum - Timed-Entry", confidence: 0.94 },
  ]);

  assert.ok(facts.some((fact) => fact.type === "confirmation_number"));
  assert.ok(facts.some((fact) => fact.type === "scheduled_date"));
  assert.ok(facts.some((fact) => fact.type === "scheduled_time"));
  assert.ok(facts.some((fact) => fact.type === "location_name"));
  assert.ok(!facts.some((fact) => fact.type === "reservation"));
  assert.ok(!facts.some((fact) => fact.type === "date"));
  assert.ok(!facts.some((fact) => fact.type === "time"));
  assert.ok(!facts.some((fact) => fact.type === "location"));
});

testAsync("interpretStructuredFactsLocally infers canonical reservation fields", async () => {
  const facts = await interpretStructuredFactsLocally({
    subject: "Your confirmation from National Air and Space Museum",
    from: "National Air and Space Museum <airandspace@smithsonian.org>",
    bodyText: "Your visit is on June 26, 2026 at 10:00 AM. Bring the QR code or digital pass for scanning at entry. Confirmation NASM12345.",
    updatedAt: "2026-06-14T18:01:41.000Z",
  }, []);

  assert.ok(facts.some((fact) => fact.type === "scheduled_date" && /June 26, 2026/i.test(fact.value)));
  assert.ok(facts.some((fact) => fact.type === "scheduled_time" && /10:00 AM/i.test(fact.value)));
  assert.ok(facts.some((fact) => fact.type === "location_name" && /National Air and Space Museum/i.test(fact.value)));
  assert.ok(facts.some((fact) => fact.type === "location_address" && /Independence Ave/i.test(fact.value)));
  assert.ok(facts.some((fact) => fact.type === "confirmation_number" && /NASM12345/i.test(fact.value)));
  assert.ok(facts.some((fact) => fact.type === "summary"));
  assert.ok(facts.some((fact) => fact.type === "email_received_at"));
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
  assert.ok(facts.some((fact) => fact.type === "confirmation_number"), "expected canonical confirmation_number fact written to sqlite");
  assert.ok(!facts.some((fact) => fact.type === "reservation"), "expected stale reservation aliases to be pruned from sqlite");
  const memoryRecord = getEmailMemoryRecord("travel-1");
  assert.ok(memoryRecord, "expected preserved correspondence record");
  assert.ok(memoryRecord.vectorDocId, "expected vector correspondence record");
});

console.log(`\nemail-intelligence: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
