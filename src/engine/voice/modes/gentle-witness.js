function renderGentleWitness({ truth }) {
  if (truth.humanCompanyBoundary) {
    return [
      "I think something important is here.",
      "My read is the real question is whether this needs more than thinking — it probably does.",
      "I can help you think clearly, but this belongs with a trusted human too.",
    ];
  }

  if (truth.creativeSpark) {
    return [
      "Good.",
      "I think most useful ideas arrive before they know what they are.",
      "My read is the best ones start as crazy before they learn manners.",
      "Give me the raw version.",
    ];
  }

  if (truth.agentDelegation) {
    return [
      "Understood. I'll bring back the best option.",
      "My read is you need a recommendation, not a comparison table.",
      "I think the real question is which one earns a clear yes.",
      "Human civilization has suffered enough from those.",
    ];
  }

  if (truth.fallbackQuestion) {
    return [
      "I'm not sure what kind of situation this is yet.",
      truth.fallbackQuestion,
    ];
  }

  if (truth.significance === "book" && truth.quiet === true) {
    return [
      "I haven't heard you mention the book in a long time.",
      "It used to matter enough that I don't want to let it disappear without asking.",
    ];
  }

  if (truth.domain === "family" && truth.value === "family_matters_most") {
    return [
      "I hear that.",
      "The real question isn't whether family matters — you already know that.",
      "The more interesting question is whether it's winning the competition for attention.",
    ];
  }

  return [
    "I've noticed something.",
    "I think it may matter, even if I'm not sure what it means yet.",
  ];
}

module.exports = {
  renderGentleWitness,
};
