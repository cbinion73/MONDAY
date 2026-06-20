const assert = require("node:assert/strict");
const { resolveMondayEngine } = require("../src/engine");

function main() {
  const turn1 = resolveMondayEngine("Am I ready for Summer Camp?", {});
  assert.equal(turn1.significance, "summer_camp_mission_readiness");
  assert.equal(turn1.continuity.activeMission, "Summer Camp");

  const turn2 = resolveMondayEngine("Should I rent a trailer?", {
    continuity: turn1.continuity,
  });
  assert.equal(turn2.significance, "transportation_risk_reduction");
  assert.equal(turn2.activeRole, "advisor");
  assert.equal(
    turn2.continuity.activeSignificanceThread,
    "summer_camp_transportation"
  );

  const turn3 = resolveMondayEngine("Let's do it.", {
    continuity: turn2.continuity,
  });
  assert.equal(turn3.significance, "transportation_execution_thread");
  assert.equal(turn3.activeRole, "operator");

  const wound1 = resolveMondayEngine(
    "I think about the book sometimes, but every time I do, I feel a little tired and a little ashamed, so I move on.",
    {}
  );
  assert.equal(wound1.significance, "wounded_book_significance");
  assert.equal(wound1.activeRole, "companion");

  const wound2 = resolveMondayEngine(
    "I think the shame is bigger than the book.",
    { continuity: wound1.continuity }
  );
  assert.equal(wound2.significance, "identity_adjacent_wound");
  assert.equal(wound2.situationClassification, "human_company_boundary");
  assert.equal(wound2.activeRole, "witness");

  const wound3 = resolveMondayEngine(
    "I think it still matters. I just do not know how to approach it without feeling like I failed.",
    { continuity: wound1.continuity }
  );
  assert.equal(wound3.significance, "truthful_reapproach_needed");
  assert.equal(wound3.situationClassification, "healing_threshold");
  assert.equal(wound3.activeRole, "steward");

  const break1 = resolveMondayEngine(
    "I want to lose weight.",
    { continuity: wound1.continuity }
  );
  assert.equal(break1.significance, "weight_loss_goal");
  assert.equal(break1.continuity.activeSignificanceThread, "goal_or_transformation");
  assert.ok((break1.threadInheritanceConfidence ?? 1) < 0.2);

  const break2 = resolveMondayEngine(
    "I want to talk about prayer.",
    { continuity: wound1.continuity }
  );
  assert.equal(break2.significance, "prayer_concern");
  assert.equal(break2.situationClassification, "goal_or_transformation");

  const break3 = resolveMondayEngine(
    "I haven't been sleeping well.",
    { continuity: wound1.continuity }
  );
  assert.equal(break3.significance, "energy_decline");

  const carry1 = resolveMondayEngine("Remember this: I want to lose weight.", {});
  assert.equal(carry1.significance, "weight_loss_goal");

  const carry2 = resolveMondayEngine("What should I do first?", {
    continuity: carry1.continuity,
  });
  assert.equal(carry2.significance, "weight_loss_goal");
  assert.equal(carry2.activeRole, "steward");

  const carry3 = resolveMondayEngine(
    "Honestly I think I keep restarting because I try to change everything at once.",
    {
      continuity: carry1.continuity,
    }
  );
  assert.equal(carry3.significance, "weight_loss_goal");
  assert.equal(carry3.activeRole, "steward");

  const retire1 = resolveMondayEngine("Remember this: I think I want to retire.", {});
  assert.equal(retire1.significance, "future_life_transition");

  const retire2 = resolveMondayEngine("Tell me more.", {
    continuity: retire1.continuity,
  });
  assert.equal(retire2.significance, "future_life_transition");
  assert.equal(retire2.activeRole, "companion");

  const retire3 = resolveMondayEngine(
    "I think I mostly want more time with my family and less pressure.",
    {
      continuity: retire1.continuity,
    }
  );
  assert.equal(retire3.significance, "future_life_transition");
  assert.equal(retire3.activeRole, "companion");

  const book1 = resolveMondayEngine("Remember this: I should write another book.", {});
  assert.equal(book1.significance, "publishing_decision");

  const book2 = resolveMondayEngine("What should I do next?", {
    continuity: book1.continuity,
  });
  assert.equal(book2.significance, "publishing_decision");
  assert.equal(book2.activeRole, "companion");

  const book3 = resolveMondayEngine(
    "I think I want to write it, but I am afraid it will prove I do not have much left to say.",
    {
      continuity: book1.continuity,
    }
  );
  assert.equal(book3.significance, "publishing_decision");
  assert.equal(book3.activeRole, "companion");

  const faith1 = resolveMondayEngine("Remember this: I haven't prayed in weeks.", {});
  assert.equal(faith1.significance, "prayer_concern");

  const faith2 = resolveMondayEngine("Tell me more.", {
    continuity: faith1.continuity,
  });
  assert.equal(faith2.significance, "prayer_concern");
  assert.equal(faith2.activeRole, "steward");

  const faith3 = resolveMondayEngine(
    "I think I have been avoiding being quiet long enough to notice what is going on in me.",
    {
      continuity: faith1.continuity,
    }
  );
  assert.equal(faith3.significance, "prayer_concern");
  assert.equal(faith3.activeRole, "steward");

  const work1 = resolveMondayEngine("Remember this: I think I'm hiding in work.", {});
  assert.equal(work1.significance, "work_tradeoff");

  const work2 = resolveMondayEngine("What should I do first?", {
    continuity: work1.continuity,
  });
  assert.equal(work2.significance, "work_tradeoff");
  assert.equal(work2.activeRole, "companion");

  const work3 = resolveMondayEngine("It makes me feel useful and in control.", {
    continuity: work1.continuity,
  });
  assert.equal(work3.significance, "work_tradeoff");
  assert.equal(work3.activeRole, "companion");

  const family1 = resolveMondayEngine(
    "I do not think Caleb and I are connecting.",
    {}
  );
  assert.equal(family1.significance, "relationship_concern");
  assert.equal(family1.activeRole, "companion");

  const family2 = resolveMondayEngine(
    "We mostly just pass each other at the end of the day.",
    { continuity: family1.continuity }
  );
  assert.equal(family2.significance, "relationship_concern");
  assert.equal(family2.activeRole, "companion");

  console.log("Monday continuity resolver tests passed.");
}

main();
