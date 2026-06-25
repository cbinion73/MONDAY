"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "monday-presence-test-"));
process.env.MONDAY_STATE_DIR = tempRoot;

const sessions = require("../src/engine/gateway/sessions");
const {
  hydratePresenceState,
  advancePresenceState,
  syncPresenceAfterConversation,
} = require("../src/engine/gateway/presence-engine");
const { enqueueSurfacing, markSurfaced } = require("../src/engine/db/surfacing-store");
const { deriveArrivalMetadata } = require("../src/engine/conversation/conversation-presenter");

function run() {
  const channel = "presence-web";
  const senderId = `test-${Date.now()}`;
  const retirementSubject = { id: "retirement", name: "Retirement" };

  sessions.clearSession(channel, senderId);

  const arrival = hydratePresenceState({ channel, senderId });
  assert.equal(arrival.stage.phase, "thought");
  assert.equal(arrival.stage.prop.visible, false);

  const subject = advancePresenceState({
    channel,
    senderId,
    action: "select_subject",
    subjectId: "retirement",
  });
  assert.equal(subject.stage.subjectId, "retirement");
  assert.equal(subject.stage.phase, "thought");
  assert.equal(subject.stage.prop.visible, false);
  assert.ok(subject.stage.arrivalMode);
  assert.equal(subject.stage.arrivalMode, "still_checking");
  assert.match(
    subject.stage.body,
    /financial and timing decision|redesign question|redesigning what work is allowed to carry/i
  );

  const revealed = advancePresenceState({ channel, senderId, action: "continue" });
  assert.equal(revealed.stage.subjectId, "retirement");
  assert.equal(revealed.stage.phase, "reveal");
  assert.equal(revealed.stage.prop.visible, true);

  syncPresenceAfterConversation({
    channel,
    senderId,
    currentSubjectId: "retirement",
    domain: "Retirement",
    reply: "Retirement is behaving less like a money decision and more like an identity decision.",
  });
  const resumed = hydratePresenceState({ channel, senderId, requestedSubjectId: "retirement" });
  assert.equal(resumed.stage.mode, "resume");
  assert.ok(resumed.stage.arrivalMode);
  assert.match(resumed.stage.title, /center of gravity has moved|harder to ignore|kept thinking/i);
  assert.match(
    resumed.stage.body,
    /financial and timing decision|redesign question|redesigning what work is allowed to carry/i
  );
  assert.ok(resumed.stage.arrivalReason);
  assert.ok(typeof resumed.stage.arrivalConfidence === "number");

  const interruptionId = enqueueSurfacing({
    source: "synthesis",
    domain: "Family",
    payload: "Family has become more consequential than it first looked.",
    priority: 1,
  });

  const interrupted = hydratePresenceState({
    channel,
    senderId: `interrupt-${Date.now()}`,
  });
  assert.equal(interrupted.stage.mode, "interruption");
  assert.ok(interrupted.stage.arrivalMode);
  assert.match(interrupted.stage.title, /found something new|harder to ignore|center of gravity has moved|ready to talk through|still checking|would not call it settled/i);
  markSurfaced(interruptionId);

  const durableSenderId = `durable-${Date.now()}`;
  sessions.clearSession(channel, durableSenderId);
  syncPresenceAfterConversation({
    channel,
    senderId: durableSenderId,
    currentSubjectId: "retirement",
    domain: "Retirement",
    reply: "Retirement is less about leaving work and more about redesigning what work is allowed to carry.",
    conversationTurn: {
      update: {
        status: "Ready",
        currentRead: "I think Retirement is less about leaving work and more about redesigning what work is allowed to carry.",
        currentReadConfidence: 0.74,
        currentReadDecision: "soften",
        currentReadLabels: ["repeated evidence", "durable read"],
        driftMemory: {
          currentCenterOfGravity: "responsibility_redesign",
          lastCenterOfGravity: "financial_timing",
          driftDirection: "financial_timing -> responsibility_redesign",
          durability: "durable",
          volatility: "medium",
          currentCenterFirstSeenAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          centerShifted: true,
        },
      },
    },
  });
  const durable = hydratePresenceState({ channel, senderId: durableSenderId, requestedSubjectId: "retirement" });
  assert.ok(["center_shifted", "fragile_read", "pattern_hardening"].includes(durable.stage.arrivalMode));
  assert.match(durable.stage.arrivalReason, /Retirement signals|live but competing signals/i);

  const patternHardening = deriveArrivalMetadata({
    currentRead: "I think Retirement is less about leaving work and more about redesigning what work is allowed to carry.",
    currentReadConfidence: 0.71,
    currentReadDecision: "hold",
    currentReadLabels: ["repeated evidence", "durable read"],
    currentReadStale: false,
    currentRecommendation: null,
    pendingRecommendation: null,
    unresolvedQuestion: null,
    provenance: { label: "Strategy Division" },
    latestWorkforceSignal: null,
    driftMemory: {
      centerShifted: false,
      durability: "durable",
      volatility: "low",
      currentCenterFirstSeenAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  }, retirementSubject, "arrival");
  assert.equal(patternHardening.arrivalMode, "pattern_hardening");

  const fragile = deriveArrivalMetadata({
    currentRead: "I think Retirement may be changing shape.",
    currentReadConfidence: 0.63,
    currentReadDecision: "soften",
    currentReadLabels: ["fragile read", "still uncertain"],
    currentReadStale: false,
    currentRecommendation: null,
    pendingRecommendation: null,
    unresolvedQuestion: null,
    provenance: { label: "Strategy Division" },
    latestWorkforceSignal: null,
    driftMemory: {
      centerShifted: false,
      durability: "fragile",
      volatility: "high",
    },
  }, retirementSubject, "arrival");
  assert.equal(fragile.arrivalMode, "fragile_read");

  const stillChecking = deriveArrivalMetadata({
    currentRead: "I think Retirement might be moving.",
    currentReadConfidence: 0.41,
    currentReadDecision: "wait",
    currentReadLabels: ["new evidence", "fragile read"],
    currentReadStale: true,
    currentRecommendation: null,
    pendingRecommendation: null,
    unresolvedQuestion: null,
    provenance: { label: "Research Division" },
    latestWorkforceSignal: { source: "synthesis", payload: "New signal." },
    driftMemory: {
      centerShifted: false,
      durability: "fragile",
      volatility: "low",
    },
  }, retirementSubject, "arrival");
  assert.equal(stillChecking.arrivalMode, "still_checking");

  const readyToDiscuss = deriveArrivalMetadata({
    currentRead: "I think Retirement is asking for a redesign, not a date.",
    currentReadConfidence: 0.7,
    currentReadDecision: "hold",
    currentReadLabels: [],
    currentReadStale: false,
    currentRecommendation: "I would name the responsibilities first.",
    pendingRecommendation: null,
    unresolvedQuestion: "What should you redesign first?",
    provenance: { label: "Strategy Division" },
    latestWorkforceSignal: null,
    driftMemory: {
      centerShifted: false,
      durability: "fragile",
      volatility: "low",
    },
  }, retirementSubject, "arrival");
  assert.equal(readyToDiscuss.arrivalMode, "ready_to_discuss");

  console.log("presence-engine: ok");
}

run();
