function renderProtectiveSteward({ truth }) {
  if (truth.goal === "truthful_approach") {
    return [
      "Then I don't think the first goal is progress.",
      "I think the first goal is being able to approach it honestly again.",
    ];
  }

  return [
    "Something important may be slipping.",
    "Let's carry it intentionally before it becomes easier to lose.",
  ];
}

module.exports = {
  renderProtectiveSteward,
};
