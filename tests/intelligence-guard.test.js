const assert = require("node:assert/strict");
const { resolveMondayEngine } = require("../src/engine");
const { inferTruth } = require("../src/engine/runtime/infer-truth");
const { translateMondayVoice } = require("../src/engine/voice/voice-translator");
const {
  shouldAcceptRefinement,
} = require("../src/engine/intelligence/monday-intelligence");

function main() {
  const state = resolveMondayEngine("I want to lose weight.", {});
  const truth = inferTruth(state, "I want to lose weight.");
  const voice = translateMondayVoice({
    engineState: state,
    truth,
  });

  const genericHealthReply = {
    reply:
      "Health is a key area for you right now. Let's focus on making small, sustainable changes that can lead to weight loss.",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: state,
        voice,
      },
      parsed: genericHealthReply,
    }),
    false
  );

  const strongerReply = {
    reply:
      "Health is asking for attention here. You don't need a perfect overhaul first. What feels like the first sustainable change you could actually carry this week?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: state,
        voice,
      },
      parsed: strongerReply,
    }),
    true
  );

  const companionState = resolveMondayEngine("I think I am hiding in work.", {});
  const companionTruth = inferTruth(companionState, "I think I am hiding in work.");
  const companionVoice = translateMondayVoice({
    engineState: companionState,
    truth: companionTruth,
  });

  const flatteningSecondTurnReply = {
    reply:
      "Can you share more about why you think work feels useful and in control right now?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: companionState,
        voice: companionVoice,
      },
      input: "It makes me feel useful and in control.",
      history: [
        {
          user: "I think I am hiding in work.",
          monday: companionVoice.text,
        },
      ],
      parsed: flatteningSecondTurnReply,
    }),
    false
  );

  const therapistBuildingReply = {
    reply: "Can you tell me more about building?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: companionState,
        voice: companionVoice,
      },
      input: "I still want to build things.",
      history: [
        {
          user: "I think I am hiding in work.",
          monday: companionVoice.text,
        },
      ],
      parsed: therapistBuildingReply,
    }),
    false
  );

  const interpretiveBuildingReply = {
    reply:
      "It sounds like you may be trying to loosen your grip on a role, not on creating itself. Does that feel true to you?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: companionState,
        voice: companionVoice,
      },
      input: "I still want to build things.",
      history: [
        {
          user: "I think I am hiding in work.",
          monday: companionVoice.text,
        },
      ],
      parsed: interpretiveBuildingReply,
    }),
    true
  );

  const reflectiveSecondTurnReply = {
    reply:
      "Work seems to be carrying more weight than usual here. If it gives you a sense of usefulness and control, I think that may be part of why it is hard to loosen your grip on it.",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: companionState,
        voice: companionVoice,
      },
      input: "It makes me feel useful and in control.",
      history: [
        {
          user: "I think I am hiding in work.",
          monday: companionVoice.text,
        },
      ],
      parsed: reflectiveSecondTurnReply,
    }),
    true
  );

  const overHedgedWorkReply = {
    reply:
      "I wonder if work may be doing more than one job for you. Perhaps it might be giving you control, and maybe it could be helping you avoid something harder too. Could it be that work is quietly protecting you from other questions?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: companionState,
        voice: companionVoice,
      },
      input: "It makes me feel useful and in control.",
      history: [
        {
          user: "I think I am hiding in work.",
          monday: companionVoice.text,
        },
      ],
      parsed: overHedgedWorkReply,
    }),
    false
  );

  const retirementState = resolveMondayEngine("I think I want to retire.", {});
  const retirementTruth = inferTruth(retirementState, "I think I want to retire.");
  const retirementVoice = translateMondayVoice({
    engineState: retirementState,
    truth: retirementTruth,
  });

  const genericRetirementReply = {
    reply:
      "Retirement sounds like it may be more than just a timing decision. What deeper feelings or changes are you noticing right now about your life and future?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: retirementState,
        voice: retirementVoice,
      },
      parsed: genericRetirementReply,
    }),
    false
  );

  const polishedButThinRetirementReply = {
    reply:
      "Retirement usually starts as a money or timing question. What feels most significant about it right now?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: retirementState,
        voice: retirementVoice,
      },
      parsed: polishedButThinRetirementReply,
    }),
    false
  );

  const oldAnchoredRetirementReply = {
    reply:
      "Retirement sounds like it may be carrying more than a timing decision. Usually when it starts surfacing like this, something deeper is asking for a different shape of life. What feels most significant about retirement right now?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: retirementState,
        voice: retirementVoice,
      },
      parsed: oldAnchoredRetirementReply,
    }),
    false
  );

  const thinkingPartnerOpeningRetirementReply = {
    reply:
      "Most retirement conversations start with money or timing. Yours is already pointing at identity, freedom, and what work has been carrying for you. My guess is the real question is not when you stop working, but what you want work to stop holding. Am I close?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: retirementState,
        voice: retirementVoice,
      },
      parsed: thinkingPartnerOpeningRetirementReply,
    }),
    true
  );

  const progressiveRetirementFollowUp = {
    reply:
      "It seems like retirement is shifting away from being primarily about financial security. What other aspects of your life or identity might be influencing this decision now?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: retirementState,
        voice: retirementVoice,
      },
      input: "It's not really about money anymore.",
      history: [
        {
          user: "I think I want to retire.",
          monday: retirementVoice.text,
        },
      ],
      parsed: progressiveRetirementFollowUp,
    }),
    false
  );

  const theoryUpdatingRetirementFollowUp = {
    reply:
      "That changes the theory. If money is moving out of the center, then retirement is probably becoming a question about identity, freedom, and what work has been carrying for you. I would separate the financial answer from the life-design answer before treating this as one decision.",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: retirementState,
        voice: retirementVoice,
      },
      input: "It's not really about money anymore.",
      history: [
        {
          user: "I think I want to retire.",
          monday: retirementVoice.text,
        },
      ],
      parsed: theoryUpdatingRetirementFollowUp,
    }),
    true
  );

  const passiveRetirementReply = {
    reply:
      "Can you share more about retirement and what building still means to you?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: retirementState,
        voice: retirementVoice,
      },
      input: "I still want to build things.",
      history: [
        {
          user: "I don't know who I am without work.",
          monday:
            "It sounds like retirement may be becoming less about timing and more about identity. What feels hardest to imagine without work at the center?",
        },
      ],
      parsed: passiveRetirementReply,
    }),
    false
  );

  const thinkingPartnerRetirementReply = {
    reply:
      "You keep returning to retirement, identity, and building together. My guess is you may be trying to retire from a role without giving up creation itself. Does that feel true to you?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: retirementState,
        voice: retirementVoice,
      },
      input: "I still want to build things.",
      history: [
        {
          user: "I don't know who I am without work.",
          monday:
            "It sounds like retirement may be becoming less about timing and more about identity. What feels hardest to imagine without work at the center?",
        },
      ],
      parsed: thinkingPartnerRetirementReply,
    }),
    true
  );

  const reflectionOnlyRetirementReply = {
    reply:
      "You still want to build things, and work gives you a place to hide. What feels most important about that right now?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: retirementState,
        voice: retirementVoice,
      },
      input: "Work gives me a place to hide.",
      history: [
        {
          user: "I still want to build things.",
          monday:
            "You keep returning to retirement, identity, and building together. My guess is you may be trying to retire from a role without giving up creation itself. Does that feel true to you?",
        },
      ],
      parsed: reflectionOnlyRetirementReply,
    }),
    false
  );

  const interpretiveButNonDirectiveReply = {
    reply:
      "My guess is you may not actually want retirement as much as freedom from the parts of work that no longer fit, while keeping the parts that still give you purpose. Am I close?",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: retirementState,
        voice: retirementVoice,
      },
      input: "Work gives me a place to hide.",
      history: [
        {
          user: "I think I want to retire.",
          monday: retirementVoice.text,
        },
        {
          user: "It's not really about money anymore.",
          monday:
            "It seems retirement is shifting away from being primarily about financial security. What other aspects of your life do you think might be influencing this decision?",
        },
        {
          user: "I don't know who I am without work.",
          monday:
            "It sounds like retirement may be becoming less about timing and more about identity. What feels hardest to imagine without work at the center?",
        },
        {
          user: "I still want to build things.",
          monday:
            "You keep returning to retirement, identity, and building together. My guess is you may be trying to retire from a role without giving up creation itself. Does that feel true to you?",
        },
      ],
      parsed: interpretiveButNonDirectiveReply,
    }),
    false
  );

  const chiefOfStaffRetirementReply = {
    reply:
      "My guess is you may not actually want retirement as much as freedom from the parts of work that no longer fit, while keeping the parts that still give you purpose. The real question is what work has been carrying that you no longer want it to hold. I would separate the responsibilities you want to lay down from the creating you still want to keep before making any retirement decision.",
  };

  assert.equal(
    shouldAcceptRefinement({
      result: {
        finalState: retirementState,
        voice: retirementVoice,
      },
      input: "Work gives me a place to hide.",
      history: [
        {
          user: "I think I want to retire.",
          monday: retirementVoice.text,
        },
        {
          user: "It's not really about money anymore.",
          monday:
            "It seems retirement is shifting away from being primarily about financial security. What other aspects of your life do you think might be influencing this decision?",
        },
        {
          user: "I don't know who I am without work.",
          monday:
            "It sounds like retirement may be becoming less about timing and more about identity. What feels hardest to imagine without work at the center?",
        },
        {
          user: "I still want to build things.",
          monday:
            "You keep returning to retirement, identity, and building together. My guess is you may be trying to retire from a role without giving up creation itself. Does that feel true to you?",
        },
      ],
      parsed: chiefOfStaffRetirementReply,
    }),
    true
  );

  console.log("Monday intelligence guard tests passed.");
}

main();
