"use strict";

const assert = require("node:assert/strict");
const {
  USER_TIMEZONE,
  normalizeClockString,
  normalizeUserFacingDate,
  normalizeUserFacingTime,
  formatLocalTime,
} = require("../src/engine/utils/local-time");

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

console.log("\nLocal Time");

test("defaults Monday user timezone to New York", () => {
  assert.equal(USER_TIMEZONE, "America/New_York");
});

test("normalizes ISO scheduled date into local date", () => {
  assert.equal(
    normalizeUserFacingDate("2026-07-04T13:30:00"),
    "Saturday, July 4, 2026"
  );
});

test("normalizes ISO scheduled time into local time", () => {
  assert.equal(normalizeUserFacingTime("2026-07-04T13:30:00"), "1:30 PM");
});

test("normalizes lowercase clock strings into standard display", () => {
  assert.equal(normalizeClockString("10:00am"), "10:00 AM");
});

test("formats calendar event times in local time", () => {
  assert.equal(formatLocalTime("2026-07-04T13:30:00Z"), "9:30 AM");
});

console.log(`\nlocal-time: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
