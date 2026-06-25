"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldUseFastEverydayLane,
  buildFastEverydayReply,
} = require("../src/engine/intelligence/fast-everyday-lane");

test("fast everyday lane detects grocery and dinner prompts", () => {
  const result = {
    finalState: {
      classificationFallback: true,
      candidateDomain: "unknown",
    },
    truth: {},
  };

  assert.equal(
    shouldUseFastEverydayLane("I need ideas for groceries and dinner tonight.", result),
    true
  );
});

test("fast everyday lane builds a practical grocery reply", () => {
  const reply = buildFastEverydayReply("I need ideas for groceries and dinner tonight.");
  assert.match(reply, /Groceries plus dinner is straightforward/);
  assert.match(reply, /taco bowls/);
});
