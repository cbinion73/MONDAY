const assert = require("node:assert/strict");

const {
  isGreetingOnly,
  isExplicitIntentShift,
  looksLikeStandaloneTopicShift,
  shouldAutoResetSession,
} = require("../src/engine/gateway/session-reset");

function main() {
  assert.equal(isGreetingOnly("Good morning"), true);
  assert.equal(isGreetingOnly("hello"), true);
  assert.equal(isGreetingOnly("Good morning, can you help me with HPLC?"), false);

  assert.equal(isExplicitIntentShift("Intent change. New topic."), true);
  assert.equal(isExplicitIntentShift("Switching gears to something unrelated."), true);
  assert.equal(isExplicitIntentShift("How should I think about this?"), false);

  assert.equal(looksLikeStandaloneTopicShift("Can you help me with groceries this week?"), true);
  assert.equal(looksLikeStandaloneTopicShift("What is on my travel calendar next week?"), true);
  assert.equal(looksLikeStandaloneTopicShift("It still feels off."), false);

  const session = {
    messages: [
      { user: "Let's talk about HPLC validation.", monday: "Sure." },
    ],
  };

  assert.equal(shouldAutoResetSession("Good morning", session), true);
  assert.equal(shouldAutoResetSession("Intent change. Different question.", session), true);
  assert.equal(shouldAutoResetSession("Can you help me with groceries this week?", session), true);
  assert.equal(shouldAutoResetSession("It still feels off.", session), false);

  console.log("Monday session reset test passed.");
}

main();
