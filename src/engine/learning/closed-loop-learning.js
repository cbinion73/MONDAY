const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { classifySituation } = require("../resolvers/situation-classifier");
const { resolvePosture } = require("../resolvers/posture-resolver");
const {
  getHealingVsExecutionForSignificance,
} = require("../resolvers/significance-resolver");

const LEARNING_POLICY = Object.freeze({
  learnable: [
    "candidate_domain",
    "candidate_significance",
    "situation_classification_hint",
    "continuity_association",
  ],
  nonLearnable: [
    "active_role",
    "secondary_role",
    "recommended_outcome",
    "healing_vs_execution",
    "contract_override",
    "human_company_boundary",
    "voice_mode",
    "workspace_mode",
  ],
});
const EXAMPLE_TTL_DAYS = Number(process.env.MONDAY_LEARNING_TTL_DAYS || 30);

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "do",
  "for",
  "from",
  "get",
  "going",
  "had",
  "has",
  "have",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "me",
  "more",
  "my",
  "need",
  "not",
  "of",
  "on",
  "or",
  "our",
  "so",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "up",
  "want",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);
const GENERIC_FOLLOWUP_KEYS = new Set([
  "should first",
  "think",
  "tell",
  "more",
  "what now",
  "should next",
  "where start",
]);

function ensureLearningDir() {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

function getDataDir() {
  return path.resolve(
    process.env.MONDAY_LEARNING_DATA_DIR ||
      path.resolve(__dirname, "../../../data/learning")
  );
}

function getTurnLogPath() {
  return path.join(getDataDir(), "turn-log.jsonl");
}

function getMemoryPath() {
  return path.join(getDataDir(), "learning-memory.json");
}

function getSummaryPath() {
  return path.join(getDataDir(), "learning-summary.json");
}

function closedLoopLearningEnabled() {
  return process.env.MONDAY_CLOSED_LOOP_LEARNING === "true";
}

function defaultMemory() {
  return {
    version: 1,
    updatedAt: null,
    policy: LEARNING_POLICY,
    examples: [],
    hypotheses: [],
    counters: {
      loggedTurns: 0,
      recoveredTurns: 0,
      assistAcceptedTurns: 0,
      clarifiedTurns: 0,
      fallbackHypotheses: 0,
    },
  };
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function tokenize(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && token.length > 1 && !STOPWORDS.has(token));
}

function phraseKey(input) {
  return tokenize(input).join(" ");
}

function nowIso() {
  return new Date().toISOString();
}

function daysSince(isoString) {
  const timestamp = Date.parse(isoString);
  if (Number.isNaN(timestamp)) return Number.POSITIVE_INFINITY;
  return (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
}

function isFreshExample(example) {
  return daysSince(example.lastSeenAt) <= EXAMPLE_TTL_DAYS;
}

function pruneExamples(examples) {
  return examples.filter(isFreshExample);
}

function readLearningMemory() {
  if (!closedLoopLearningEnabled()) {
    return defaultMemory();
  }
  ensureLearningDir();
  const memory = readJson(getMemoryPath(), defaultMemory());
  const baseline = defaultMemory();
  return {
    ...baseline,
    ...memory,
    counters: normalizeCounters(memory.counters || {}),
    policy: LEARNING_POLICY,
    examples: pruneExamples(memory.examples || []),
    hypotheses: pruneExamples(memory.hypotheses || []),
  };
}

function writeLearningMemory(memory) {
  if (!closedLoopLearningEnabled()) {
    return;
  }
  ensureLearningDir();
  writeJson(getMemoryPath(), {
    ...memory,
    updatedAt: nowIso(),
  });
}

function computeOverlapScore(leftTokens, rightTokens) {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }

  return shared / Math.max(left.size, right.size);
}

function shouldStoreExample({ finalState, classificationAssist, input }) {
  if (!input || !finalState) return false;
  if (finalState.classificationFallback) return false;
  if (finalState.significance === "general_significance") return false;
  if (finalState.situationClassification === "unclassified") return false;
  if (tokenize(input).length < 2) return false;
  if (isGenericFollowUpPhrase(input)) return false;

  return true;
}

function isGenericFollowUpPhrase(input) {
  const key = phraseKey(input);
  if (GENERIC_FOLLOWUP_KEYS.has(key)) return true;

  const raw = String(input || "").trim().toLowerCase();
  return [
    "what should i do first",
    "what should i do next",
    "what now",
    "tell me more",
    "what do you think",
    "how's that going",
    "hows that going",
    "where should i start",
  ].includes(raw);
}

function sourceLabel({ learningRecovery, classificationAssist }) {
  if (learningRecovery?.used) return "learning-recovery";
  if (classificationAssist?.used) return "classification-assist";
  return "deterministic";
}

function isTrustedLearningSource(source) {
  return source === "deterministic" ||
    source === "classification-assist" ||
    source === "session-clarified";
}

function upsertLearnedExample({
  input,
  finalState,
  source = "deterministic",
  confidence = "high",
}) {
  const memory = readLearningMemory();
  const key = phraseKey(input);
  const tokens = tokenize(input);
  const existing = memory.examples.find((example) => example.phraseKey === key);
  const timestamp = nowIso();
  const nextContinuityAssociation =
    finalState.continuity?.activeSignificanceThread &&
    finalState.continuity.activeSignificanceThread !== "unclassified"
      ? finalState.continuity.activeSignificanceThread
      : existing?.continuityAssociation || null;
  const sourceHistory = Array.from(
    new Set([...(existing?.sourceHistory || []), source])
  );

  const nextExample = {
    id: existing?.id || crypto.randomUUID(),
    phraseKey: key,
    sampleInput: String(input),
    tokens,
    significance: finalState.significance,
    situationClassification: finalState.situationClassification,
    continuityAssociation: nextContinuityAssociation,
    source,
    sourceHistory,
    confidence,
    useCount: (existing?.useCount || 0) + 1,
    firstSeenAt: existing?.firstSeenAt || timestamp,
    lastSeenAt: timestamp,
  };

  memory.examples = [
    nextExample,
    ...pruneExamples(memory.examples).filter((example) => example.phraseKey !== key),
  ].slice(0, 250);

  memory.counters.loggedTurns += 1;

  writeLearningMemory(memory);
  updateLearningSummary();

  return nextExample;
}

function shouldStoreHypothesis({ input, finalState }) {
  if (!input || !finalState) return false;
  if (!finalState.classificationFallback) return false;
  if (!finalState.candidateDomain || finalState.candidateDomain === "unknown") return false;
  if (!finalState.candidateClassification || finalState.candidateClassification === "unknown") {
    return false;
  }
  if ((finalState.candidateConfidence ?? 0.5) < 0.45) return false;
  if (tokenize(input).length < 2) return false;
  if (isGenericFollowUpPhrase(input)) return false;

  return true;
}

function upsertFallbackHypothesis({ input, finalState }) {
  const memory = readLearningMemory();
  const key = phraseKey(input);
  const tokens = tokenize(input);
  const existing = memory.hypotheses.find((example) => example.phraseKey === key);
  const timestamp = nowIso();

  const nextHypothesis = {
    id: existing?.id || crypto.randomUUID(),
    phraseKey: key,
    sampleInput: String(input),
    tokens,
    candidateDomain: finalState.candidateDomain,
    candidateClassification: finalState.candidateClassification,
    candidateConfidence: finalState.candidateConfidence ?? existing?.candidateConfidence ?? 0.5,
    status:
      (existing?.useCount || 0) + 1 >= 2 &&
      (finalState.candidateConfidence ?? existing?.candidateConfidence ?? 0) >= 0.6
        ? "confirmed"
        : "pending",
    useCount: (existing?.useCount || 0) + 1,
    firstSeenAt: existing?.firstSeenAt || timestamp,
    lastSeenAt: timestamp,
  };

  memory.hypotheses = [
    nextHypothesis,
    ...pruneExamples(memory.hypotheses).filter((example) => example.phraseKey !== key),
  ].slice(0, 250);
  memory.counters.fallbackHypotheses += 1;

  writeLearningMemory(memory);
  updateLearningSummary();

  return nextHypothesis;
}

function storeLearnedExample({ input, finalState, classificationAssist, learningRecovery }) {
  if (!closedLoopLearningEnabled()) {
    return null;
  }

  const source = sourceLabel({ learningRecovery, classificationAssist });
  if (!isTrustedLearningSource(source)) {
    return null;
  }

  if (!shouldStoreExample({ finalState, classificationAssist, input })) {
    return null;
  }
  const nextExample = upsertLearnedExample({
    input,
    finalState,
    source,
    confidence:
      classificationAssist?.used
        ? classificationAssist.suggestion?.confidence || "medium"
        : "high",
  });

  if (classificationAssist?.used) {
    const memory = readLearningMemory();
    memory.counters.assistAcceptedTurns += 1;
    writeLearningMemory(memory);
    updateLearningSummary();
  }

  return nextExample;
}

function recordClarifiedLearning({ input, finalState }) {
  if (!closedLoopLearningEnabled()) {
    return null;
  }

  if (!input || !finalState) return null;
  if (finalState.classificationFallback) return null;
  if (finalState.significance === "general_significance") return null;
  if (finalState.situationClassification === "unclassified") return null;
  if (tokenize(input).length < 2) return null;

  const nextExample = upsertLearnedExample({
    input,
    finalState,
    source: "session-clarified",
    confidence: "medium",
  });

  const memory = readLearningMemory();
  memory.counters.clarifiedTurns += 1;
  writeLearningMemory(memory);
  updateLearningSummary();

  return nextExample;
}

function recordFallbackHypothesis({ input, finalState }) {
  if (!closedLoopLearningEnabled()) {
    return null;
  }

  if (!shouldStoreHypothesis({ input, finalState })) {
    return null;
  }

  return upsertFallbackHypothesis({ input, finalState });
}

function applyLearnedRecovery({ input, context = {}, engineState }) {
  if (!closedLoopLearningEnabled()) {
    return {
      engineState: {
        ...engineState,
        learningRecovery: {
          used: false,
          enabled: false,
          reason: "MONDAY_CLOSED_LOOP_LEARNING is not enabled.",
        },
      },
    };
  }

  if (!engineState?.classificationFallback) {
    return {
      engineState: {
        ...engineState,
        learningRecovery: {
          used: false,
          reason: "Deterministic classification already resolved.",
        },
      },
    };
  }

  const memory = readLearningMemory();
  const inputTokens = tokenize(input);
  if (inputTokens.length < 2 || memory.examples.length === 0) {
    return {
      engineState: {
        ...engineState,
        learningRecovery: {
          used: false,
          reason: "No learned examples available.",
        },
      },
    };
  }

  const directMatch = memory.examples.find((example) => example.phraseKey === phraseKey(input));
  const scoredExamples = pruneExamples(memory.examples)
    .filter((example) => isTrustedLearningSource(example.source))
    .map((example) => ({
      example,
      score: directMatch?.id === example.id ? 1 : computeOverlapScore(inputTokens, example.tokens),
    }))
    .sort((left, right) => right.score - left.score);

  const best = scoredExamples[0];
  if (!best || best.score < 0.86) {
    return {
      engineState: {
        ...engineState,
        learningRecovery: {
          used: false,
          reason: "No learned example matched with sufficient confidence.",
          bestScore: best?.score ?? 0,
        },
      },
    };
  }

  const classificationResult = classifySituation({
    input,
    significance: best.example.significance,
    context,
  });
  const postureResult = resolvePosture({
    significance: best.example.significance,
    situationClassification: classificationResult.situationClassification,
    humanCompanyRequired: classificationResult.humanCompanyRequired,
    healingVsExecution: getHealingVsExecutionForSignificance(
      best.example.significance
    ),
    input,
    context,
  });

  const recoveredState = {
    ...engineState,
    significance: best.example.significance,
    situationClassification: classificationResult.situationClassification,
    activeRole: postureResult.activeRole,
    secondaryRole: postureResult.secondaryRole,
    ripenessState: classificationResult.ripenessState,
    interruptibility: classificationResult.interruptibility,
    humanCompanyRequired: classificationResult.humanCompanyRequired,
    recommendedOutcome: postureResult.recommendedOutcome,
    woundRisk: classificationResult.woundRisk,
    shamePresent: classificationResult.shamePresent,
    identityProximity: classificationResult.identityProximity,
    healingVsExecution: getHealingVsExecutionForSignificance(
      best.example.significance
    ),
    classificationFallback: false,
    fallbackReason: null,
    explanation: [
      ...(engineState.explanation || []),
      `Recovered from learning memory using prior '${best.example.significance}' example.`,
      ...classificationResult.explanation,
      ...postureResult.explanation,
    ],
    learningRecovery: {
      used: true,
      sourceExampleId: best.example.id,
      sourceInput: best.example.sampleInput,
      matchedSignificance: best.example.significance,
      continuityAssociation: best.example.continuityAssociation || null,
      similarity: Number(best.score.toFixed(2)),
    },
  };

  const memoryForUpdate = readLearningMemory();
  memoryForUpdate.counters.recoveredTurns += 1;
  writeLearningMemory(memoryForUpdate);
  updateLearningSummary();

  return { engineState: recoveredState };
}

function deriveLearningSignals({ result }) {
  const learningRecovery = result.learningRecovery || result.finalState?.learningRecovery;
  return {
    classificationFallback: Boolean(result.finalState?.classificationFallback),
    assistUsed: Boolean(result.classificationAssist?.used),
    learningRecoveryUsed: Boolean(learningRecovery?.used),
    contractAdjusted: (result.contract?.adjustments || []).length > 0,
    contractBlocked: (result.contract?.blocked || []).length > 0,
    threadInherited: Boolean(result.finalState?.threadInheritanceConfidence > 0),
  };
}

function appendTurnLog(entry) {
  if (!closedLoopLearningEnabled()) {
    return;
  }
  ensureLearningDir();
  fs.appendFileSync(getTurnLogPath(), `${JSON.stringify(entry)}\n`, "utf8");
}

function recordTurnLearning({ input, sessionId, result }) {
  if (!closedLoopLearningEnabled()) {
    return {
      learningSignals: deriveLearningSignals({ result }),
      learnedExample: null,
      enabled: false,
    };
  }

  const learningSignals = deriveLearningSignals({ result });
  const learnedExample = storeLearnedExample({
    input,
    finalState: result.finalState,
    classificationAssist: result.classificationAssist,
    learningRecovery: result.learningRecovery || result.finalState?.learningRecovery,
  });
  const fallbackHypothesis = recordFallbackHypothesis({
    input,
    finalState: result.finalState,
  });

  const logEntry = {
    timestamp: nowIso(),
    sessionId,
    input,
    finalState: {
      significance: result.finalState?.significance,
      situationClassification: result.finalState?.situationClassification,
      activeRole: result.finalState?.activeRole,
      secondaryRole: result.finalState?.secondaryRole,
      recommendedOutcome: result.finalState?.recommendedOutcome,
      classificationFallback: result.finalState?.classificationFallback,
      candidateDomain: result.finalState?.candidateDomain,
      candidateClassification: result.finalState?.candidateClassification,
      threadInheritanceConfidence:
        result.finalState?.threadInheritanceConfidence ?? null,
    },
    learningSignals,
    classificationAssist: result.classificationAssist || null,
    learningRecovery:
      result.learningRecovery || result.finalState?.learningRecovery || null,
    intelligence: result.intelligence || null,
    learnedExampleId: learnedExample?.id || null,
    fallbackHypothesisId: fallbackHypothesis?.id || null,
  };

  appendTurnLog(logEntry);
  updateLearningSummary();

  return {
    learningSignals,
    learnedExample,
    fallbackHypothesis,
  };
}

function readRecentTurnLogs(limit = 200) {
  if (!closedLoopLearningEnabled()) return [];
  if (!fs.existsSync(getTurnLogPath())) return [];
  const lines = fs
    .readFileSync(getTurnLogPath(), "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(-limit);

  return lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function updateLearningSummary() {
  if (!closedLoopLearningEnabled()) {
    return {
      enabled: false,
      policy: LEARNING_POLICY,
      ttlDays: EXAMPLE_TTL_DAYS,
      totalLoggedTurns: 0,
      learnedExamples: 0,
      counters: defaultMemory().counters,
      topFallbackDomains: [],
      topSignificances: [],
      recoveryRate: 0,
      recentLearnedExamples: [],
    };
  }

  ensureLearningDir();
  const memory = readLearningMemory();
  const turns = readRecentTurnLogs(300);
  const freshExamples = pruneExamples(memory.examples);
  const trustedExamples = freshExamples.filter((example) =>
    isTrustedLearningSource(example.source)
  );
  const quarantinedExamples = freshExamples.filter(
    (example) => !isTrustedLearningSource(example.source)
  );

  const summary = {
    updatedAt: nowIso(),
    policy: LEARNING_POLICY,
    ttlDays: EXAMPLE_TTL_DAYS,
    totalLoggedTurns: turns.length,
    learnedExamples: trustedExamples.length,
    quarantinedExamples: quarantinedExamples.length,
    learnedHypotheses: pruneExamples(memory.hypotheses || []).length,
    counters: memory.counters,
    sourceCounts: topCounts(
      trustedExamples.map((example) => example.source || "unknown")
    ),
    quarantinedSourceCounts: topCounts(
      quarantinedExamples.map((example) => example.source || "unknown")
    ),
    topFallbackDomains: topCounts(
      turns
        .filter((turn) => turn.finalState?.classificationFallback)
        .map((turn) => turn.finalState?.candidateDomain || "unknown")
    ),
    topSignificances: topCounts(
      turns
        .map((turn) => turn.finalState?.significance)
        .filter(Boolean)
    ),
    recoveryRate:
      memory.counters.loggedTurns > 0
        ? Number(
            (
              memory.counters.recoveredTurns / Math.max(memory.counters.loggedTurns, 1)
            ).toFixed(2)
          )
        : 0,
    recentLearnedExamples: trustedExamples.slice(0, 8).map((example) => ({
      sampleInput: example.sampleInput,
      significance: example.significance,
      situationClassification: example.situationClassification,
      continuityAssociation: example.continuityAssociation,
      source: example.source,
      sourceHistory: example.sourceHistory || [example.source],
      useCount: example.useCount,
      ageDays: Number(daysSince(example.lastSeenAt).toFixed(2)),
      lastSeenAt: example.lastSeenAt,
    })),
    recentQuarantinedExamples: quarantinedExamples.slice(0, 8).map((example) => ({
      sampleInput: example.sampleInput,
      significance: example.significance,
      situationClassification: example.situationClassification,
      continuityAssociation: example.continuityAssociation,
      source: example.source,
      sourceHistory: example.sourceHistory || [example.source],
      useCount: example.useCount,
      ageDays: Number(daysSince(example.lastSeenAt).toFixed(2)),
      lastSeenAt: example.lastSeenAt,
    })),
    recentHypotheses: pruneExamples(memory.hypotheses || [])
      .slice(0, 8)
      .map((hypothesis) => ({
        sampleInput: hypothesis.sampleInput,
        candidateDomain: hypothesis.candidateDomain,
        candidateClassification: hypothesis.candidateClassification,
        candidateConfidence: hypothesis.candidateConfidence,
        status: hypothesis.status,
        useCount: hypothesis.useCount,
        ageDays: Number(daysSince(hypothesis.lastSeenAt).toFixed(2)),
        lastSeenAt: hypothesis.lastSeenAt,
      })),
  };

  writeJson(getSummaryPath(), summary);
  return summary;
}

function topCounts(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([value, count]) => ({ value, count }));
}

function normalizeCounters(rawCounters = {}) {
  const baseline = defaultMemory().counters;
  return {
    loggedTurns:
      rawCounters.loggedTurns ?? baseline.loggedTurns,
    recoveredTurns:
      rawCounters.recoveredTurns ?? baseline.recoveredTurns,
    assistAcceptedTurns:
      rawCounters.assistAcceptedTurns ?? baseline.assistAcceptedTurns,
    clarifiedTurns:
      rawCounters.clarifiedTurns ?? baseline.clarifiedTurns,
    fallbackHypotheses:
      rawCounters.fallbackHypotheses ?? baseline.fallbackHypotheses,
  };
}

function getLearningSummary() {
  return updateLearningSummary();
}

function getLearningInspection() {
  const memory = readLearningMemory();
  const summary = getLearningSummary();
  const trustedExamples = pruneExamples(memory.examples).filter((example) =>
    isTrustedLearningSource(example.source)
  );
  const quarantinedExamples = pruneExamples(memory.examples).filter(
    (example) => !isTrustedLearningSource(example.source)
  );
  const turns = readRecentTurnLogs(120);
  const recentRecoveries = turns
    .filter((turn) => turn.learningRecovery?.used)
    .slice(-8)
    .reverse()
    .map((turn) => ({
      timestamp: turn.timestamp,
      input: turn.input,
      significance: turn.finalState?.significance || null,
      sourceInput: turn.learningRecovery?.sourceInput || null,
      similarity: turn.learningRecovery?.similarity ?? null,
    }));
  const recentFallbacks = turns
    .filter((turn) => turn.finalState?.classificationFallback)
    .slice(-8)
    .reverse()
    .map((turn) => ({
      timestamp: turn.timestamp,
      input: turn.input,
      candidateDomain: turn.finalState?.candidateDomain || "unknown",
      candidateClassification:
        turn.finalState?.candidateClassification || "unknown",
      fallbackReason: turn.finalState?.fallbackReason || null,
    }));

  return {
    enabled: closedLoopLearningEnabled(),
    summary,
    policy: LEARNING_POLICY,
    ttlDays: EXAMPLE_TTL_DAYS,
    counters: normalizeCounters(summary.counters || memory.counters || {}),
    examples: trustedExamples.map((example) => ({
      id: example.id,
      phraseKey: example.phraseKey,
      sampleInput: example.sampleInput,
      significance: example.significance,
      situationClassification: example.situationClassification,
      continuityAssociation: example.continuityAssociation,
      source: example.source,
      sourceHistory: example.sourceHistory || [example.source],
      confidence: example.confidence,
      useCount: example.useCount,
      ageDays: Number(daysSince(example.lastSeenAt).toFixed(2)),
      firstSeenAt: example.firstSeenAt,
      lastSeenAt: example.lastSeenAt,
    })),
    quarantinedExamples: quarantinedExamples.map((example) => ({
      id: example.id,
      phraseKey: example.phraseKey,
      sampleInput: example.sampleInput,
      significance: example.significance,
      situationClassification: example.situationClassification,
      continuityAssociation: example.continuityAssociation,
      source: example.source,
      sourceHistory: example.sourceHistory || [example.source],
      confidence: example.confidence,
      useCount: example.useCount,
      ageDays: Number(daysSince(example.lastSeenAt).toFixed(2)),
      firstSeenAt: example.firstSeenAt,
      lastSeenAt: example.lastSeenAt,
    })),
    hypotheses: pruneExamples(memory.hypotheses || []).map((hypothesis) => ({
      id: hypothesis.id,
      phraseKey: hypothesis.phraseKey,
      sampleInput: hypothesis.sampleInput,
      candidateDomain: hypothesis.candidateDomain,
      candidateClassification: hypothesis.candidateClassification,
      candidateConfidence: hypothesis.candidateConfidence,
      status: hypothesis.status,
      useCount: hypothesis.useCount,
      ageDays: Number(daysSince(hypothesis.lastSeenAt).toFixed(2)),
      firstSeenAt: hypothesis.firstSeenAt,
      lastSeenAt: hypothesis.lastSeenAt,
    })),
    recentRecoveries,
    recentFallbacks,
  };
}

function getLearnedClassificationHints({ input, limit = 5 }) {
  if (!closedLoopLearningEnabled()) return [];
  const memory = readLearningMemory();
  const inputTokens = tokenize(input);
  if (inputTokens.length < 2) return [];

  return pruneExamples(memory.hypotheses || [])
    .map((hypothesis) => ({
      ...hypothesis,
      similarity:
        hypothesis.phraseKey === phraseKey(input)
          ? 1
          : computeOverlapScore(inputTokens, hypothesis.tokens || []),
    }))
    .filter((hypothesis) => hypothesis.similarity >= 0.45)
    .sort((left, right) => {
      if (right.similarity !== left.similarity) {
        return right.similarity - left.similarity;
      }
      return (right.useCount || 0) - (left.useCount || 0);
    })
    .slice(0, limit)
    .map((hypothesis) => ({
      sampleInput: hypothesis.sampleInput,
      candidateDomain: hypothesis.candidateDomain,
      candidateClassification: hypothesis.candidateClassification,
      candidateConfidence: hypothesis.candidateConfidence,
      similarity: Number(hypothesis.similarity.toFixed(2)),
      status: hypothesis.status,
      useCount: hypothesis.useCount,
    }));
}

module.exports = {
  applyLearnedRecovery,
  closedLoopLearningEnabled,
  getLearningInspection,
  getLearnedClassificationHints,
  getLearningSummary,
  recordClarifiedLearning,
  recordFallbackHypothesis,
  recordTurnLearning,
  readLearningMemory,
  updateLearningSummary,
  getDataDir,
};
