"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findEmailReadSkillResult,
  renderEmailReadReply,
} = require("../src/engine/skills/email-read-renderer");

test("findEmailReadSkillResult returns the successful email result", () => {
  const result = findEmailReadSkillResult([
    { skillId: "science-advisor", ok: true, raw: { ok: true } },
    { skillId: "email-read", ok: true, raw: { ok: true, data: [] } },
  ]);

  assert.equal(result.skillId, "email-read");
});

test("renderEmailReadReply produces a concise summary", () => {
  const reply = renderEmailReadReply({
    raw: {
      unreadCount: 4,
      usedIntelligence: true,
      data: [
        {
          subject: "Philadelphia museum confirmation",
          from: "tickets@example.com",
          unread: true,
          threadType: "travel",
          significanceScore: 0.91,
          structuredFacts: [
            { type: "scheduled_date", value: "July 4" },
            { type: "location_name", value: "Philadelphia Museum of Art" },
          ],
        },
      ],
    },
  });

  assert.match(reply, /I checked your email/);
  assert.match(reply, /Philadelphia museum confirmation/);
  assert.match(reply, /July 4/);
});
