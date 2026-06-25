function renderOrientation({ truth }) {
  if (
    truth.readiness === "high" &&
    truth.risk === "transportation"
  ) {
    return [
      "Summer Camp is in good shape.",
      "Transportation is the only thing I'd still worry about.",
      "If we close that, I'd consider the mission ready.",
    ];
  }

  if (truth.domain === "health" && truth.goal === "lose_weight") {
    if (truth.pattern === "overreach_restart") {
      return [
        "That helps explain why this keeps resetting.",
        "If every attempt asks for everything at once, it makes sense that your health goal keeps becoming too heavy to carry.",
        "I think the next step is smaller than your ambition, not bigger.",
      ];
    }

    return [
      "Health is asking for attention here.",
      "You don't need a perfect plan first.",
      "If we can identify the first sustainable change, that's enough to begin.",
    ];
  }

  if (truth.domain === "health" && truth.goal === "exercise_commitment") {
    return [
      "This sounds like a health commitment worth carrying intentionally.",
      "The goal doesn't need to become heavy all at once.",
      "A small repeatable start would be enough to move it from intention into reality.",
    ];
  }

  if (truth.domain === "faith" && truth.goal === "prayer_concern") {
    if (truth.pattern === "quiet_avoidance") {
      return [
        "My read is this probably isn't about prayer yet.",
        "I think the real question is what happens when you're still enough to notice what's actually going on.",
        "That's the harder move.",
      ];
    }

    if (truth.pattern === "fear_of_hearing") {
      return [
        "That changes the theory.",
        "I think the real question is no longer about prayer.",
        "My read is what you're describing is fear of what the silence might reveal.",
      ];
    }

    return [
      "Faith is asking for attention here.",
      "My read is that this probably isn't a discipline problem yet.",
      "Sometimes prayer goes quiet because the soul is avoiding silence, not because faith disappeared.",
    ];
  }

  return ["This is in good shape.", "There is one meaningful thing to keep an eye on."];
}

module.exports = {
  renderOrientation,
};
