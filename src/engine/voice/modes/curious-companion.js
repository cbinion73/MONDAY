function renderCuriousCompanion({ truth }) {
  if (truth.significance === "book" && truth.shamePresent === true) {
    return [
      "Thank you for saying that.",
      "I don't think the problem is that you forgot.",
      "It sounds like the book still matters.",
    ];
  }

  if (truth.humanCompanyBoundary) {
    return [
      "I think something important is here, and I don't think I should be the only one holding it.",
      "I can help you think clearly.",
      "But this belongs with a trusted human too.",
      "Let's keep this grounded, not isolated.",
    ];
  }

  if (truth.creativeSpark) {
    return [
      "Good.",
      "Most useful things start as crazy ideas before they learn manners.",
      "Give me the raw version.",
      "I'll help separate the signal from the fireworks.",
    ];
  }

  if (truth.agentDelegation) {
    return [
      "Understood.",
      "I'll find the options, filter out the noise, and bring back a recommendation instead of a comparison table.",
      "Human civilization has suffered enough from those.",
    ];
  }

  if (truth.fallbackQuestion) {
    return [
      "I'm not sure what kind of situation this is yet.",
      truth.fallbackQuestion,
    ];
  }

  if (truth.domain === "faith" && truth.concern === "spiritual_drift") {
    return [
      "Something in your faith has gone quiet.",
      "I don't want to rush past that and call it a discipline problem.",
      "What feels most true about this season?",
    ];
  }

  if (truth.domain === "family" && truth.concern === "relationship_concern") {
    if (truth.pattern === "daily_distance") {
      return [
        "That sounds less like conflict and more like slow distance built by the rhythm of the day.",
        "When you mostly pass each other at the edges, connection gets whatever energy is left.",
        "Where do you most feel that distance right now?",
      ];
    }

    return [
      "I think this matters more than the current pattern is admitting.",
      "You already know something is off.",
      "My read is the useful question is what has made that distance start to feel normal.",
    ];
  }

  if (truth.domain === "family" && truth.concern === "family_time_tension") {
    return [
      "Family and attention are pulling against each other again.",
      "I don't think this is an efficiency problem yet.",
      "My read is the real issue is what keeps winning when the two collide.",
    ];
  }

  if (truth.domain === "work" && truth.concern === "work_tradeoff") {
    if (truth.pattern === "avoidance_refuge") {
      return [
        "I think work is doing more than giving you something to build.",
        "It may also be protecting you from something harder to face.",
        "My read is we're no longer talking about workload. We're talking about refuge.",
      ];
    }

    if (truth.pattern === "control_refuge") {
      return [
        "That sense of usefulness and control matters.",
        "Work may be carrying jobs for you that nothing else is carrying right now.",
        "My read is this isn't really about hours.",
      ];
    }

    return [
      "Work appears to be winning the competition for time right now.",
      "I don't think the issue is the number by itself.",
      "My read is those hours are doing something for you besides getting work done.",
    ];
  }

  if (truth.domain === "work" && truth.concern === "burnout_risk") {
    return [
      "I don't think this is something to push past casually.",
      "Burnout usually means something important has been under strain for longer than you've wanted to admit.",
      "What feels most depleted right now?",
    ];
  }

  if (truth.domain === "faith" && truth.concern === "calling_question") {
    return [
      "That sounds bigger than a simple decision.",
      "Calling questions usually need clarity before direction.",
      "What keeps returning about it for you?",
    ];
  }

  if (truth.domain === "retirement" && truth.question === "future_life_transition") {
    if (truth.pattern === "family_relief") {
      return [
        "That sounds like retirement may be pointing less to escape and more to relief.",
        "More time with family and less pressure sounds like a different way of carrying life, not an exit from usefulness.",
        "Where do you feel that pressure most right now?",
      ];
    }

    return [
      "Most retirement conversations start with money or timing.",
      "Yours is already pointing at identity, freedom, and what work has been carrying for you.",
      "My guess is the real question is not when you stop working, but what you want work to stop holding.",
      "Am I close?",
    ];
  }

  if (truth.domain === "retirement" && truth.concern === "identity_transition") {
    return [
      "I think that changes something.",
      "This sounds less like retiring from work and more like retiring from what work has become.",
      "My read is 'I still want to build' and 'I want to retire' are not actually in conflict.",
    ];
  }

  if (truth.domain === "retirement" && truth.concern === "legacy_question") {
    return [
      "If retirement keeps returning, I think it's worth listening to.",
      "Questions that keep resurfacing usually aren't random.",
      "What do you think retirement is pointing to for you?",
    ];
  }

  if (truth.domain === "work" && truth.decision === "career_decision") {
    return [
      "That sounds like more than a career move question.",
      "Before we jump to yes or no, I want to know what leaving would be trying to protect or restore.",
      "What feels most significant about it right now?",
    ];
  }

  if (truth.domain === "publishing" && truth.decision === "publishing_decision") {
    if (truth.pattern === "fear_of_emptiness") {
      return [
        "That's not a publishing problem.",
        "That's a vulnerability problem wearing a publishing jacket.",
        "My read is the fear of having nothing left to say is less about output and more about significance.",
        "Those are different questions.",
      ];
    }

    return [
      "That doesn't sound like a project question yet.",
      "Writing questions are rarely just about output.",
      "My read is this is less about whether you can write another book and more about whether there's something left that needs to be said.",
    ];
  }

  if (truth.domain === "publishing" && truth.concern === "creative_drift") {
    return [
      "Something about the project feels less clear than it used to.",
      "I don't want to force momentum before meaning is clear.",
      "What feels uncertain about it right now?",
    ];
  }

  return [
    "I think something here matters.",
    "My read is we don't have enough shape yet to name it cleanly.",
  ];
}

module.exports = {
  renderCuriousCompanion,
};
