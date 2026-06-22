"use strict";

const assert = require("node:assert/strict");
const { normalizeSkillResult } = require("../src/engine/skills/skill-result-normalizer");

const raw = {
  ok: true,
  data: [
    {
      subject: "Statue of Liberty Reserve Ticket Confirmation",
      from: "tickets@example.com",
      snippet: "Entry time 10:00 AM on 7/2. Reservation number ABC12345.",
      bodyText:
        "Your Statue of Liberty Reserve Ticket is confirmed for 7/2/2026 at 10:00 AM. Reservation number ABC12345. Arrive 30 minutes early.",
      unread: true,
      starred: false,
    },
  ],
  unreadCount: 1,
};

const result = normalizeSkillResult("email-read", raw);

assert.ok(
  result.observations.some((line) => /Travel email:/i.test(line)),
  "expected travel email observation"
);
assert.ok(
  result.observations.some((line) => /10:00 AM/i.test(line)),
  "expected ticket time extraction"
);
assert.ok(
  result.patterns.includes("ticket or itinerary details present in email"),
  "expected travel pattern"
);

console.log("Monday email skill normalizer travel test passed.");
