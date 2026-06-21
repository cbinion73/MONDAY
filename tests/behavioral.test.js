// Behavioral test suite for Monday.
// Evaluates actual engine output against 6-dimension scoring rubric.
// Pass threshold: 9/12 per turn, avg >= 7 across conversation.
//
// Run: node tests/behavioral.test.js
// With Ollama: MONDAY_OLLAMA_ENABLED=true node tests/behavioral.test.js
// With Claude: ANTHROPIC_API_KEY=sk-... node tests/behavioral.test.js

const path = require("node:path");

process.env.MONDAY_OLLAMA_ENABLED = process.env.MONDAY_OLLAMA_ENABLED || "false";
process.env.MONDAY_CLOSED_LOOP_LEARNING = "false";
process.env.MONDAY_PERSONAL_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-behavioral-personal"
);

const { runMondayTurn } = require("../src/engine/runtime/run-turn");
const { applyMondayIntelligence } = require("../src/engine/intelligence/monday-intelligence");
const { FIXTURES } = require("../src/engine/evals/behavioral-fixtures");
const { evaluateFixture, scoreReply } = require("../src/engine/evals/behavioral-scorer");

async function runConversation(fixture) {
  const replies = [];
  let context = {};
  const history = [];

  for (const turn of fixture.turns) {
    const result = await runMondayTurn({ input: turn.user, context });

    const intelligentResult = await applyMondayIntelligence({
      result,
      input: turn.user,
      history,
      personalContext: {},
    });

    const reply = intelligentResult.voice?.text || result.voice?.text || "";
    replies.push(reply);
    history.push({ user: turn.user, monday: reply });
    context = intelligentResult.nextContext || context;
  }

  return replies;
}

async function main() {
  const mode = process.env.MONDAY_OLLAMA_ENABLED === "true" ? "ollama" : "deterministic";
  console.log(`\nMonday Behavioral Test Suite — mode: ${mode}`);
  console.log("=".repeat(60));

  const allResults = [];
  let passed = 0;
  let failed = 0;

  for (const fixture of FIXTURES) {
    process.stdout.write(`\n[${fixture.id}] ${fixture.label}...\n`);

    try {
      const replies = await runConversation(fixture);
      const result = evaluateFixture(fixture, replies);
      allResults.push(result);

      const status = result.passed ? "PASS" : "FAIL";
      console.log(`  ${status} — avg score: ${result.avgScore.toFixed(1)}/12`);

      for (const turn of result.turns) {
        const s = turn.scores;
        console.log(`  Turn ${turn.turn}: ${turn.total}/12 [insight:${s.insight} synth:${s.synthesis} theory:${s.theory} therapy:${s.therapyAvoided} rec:${s.recommendation} personality:${s.personality}]`);
        if (turn.avoidHits.length > 0) {
          console.log(`    ⚠ AVOID HITS: ${turn.avoidHits.join(", ")}`);
        }
        console.log(`    Reply: "${turn.reply.slice(0, 120)}..."`);
      }

      if (result.passed) passed++;
      else failed++;
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      failed++;
      allResults.push({ fixture: fixture.id, label: fixture.label, passed: false, error: err.message });
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed}/${FIXTURES.length} fixtures passed`);

  const allScores = allResults
    .filter(r => !r.error)
    .flatMap(r => (r.turns || []).map(t => t.total));
  const avgAll = allScores.length > 0
    ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)
    : "n/a";
  console.log(`Overall avg score: ${avgAll}/12`);

  // Show failing fixtures
  const failures = allResults.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log("\nFailing fixtures:");
    for (const f of failures) {
      if (f.error) {
        console.log(`  [${f.fixture}] ERROR: ${f.error}`);
      } else {
        const worstTurn = f.turns?.reduce((a, b) => a.total < b.total ? a : b);
        console.log(`  [${f.fixture}] avg=${f.avgScore?.toFixed(1)} worst-turn=${worstTurn?.total}/12`);
      }
    }
  }

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nAll behavioral tests passed.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
