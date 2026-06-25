"use strict";

const {
  listEmailMemoryRecords,
  markEmailMemoryRecordDropped,
} = require("../src/engine/db/email-memory-store");
const {
  shouldPreserveCorrespondence,
} = require("../src/engine/correspondence/katy-stampwhistle");
const {
  getEmailThread,
} = require("../src/engine/db/email-intelligence-store");
const {
  deleteCorrespondenceByThreadIds,
} = require("../src/engine/memory/memory-writer");

async function main() {
  const limit = Number(process.argv[2] || 500);
  const records = listEmailMemoryRecords({ limit, preserveState: "preserved" });
  const toDrop = [];

  for (const record of records) {
    const thread = getEmailThread(record.threadId);
    if (!thread) continue;
    const verdict = shouldPreserveCorrespondence({
      id: thread.threadId,
      source: thread.source,
      subject: thread.subject,
      from: thread.fromAddress,
      snippet: thread.snippet,
      bodyText: thread.bodyText,
      providerCategory: thread.providerCategory,
      providerLabels: thread.providerLabels,
      threadType: thread.threadType,
      significanceScore: thread.significanceScore,
      relationshipScore: thread.relationshipScore,
      junkScore: thread.junkScore,
      actionability: thread.actionability,
      structuredFacts: thread.structuredFacts,
      entities: thread.entities,
      userParticipated: thread.userParticipated,
      domain: thread.domain,
      starred: thread.starred,
      hasAttachments: thread.hasAttachments,
    });
    if (!verdict.preserve) {
      toDrop.push({
        threadId: thread.threadId,
        subject: thread.subject || "(no subject)",
        reason: verdict.reason,
      });
    }
  }

  if (!toDrop.length) {
    console.log("No preserved junk found. Katy is clean.");
    return;
  }

  await deleteCorrespondenceByThreadIds(toDrop.map((item) => item.threadId));
  for (const item of toDrop) {
    markEmailMemoryRecordDropped(item.threadId, item.reason);
  }

  console.log(`Dropped ${toDrop.length} preserved correspondence records:\n`);
  for (const item of toDrop) {
    console.log(`- ${item.threadId}: ${item.subject}`);
    console.log(`  reason: ${item.reason}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
