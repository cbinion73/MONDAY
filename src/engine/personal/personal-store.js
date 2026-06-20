const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MISSION_NAMES = ["Health", "Publishing", "Retirement", "Family", "Faith", "Work"];
const CAPTURE_DEDUPE_WINDOW_MS = Number(
  process.env.MONDAY_CAPTURE_DEDUPE_WINDOW_MS || 7 * 24 * 60 * 60 * 1000
);

function getDataDir() {
  return path.resolve(
    process.env.MONDAY_PERSONAL_DATA_DIR ||
      path.resolve(__dirname, "../../../data/personal")
  );
}

function getCapturesPath() {
  return path.join(getDataDir(), "captures.json");
}

function getMissionsPath() {
  return path.join(getDataDir(), "missions.json");
}

function ensureStoreDir() {
  fs.mkdirSync(getDataDir(), { recursive: true });
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

function nowIso() {
  return new Date().toISOString();
}

function detectCaptureIntent(input) {
  const text = String(input || "").trim().toLowerCase();
  return (
    text.startsWith("remember this") ||
    text.startsWith("monday, remember this") ||
    text.startsWith("monday remember this") ||
    text.startsWith("remember ") ||
    text.startsWith("monday, remember ") ||
    text.startsWith("monday remember ")
  );
}

function extractCaptureText(input) {
  const raw = String(input || "").trim();
  return raw
    .replace(/^monday,?\s*remember this[:,-]?\s*/i, "")
    .replace(/^remember this[:,-]?\s*/i, "")
    .replace(/^monday,?\s*remember[:,-]?\s*/i, "")
    .replace(/^remember[:,-]?\s*/i, "")
    .trim();
}

function defaultMissions() {
  const now = nowIso();
  return MISSION_NAMES.map((name) => ({
    id: name.toLowerCase(),
    name,
    status: "active",
    significanceThreads: [],
    recentCaptures: [],
    lastTouchedAt: now,
  }));
}

function readMissions() {
  ensureStoreDir();
  const missions = readJson(getMissionsPath(), defaultMissions());
  return normalizeMissions(missions);
}

function normalizeMissions(missions) {
  const byId = new Map((missions || []).map((mission) => [mission.id, mission]));
  return MISSION_NAMES.map((name) => {
    const id = name.toLowerCase();
    const existing = byId.get(id);
    const normalized = existing || {
      id,
      name,
      status: "active",
      significanceThreads: [],
      recentCaptures: [],
      lastTouchedAt: nowIso(),
    };

    return {
      ...normalized,
      significanceThreads: uniqueStrings(normalized.significanceThreads || []).slice(0, 10),
      recentCaptures: dedupeMissionRecentCaptures(normalized.recentCaptures || []).slice(0, 8),
    };
  });
}

function writeMissions(missions) {
  ensureStoreDir();
  writeJson(getMissionsPath(), normalizeMissions(missions));
}

function readCaptures() {
  ensureStoreDir();
  return dedupeCaptureRows(readJson(getCapturesPath(), [])).slice(0, 300);
}

function writeCaptures(captures) {
  ensureStoreDir();
  writeJson(getCapturesPath(), dedupeCaptureRows(captures).slice(0, 300));
}

function mapSignificanceToMission(significance) {
  const mapping = {
    weight_loss_goal: "health",
    energy_decline: "health",
    exercise_commitment: "health",
    declared_family_value: "family",
    relationship_concern: "family",
    family_time_tension: "family",
    spiritual_drift: "faith",
    prayer_concern: "faith",
    calling_question: "faith",
    work_tradeoff: "work",
    burnout_risk: "work",
    career_decision: "work",
    publishing_decision: "publishing",
    creative_drift: "publishing",
    wounded_book_significance: "publishing",
    book_project_quiet_significance: "publishing",
    truthful_reapproach_needed: "publishing",
    identity_adjacent_wound: "publishing",
    future_life_transition: "retirement",
    identity_transition: "retirement",
    legacy_question: "retirement",
  };
  return mapping[significance] || null;
}

function normalizeMissionId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  const known = new Set([
    "health",
    "publishing",
    "retirement",
    "family",
    "faith",
    "work",
  ]);

  return known.has(normalized) ? normalized : null;
}

function inferMissionIdForCapture({ finalState, truth, context = {} }) {
  return (
    mapSignificanceToMission(finalState?.significance) ||
    normalizeMissionId(finalState?.candidateDomain) ||
    normalizeMissionId(truth?.domain) ||
    normalizeMissionId(context.activeMission) ||
    null
  );
}

function recordCapture({ input, finalState, truth, context = {} }) {
  const content = extractCaptureText(input) || input;
  const missionId = inferMissionIdForCapture({ finalState, truth, context });
  const createdAt = nowIso();
  const existingCaptures = readCaptures();
  const duplicate = findDuplicateCapture(existingCaptures, {
    content,
    missionId,
    significance: finalState.significance,
  });
  const capture = duplicate
    ? {
        ...duplicate,
        content,
        significance: finalState.significance,
        situationClassification: finalState.situationClassification,
        missionId,
        truth,
        createdAt,
      }
    : {
        id: crypto.randomUUID(),
        content,
        significance: finalState.significance,
        situationClassification: finalState.situationClassification,
        missionId,
        truth,
        createdAt,
      };

  const captures = [
    capture,
    ...existingCaptures.filter(
      (item) =>
        item.id !== capture.id &&
        !(
          item.missionId === missionId &&
          isDuplicateCaptureRecord(item, {
            content,
            significance: finalState.significance,
          })
        )
    ),
  ].slice(0, 300);
  writeCaptures(captures);

  if (missionId) {
    const missions = readMissions().map((mission) => {
      if (mission.id !== missionId) return mission;
      return {
        ...mission,
        significanceThreads: uniqueStrings([
          finalState.significance,
          ...mission.significanceThreads,
        ]).slice(0, 10),
        recentCaptures: [
          { content, significance: finalState.significance, createdAt: capture.createdAt },
          ...mission.recentCaptures.filter(
            (item) =>
              !isDuplicateCaptureRecord(item, {
                content,
                significance: finalState.significance,
              })
          ),
        ].slice(0, 8),
        lastTouchedAt: capture.createdAt,
      };
    });
    writeMissions(missions);
  }

  return capture;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function dedupeMissionRecentCaptures(captures = []) {
  const seen = new Set();
  const deduped = [];

  for (const capture of captures) {
    const key = `${normalizeCaptureText(capture?.content)}::${String(
      capture?.significance || ""
    )}`;
    if (!capture?.content || seen.has(key)) continue;
    seen.add(key);
    deduped.push(capture);
  }

  return deduped;
}

function dedupeCaptureRows(captures = []) {
  const deduped = [];

  for (const capture of captures) {
    if (
      deduped.some(
        (existing) =>
          existing.missionId === capture.missionId &&
          isDuplicateCaptureRecord(existing, {
            content: capture.content,
            significance: capture.significance,
          })
      )
    ) {
      continue;
    }
    deduped.push(capture);
  }

  return deduped;
}

function normalizeCaptureText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.?!]+$/g, "")
    .replace(/\s+/g, " ");
}

function withinDedupeWindow(isoString) {
  const timestamp = Date.parse(isoString || "");
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= CAPTURE_DEDUPE_WINDOW_MS;
}

function isDuplicateCaptureRecord(record, { content, significance }) {
  return (
    normalizeCaptureText(record?.content) === normalizeCaptureText(content) &&
    String(record?.significance || "") === String(significance || "")
  );
}

function findDuplicateCapture(captures, { content, missionId, significance }) {
  return (captures || []).find(
    (capture) =>
      capture.missionId === missionId &&
      isDuplicateCaptureRecord(capture, { content, significance }) &&
      withinDedupeWindow(capture.createdAt)
  ) || null;
}

function buildPersonalContext() {
  const missions = readMissions();
  const captures = readCaptures();
  return {
    missionThreads: missions.map((mission) => ({
      id: mission.id,
      name: mission.name,
      lastTouchedAt: mission.lastTouchedAt,
      significanceThreads: mission.significanceThreads,
    })),
    recentCaptures: captures.slice(0, 8).map((capture) => ({
      content: capture.content,
      missionId: capture.missionId,
      significance: capture.significance,
      createdAt: capture.createdAt,
    })),
  };
}

function getRelevantThreadContext({ significance }) {
  const missionId = mapSignificanceToMission(significance);
  if (!missionId) return null;

  const mission = readMissions().find((item) => item.id === missionId);
  const captures = readCaptures()
    .filter((capture) => capture.missionId === missionId)
    .slice(0, 4);

  if (!mission && captures.length === 0) {
    return null;
  }

  const sameSignificance = captures.filter(
    (capture) => capture.significance === significance
  );

  return {
    missionId,
    missionName: mission?.name || capitalize(missionId),
    significance,
    hasMissionThread: Boolean(mission?.significanceThreads?.length),
    missionLastTouchedAt: mission?.lastTouchedAt || null,
    matchingCaptureCount: sameSignificance.length,
    recentMissionCaptures: captures.map((capture) => ({
      content: capture.content,
      significance: capture.significance,
      createdAt: capture.createdAt,
    })),
    mostRecentMatchingCapture: sameSignificance[0]?.content || null,
  };
}

function capitalize(value) {
  return String(value || "")
    .slice(0, 1)
    .toUpperCase() + String(value || "").slice(1);
}

function getMissionSummary() {
  return readMissions();
}

function getRecentCaptures(limit = 20) {
  return readCaptures().slice(0, limit);
}

module.exports = {
  buildPersonalContext,
  detectCaptureIntent,
  extractCaptureText,
  getDataDir,
  getMissionSummary,
  getRecentCaptures,
  getRelevantThreadContext,
  inferMissionIdForCapture,
  recordCapture,
};
