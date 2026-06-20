const assert = require("node:assert/strict");
const { resolveMondayEngine } = require("../src/engine");
const {
  translateMondayVoice,
  resolveVoiceMode,
} = require("../src/engine/voice/voice-translator");
const summerCampFixtures = require("../src/engine/fixtures/summer-camp");
const woundedFixtures = require("../src/engine/fixtures/wounded-significance");
const summerCampTruth = require("../src/engine/voice/templates/summer-camp");
const woundedTruth = require("../src/engine/voice/templates/wounded-significance");
const { inferTruth } = require("../src/engine/runtime/infer-truth");

function assertNoDashboardSpeak(text) {
  assert.ok(!text.includes("Readiness score"), "must not emit dashboard score language");
  assert.ok(!text.includes("inactive for"), "must not emit project-manager inactivity language");
}

function main() {
  const summerReadinessState = resolveMondayEngine(
    summerCampFixtures.readiness.input,
    summerCampFixtures.readiness.context
  );
  const summerReadinessVoice = translateMondayVoice({
    engineState: summerReadinessState,
    truth: summerCampTruth.readiness,
  });
  assert.equal(resolveVoiceMode(summerReadinessState), "orientation");
  assert.equal(summerReadinessVoice.voiceMode, "orientation");
  assert.equal(
    summerReadinessVoice.text,
    "Summer Camp is in good shape. Transportation is the only thing I'd still worry about. If we close that, I'd consider the mission ready."
  );
  assertNoDashboardSpeak(summerReadinessVoice.text);

  const woundedState = resolveMondayEngine(
    woundedFixtures.shameRevealed.input,
    woundedFixtures.shameRevealed.context
  );
  const woundedVoice = translateMondayVoice({
    engineState: woundedState,
    truth: woundedTruth.shameRevealed,
  });
  assert.equal(resolveVoiceMode(woundedState), "curious-companion");
  assert.equal(
    woundedVoice.text,
    "Thank you for saying that. I don't think the problem is that you forgot. It sounds like the book still matters."
  );
  assertNoDashboardSpeak(woundedVoice.text);

  const advisorState = resolveMondayEngine(
    summerCampFixtures.trailerDecision.input,
    summerCampFixtures.trailerDecision.context
  );
  const advisorVoice = translateMondayVoice({
    engineState: advisorState,
    truth: summerCampTruth.trailerDecision,
  });
  assert.equal(resolveVoiceMode(advisorState), "direct-advisor");
  assert.equal(
    advisorVoice.text,
    "Yes. I think the trailer is worth it. It reduces transportation risk and gives you more flexibility. If the goal is to make Summer Camp steady instead of fragile, the trailer helps."
  );

  const operatorState = resolveMondayEngine(
    summerCampFixtures.commitment.input,
    summerCampFixtures.commitment.context
  );
  const operatorVoice = translateMondayVoice({
    engineState: operatorState,
    truth: summerCampTruth.commitment,
  });
  assert.equal(resolveVoiceMode(operatorState), "execution-operator");
  assert.equal(
    operatorVoice.text,
    "Understood. I'll treat transportation as the next execution thread. I'll keep it moving and bring back anything that matters."
  );

  const escalationState = resolveMondayEngine(
    woundedFixtures.humanCompanyBoundary.input,
    woundedFixtures.humanCompanyBoundary.context
  );
  const escalationVoice = translateMondayVoice({
    engineState: escalationState,
    truth: woundedTruth.humanCompanyBoundary,
  });
  assert.equal(resolveVoiceMode(escalationState), "humble-escalation");
  assert.equal(
    escalationVoice.text,
    "I think something important is here, and I don't think I'm enough for it. I can help you think it through, but I don't think I should be the only one holding it."
  );

  const healthGoalState = resolveMondayEngine("I want to lose weight.", {});
  const healthGoalVoice = translateMondayVoice({
    engineState: healthGoalState,
    truth: inferTruth(healthGoalState, "I want to lose weight."),
  });
  assert.equal(resolveVoiceMode(healthGoalState), "orientation");
  assert.equal(
    healthGoalVoice.text,
    "Health is asking for attention here. You don't need a perfect plan first. If we can identify the first sustainable change, that's enough to begin."
  );
  assert.notEqual(
    healthGoalVoice.text,
    "I've noticed something. I think it may matter, even if I'm not sure what it means yet."
  );

  const retirementState = resolveMondayEngine("I think I want to retire.", {});
  const retirementVoice = translateMondayVoice({
    engineState: retirementState,
    truth: inferTruth(retirementState, "I think I want to retire."),
  });
  assert.equal(resolveVoiceMode(retirementState), "curious-companion");
  assert.equal(
    retirementVoice.text,
    "Most retirement conversations start with money or timing. Yours is already pointing at identity, freedom, and what work has been carrying for you. My guess is the real question is not when you stop working, but what you want work to stop holding. Am I close?"
  );

  const publishingState = resolveMondayEngine("I should write another book.", {});
  const publishingVoice = translateMondayVoice({
    engineState: publishingState,
    truth: inferTruth(publishingState, "I should write another book."),
  });
  assert.equal(resolveVoiceMode(publishingState), "curious-companion");
  assert.equal(
    publishingVoice.text,
    "That sounds worth taking seriously. Writing questions are rarely just about output. What makes this book feel alive again right now?"
  );

  console.log("Monday voice translator tests passed.");
}

main();
