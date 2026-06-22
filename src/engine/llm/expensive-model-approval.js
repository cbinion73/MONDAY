"use strict";

const { CLOUD_MODELS } = require("./model-router");

const EXPENSIVE_TIERS = new Set(["strategic", "executive"]);

const APPROVE_PATTERNS = [
  /^(yes|yep|yeah|y|ok|okay|sure|do it|go ahead|proceed|approve|use it|use strategic|use executive)\b/i,
];

const DECLINE_PATTERNS = [
  /^(no|nope|nah|stop|cancel|skip|not now|don't|do not|stay standard|use standard|cheaper option)\b/i,
];

function isExpensiveTier(tier) {
  return EXPENSIVE_TIERS.has(tier);
}

function classifyApprovalInput(input) {
  const text = String(input || "").trim();
  if (!text) return "other";
  if (APPROVE_PATTERNS.some((pattern) => pattern.test(text))) return "approve";
  if (DECLINE_PATTERNS.some((pattern) => pattern.test(text))) return "decline";
  return "other";
}

function buildApprovalRequest(decision, input) {
  const tier = decision?.tier || "strategic";
  const model = decision?.model || CLOUD_MODELS[tier] || "high-cost model";
  const tierLabel = tier === "executive" ? "executive" : "strategic";
  const preview = String(input || "").trim().replace(/\s+/g, " ").slice(0, 160);

  return {
    tier,
    model,
    prompt: preview,
    createdAt: new Date().toISOString(),
    warning: `This would use Monday's ${tierLabel} model (${model}), and it has a very high cost. Reply \"yes\" to approve this pass, or say \"no\" and I'll stay on the standard models.`,
  };
}

function buildDeclineMessage() {
  return "Understood. I'll stay on the standard models unless you explicitly approve a high-cost pass.";
}

module.exports = {
  buildApprovalRequest,
  buildDeclineMessage,
  classifyApprovalInput,
  isExpensiveTier,
};
