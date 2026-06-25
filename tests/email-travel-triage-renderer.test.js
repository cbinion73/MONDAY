"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { renderEmailReadReply } = require("../src/engine/skills/email-read-renderer");

test("travel inbox reply clusters actionable reservations", () => {
  const reply = renderEmailReadReply({
    raw: {
      query: "Do I have any important travel emails right now?",
      unreadCount: 12,
      data: [
        {
          subject: "Your confirmation from National Air and Space Museum",
          from: "airandspace@smithsonian.org",
          unread: true,
          significanceScore: 0.99,
          snippet: "reservation with QR code needed for scanning when you arrive",
          bodyText: "Order details for Washington, DC museum visit on Jul 4, 2026",
        },
        {
          subject: "Thank You For Reserving Tickets to the Archives",
          from: "confirmation@etix.com",
          unread: true,
          significanceScore: 0.9,
          snippet: "timed-entry ticket",
          bodyText: "National Archives Museum startDate 2026-07-04T13:30:00 Washington DC",
        },
        {
          subject: "Summer Programs at Cincinnati Museum Center",
          from: "information@cincymuseum.org",
          unread: true,
          significanceScore: 0.7,
          snippet: "Upcoming Programs and Events",
          bodyText: "event calendar and extended hours",
        },
      ],
    },
  });

  assert.match(reply, /Likely trips or reservations right now/);
  assert.match(reply, /Washington, DC museum reservations/);
  assert.doesNotMatch(reply, /Cincinnati Museum Center/);
});
