const assert = require("node:assert/strict");
const { resolveMondayEngine } = require("../src/engine");
const { translateMondayVoice } = require("../src/engine/voice/voice-translator");
const { inferTruth } = require("../src/engine/runtime/infer-truth");

function main() {
  const unknown = resolveMondayEngine("I think I should move to Denver.", {});
  assert.equal(unknown.classificationFallback, true);
  assert.equal(unknown.candidateDomain, "unknown");
  assert.equal(unknown.candidateClassification, "unknown");

  const unknownVoice = translateMondayVoice({
    engineState: unknown,
    truth: inferTruth(unknown, "I think I should move to Denver."),
  });
  assert.equal(
    unknownVoice.text,
    "I'm not sure what kind of situation this is yet. Help me understand what feels most important about it."
  );

  const family = resolveMondayEngine("Family matters most.", {});
  assert.equal(family.classificationFallback, false);
  assert.equal(family.significance, "declared_family_value");

  const work = resolveMondayEngine("I worked 80 hours this week.", {});
  assert.equal(work.classificationFallback, false);
  assert.equal(work.significance, "work_tradeoff");

  console.log("Monday fallback analysis tests passed.");
}

main();
