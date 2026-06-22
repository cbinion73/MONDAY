"use strict";

const { syncGmailHistorical } = require("../src/engine/connectors/gmail-sync");
const { syncOutlookHistorical } = require("../src/engine/connectors/outlook-sync");
const { backfillEmailIntelligence } = require("../src/engine/connectors/email-intelligence");
const { getEmailSummary } = require("../src/engine/connectors/email-context");

function parseArgs(argv) {
  const args = {
    maxThreadsPerProvider: Number(process.env.MONDAY_HISTORICAL_EMAIL_MAX_THREADS || 2000),
    gmailOnly: false,
    outlookOnly: false,
    skipBackfill: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--max" && argv[i + 1]) {
      args.maxThreadsPerProvider = Number(argv[i + 1]) || args.maxThreadsPerProvider;
      i += 1;
      continue;
    }
    if (arg === "--gmail-only") {
      args.gmailOnly = true;
      continue;
    }
    if (arg === "--outlook-only") {
      args.outlookOnly = true;
      continue;
    }
    if (arg === "--skip-backfill") {
      args.skipBackfill = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const before = getEmailSummary({ limit: 1 });
  console.log(`[historical-email] starting with ${before.totalThreads} threads in store`);

  const providerResults = [];

  if (!args.outlookOnly && process.env.GOOGLE_REFRESH_TOKEN) {
    providerResults.push(
      await syncGmailHistorical({ maxThreads: args.maxThreadsPerProvider })
    );
  }

  if (!args.gmailOnly && process.env.MICROSOFT_REFRESH_TOKEN) {
    providerResults.push(
      await syncOutlookHistorical({ maxThreads: args.maxThreadsPerProvider })
    );
  }

  if (providerResults.length === 0) {
    throw new Error("No email providers configured for historical import.");
  }

  console.log("[historical-email] provider import complete");
  for (const result of providerResults) {
    console.log(`  - ${result.source}: imported ${result.added}, store total now ${result.total}`);
  }

  if (!args.skipBackfill) {
    const afterImport = getEmailSummary({ limit: 1 });
    console.log(`[historical-email] running Katy across ${afterImport.totalThreads} stored threads...`);
    const backfill = await backfillEmailIntelligence({ preserve: true });
    console.log(`[historical-email] backfill complete: processed ${backfill.processed} threads`);
  }

  const after = getEmailSummary({ limit: 1 });
  console.log(`[historical-email] finished with ${after.totalThreads} threads in store`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
