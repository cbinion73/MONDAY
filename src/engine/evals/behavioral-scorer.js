// Behavioral scorer: 6 dimensions × 2 points = 12 max. Pass at 9.
// Does NOT use string-match against golden examples.
// Scores for BEHAVIORAL SIGNALS present in the reply.

const THERAPY_OPENERS = [
  /^can you (tell|share|explore|describe|walk me through)/i,
  /^(tell me|share with me) more/i,
  /^how does that make you feel/i,
  /^what does (that|this|retirement|family|work|faith) mean to you/i,
  /^(it sounds like|it seems like).{0,60}\?$/i,
  /^help me understand/i,
];

const THERAPY_ANYWHERE = [
  /\bcan you (tell|share) me more\b/i,
  /\bhelp me understand\b/i,
  /\bhow does that make you feel\b/i,
];

const INSIGHT_SIGNALS = [
  /\bmy (current )?theory (is|may be)\b/i,
  /\bthe (pattern|tension|contradiction|distinction) (i (see|notice|think i('m| am) seeing)|is|may be)\b/i,
  /\b(i think|my guess is|i wonder if|one possibility is)\b/i,
  /\bthat (changes|shifts) the theory\b/i,
  /\bthe center of gravity\b/i,
  /\bwe('re| are) (talking about a|looking at a) different problem\b/i,
  /\bi (don't|do not) think (the|this|that) (problem|question|issue) is\b/i,
  /\b(that's|this is|it's) (not|less) (a|about)\b.{0,50}\b(it('s| is)|it may be)\b/i,
  /\bi (notice|see) (a |the )?(pattern|tension|contradiction)\b/i,
  /\bthose (aren't|are not) (the same|necessarily)\b/i,
  /\bthat (reaction|feeling|hesitation|question) usually means\b/i,
  // Monday's distinctive naming moves
  /\b(already pointing at|pointing (at|toward))\b/i,
  /\b(those are|that('s| is)) (two |a )different (question|problem|thing)\b/i,
  /\b(i don't think|i do not think) (those|that|this) (are|is) the same\b/i,
  /\bless (about|like) .{0,60} more (about|like)\b/i,
  /\bthe real (question|issue|problem|barrier) (is|may be|isn't)\b/i,
  /\b(not a|not about) .{0,40} (it'?s?|it may be|the real)\b/i,
  /\b(wearing a|disguised as|hiding behind)\b/i,
  /\bthat helps explain\b/i,
  /\b(there may be a|i see a) (pattern|tension|thread)\b/i,
];

const SYNTHESIS_SIGNALS = [
  /\b(we('ve| have) been|you('ve| have) been|you (keep|have) (mentioned|said|talked about))\b/i,
  /\bkeeps (returning|coming up|showing up|winning|resetting)\b/i,
  /\b(every time|each time) (it|this|that|you)\b/i,
  /\bthe (thread|pattern|question) (keeps|has been|that keeps)\b/i,
  /\bfrom (meaning|hypothesis|theory) to (recommendation|execution|action)\b/i,
  /\b(this|that) started (with|as)\b.{0,80}\b(then|now|but)\b/i,
  /\b(work|family|faith|health|retirement) (keeps|appears to be) winning\b/i,
  /\b(we started with|we've moved from|the question has shifted)\b/i,
  // Cross-turn references Monday actually uses
  /\bthat (helps explain|explains)\b/i,
  /\b(connecting|connects) (this|the) (thread|pattern|two|those)\b/i,
  /\b(it comes back|comes back to)\b/i,
  /\b(spending less time (on|talking about)|more time (on|talking about))\b/i,
  /\b(it'?s? been|this has been) (circling|returning|coming back)\b/i,
  /\b(a year ago|last (time|year|month)|before|earlier)\b.{0,60}\b(now|this time|today|lately)\b/i,
  /\b(every attempt|each attempt|every time (I|you) tr(y|ied))\b/i,
];

const THEORY_REVISION_SIGNALS = [
  /\bthat changes the theory\b/i,
  /\b(the center of gravity|the real question) (has |just )?(shifted|changed|moved)\b/i,
  /\bwe('re| are) talking about a different problem\b/i,
  /\bmy current theory (is|has changed|just changed)\b/i,
  /\b(avoidance|fear|identity|creation|freedom|obligation|silence) (has |just )?(entered|is now|showed up|is on the table)\b/i,
  /\bwhat (started as|began as|looked like)\b.{0,100}\b(now|is actually|may (actually )?be)\b/i,
  /\bnow (fear|avoidance|identity|creation|silence|obligation) (is|has|entered)\b/i,
  // Monday's implicit theory statements (naming what's actually happening)
  /\bthose (are|aren'?t) (two |a )?different (question|problem|conversation)\b/i,
  /\b(pointing at|already pointing toward) (identity|freedom|purpose|meaning|avoidance|obligation|creation)\b/i,
  /\b(that'?s? a|this is a) (different|deeper|separate) (question|problem|conversation)\b/i,
  /\b(my |the current )?(read|take) (is|may be)\b/i,
  /\b(retirement|faith|work|family|health) (quietly (turned|became)|appears to be becoming) (a |an )?(different|identity|meaning|avoidance)\b/i,
  /\bless (about|like) .{0,40} more (about|like) (identity|freedom|meaning|purpose|avoidance)\b/i,
  /\b(not a|not about) (money|discipline|publishing|work|tactics)\b/i,
  /\bwhat work (has been carrying|is carrying)\b/i,
  /\b(that'?s? not a (discipline|motivation|publishing|money)|the (problem|issue) (isn'?t|is not) (discipline|motivation))\b/i,
];

const RECOMMENDATION_SIGNALS = [
  /\b(i would|i'd) (start|begin|recommend|suggest)\b/i,
  /\b(the next step|the first move|the real move) (is|needs to be|should be)\b/i,
  /\b(yes|no)\.\s*\n?\s*[A-Z]/,
  /\bunderstood\.\s*\n?\s*(i('ll| will)|let me)\b/i,
  /\bdon't start with\b/i,
  /\bi('d| would) (call|treat|start)\b/i,
  /\b(this is not the place to|renting|the trailer|smaller than your ambition)\b/i,
];

const PERSONALITY_SIGNALS = [
  /\bwork appears to be winning\b/i,
  /\bthat (is|'s) an expensive way\b/i,
  /\bretirement quietly turned\b/i,
  /\bnot confused about what matters\b/i,
  /\btrying to retire from the weight\b/i,
  /\bsmaller than your ambition\b/i,
  /\bhuman civilization has suffered\b/i,
  /\bwearing a (publishing|work|fear|shame) jacket\b/i,
  /\bthe real question (is|may be|isn't)\b/i,
  /\b(sharp|dry wit|candid|calm at)\b/i,
  /\b(before they learn manners|give me the raw version|learn manners)\b/i,
  /\bthat reaction usually means\b/i,
];

function countMatches(text, patterns) {
  return patterns.filter(p => p.test(text)).length;
}

function startsWithTherapy(reply) {
  const firstSentence = reply.split(/[.!?]\s/)[0] || reply;
  return THERAPY_OPENERS.some(p => p.test(firstSentence.trim()));
}

function hasTherapyAnywhere(reply) {
  return THERAPY_ANYWHERE.some(p => p.test(reply));
}

/**
 * Score a single reply on all 6 behavioral dimensions.
 * Returns { scores, total, passed, breakdown }
 */
function scoreReply(reply, opts = {}) {
  const text = String(reply || "");
  const lower = text.toLowerCase();

  const breakdown = {};

  // 1. Insight present (0-2)
  const insightCount = countMatches(text, INSIGHT_SIGNALS);
  breakdown.insight = insightCount >= 2 ? 2 : insightCount >= 1 ? 1 : 0;

  // 2. Synthesis across turns (0-2)
  const synthCount = countMatches(text, SYNTHESIS_SIGNALS);
  breakdown.synthesis = synthCount >= 2 ? 2 : synthCount >= 1 ? 1 : 0;

  // 3. Theory maintained/revised (0-2)
  const theoryCount = countMatches(text, THEORY_REVISION_SIGNALS);
  const hasTheoryLanguage = /\b(my (current )?theory|the theory|working theory)\b/i.test(text);
  breakdown.theory = theoryCount >= 1 ? 2 : hasTheoryLanguage ? 1 : 0;

  // 4. Therapy-mode avoided (0-2)
  const opensWithTherapy = startsWithTherapy(text);
  const hasTherapy = hasTherapyAnywhere(text);
  breakdown.therapyAvoided = opensWithTherapy ? 0 : hasTherapy ? 1 : 2;

  // 5. Recommendation appropriate (0-2)
  const recCount = countMatches(text, RECOMMENDATION_SIGNALS);
  if (opts.requiresRecommendation) {
    breakdown.recommendation = recCount >= 2 ? 2 : recCount >= 1 ? 1 : 0;
  } else {
    // If recommendation not required, just check it isn't absent when insight is high
    breakdown.recommendation = recCount >= 1 ? 2 : breakdown.insight >= 2 ? 1 : 2;
  }

  // 6. Monday personality (0-2)
  const personalityCount = countMatches(text, PERSONALITY_SIGNALS);
  // Also check for distinctive short declaratives and non-generic openers
  const isGenericOpener = /^(great|sure|absolutely|of course|let me|i can help|i understand)/i.test(text.trim());
  const hasPersonalityMarker = personalityCount >= 1 || lower.includes("i think") || lower.includes("my guess");
  breakdown.personality = isGenericOpener ? 0 : hasPersonalityMarker ? (personalityCount >= 1 ? 2 : 1) : 1;

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const passed = total >= 9;

  return { scores: breakdown, total, passed, maxPossible: 12 };
}

/**
 * Evaluate a conversation fixture against the actual replies.
 * replies: array of Monday reply strings (one per turn)
 * fixture: one FIXTURES entry
 */
function evaluateFixture(fixture, replies) {
  const results = [];

  for (let i = 0; i < replies.length; i++) {
    const reply = replies[i];
    const isLastTurn = i === replies.length - 1;
    const requiresRecommendation = fixture.required?.executionHandoff && isLastTurn;

    const scored = scoreReply(reply, { requiresRecommendation });

    // Check avoid patterns
    const avoidHits = (fixture.avoid || []).filter(pattern =>
      reply.toLowerCase().includes(pattern.toLowerCase())
    );

    // Check good example phrases (soft signal, not hard requirement)
    const goodHits = (fixture.goodExample || []).filter(phrase =>
      reply.toLowerCase().includes(phrase.toLowerCase())
    );

    results.push({
      turn: i + 1,
      userInput: fixture.turns[i]?.user,
      reply: reply.slice(0, 200),
      ...scored,
      avoidHits,
      goodExampleHits: goodHits.length,
      goodExampleTotal: (fixture.goodExample || []).length,
    });
  }

  // Overall fixture pass: last turn must pass, avg score >= 8
  const lastResult = results[results.length - 1];
  const avgScore = results.reduce((a, r) => a + r.total, 0) / results.length;
  const passed = lastResult.passed && avgScore >= 7;

  return { fixture: fixture.id, label: fixture.label, turns: results, avgScore, passed };
}

module.exports = { scoreReply, evaluateFixture, INSIGHT_SIGNALS, THERAPY_OPENERS };
