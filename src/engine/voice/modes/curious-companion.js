function renderCuriousCompanion({ truth }) {
  if (truth.significance === "book" && truth.shamePresent === true) {
    return [
      "Thank you for saying that.",
      "I don't think the problem is that you forgot.",
      "It sounds like the book still matters.",
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
      "I think this matters because the relationship matters.",
      "Before we decide what to do, I want to understand what feels off to you.",
      "What has felt hardest about it lately?",
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
        "That makes it sound like work is doing more than giving you something to build.",
        "If it keeps you from thinking about other things, it may also be acting like a refuge.",
        "What are the things work is helping you avoid right now?",
      ];
    }

    if (truth.pattern === "control_refuge") {
      return [
        "That sense of usefulness and control matters.",
        "If work gives you both of those, I can see why it would be hard to loosen your grip on it.",
        "What do you think work is protecting you from right now?",
      ];
    }

    return [
      "Work seems to be carrying more weight than usual here.",
      "Before we talk about what to change, I want to understand what work is doing for you right now.",
      "What feels most true about that tradeoff?",
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
      "That sounds closer to identity than scheduling.",
      "I don't want to answer it too quickly.",
      "What feels hardest about imagining life without work?",
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
        "That sounds like the fear is less about discipline and more about what the book might reveal.",
        "If writing it feels like a test of whether you still have something to say, I can see why the question would carry weight.",
        "What do you think the book would mean about you if the words did not come the way you hope?",
      ];
    }

    return [
      "That sounds worth taking seriously.",
      "Writing questions are rarely just about output.",
      "What makes this book feel alive again right now?",
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
