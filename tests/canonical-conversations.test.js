const assert = require("node:assert/strict");
const path = require("node:path");

process.env.MONDAY_OLLAMA_ENABLED = "false";
process.env.MONDAY_CLOSED_LOOP_LEARNING = "false";
process.env.MONDAY_PERSONAL_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-canonical-personal"
);

const {
  evaluateCanonicalConversations,
} = require("../src/engine/evals/canonical-conversations");

async function main() {
  const report = await evaluateCanonicalConversations();

  assert.equal(report.totalTurns, 10);
  assert.equal(report.failedTurns, 0);
  assert.equal(report.passed, true);

  console.log("Monday canonical conversations test passed.\n");
  console.log(JSON.stringify(report.results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
