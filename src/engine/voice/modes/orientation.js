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
        "That sounds like the quiet itself may be part of what feels difficult.",
        "If prayer means becoming still enough to notice what is going on in you, I can see why returning to it might feel costly.",
        "I think the first step may be making a little room for honesty before trying to force consistency.",
      ];
    }

    return [
      "Faith is asking for attention here.",
      "You don't need to solve the whole season tonight.",
      "If we can name what returning to prayer would need, that's enough to begin.",
    ];
  }

  return ["This is in good shape.", "There is one meaningful thing to keep an eye on."];
}

module.exports = {
  renderOrientation,
};
