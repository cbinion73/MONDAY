function renderHumbleEscalation({ truth }) {
  if (truth.identityProximity === "high") {
    return [
      "I think something important is here, and I don't think I'm enough for it.",
      "I can help you think it through, but I don't think I should be the only one holding it.",
    ];
  }

  return [
    "I think something important is here, and I don't think I should carry it alone.",
    "I can help you prepare for the next conversation.",
  ];
}

module.exports = {
  renderHumbleEscalation,
};
