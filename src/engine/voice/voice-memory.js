"use strict";

// Voice Memory — classifies voice turns and auto-captures things worth keeping.
// Every voice interaction is more than a transcript. It's an idea, concern,
// question, reminder, or mission signal that needs a home in continuity.

const CLASSIFIERS = [
  { type: "idea",     pattern: /\b(idea|what if|imagine|could we|what about|i wonder|just thought)\b/i },
  { type: "reminder", pattern: /\b(remind me|remember|don't forget|note that|keep in mind|capture this|write this down)\b/i },
  { type: "concern",  pattern: /\b(worried|concern|problem|issue|struggling|not sure about|uncertain|bothering me)\b/i },
  { type: "question", pattern: /\b(why did|when did|what was|how did|who is|help me understand|remind me why|what happened)\b/i },
  { type: "mission",  pattern: /\b(i've decided|let's start|i want to build|new mission|let's work on|time to|we should)\b/i },
];

const CAPTURE_TYPES = new Set(["idea", "reminder", "concern", "mission"]);

function classifyVoiceTurn(input) {
  for (const { type, pattern } of CLASSIFIERS) {
    if (pattern.test(input)) return type;
  }
  return "voice";
}

function logVoiceTurn(input, finalState, truth) {
  const type = classifyVoiceTurn(input);
  const shouldCapture = CAPTURE_TYPES.has(type);

  if (shouldCapture) {
    try {
      const { recordCapture } = require("../personal/personal-store");
      recordCapture({
        input,
        finalState: finalState || {},
        truth: truth || {},
        context: { channel: "voice", voiceType: type },
      });
      console.log(`[voice-memory] ${type} captured: "${input.slice(0, 60)}"`);
    } catch (err) {
      console.warn("[voice-memory] capture error:", err.message);
    }
  }

  return { type, captured: shouldCapture };
}

module.exports = { classifyVoiceTurn, logVoiceTurn };
