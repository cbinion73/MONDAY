function renderExecutionOperator({ truth }) {
  if (truth.executionThread === "transportation") {
    return [
      "Understood. I'll move on transportation.",
      "I'd start by confirming the trailer rental — that closes the last open item.",
      "I think the real question is what you need from me before camp day.",
      "My read is everything else is ready.",
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
