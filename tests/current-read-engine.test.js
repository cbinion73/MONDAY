"use strict";

const assert = require("node:assert/strict");

const {
  recomputeCurrentRead,
  buildChangedMindReply,
  buildConfidenceReply,
  buildDriftReply,
  buildHowLongReply,
  buildIsThisNewReply,
  buildWhyDoYouThinkThatReply,
  buildWhatWouldChangeMindReply,
} = require("../src/engine/conversation/current-read-engine");

function retirementConversation(overrides = {}) {
  return {
    status: "Ready",
    currentHypothesis: "Retirement looks more like a financial and timing question.",
    currentThought: "Retirement appears to be shifting toward freedom and responsibility.",
    currentConversationSummary: "Retirement is becoming less about stopping and more about preserving the part of Chris that still wants to build.",
    currentRead: null,
    currentRecommendation: "Separate the responsibilities you want to lay down from the work you still want to keep.",
    currentConcern: null,
    currentOpportunity: null,
    currentQuestion: null,
    lastTheoryChangedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    lastProgressAt: new Date().toISOString(),
    lastTouchedAt: new Date().toISOString(),
    lastUserAttentionAt: new Date().toISOString(),
    lastUserAsk: "I still want to build things, but I want less burden.",
    latestWorkforceSignal: {
      source: "synthesis",
      payload: "The strongest pattern now is the tension between wanting freedom and still wanting to build, which makes this look more like a responsibility redesign.",
      createdAt: new Date().toISOString(),
    },
    pendingReveal: null,
    pendingRecommendation: null,
    pendingWorkforceJobs: [],
    unresolvedQuestion: null,
    currentOpenQuestion: null,
    history: [
      { user: "I think I want to retire." },
      { user: "It's not really about money anymore." },
      { user: "I still want to build things." },
    ],
    ...overrides,
  };
}

function run() {
  const subject = { id: "retirement", name: "Retirement" };

  const contradictionWins = recomputeCurrentRead(subject, retirementConversation({
    currentConcern: "You still want to build, but you want work carrying less responsibility.",
  }));
  assert.equal(
    contradictionWins.currentRead,
    "I think Retirement is less about leaving work and more about redesigning what work is allowed to carry."
  );
  assert.ok(["revise", "escalate"].includes(contradictionWins.currentReadDecision));

  const workforceRevises = recomputeCurrentRead(subject, retirementConversation());
  assert.match(workforceRevises.whatChangedMyMind || "", /repeated tension between wanting freedom and still wanting to build/i);
  assert.equal(workforceRevises.currentReadDecision, "revise");

  const weakSignalHolds = recomputeCurrentRead(subject, retirementConversation({
    currentRead: "I think we've been treating this like a retirement decision when it's becoming a responsibility redesign.",
    currentHypothesis: "Retirement still might be about timing.",
    currentThought: "Maybe retirement soon.",
    latestWorkforceSignal: null,
    currentConcern: null,
    status: "Watching",
    lastTheoryChangedAt: new Date().toISOString(),
    lastProgressAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    lastTouchedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    lastUserAttentionAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    lastUserAsk: "retirement",
    currentRecommendation: null,
  }));
  assert.equal(weakSignalHolds.currentReadDecision, "hold");

  const opposingSoftens = recomputeCurrentRead(subject, retirementConversation({
    currentConcern: "I am not dismissing the financial side. I just do not think it is the center anymore.",
    pendingReveal: {
      type: "contradiction",
      observed: "You still want to build, but you want less burden.",
    },
    currentHypothesis: "Retirement is really about redesigning what work is allowed to carry.",
    currentRead: "I think we've been treating this like a retirement decision when it's becoming a responsibility redesign.",
    history: [{ user: "I still want to build things." }],
    latestWorkforceSignal: {
      source: "synthesis",
      payload: "Retirement now behaves more like a responsibility redesign, but the financial readiness question still matters.",
      createdAt: new Date().toISOString(),
    },
  }));
  assert.equal(opposingSoftens.currentReadDecision, "soften");
  assert.ok((opposingSoftens.currentReadConfidence || 0) < 0.78);
  assert.match(opposingSoftens.whatIAmStillChecking || "", /financial side/i);

  const changedMindReply = buildChangedMindReply(subject, workforceRevises);
  assert.match(changedMindReply, /strongest signal/i);

  const confidenceReply = buildConfidenceReply(subject, opposingSoftens);
  assert.match(confidenceReply, /Reasonably sure|Fairly sure/i);
  assert.match(confidenceReply, /financial side|still checking/i);

  assert.ok(Array.isArray(workforceRevises.currentReadEvidence.supportingEvidence));
  assert.ok(workforceRevises.currentReadEvidence.supportingEvidence.length >= 1);
  assert.ok(Array.isArray(workforceRevises.currentReadEvidence.sourceProvenance));
  assert.ok(workforceRevises.currentReadEvidence.sourceProvenance.includes("workforce_output"));
  assert.match(
    workforceRevises.currentReadEvidence.whatWouldChangeMyMind || "",
    /money|readiness|dates|responsibility/i
  );

  const whyReply = buildWhyDoYouThinkThatReply(subject, workforceRevises);
  assert.match(whyReply, /strongest evidence/i);
  assert.match(whyReply, /confidence is/i);

  const overturnReply = buildWhatWouldChangeMindReply(subject, workforceRevises);
  assert.match(overturnReply, /change your mind|What keeps this open|money|responsibility/i);

  const repeatedPattern = recomputeCurrentRead(subject, retirementConversation({
    currentRead: "I think Retirement is still behaving like a financial and timing decision more than a redesign question.",
    currentHypothesis: "Retirement is really about redesigning what work is allowed to carry.",
    signalProvenance: [
      {
        source: "working_theory",
        signalType: "theory",
        statement: "Retirement is really about redesigning what work is allowed to carry.",
        normalizedTheme: "responsibility_redesign",
        score: 7.1,
        confidence: 0.8,
        timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        snapshotAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        wonArbitration: true,
        opposedArbitration: false,
        changedRead: true,
      },
      {
        source: "workforce_output",
        signalType: "workforce",
        statement: "Freedom and still wanting to build keeps pushing this toward responsibility redesign.",
        normalizedTheme: "responsibility_redesign",
        score: 7.8,
        confidence: 0.88,
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        snapshotAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        wonArbitration: true,
        opposedArbitration: false,
        changedRead: false,
      },
    ],
    driftMemory: {
      currentCenterOfGravity: "financial_timing",
      lastCenterOfGravity: null,
      driftDirection: null,
    },
  }));
  assert.ok(repeatedPattern.currentReadLabels.includes("repeated evidence"));
  assert.ok(["building", "durable"].includes(repeatedPattern.driftMemory.durability));

  const oneTimeSignal = recomputeCurrentRead(subject, retirementConversation({
    signalProvenance: [],
    driftMemory: {
      currentCenterOfGravity: null,
      lastCenterOfGravity: null,
      driftDirection: null,
    },
  }));
  assert.ok(oneTimeSignal.currentReadLabels.includes("new evidence"));
  assert.ok(oneTimeSignal.currentReadLabels.includes("fragile read"));

  const volatileRead = recomputeCurrentRead(subject, retirementConversation({
    currentRead: "I think Retirement is still behaving like a financial and timing decision more than a redesign question.",
    signalProvenance: [
      {
        source: "working_theory",
        signalType: "theory",
        statement: "Retirement is mostly a money and date question.",
        normalizedTheme: "financial_timing",
        score: 7.2,
        confidence: 0.82,
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        snapshotAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        wonArbitration: true,
        opposedArbitration: false,
        changedRead: false,
      },
      {
        source: "workforce_output",
        signalType: "workforce",
        statement: "The pattern is shifting toward responsibility redesign.",
        normalizedTheme: "responsibility_redesign",
        score: 7.8,
        confidence: 0.88,
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        snapshotAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        wonArbitration: true,
        opposedArbitration: false,
        changedRead: true,
      },
      {
        source: "recent_conversation",
        signalType: "conversation",
        statement: "Maybe this is still mostly about the money.",
        normalizedTheme: "financial_timing",
        score: 6.7,
        confidence: 0.6,
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        snapshotAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        wonArbitration: false,
        opposedArbitration: true,
        changedRead: false,
      },
    ],
    driftMemory: {
      currentCenterOfGravity: "financial_timing",
      lastCenterOfGravity: null,
      driftDirection: null,
    },
    pendingReveal: {
      type: "contradiction",
      observed: "You still want to build, but you want less burden.",
    },
  }));
  assert.ok(["medium", "high"].includes(volatileRead.driftMemory.volatility));

  const shiftedCenter = recomputeCurrentRead(subject, retirementConversation({
    currentRead: "I think Retirement is still behaving like a financial and timing decision more than a redesign question.",
    currentHypothesis: "Retirement is really about redesigning what work is allowed to carry.",
    signalProvenance: [
      {
        source: "working_theory",
        signalType: "theory",
        statement: "Retirement is mostly a money and date question.",
        normalizedTheme: "financial_timing",
        score: 7.1,
        confidence: 0.82,
        timestamp: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
        snapshotAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
        wonArbitration: true,
        opposedArbitration: false,
        changedRead: false,
      },
      {
        source: "workforce_output",
        signalType: "workforce",
        statement: "This now looks more like responsibility redesign.",
        normalizedTheme: "responsibility_redesign",
        score: 7.9,
        confidence: 0.88,
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        snapshotAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        wonArbitration: true,
        opposedArbitration: false,
        changedRead: true,
      },
      {
        source: "recent_conversation",
        signalType: "conversation",
        statement: "Freedom and still wanting to build keeps showing up.",
        normalizedTheme: "responsibility_redesign",
        score: 7.4,
        confidence: 0.76,
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        snapshotAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        wonArbitration: true,
        opposedArbitration: false,
        changedRead: false,
      },
    ],
    driftMemory: {
      currentCenterOfGravity: "financial_timing",
      lastCenterOfGravity: null,
      driftDirection: null,
    },
  }));
  assert.equal(shiftedCenter.driftMemory.currentCenterOfGravity, "responsibility_redesign");
  assert.equal(shiftedCenter.driftMemory.lastCenterOfGravity, "financial_timing");
  assert.equal(shiftedCenter.driftMemory.centerShifted, true);

  const isThisNewReply = buildIsThisNewReply(subject, shiftedCenter);
  assert.match(isThisNewReply, /not new|pattern has been moving this direction/i);

  const hasThisBeenChangingReply = buildDriftReply(subject, shiftedCenter);
  assert.match(hasThisBeenChangingReply, /center of gravity|not a single update/i);

  const howLongReply = buildHowLongReply(subject, shiftedCenter);
  assert.match(howLongReply, /about|seeing/i);

  console.log("current-read-engine: ok");
}

run();
