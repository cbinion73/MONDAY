"use strict";

const assert = require("node:assert/strict");
const { attachArtifactPresentation } = require("../src/engine/surfacing/artifact-factory");

function main() {
  const plan = attachArtifactPresentation(
    {
      shouldSurface: true,
      artifactType: "model_display",
      artifactKey: "dynamic-model",
      sourceDomain: "financial",
      rationale: "The structure is easier to understand when it is shown instead of described.",
    },
    {
      input: "Build me a model of my current finances and show it to me.",
      domain: "Financial",
      skillResults: [
        {
          skillId: "financial-read",
          confidence: 0.84,
          summary: "Spending is rising faster than income this month.",
          observations: ["Net spending increased 12% month over month."],
          patterns: ["Discretionary spending is pulling the trend upward."],
        },
      ],
    }
  );

  assert.equal(plan?.artifactRuntime?.mode, "dynamic");
  assert.equal(plan?.artifactRuntime?.key, "dynamic-model");
  assert.equal(plan?.artifactRuntime?.payload?.kind, "adaptive-model");
  assert.ok(Array.isArray(plan?.artifactRuntime?.payload?.blocks));
  assert.ok(plan.artifactRuntime.payload.blocks.length >= 3);

  console.log("Monday artifact factory tests passed.");
}

main();
