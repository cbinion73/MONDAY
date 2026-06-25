"use strict";

const assert = require("node:assert/strict");

const {
  resolveFollowUpIntent,
  buildFollowUpReply,
} = require("../src/engine/conversation/follow-up-resolver");
const {
  containsTherapyPhrase,
} = require("../src/engine/conversation/follow-up-composers");

function run() {
  assert.equal(resolveFollowUpIntent("What changed?"), "what_changed");
  assert.equal(resolveFollowUpIntent("What changed your mind?"), "what_changed_your_mind");
  assert.equal(resolveFollowUpIntent("Why do you think that?"), "why_do_you_think_that");
  assert.equal(resolveFollowUpIntent("What would change your mind?"), "what_would_change_your_mind");
  assert.equal(resolveFollowUpIntent("Is this new?"), "is_this_new");
  assert.equal(resolveFollowUpIntent("Why are you bringing this up?"), "why_are_you_bringing_this_up");
  assert.equal(resolveFollowUpIntent("Is this urgent?"), "is_this_urgent");
  assert.equal(resolveFollowUpIntent("Has this been changing?"), "has_this_been_changing");
  assert.equal(resolveFollowUpIntent("How long have you been seeing this?"), "how_long_have_you_been_seeing_this");
  assert.equal(resolveFollowUpIntent("Why does that matter?"), "why_it_matters");
  assert.equal(resolveFollowUpIntent("What should I do next?"), "next_move");
  assert.equal(resolveFollowUpIntent("Are you sure?"), "are_you_sure");
  assert.equal(resolveFollowUpIntent("Pause this"), "pause");

  const fixtures = [
    {
      label: "retirement",
      subject: {
        id: "retirement",
        name: "Retirement",
        summary: "Identity, freedom, and what life should feel like after work stops being the center.",
      },
      conversation: {
        currentThought:
          "Retirement is behaving less like an exit plan and more like a responsibility redesign.",
        currentConversationSummary:
          "Retirement appears to be less about stopping and more about protecting the part of Chris that still wants to build.",
        currentHypothesis:
          "Retirement is really about redesigning what work is allowed to carry.",
        previousHypothesis:
          "Retirement looked more like a timing and money question.",
        currentRecommendation:
          "I would separate the responsibilities you want to lay down from the work you still want to keep.",
        whatChangedMyMind:
          "The strongest signal was the repeated tension between wanting freedom and still wanting to build.",
        whatIAmStillChecking:
          "I am not dismissing the financial side. I just do not think it is the center anymore.",
        currentReadEvidence: {
          supportingEvidence: [
            {
              source: "recent_conversation",
              statement: "Freedom and still wanting to build keeps surfacing together.",
            },
            {
              source: "workforce_output",
              statement: "The newer pattern keeps pulling toward freedom, identity, and responsibility instead of toward dates or numbers.",
            },
          ],
          opposingEvidence: [
            {
              source: "working_theory",
              statement: "The financial side is still unresolved.",
            },
          ],
          confidence: 0.68,
          evidenceFreshness: { label: "fresh" },
          sourceProvenance: ["recent_conversation", "workforce_output", "working_theory"],
          whatWouldChangeMyMind:
            "Evidence that retirement conversations consistently return to money, readiness, and dates rather than responsibility or what work is carrying.",
        },
        currentReadLabels: ["repeated evidence", "center shifted"],
        driftMemory: {
          currentCenterOfGravity: "responsibility_redesign",
          lastCenterOfGravity: "financial_timing",
          driftDirection: "financial_timing -> responsibility_redesign",
          durability: "durable",
          volatility: "medium",
          currentCenterFirstSeenAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          centerShifted: true,
        },
        currentReadConfidence: 0.68,
        latestWorkforceSignal: {
          source: "synthesis",
          payload:
            "The newer pattern kept pulling toward freedom, identity, and responsibility instead of toward dates or numbers.",
        },
      },
      expected: {
        changed: [/Earlier, I was treating Retirement/i, /What changed is/i, /My read now is/i],
        matters: [/The contradiction is/i, /If we call this retirement/i],
        nextMove: [/I would separate the responsibilities/i, /Next action:/i, /Do not set a retirement date yet/i],
      },
    },
    {
      label: "family",
      subject: {
        id: "family",
        name: "Family",
        summary: "Presence, attention, and whether the people who matter most are getting more than logistics.",
      },
      conversation: {
        currentThought:
          "Family is asking for protected attention, not just cleaner logistics.",
        currentConversationSummary:
          "The issue is not indifference. It is importance and attention drifting apart.",
        currentHypothesis:
          "Family is really an attention and presence problem before it becomes a larger relationship problem.",
        previousHypothesis:
          "Family looked more like a scheduling problem.",
        currentRecommendation:
          "I would protect one block of undivided attention for the relationship that feels thinnest right now.",
        currentReadLabels: ["repeated evidence"],
        driftMemory: {
          currentCenterOfGravity: "presence",
          lastCenterOfGravity: "logistics",
          driftDirection: "logistics -> presence",
          durability: "building",
          volatility: "low",
          currentCenterFirstSeenAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          centerShifted: true,
        },
        latestWorkforceSignal: {
          source: "family-office",
          payload:
            "The newer pattern keeps pointing to attention and presence rather than scheduling mechanics.",
        },
      },
      expected: {
        changed: [/Earlier, I was reading Family/i, /What changed is/i, /My read now is/i],
        matters: [/logistics keep impersonating presence/i],
        nextMove: [/protect one block of undivided attention/i, /Do not turn it into a family optimization project/i],
      },
    },
    {
      label: "faith",
      subject: {
        id: "faith",
        name: "Faith",
        summary: "Stillness, prayer, and what becomes expensive to meet in quiet.",
      },
      conversation: {
        currentThought:
          "Faith is behaving less like a discipline failure and more like a stillness problem.",
        currentConversationSummary:
          "Quiet has become expensive, which is changing the way prayer feels.",
        currentHypothesis:
          "Faith may be catching whatever has become expensive to meet in quiet.",
        previousHypothesis:
          "Faith looked more like a discipline problem.",
        currentRecommendation:
          "I would create one short, honest block of quiet without trying to solve the whole season.",
        currentReadLabels: ["repeated evidence"],
        driftMemory: {
          currentCenterOfGravity: "silence",
          lastCenterOfGravity: "practice",
          driftDirection: "practice -> silence",
          durability: "building",
          volatility: "medium",
          currentCenterFirstSeenAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          centerShifted: true,
        },
        latestWorkforceSignal: {
          source: "faith",
          payload:
            "The newer pattern keeps pointing to stillness, avoidance, and what prayer would expose if it slowed down enough.",
        },
      },
      expected: {
        changed: [/Earlier, I was reading Faith/i, /What changed is/i, /presence problem before it becomes a practice problem/i],
        matters: [/If you ignore it, you may keep blaming practice/i],
        nextMove: [/one short, honest block of quiet/i, /Do not turn this into a guilt exercise/i],
      },
    },
    {
      label: "publishing",
      subject: {
        id: "publishing",
        name: "Publishing",
        summary: "Writing, significance, and whether the work can be approached honestly again.",
      },
      conversation: {
        currentThought:
          "Publishing is carrying meaning pressure, not just output pressure.",
        currentConversationSummary:
          "The thread is exposing identity pressure more than simple inconsistency.",
        currentHypothesis:
          "Publishing is tangled up with identity and what the work is allowed to mean.",
        previousHypothesis:
          "Publishing looked more like an output problem.",
        currentRecommendation:
          "I would reset the frame before trying to increase output.",
        currentReadLabels: ["repeated evidence"],
        driftMemory: {
          currentCenterOfGravity: "significance",
          lastCenterOfGravity: "output",
          driftDirection: "output -> significance",
          durability: "durable",
          volatility: "low",
          currentCenterFirstSeenAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
          centerShifted: true,
        },
        latestWorkforceSignal: {
          source: "publishing",
          payload:
            "The newer pattern keeps pointing to significance pressure and fear of what the work might reveal.",
        },
      },
      expected: {
        changed: [/Earlier, I was reading Publishing/i, /What changed is/i, /clarity the first need, not acceleration/i],
        matters: [/unfinished work keeps turning into identity pressure/i],
        nextMove: [/reset the frame before trying to increase output/i, /Do not start with a production target/i],
      },
    },
  ];

  for (const fixture of fixtures) {
    const changed = buildFollowUpReply({
      intent: "what_changed",
      subject: fixture.subject,
      conversation: fixture.conversation,
    });
    fixture.expected.changed.forEach((pattern) => assert.match(changed.reply, pattern, `${fixture.label} changed`));
    assert.equal(changed.update.status, "Revising");
    assert.ok(changed.update.pendingReveal, `${fixture.label} changed prop`);
    assert.equal(containsTherapyPhrase(changed.reply), false, `${fixture.label} changed no therapy`);

    const matters = buildFollowUpReply({
      intent: "why_it_matters",
      subject: fixture.subject,
      conversation: fixture.conversation,
    });
    fixture.expected.matters.forEach((pattern) => assert.match(matters.reply, pattern, `${fixture.label} matters`));
    assert.equal(matters.update.status, "Discussing");
    assert.ok(matters.update.pendingReveal, `${fixture.label} matters prop`);
    assert.equal(containsTherapyPhrase(matters.reply), false, `${fixture.label} matters no therapy`);

    const nextMove = buildFollowUpReply({
      intent: "next_move",
      subject: fixture.subject,
      conversation: fixture.conversation,
    });
    fixture.expected.nextMove.forEach((pattern) => assert.match(nextMove.reply, pattern, `${fixture.label} next move`));
    assert.equal(nextMove.update.status, "Discussing");
    assert.ok(nextMove.update.pendingReveal, `${fixture.label} next move prop`);
    assert.equal(containsTherapyPhrase(nextMove.reply), false, `${fixture.label} next move no therapy`);
  }

  const changedMind = buildFollowUpReply({
    intent: "what_changed_your_mind",
    subject: fixtures[0].subject,
    conversation: fixtures[0].conversation,
  });
  assert.match(changedMind.reply, /strongest signal/i);
  assert.match(changedMind.reply, /financial side/i);

  const whyThink = buildFollowUpReply({
    intent: "why_do_you_think_that",
    subject: fixtures[0].subject,
    conversation: fixtures[0].conversation,
  });
  assert.match(whyThink.reply, /strongest evidence/i);
  assert.match(whyThink.reply, /confidence is/i);

  const whatWouldChangeMind = buildFollowUpReply({
    intent: "what_would_change_your_mind",
    subject: fixtures[0].subject,
    conversation: fixtures[0].conversation,
  });
  assert.match(whatWouldChangeMind.reply, /money|readiness|dates|What keeps this open/i);

  const confidence = buildFollowUpReply({
    intent: "are_you_sure",
    subject: fixtures[0].subject,
    conversation: fixtures[0].conversation,
  });
  assert.match(confidence.reply, /Reasonably sure|Fairly sure/i);
  assert.match(confidence.reply, /financial side/i);

  const isNew = buildFollowUpReply({
    intent: "is_this_new",
    subject: fixtures[0].subject,
    conversation: fixtures[0].conversation,
  });
  assert.match(isNew.reply, /not new|pattern has been moving/i);

  const changing = buildFollowUpReply({
    intent: "has_this_been_changing",
    subject: fixtures[0].subject,
    conversation: fixtures[0].conversation,
  });
  assert.match(changing.reply, /center of gravity|not a single update|been winning/i);

  const duration = buildFollowUpReply({
    intent: "how_long_have_you_been_seeing_this",
    subject: fixtures[0].subject,
    conversation: fixtures[0].conversation,
  });
  assert.match(duration.reply, /about|seeing/i);

  const whyBring = buildFollowUpReply({
    intent: "why_are_you_bringing_this_up",
    subject: fixtures[0].subject,
    conversation: fixtures[0].conversation,
    stageMode: "arrival",
  });
  assert.match(whyBring.reply, /center of gravity has moved|repeated Retirement signals/i);

  const urgency = buildFollowUpReply({
    intent: "is_this_urgent",
    subject: fixtures[0].subject,
    conversation: fixtures[0].conversation,
    stageMode: "arrival",
  });
  assert.match(urgency.reply, /Important, but not urgent|Worth watching|Urgent|Not ready yet/i);

  console.log("conversation-followup: ok");
}

run();
