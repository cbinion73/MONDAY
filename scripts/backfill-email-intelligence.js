"use strict";

const { backfillEmailIntelligence } = require("../src/engine/connectors/email-intelligence");
const { getEmailSummary } = require("../src/engine/connectors/email-context");

function parseArgs(argv) {
  const args = {
    batchSize: Number(process.env.MONDAY_EMAIL_BACKFILL_BATCH || 24),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--batch" && argv[i + 1]) {
      args.batchSize = Number(argv[i + 1]) || args.batchSize;
      i += 1;
    }
  }
  return args;
}

async function main() {
  const { batchSize } = parseArgs(process.argv.slice(2));
  const before = getEmailSummary({ limit: 1 });
  console.log(`[katy] email threads available: ${before.totalThreads}`);
  console.log(`[katy] unread threads: ${before.unreadCount}`);
  console.log(`[katy] source: ${before.source}`);
  console.log(`[katy] starting full intelligence backfill (batch size ${batchSize})...`);

  const result = await backfillEmailIntelligence({ batchSize, preserve: true });
  console.log(`[katy] complete: processed ${result.processed} threads`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
