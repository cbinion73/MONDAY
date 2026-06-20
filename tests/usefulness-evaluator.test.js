const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.MONDAY_OLLAMA_ENABLED = "false";
process.env.MONDAY_CLOSED_LOOP_LEARNING = "false";
process.env.MONDAY_PERSONAL_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-usefulness-evaluator"
);

const {
  evaluateUsefulness,
} = require("../src/engine/evals/usefulness-evaluator");
const { getDataDir } = require("../src/engine/personal/personal-store");

async function main() {
  fs.rmSync(getDataDir(), { recursive: true, force: true });

  const report = await evaluateUsefulness();

  assert.equal(report.passed, true);
  assert.ok(report.totalTurns >= 10);
  assert.equal(report.failedTurns, 0);
  assert.ok(Array.isArray(report.primaryPromptResults));
  assert.ok(Array.isArray(report.continuationResults));
  assert.equal(report.primaryPromptResults.length, 5);
  assert.ok(report.continuationResults.length >= 5);

  const healthPrimary = report.primaryPromptResults.find(
    (item) => item.prompt === "I want to lose weight."
  );
  assert.ok(healthPrimary);
  assert.equal(healthPrimary.passed, true);
  assert.equal(healthPrimary.checks.bestResponseStandard, true);

  const workContinuation = report.continuationResults.find(
    (item) => item.name === "work_continuation"
  );
  assert.ok(workContinuation);
  assert.equal(workContinuation.passed, true);
  assert.equal(workContinuation.checks.continuityQuality, true);

  fs.rmSync(getDataDir(), { recursive: true, force: true });
  console.log("Monday usefulness evaluator tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
