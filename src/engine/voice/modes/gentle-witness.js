function renderGentleWitness({ truth }) {
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
      "When you say family matters most, I want to help keep that connected to how life is actually being lived.",
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
