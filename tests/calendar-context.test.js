const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.MONDAY_OLLAMA_ENABLED = "false";

process.env.MONDAY_CONNECTORS_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-connectors-calendar"
);

const {
  importCalendarEvents,
  getCalendarSummary,
  clearCalendarEvents,
  getDataDir,
} = require("../src/engine/connectors/calendar-context");
const { generateDailyBrief } = require("../src/engine/intelligence/monday-intelligence");

async function main() {
  fs.rmSync(getDataDir(), { recursive: true, force: true });
  importCalendarEvents(
    [
      {
        title: "Pediatrician Appointment",
        startAt: "2026-06-15T13:00:00.000Z",
        endAt: "2026-06-15T14:00:00.000Z",
        location: "Main Street Clinic",
      },
      {
        title: "Dinner with Rebekah",
        startAt: "2026-06-15T22:00:00.000Z",
        endAt: "2026-06-15T23:30:00.000Z",
      },
    ],
    { source: "test" }
  );

  const summary = getCalendarSummary({
    from: new Date("2026-06-15T12:00:00.000Z"),
    horizonHours: 24,
  });

  assert.equal(summary.source, "test");
  assert.equal(summary.totalEvents, 2);
  assert.equal(summary.upcomingEvents.length, 2);
  assert.equal(summary.nextEvent.title, "Pediatrician Appointment");

  const brief = await generateDailyBrief({
    missions: [],
    captures: [],
    calendar: summary,
  });

  assert.equal(brief.enabled, false);
  assert.ok(Array.isArray(brief.changed));
  assert.ok(
    brief.changed.some((item) => item.includes("Pediatrician Appointment"))
  );
  assert.ok(brief.brief.includes("Pediatrician Appointment"));
  assert.ok(
    brief.needsAttention.some((item) => item.includes("Pediatrician Appointment"))
  );
  assert.ok(Array.isArray(brief.deservesProtection));

  clearCalendarEvents();
  fs.rmSync(getDataDir(), { recursive: true, force: true });
  console.log("Monday calendar context tests passed.");
}

main();
