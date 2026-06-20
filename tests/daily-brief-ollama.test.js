const assert = require("node:assert/strict");

async function main() {
  process.env.MONDAY_OLLAMA_ENABLED = "true";
  process.env.MONDAY_INTELLIGENCE_DATA_DIR = require("node:path").resolve(
    __dirname,
    "../data/test-intelligence-brief"
  );

  const originalFetch = global.fetch;
  try {
    let callCount = 0;

    global.fetch = async () => {
      callCount += 1;
      return {
        ok: true,
        async json() {
          return {
            message: {
              content: '```json\n{"brief":"Monday is carrying a few live threads.","changed":["Camp forms still missing"],"stillMatters":["Keep in view: returning to prayer"],"needsAttention":["Faith may need attention around returning to prayer."],"deservesProtection":["Protect returning to prayer from getting crowded out."]}\n```',
            },
          };
        },
      };
    };

    delete require.cache[require.resolve("../src/engine/llm/ollama-provider")];
    delete require.cache[require.resolve("../src/engine/intelligence/monday-intelligence")];
    let {
      generateDailyBrief,
    } = require("../src/engine/intelligence/monday-intelligence");

    const brief = await generateDailyBrief({
      missions: [],
      captures: [],
      calendar: null,
      documents: null,
      email: null,
      finances: null,
    });

    assert.equal(callCount, 1);
    assert.equal(brief.enabled, true);
    assert.equal(brief.source, "live");
    assert.equal(brief.error, undefined);
    assert.equal(brief.brief, "Monday is carrying a few live threads.");
    assert.deepEqual(brief.stillMatters, ["Keep in view: returning to prayer"]);
    assert.deepEqual(brief.needsAttention, [
      "Faith may need attention around returning to prayer.",
    ]);
    assert.deepEqual(brief.deservesProtection, [
      "Protect returning to prayer from getting crowded out.",
    ]);

    callCount = 0;
    global.fetch = async () => {
      callCount += 1;
      return {
        ok: true,
        async json() {
          return {
            message: {
              content: JSON.stringify({
                summary: "Monday is carrying a few live threads.",
                whatChanged: "Camp forms still missing\nCash cushion before camp expenses",
                still_matters: ["Keep in view: returning to prayer"],
                what_needs_attention:
                  "Faith may need attention around returning to prayer.; Health may need attention around wanting to lose weight.",
                deserves_protection: [
                  "Protect returning to prayer from getting crowded out.",
                ],
              }),
            },
          };
        },
      };
    };

    delete require.cache[require.resolve("../src/engine/llm/ollama-provider")];
    delete require.cache[require.resolve("../src/engine/intelligence/monday-intelligence")];
    ({
      generateDailyBrief,
    } = require("../src/engine/intelligence/monday-intelligence"));

    const normalizedBrief = await generateDailyBrief({
      missions: [],
      captures: [],
      calendar: null,
      documents: null,
      email: null,
      finances: null,
    });

    assert.equal(callCount, 1);
    assert.equal(normalizedBrief.enabled, true);
    assert.equal(normalizedBrief.source, "live");
    assert.equal(normalizedBrief.error, undefined);
    assert.equal(normalizedBrief.brief, "Monday is carrying a few live threads.");
    assert.deepEqual(normalizedBrief.changed, [
      "Camp forms still missing",
      "Cash cushion before camp expenses",
    ]);
    assert.deepEqual(normalizedBrief.stillMatters, [
      "Keep in view: returning to prayer",
    ]);
    assert.deepEqual(normalizedBrief.needsAttention, [
      "Faith may need attention around returning to prayer.",
      "Health may need attention around wanting to lose weight.",
    ]);
    assert.deepEqual(normalizedBrief.deservesProtection, [
      "Protect returning to prayer from getting crowded out.",
    ]);

    callCount = 0;
    global.fetch = async () => {
      callCount += 1;
      throw new Error("synthetic ollama failure");
    };

    delete require.cache[require.resolve("../src/engine/llm/ollama-provider")];
    delete require.cache[require.resolve("../src/engine/intelligence/monday-intelligence")];
    ({
      generateDailyBrief,
    } = require("../src/engine/intelligence/monday-intelligence"));

    const cachedBrief = await generateDailyBrief({
      missions: [],
      captures: [],
      calendar: null,
      documents: null,
      email: null,
      finances: null,
    });

    assert.equal(callCount, 1);
    assert.equal(cachedBrief.cached, true);
    assert.equal(cachedBrief.source, "cached");
    assert.equal(cachedBrief.brief, "Monday is carrying a few live threads.");
    assert.equal(cachedBrief.error, "synthetic ollama failure");
    assert.deepEqual(cachedBrief.stillMatters, [
      "Keep in view: returning to prayer",
    ]);

    const path = require("node:path");
    const fs = require("node:fs");
    const cacheDir = process.env.MONDAY_INTELLIGENCE_DATA_DIR;
    fs.rmSync(cacheDir, { recursive: true, force: true });

    callCount = 0;
    global.fetch = async () => {
      callCount += 1;
      throw new Error("cold start failure");
    };

    delete require.cache[require.resolve("../src/engine/llm/ollama-provider")];
    delete require.cache[require.resolve("../src/engine/intelligence/monday-intelligence")];
    ({
      generateDailyBrief,
    } = require("../src/engine/intelligence/monday-intelligence"));

    const firstFallback = await generateDailyBrief({
      missions: [],
      captures: [],
      calendar: null,
      documents: null,
      email: null,
      finances: null,
    });

    assert.equal(firstFallback.cached, undefined);
    assert.equal(firstFallback.source, "fallback");
    assert.equal(firstFallback.error, "cold start failure");
    assert.ok(fs.existsSync(path.join(cacheDir, "daily-brief-cache.json")));

    const secondFallback = await generateDailyBrief({
      missions: [],
      captures: [],
      calendar: null,
      documents: null,
      email: null,
      finances: null,
    });

    assert.equal(secondFallback.cached, true);
    assert.equal(secondFallback.source, "cached");
    assert.equal(secondFallback.error, "cold start failure");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("Monday daily brief Ollama JSON tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
