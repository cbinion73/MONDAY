"use strict";

const {
  listEmailMemoryRecords,
  getEmailMemoryStats,
} = require("../src/engine/db/email-memory-store");
const { searchCorrespondence } = require("../src/engine/memory/memory-search");

function parseArgs(argv) {
  const args = { limit: 10, query: "", all: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit" && argv[i + 1]) {
      args.limit = Number(argv[i + 1]) || args.limit;
      i += 1;
      continue;
    }
    if (arg === "--query" && argv[i + 1]) {
      args.query = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--all") {
      args.all = true;
    }
  }
  return args;
}

function printRecord(record, index) {
  console.log(`\n${index + 1}. ${record.subject || "(no subject)"}`);
  console.log(`   threadId: ${record.threadId}`);
  console.log(`   from: ${record.fromAddress || "unknown"} | source: ${record.source || "unknown"}`);
  console.log(`   type/domain: ${record.threadType || "unknown"} / ${record.domain || "unknown"}`);
  console.log(`   preserve: ${record.preserveState} | score: ${(record.preserveScore || 0).toFixed(2)}`);
  console.log(`   significance: ${(record.significanceScore || 0).toFixed(2)} | relationship: ${(record.relationshipScore || 0).toFixed(2)} | actionability: ${(record.actionability || 0).toFixed(2)}`);
  console.log(`   reason: ${record.preserveReason || "n/a"}`);
  console.log(`   vectorDocId: ${record.vectorDocId || "n/a"}`);
  console.log(`   preservedAt: ${record.lastPreservedAt || "n/a"}`);
  if (record.entities?.length) {
    console.log(`   entities: ${record.entities.join(", ")}`);
  }
  if (record.summary) {
    console.log(`   summary: ${String(record.summary).replace(/\s+/g, " ").slice(0, 220)}`);
  }
}

async function main() {
  const { limit, query, all } = parseArgs(process.argv.slice(2));
  const stats = getEmailMemoryStats();
  const records = listEmailMemoryRecords({ limit, preserveState: all ? null : "preserved" });

  console.log("Katy Stampwhistle Inspector");
  console.log("===========================");
  console.log(`Preserved threads: ${stats.preservedCount}`);
  console.log(`Active preserved: ${stats.activePreservedCount}`);
  console.log(`Average preserve score: ${(stats.avgPreserveScore || 0).toFixed(2)}`);
  console.log(`Last preserved at: ${stats.lastPreservedAt || "never"}`);

  if (!records.length) {
    console.log("\nNo preserved correspondence records found.");
  } else {
    console.log(`\nLatest ${all ? "correspondence records" : "active preserved records"} (${records.length} shown):`);
    records.forEach(printRecord);
  }

  if (query) {
    const recall = await searchCorrespondence(query, { limit: Math.min(limit, 8) });
    console.log(`\nSemantic recall for query: "${query}"`);
    if (!recall.ok || !recall.results.length) {
      console.log("No correspondence recall results.");
      return;
    }
    recall.results.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.id} | score: ${item.score == null ? "n/a" : item.score.toFixed(4)}`);
      console.log(`   source: ${item.source || "unknown"} | domain: ${item.domain || "unknown"}`);
      console.log(`   excerpt: ${item.excerpt || ""}`);
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
