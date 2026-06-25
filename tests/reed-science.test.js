const assert = require("node:assert/strict");

const { detectIntents } = require("../src/engine/skills/intent-detector");
const {
  SCIENTIFIC_COPILOT_PROMPT,
  buildReedSystemPrompt,
  isThermoFisherContext,
} = require("../src/engine/baxter/reed-richards");
const {
  advise,
} = require("../src/engine/connectors/science-advisor");
const {
  renderScienceAdvisorReply,
} = require("../src/engine/skills/science-advisor-renderer");

async function main() {
  assert.equal(
    isThermoFisherContext({ input: "Compare Thermo Fisher HPLC options for assay development." }),
    true
  );
  assert.equal(
    isThermoFisherContext({ input: "Explain PCR inhibition in blood samples." }),
    false
  );

  assert.equal(
    buildReedSystemPrompt({ thermoFisherMode: true }),
    SCIENTIFIC_COPILOT_PROMPT
  );
  assert.match(
    buildReedSystemPrompt({ thermoFisherMode: false }),
    /Reed Richards, Scientific Advisor to Monday/
  );

  const scienceIntent = detectIntents(
    "How should I troubleshoot HPLC peak tailing in a hydrocodone assay?"
  );
  assert.ok(
    scienceIntent.some((intent) => intent.skillId === "science-advisor"),
    scienceIntent
  );

  const groceryIntent = detectIntents("Can you help me with groceries this week?");
  assert.ok(
    groceryIntent.every((intent) => intent.skillId !== "science-advisor"),
    groceryIntent
  );

  const rendered = renderScienceAdvisorReply({
    raw: {
      data: {
        reply: "Peak tailing usually points to secondary interactions or column overload [S1].",
        sources: [
          {
            label: "S1",
            title: "Chromatography Troubleshooting Guide",
            url: "https://example.com/guide",
          },
        ],
      },
    },
  });
  assert.match(rendered, /Peak tailing usually points/);
  assert.match(rendered, /Sources:/);

  const thermoReply = await advise({
    query: "Compare Thermo Fisher options for reducing variability in NGS library prep.",
  });
  assert.equal(thermoReply.ok, true);
  assert.equal(thermoReply.data.mode, "thermo_fisher");
  assert.match(thermoReply.data.reply, /Generative AI CoPilot for Thermo Fisher Scientific/);

  const hplcReply = await advise({
    query: "How should I troubleshoot HPLC peak tailing in a hydrocodone/APAP assay?",
  });
  assert.equal(hplcReply.ok, true);
  assert.equal(hplcReply.data.mode, "general_science");
  assert.ok(hplcReply.data.reply.length < 900, hplcReply.data.reply.length);

  console.log("Monday Reed science test passed.");
}

main();
