const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.MONDAY_OLLAMA_ENABLED = "false";

process.env.MONDAY_CONNECTORS_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-connectors-financial"
);

const {
  importFinancialAccounts,
  getFinancialSummary,
  clearFinancialAccounts,
  getDataDir,
} = require("../src/engine/connectors/financial-context");
const { generateDailyBrief } = require("../src/engine/intelligence/monday-intelligence");

async function main() {
  fs.rmSync(getDataDir(), { recursive: true, force: true });
  importFinancialAccounts(
    [
      {
        name: "Operating Checking",
        type: "checking",
        balance: 4200,
        watchLabel: "Cash cushion before camp expenses",
      },
    ],
    { source: "test" }
  );

  const finances = getFinancialSummary();
  assert.equal(finances.source, "test");
  assert.equal(finances.totalAccounts, 1);
  assert.equal(finances.accounts[0].name, "Operating Checking");

  const brief = await generateDailyBrief({
    missions: [],
    captures: [],
    calendar: {
      upcomingEvents: [
        {
          title: "Caleb Summer Camp Check-in",
          startAt: "2026-06-15T14:00:00.000Z",
        },
      ],
      nextEvent: {
        title: "Caleb Summer Camp Check-in",
        startAt: "2026-06-15T14:00:00.000Z",
      },
    },
    documents: null,
    email: null,
    finances,
  });

  assert.equal(brief.enabled, false);
  assert.ok(brief.brief.includes("Operating Checking"));
  assert.ok(brief.changed.some((item) => item.includes("Operating Checking")));
  assert.ok(
    brief.stillMatters.some((item) => item.includes("Operating Checking"))
  );
  assert.ok(
    brief.needsAttention.some((item) => item.includes("Cash cushion before camp expenses"))
  );

  const calendarMentions = brief.needsAttention.filter((item) =>
    item.includes("Caleb Summer Camp Check-in")
  );
  assert.equal(calendarMentions.length, 1);

  clearFinancialAccounts();
  fs.rmSync(getDataDir(), { recursive: true, force: true });
  console.log("Monday financial context tests passed.");
}

main();
