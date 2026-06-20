const assert = require("node:assert/strict");
const { resolveMondayEngine } = require("../src/engine");

function main() {
  const result = resolveMondayEngine("What should I cook for dinner tonight?", {});

  assert.equal(result.significance, "general_significance");
  assert.equal(result.situationClassification, "unclassified");
  assert.equal(result.activeRole, "witness");
  assert.equal(result.classificationFallback, true);
  assert.equal(result.fallbackReason, "No matching significance domain found");

  console.log("Monday fallback classification tests passed.");
}

main();
