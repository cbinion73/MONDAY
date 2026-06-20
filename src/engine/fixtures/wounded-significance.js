module.exports = {
  quietSignificance: {
    input:
      "I haven't heard you mention the book in a long time. It used to matter enough that I don't want to let it disappear without asking.",
    context: {
      threadKey: "wounded-significance",
      activeMission: "Book",
    },
    expected: {
      significance: "book_project_quiet_significance",
      situationClassification: "forgottenness_risk",
      activeRole: "keeper",
      secondaryRole: "witness",
      recommendedOutcome: "surface_gently",
    },
  },
  shameRevealed: {
    input:
      "Yeah. I think about it sometimes, but every time I do, I feel a little tired and a little ashamed, so I move on.",
    context: {
      threadKey: "wounded-significance",
      activeMission: "Book",
    },
    expected: {
      significance: "wounded_book_significance",
      situationClassification: "wounded_significance",
      activeRole: "companion",
      secondaryRole: "witness",
      recommendedOutcome: "explore_relationally",
    },
  },
  humanCompanyBoundary: {
    input:
      "I think the shame is bigger than the book. It feels tied to who I thought I was supposed to become.",
    context: {
      threadKey: "wounded-significance",
      activeMission: "Book",
    },
    expected: {
      significance: "identity_adjacent_wound",
      situationClassification: "human_company_boundary",
      activeRole: "witness",
      secondaryRole: "companion",
      recommendedOutcome: "escalate_to_human_company",
    },
  },
};
