"use strict";
// Nano intent classifier — runs when the deterministic engine returns classificationFallback:true.
// Converts unclassified messages into typed intents so the router picks the right tier and posture.
//
// Over time, common intent patterns should be promoted into situation-classifier.js as deterministic
// rules, shrinking the set of messages that need this LLM call.

const { chatWithLLM } = require("./llm-router");

// Intent type → tier + conciseness posture.
// Tier drives model selection and token budget.
// Posture is passed through to the prompt builder as a hint.
const INTENT_TIERS = {
  logistical_update:    { tier: "utility",      posture: "acknowledge"  },
  check_in:             { tier: "utility",      posture: "presence"     },
  casual_chat:          { tier: "utility",      posture: "light"        },
  announcement:         { tier: "conversation", posture: "acknowledge"  },
  question:             { tier: "conversation", posture: "answer"       },
  task_request:         { tier: "conversation", posture: "execute"      },
  problem:              { tier: "conversation", posture: "diagnose"     },
  emotional_processing: { tier: "thinking",     posture: "companion"    },
  reflection:           { tier: "thinking",     posture: "depth"        },
};

const INTENT_TYPES = Object.keys(INTENT_TIERS);

const CLASSIFIER_SYSTEM = `You are an intent classifier for a personal AI assistant.
Classify the user message into exactly one of these intent types:

- logistical_update: user is announcing they're doing or going to do something routine (chores, errands, tasks)
- check_in: user is pinging for presence ("you there?", "hello", "hey")
- casual_chat: light, social, or off-topic message with no real task
- announcement: user is sharing news or a result they want acknowledged ("I finished the chapter", "I got the job")
- question: user is asking for information, advice, or a recommendation
- task_request: user wants the assistant to do something concrete ("draft an email", "make a list")
- problem: user is describing a stuck situation or challenge that needs diagnosis
- emotional_processing: user is expressing feelings, stress, or something weighing on them
- reflection: user is thinking out loud about meaning, identity, purpose, or direction

Return JSON only:
{"type":"<type>","confidence":<0.0-1.0>,"reason":"<one short phrase>"}`;

/**
 * Classify an unclassified message using nano.
 *
 * @param {string} input - raw user message
 * @returns {Promise<{ type: string, tier: string, posture: string, confidence: number, reason: string }>}
 */
async function classifyIntent(input) {
  try {
    const response = await chatWithLLM({
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM },
        { role: "user", content: input },
      ],
      tier: "utility",
      purpose: "intent-classification",
    });

    const parsed = response.json;
    const type = parsed?.type && INTENT_TIERS[parsed.type] ? parsed.type : "question";
    const { tier, posture } = INTENT_TIERS[type];

    return {
      type,
      tier,
      posture,
      confidence: parsed?.confidence ?? 0.5,
      reason: parsed?.reason || "nano classification",
    };
  } catch {
    // Fallback — treat unknown as a standard question on conversation tier
    return {
      type: "question",
      tier: "conversation",
      posture: "answer",
      confidence: 0,
      reason: "classification failed — defaulted to conversation",
    };
  }
}

module.exports = { classifyIntent, INTENT_TIERS, INTENT_TYPES };
