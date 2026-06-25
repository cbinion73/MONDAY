"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "monday-conversation-test-"));
process.env.MONDAY_STATE_DIR = tempRoot;

const sessions = require("../src/engine/gateway/sessions");
const { getPendingItems, markSurfaced } = require("../src/engine/db/surfacing-store");
const {
  hydrateConversationState,
  advanceConversationState,
  syncConversationAfterTurn,
} = require("../src/engine/conversation/conversation-engine");

function run() {
  const channel = "presence-web";
  const senderId = `living-${Date.now()}`;

  sessions.clearSession(channel, senderId);
  for (const item of getPendingItems()) markSurfaced(item.id);

  const initial = hydrateConversationState({ channel, senderId });
  assert.equal(initial.home.name, "Current Conversation");
  assert.ok(initial.conversation.subjectId);
  assert.ok(initial.stage.body);
  assert.ok(["arrival", "interruption", "resume"].includes(initial.stage.mode));

  const selected = advanceConversationState({
    channel,
    senderId,
    action: "select_subject",
    subjectId: "retirement",
  });
  assert.equal(selected.stage.subjectId, "retirement");
  assert.equal(selected.conversation.status, "Thinking");
  assert.match(
    selected.conversation.read || "",
    /financial and timing decision|redesign question|redesigning what work is allowed to carry/i
  );
  assert.equal(selected.conversation.readStale, true);

  const revealed = advanceConversationState({
    channel,
    senderId,
    action: "continue",
    subjectId: "retirement",
  });
  assert.equal(revealed.stage.phase, "reveal");
  assert.equal(revealed.stage.prop.visible, true);

  syncConversationAfterTurn({
    channel,
    senderId,
    currentSubjectId: "retirement",
    domain: "Retirement",
    userInput: "What changed?",
    reply: "Before, I was reading Retirement more like a timing question. Now it looks more like a responsibility redesign.",
    workingTheory: "Retirement appears to be less about stopping and more about protecting the part of Chris that still wants to build.",
    conversationTurn: {
      intent: "what_changed",
      update: {
        status: "Revising",
        currentHypothesis: "Retirement appears to be less about stopping and more about protecting the part of Chris that still wants to build.",
        previousHypothesis: "Retirement looked more like a timing question.",
        pendingReveal: {
          type: "theory",
          title: "Retirement Theory",
          signal: "Updated read",
          body: "Retirement appears to be less about stopping and more about protecting the part of Chris that still wants to build.",
        },
        lastMondayConclusion: "Before, I was reading Retirement more like a timing question. Now it looks more like a responsibility redesign.",
      },
    },
  });

  const resumed = hydrateConversationState({
    channel,
    senderId,
    requestedSubjectId: "retirement",
  });
  assert.equal(resumed.stage.mode, "resume");
  assert.equal(resumed.conversation.status, "Revising");
  assert.match(resumed.stage.title, /updated my read/i);
  assert.match(resumed.conversation.hypothesis, /less about stopping/i);
  assert.match(
    resumed.conversation.read || "",
    /financial and timing decision|responsibility redesign|what work should keep carrying|redesigning what work is allowed to carry/i
  );
  assert.equal(resumed.conversation.openQuestion, null);
  assert.equal(resumed.stage.prop.visible, true);
  assert.equal(resumed.stage.prop.payload?.type, "theory");
  assert.match(resumed.stage.prop.payload?.body || "", /less about stopping/i);

  console.log("conversation-engine: ok");
}

run();
