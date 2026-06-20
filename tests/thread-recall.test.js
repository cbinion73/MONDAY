const assert = require("node:assert/strict");
const path = require("node:path");

process.env.MONDAY_OLLAMA_ENABLED = "false";
process.env.MONDAY_PERSONAL_DATA_DIR = path.resolve(
  __dirname,
  "../data/test-thread-recall"
);

const {
  applyMondayIntelligence,
} = require("../src/engine/intelligence/monday-intelligence");

async function main() {
  const baseResult = {
    finalState: {
      significance: "general_significance",
      candidateDomain: "family",
    },
    voice: {
      text: "Help me understand what feels most important about it.",
      lines: ["Help me understand what feels most important about it."],
      voiceMode: "gentle-witness",
    },
    workspace: {
      workspaceMode: "reflection_support",
      supportIntent: "help_meaning_emerge",
    },
  };

  const familyRecall = await applyMondayIntelligence({
    result: baseResult,
    input: "What am I carrying in family right now?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "family",
          name: "Family",
          significanceThreads: ["family_time_tension"],
        },
        {
          id: "health",
          name: "Health",
          significanceThreads: ["weight_loss_goal"],
        },
      ],
      recentCaptures: [
        {
          missionId: "family",
          content: "Take Caleb fishing next month.",
        },
        {
          missionId: "family",
          content: "Take Caleb fishing next month.",
        },
        {
          missionId: "health",
          content: "I want to lose weight.",
        },
      ],
    },
  });

  assert.equal(familyRecall.voice.responseSource, "thread-recall");
  assert.ok(
    familyRecall.voice.text.includes("your family thread"),
    familyRecall.voice.text
  );
  assert.ok(
    familyRecall.voice.text.toLowerCase().includes("taking caleb fishing next month"),
    familyRecall.voice.text
  );
  assert.equal(familyRecall.finalState.significance, "family_time_tension");
  assert.equal(familyRecall.finalState.candidateDomain, "family");
  assert.equal(
    familyRecall.voice.text.match(/taking caleb fishing next month/gi)?.length,
    1,
    familyRecall.voice.text
  );

  const generalRecall = await applyMondayIntelligence({
    result: baseResult,
    input: "What am I carrying right now?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "family",
          name: "Family",
          significanceThreads: ["family_time_tension"],
        },
        {
          id: "health",
          name: "Health",
          significanceThreads: ["weight_loss_goal"],
        },
      ],
      recentCaptures: [
        {
          missionId: "family",
          content: "Take Caleb fishing next month.",
        },
        {
          missionId: "health",
          content: "I want to lose weight.",
        },
      ],
    },
  });

  assert.equal(generalRecall.voice.responseSource, "thread-recall");
  assert.ok(
    generalRecall.voice.text.toLowerCase().includes("family and health") ||
      generalRecall.voice.text.toLowerCase().includes("health and family"),
    generalRecall.voice.text
  );
  assert.ok(
    generalRecall.voice.text.toLowerCase().includes("wanting to lose weight") ||
      generalRecall.voice.text.toLowerCase().includes("taking caleb fishing next month"),
    generalRecall.voice.text
  );

  const workRecall = await applyMondayIntelligence({
    result: {
      ...baseResult,
      finalState: {
        significance: "general_significance",
        candidateDomain: "work",
      },
    },
    input: "What do I have going on in work right now?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "work",
          name: "Work",
          significanceThreads: ["work_tradeoff"],
        },
      ],
      recentCaptures: [
        {
          missionId: "work",
          content: "I think I am hiding in work.",
        },
      ],
    },
  });

  assert.equal(workRecall.voice.responseSource, "thread-recall");
  assert.ok(
    workRecall.voice.text.toLowerCase().includes("your work thread"),
    workRecall.voice.text
  );
  assert.ok(
    workRecall.voice.text.toLowerCase().includes("hiding in work"),
    workRecall.voice.text
  );

  const familyStillMatters = await applyMondayIntelligence({
    result: baseResult,
    input: "What still matters in family?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "family",
          name: "Family",
          significanceThreads: ["family_time_tension"],
        },
      ],
      recentCaptures: [
        {
          missionId: "family",
          content: "Take Caleb fishing next month.",
        },
      ],
    },
  });

  assert.equal(familyStillMatters.voice.responseSource, "thread-recall");
  assert.ok(
    familyStillMatters.voice.text.toLowerCase().includes("your family thread"),
    familyStillMatters.voice.text
  );

  const healthKeepInView = await applyMondayIntelligence({
    result: {
      ...baseResult,
      finalState: {
        significance: "general_significance",
        candidateDomain: "health",
      },
    },
    input: "What should I keep in view in health right now?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "health",
          name: "Health",
          significanceThreads: ["weight_loss_goal"],
        },
      ],
      recentCaptures: [
        {
          missionId: "health",
          content: "I want to lose weight.",
        },
      ],
    },
  });

  assert.equal(healthKeepInView.voice.responseSource, "thread-recall");
  assert.ok(
    healthKeepInView.voice.text.toLowerCase().includes("keep in view"),
    healthKeepInView.voice.text
  );
  assert.ok(
    healthKeepInView.voice.text.toLowerCase().includes("wanting to lose weight"),
    healthKeepInView.voice.text
  );
  assert.equal(healthKeepInView.finalState.significance, "weight_loss_goal");
  assert.equal(healthKeepInView.finalState.candidateDomain, "health");

  const familyNeedsAttention = await applyMondayIntelligence({
    result: baseResult,
    input: "What needs attention in family right now?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "family",
          name: "Family",
          significanceThreads: ["family_time_tension"],
        },
      ],
      recentCaptures: [
        {
          missionId: "family",
          content: "Take Caleb fishing next month.",
        },
      ],
    },
  });

  assert.equal(familyNeedsAttention.voice.responseSource, "thread-recall");
  assert.ok(
    familyNeedsAttention.voice.text.toLowerCase().includes("need attention"),
    familyNeedsAttention.voice.text
  );
  assert.ok(
    familyNeedsAttention.voice.text.toLowerCase().includes("taking caleb fishing next month"),
    familyNeedsAttention.voice.text
  );

  const faithNeedsProtection = await applyMondayIntelligence({
    result: {
      ...baseResult,
      finalState: {
        significance: "general_significance",
        candidateDomain: "faith",
      },
    },
    input: "What deserves protection in faith right now?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "faith",
          name: "Faith",
          significanceThreads: ["prayer_concern"],
        },
      ],
      recentCaptures: [
        {
          missionId: "faith",
          content: "I haven't prayed in weeks.",
        },
      ],
    },
  });

  assert.equal(faithNeedsProtection.voice.responseSource, "thread-recall");
  assert.ok(
    faithNeedsProtection.voice.text.toLowerCase().includes("deserves protection"),
    faithNeedsProtection.voice.text
  );
  assert.ok(
    faithNeedsProtection.voice.text.toLowerCase().includes("returning to prayer"),
    faithNeedsProtection.voice.text
  );
  assert.equal(faithNeedsProtection.finalState.significance, "prayer_concern");
  assert.equal(faithNeedsProtection.finalState.candidateDomain, "faith");

  const retirementKeepInView = await applyMondayIntelligence({
    result: {
      ...baseResult,
      finalState: {
        significance: "general_significance",
        candidateDomain: "retirement",
      },
    },
    input: "What should I keep in view in retirement right now?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "retirement",
          name: "Retirement",
          significanceThreads: ["future_life_transition"],
        },
      ],
      recentCaptures: [
        {
          missionId: "retirement",
          content: "I think I want to retire.",
        },
      ],
    },
  });

  assert.equal(retirementKeepInView.voice.responseSource, "thread-recall");
  assert.ok(
    retirementKeepInView.voice.text.toLowerCase().includes("keep in view"),
    retirementKeepInView.voice.text
  );
  assert.ok(
    retirementKeepInView.voice.text.toLowerCase().includes("retirement question"),
    retirementKeepInView.voice.text
  );
  assert.equal(
    retirementKeepInView.finalState.significance,
    "future_life_transition"
  );
  assert.equal(retirementKeepInView.finalState.candidateDomain, "retirement");

  const workChanged = await applyMondayIntelligence({
    result: {
      ...baseResult,
      finalState: {
        significance: "general_significance",
        candidateDomain: "work",
      },
    },
    input: "What changed in work?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "work",
          name: "Work",
          significanceThreads: ["work_tradeoff"],
        },
      ],
      recentCaptures: [
        {
          missionId: "work",
          content: "I think I am hiding in work.",
        },
      ],
    },
  });

  assert.equal(workChanged.voice.responseSource, "thread-recall");
  assert.ok(
    workChanged.voice.text.toLowerCase().includes("recent change"),
    workChanged.voice.text
  );
  assert.ok(
    workChanged.voice.text.toLowerCase().includes("hiding in work"),
    workChanged.voice.text
  );

  const publishingChanged = await applyMondayIntelligence({
    result: {
      ...baseResult,
      finalState: {
        significance: "general_significance",
        candidateDomain: "publishing",
      },
    },
    input: "What changed in publishing?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "publishing",
          name: "Publishing",
          significanceThreads: ["publishing_decision"],
        },
      ],
      recentCaptures: [
        {
          missionId: "publishing",
          content: "I should write another book.",
        },
      ],
    },
  });

  assert.equal(publishingChanged.voice.responseSource, "thread-recall");
  assert.ok(
    publishingChanged.voice.text.toLowerCase().includes("recent change"),
    publishingChanged.voice.text
  );
  assert.ok(
    publishingChanged.voice.text.toLowerCase().includes("writing question"),
    publishingChanged.voice.text
  );
  assert.equal(publishingChanged.finalState.significance, "publishing_decision");
  assert.equal(publishingChanged.finalState.candidateDomain, "publishing");

  const attentionToday = await applyMondayIntelligence({
    result: baseResult,
    input: "What needs attention right now?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "family",
          name: "Family",
          significanceThreads: ["family_time_tension"],
        },
      ],
      recentCaptures: [
        {
          missionId: "family",
          content: "Take Caleb fishing next month.",
          significance: "family_time_tension",
          createdAt: "2026-06-15T05:00:00.000Z",
        },
      ],
      calendar: {
        nextEvent: {
          title: "Scout planning",
          startAt: "2026-06-15T14:00:00.000Z",
        },
        upcomingEvents: [
          {
            title: "Scout planning",
            startAt: "2026-06-15T14:00:00.000Z",
          },
        ],
      },
      documents: {
        documents: [],
      },
      email: {
        threads: [],
      },
      finances: {
        accounts: [],
      },
    },
  });

  assert.equal(attentionToday.voice.responseSource, "daily-orientation");
  assert.ok(
    attentionToday.voice.text.toLowerCase().includes("needs attention"),
    attentionToday.voice.text
  );
  assert.ok(
    attentionToday.voice.text.toLowerCase().includes("scout planning") ||
      attentionToday.voice.text.toLowerCase().includes("taking caleb fishing next month"),
    attentionToday.voice.text
  );

  const protectionToday = await applyMondayIntelligence({
    result: baseResult,
    input: "What deserves protection today?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "family",
          name: "Family",
          significanceThreads: ["family_time_tension"],
        },
      ],
      recentCaptures: [
        {
          missionId: "family",
          content: "Take Caleb fishing next month.",
          significance: "family_time_tension",
          createdAt: "2026-06-15T05:00:00.000Z",
        },
      ],
      calendar: null,
      documents: { documents: [] },
      email: { threads: [] },
      finances: { accounts: [] },
    },
  });

  assert.equal(protectionToday.voice.responseSource, "daily-orientation");
  assert.ok(
    protectionToday.voice.text.toLowerCase().includes("deserves protection"),
    protectionToday.voice.text
  );
  assert.ok(
    protectionToday.voice.text.toLowerCase().includes("family") ||
      protectionToday.voice.text.toLowerCase().includes("taking caleb fishing next month"),
    protectionToday.voice.text
  );

  const changedToday = await applyMondayIntelligence({
    result: baseResult,
    input: "What changed today?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "publishing",
          name: "Publishing",
          significanceThreads: ["publishing_decision"],
        },
      ],
      recentCaptures: [
        {
          missionId: "publishing",
          content: "I should write another book.",
          significance: "publishing_decision",
          createdAt: "2026-06-15T05:00:00.000Z",
        },
      ],
      calendar: null,
      documents: {
        documents: [
          {
            title: "Book outline",
            missionId: "publishing",
            updatedAt: "2026-06-15T08:00:00.000Z",
          },
        ],
      },
      email: {
        threads: [],
      },
      finances: {
        accounts: [],
      },
    },
  });

  assert.equal(changedToday.voice.responseSource, "daily-orientation");
  assert.ok(
    changedToday.voice.text.toLowerCase().includes("clearest change"),
    changedToday.voice.text
  );
  assert.ok(
    changedToday.voice.text.toLowerCase().includes("book outline") ||
      changedToday.voice.text.toLowerCase().includes("write another book"),
    changedToday.voice.text
  );

  const stillMattersToday = await applyMondayIntelligence({
    result: baseResult,
    input: "What still matters right now?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [
        {
          id: "family",
          name: "Family",
          significanceThreads: ["family_time_tension"],
        },
      ],
      recentCaptures: [
        {
          missionId: "family",
          content: "Take Caleb fishing next month.",
          significance: "family_time_tension",
          createdAt: "2026-06-15T05:00:00.000Z",
        },
      ],
      calendar: {
        nextEvent: {
          title: "Scout planning",
          startAt: "2026-06-15T14:00:00.000Z",
        },
        upcomingEvents: [
          {
            title: "Scout planning",
            startAt: "2026-06-15T14:00:00.000Z",
          },
        ],
      },
      documents: { documents: [] },
      email: { threads: [] },
      finances: { accounts: [] },
    },
  });

  assert.equal(stillMattersToday.voice.responseSource, "daily-orientation");
  assert.ok(
    stillMattersToday.voice.text.toLowerCase().includes("what still matters right now is"),
    stillMattersToday.voice.text
  );
  assert.ok(
    stillMattersToday.voice.text.toLowerCase().includes("taking caleb fishing next month"),
    stillMattersToday.voice.text
  );
  assert.ok(
    stillMattersToday.voice.text.toLowerCase().includes("scout planning"),
    stillMattersToday.voice.text
  );

  const changedFromCalendar = await applyMondayIntelligence({
    result: baseResult,
    input: "What changed today?",
    history: [],
    personalContext: {
      captureIntent: false,
      missionThreads: [],
      recentCaptures: [],
      calendar: {
        nextEvent: {
          title: "Scout planning",
          startAt: "2026-06-15T14:00:00.000Z",
        },
        upcomingEvents: [
          {
            title: "Scout planning",
            startAt: "2026-06-15T14:00:00.000Z",
          },
        ],
      },
      documents: { documents: [] },
      email: { threads: [] },
      finances: { accounts: [] },
    },
  });

  assert.equal(changedFromCalendar.voice.responseSource, "daily-orientation");
  assert.ok(
    changedFromCalendar.voice.text.toLowerCase().includes("clearest change"),
    changedFromCalendar.voice.text
  );
  assert.ok(
    changedFromCalendar.voice.text.toLowerCase().includes("scout planning"),
    changedFromCalendar.voice.text
  );
  assert.equal(
    changedFromCalendar.voice.text.toLowerCase().includes("the clearest change right now is the"),
    false,
    changedFromCalendar.voice.text
  );

  console.log("Monday thread recall tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
