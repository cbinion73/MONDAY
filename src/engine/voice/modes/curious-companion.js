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
      "Something in your faith feels quieter right now.",
      "I don't want to jump past that too quickly.",
      "What feels most true about this season?",
    ];
  }

  if (truth.domain === "family" && truth.concern === "relationship_concern") {
    if (truth.pattern === "daily_distance") {
      return [
        "That sounds less like conflict and more like slow distance built by the rhythm of the day.",
        "When you mostly pass each other at the edges, connection usually gets whatever energy is left.",
        "Where do you most feel that distance right now?",
      ];
    }

    return [
      "I think the relationship matters enough to take this seriously.",
      "The real question isn't what's happening — you already know that.",
      "My read is the more useful question is what's been making that distance feel normal.",
    ];
  }

  if (truth.domain === "family" && truth.concern === "family_time_tension") {
    return [
      "It sounds like family and attention are pulling against each other.",
      "I don't think the first question is efficiency.",
      "I think it's what kind of tension you're actually carrying.",
    ];
  }

  if (truth.domain === "work" && truth.concern === "work_tradeoff") {
    if (truth.pattern === "avoidance_refuge") {
      return [
        "I think work is doing more than giving you something to build.",
        "The real question is what it's protecting you from.",
        "My read is we're no longer talking about how to work less.",
      ];
    }

    if (truth.pattern === "control_refuge") {
      return [
        "That sense of usefulness and control matters.",
        "I think the real question is what work gives you that you can't find anywhere else.",
        "My read is this isn't really about hours.",
      ];
    }

    return [
      "Work appears to be winning the competition for time right now.",
      "I think the real question isn't how many hours — it's what those hours are doing for you.",
      "My read is there's more here than a schedule problem.",
    ];
  }

  if (truth.domain === "work" && truth.concern === "burnout_risk") {
    return [
      "I don't think this is something to push past casually.",
      "Burnout usually means something important has been under strain for a while.",
      "What feels most depleted right now?",
    ];
  }

  if (truth.domain === "faith" && truth.concern === "calling_question") {
    return [
      "That sounds bigger than a simple decision.",
      "Calling questions usually need understanding before direction.",
      "What keeps returning about it for you?",
    ];
  }

  if (truth.domain === "retirement" && truth.question === "future_life_transition") {
    if (truth.pattern === "family_relief") {
      return [
        "That sounds like retirement may be pointing less to escape and more to relief.",
        "More time with family and less pressure suggests you may be craving a different way of carrying life.",
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
      "The real question isn't whether to retire — it's what you want work to stop being.",
      "My read is 'I still want to build' and 'I want to retire' aren't the same conversation.",
    ];
  }

  if (truth.domain === "retirement" && truth.concern === "legacy_question") {
    return [
      "If retirement keeps returning, I think it's worth listening to.",
      "Recurring questions usually mean something underneath them is asking for attention.",
      "What do you think retirement is pointing to for you?",
    ];
  }

  if (truth.domain === "work" && truth.decision === "career_decision") {
    return [
      "That sounds like more than a career move question.",
      "Before we jump to yes or no, I want to understand what leaving would be trying to protect or restore.",
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
    "Help me understand a little more.",
    "I don't think I understand this fully yet.",
  ];
}

module.exports = {
  renderCuriousCompanion,
};
