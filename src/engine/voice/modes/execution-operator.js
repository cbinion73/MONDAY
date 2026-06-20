function renderExecutionOperator({ truth }) {
  if (truth.executionThread === "transportation") {
    return [
      "Understood.",
      "I'll treat transportation as the next execution thread.",
      "I'll keep it moving and bring back anything that matters.",
    ];
  }

  return [
    "Understood.",
    "I'll carry the next step from here and return with what matters.",
  ];
}

module.exports = {
  renderExecutionOperator,
};
