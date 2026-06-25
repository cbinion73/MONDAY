function renderDirectAdvisor({ truth }) {
  if (truth.decision === "rent_trailer") {
    return [
      "Yes.",
      "I think the trailer is worth it.",
      "It reduces transportation risk and gives you more flexibility.",
      "If the goal is to make Summer Camp steady instead of fragile, the trailer helps.",
    ];
  }

  return [
    "Here's my read.",
    "The next step is clear enough to name.",
  ];
}

module.exports = {
  renderDirectAdvisor,
};
