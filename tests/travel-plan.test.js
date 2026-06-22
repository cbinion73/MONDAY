"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.MONDAY_DB_PATH = ":memory:";
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "monday-travel-plan-"));
process.env.MONDAY_CONNECTORS_DATA_DIR = TEMP_DIR;

function fresh(mod) {
  delete require.cache[require.resolve(mod)];
  return require(mod);
}

const councilPath = "/Users/chris/CODE/MONDAY/src/engine/council/convene.js";
const council = fresh(councilPath);
council.runSpecialistAgent = async (_agentKey, _userContent, fallback) => fallback;
const imessagePath = "/Users/chris/CODE/MONDAY/src/engine/channels/imessage.js";
const imessage = fresh(imessagePath);
imessage.sendViaiMessage = async () => ({ ok: true });
imessage.isConfigured = () => false;

const { importEmailThreads } = fresh("/Users/chris/CODE/MONDAY/src/engine/connectors/email-context.js");
const { importCalendarEvents, clearCalendarEvents } = fresh("/Users/chris/CODE/MONDAY/src/engine/connectors/calendar-context.js");
const { planTrip } = fresh("/Users/chris/CODE/MONDAY/src/engine/connectors/travel-plan.js");

let pass = 0;
let fail = 0;

async function test(name, fn) {
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

console.log("\nTravel Plan");

importEmailThreads(
  [
    {
      id: "travel-1",
      source: "gmail",
      subject: "Statue of Liberty Reserve Ticket Confirmation",
      from: "tickets@reserve.example.com",
      snippet: "Your visit is confirmed for June 26 at 10:00 AM.",
      bodyText:
        "Reservation number ABC12345. Visit date June 26, 2026 at 10:00 AM. Arrive 30 minutes early at Battery Park. Philadelphia hotel check-in is June 25. Washington, DC museum tickets are June 27.",
      unread: true,
      labelIds: ["INBOX", "CATEGORY_UPDATES"],
      updatedAt: "2026-06-21T08:00:00.000Z",
    },
  ],
  { source: "multi" }
);

importCalendarEvents(
  [
    {
      id: "trip-day-1",
      title: "Drive to Philadelphia",
      startAt: "2026-06-25T13:00:00.000Z",
      endAt: "2026-06-25T18:00:00.000Z",
      location: "Philadelphia",
      source: "test",
    },
    {
      id: "trip-day-2",
      title: "Statue of Liberty",
      startAt: "2026-06-26T14:00:00.000Z",
      endAt: "2026-06-26T18:00:00.000Z",
      location: "New York",
      source: "test",
    },
  ],
  { source: "test" }
);

async function main() {
  await test("planTrip returns confirmed evidence when tickets are present", async () => {
    const result = await planTrip({
      query: "I need to plan my trip next week to Philadelphia, the Statue of Liberty, and Washington, DC. I have tickets in my email.",
      liveProviderSearch: false,
      expedited: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.status, "completed");
    assert.equal(result.data.noDirectTicketEvidence, false);
    assert.ok(result.data.confirmedItems.some((item) => item.includes("ABC12345")));
    assert.ok(result.data.plan.length >= 1);
  });

  await test("planTrip falls back honestly when direct ticket evidence is missing", async () => {
    importEmailThreads(
      [
        {
          id: "newsletter-1",
          source: "gmail",
          subject: "Summer in Philadelphia",
          from: "newsletter@example.com",
          snippet: "A guide to things to do this summer.",
          bodyText: "Philadelphia this summer has plenty of things to do. Read the guide online.",
          unread: true,
          labelIds: ["INBOX", "CATEGORY_UPDATES"],
          updatedAt: "2026-06-21T08:00:00.000Z",
        },
      ],
      { source: "multi" }
    );

    const result = await planTrip({
      query: "Plan my trip next week to Philadelphia.",
      liveProviderSearch: false,
      expedited: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.status, "completed");
    assert.equal(result.data.noDirectTicketEvidence, true);
    assert.ok(
      result.data.missingItems.some((item) => /No direct ticket or reservation email/i.test(item))
    );
  });

  await test("planTrip asks for dates when no trip anchors exist yet", async () => {
    clearCalendarEvents();
    const result = await planTrip({
      query: "Monday, I need to create an itinerary for next week.",
      liveProviderSearch: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.status, "needs_input");
    assert.match(result.data.reply, /trip dates|calendar anchors/i);
  });

  await test("planTrip queues Nick by default when request is not urgent", async () => {
    importCalendarEvents(
      [
        {
          id: "trip-day-1",
          title: "Drive to Philadelphia",
          startAt: "2026-06-25T13:00:00.000Z",
          endAt: "2026-06-25T18:00:00.000Z",
          location: "Philadelphia",
          source: "test",
        },
      ],
      { source: "test" }
    );
    const result = await planTrip({
      query: "Monday, I need to create an itinerary for next week to Philadelphia.",
      liveProviderSearch: false,
      channel: "http",
      senderId: "chris",
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.status, "queued");
    assert.match(result.data.reply, /get Nick on that right away/i);
  });

  await test("planTrip expedites when urgency is explicit", async () => {
    const result = await planTrip({
      query: "Monday I need to create an itinerary quickly for next week to Philadelphia.",
      liveProviderSearch: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.status, "completed");
  });

  console.log(`\ntravel-plan: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
