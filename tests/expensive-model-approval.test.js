"use strict";

const assert = require("node:assert/strict");

const {
  buildApprovalRequest,
  buildDeclineMessage,
  classifyApprovalInput,
  isExpensiveTier,
} = require("../src/engine/llm/expensive-model-approval");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test("strategic and executive tiers are treated as expensive", () => {
  assert.equal(isExpensiveTier("strategic"), true);
  assert.equal(isExpensiveTier("executive"), true);
  assert.equal(isExpensiveTier("thinking"), false);
});

test("approval input classifier recognizes approve/decline/other", () => {
  assert.equal(classifyApprovalInput("yes, use it"), "approve");
  assert.equal(classifyApprovalInput("no, stay standard"), "decline");
  assert.equal(classifyApprovalInput("tell me more"), "other");
});

test("approval request includes very high cost warning", () => {
  const approval = buildApprovalRequest(
    { tier: "strategic", model: "o3" },
    "When should I retire?"
  );

  assert.equal(approval.tier, "strategic");
  assert.equal(approval.model, "o3");
  assert.match(approval.warning, /very high cost/i);
  assert.match(approval.warning, /Reply "yes" to approve/i);
  assert.match(approval.prompt, /When should I retire\?/);
});

test("decline message preserves standard-model fallback", () => {
  assert.match(buildDeclineMessage(), /stay on the standard models/i);
});
