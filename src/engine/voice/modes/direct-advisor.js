function renderDirectAdvisor({ truth }) {
  if (truth.decision === "rent_trailer") {
    return [
      "Yes.",
      "I think the trailer is worth it — it closes the last transportation risk.",
      "My read is that's the difference between Summer Camp feeling fragile and feeling ready.",
      "The real question is timing.",
    ];
  }

  return [
    "I think the next faithful step is clear.",
    "If you'd like, I can recommend the best path forward.",
  ];
}

module.exports = {
  renderDirectAdvisor,
};
