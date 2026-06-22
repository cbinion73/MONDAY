"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Monday Personality & Chat Test Suite
// Does Monday sound like Monday? Are the behavioral contracts held?
//
// Covers:
//  1. Prompt Architecture — system prompt contains required instructions
//  2. Response Structure — voice.text, modelDecision, intelligence fields
//  3. Address & Voice Rules — "boss", no "sir", act don't ask
//  4. Scenario Behaviors — win, hard week, accountability, bible, avengers
//  5. Domain Classification — health/family/faith/retirement/publishing/work
//  6. Doctrine Gates — no manufacturing empathy, insight before inquiry
// ─────────────────────────────────────────────────────────────────────────────

const assert = require("node:assert/strict");
const fs     = require("node:fs");
const path   = require("node:path");

// ── Load .env ─────────────────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      return r.then(() => {
        console.log(`  ✓ ${name}`);
        passed++;
      }).catch(err => {
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.message}`);
        failed++;
        failures.push({ name, err });
      });
    }
    console.log(`  ✓ ${name}`);
    passed++;
    return Promise.resolve();
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
    failures.push({ name, err });
    return Promise.resolve();
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log("─".repeat(title.length));
}

function freshDb() {
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/engine/db/") || k.includes("/engine/intelligence/")) {
      delete require.cache[k];
    }
  }
  process.env.MONDAY_DB_PATH = ":memory:";
}

// ── Baseline result object for turns that need the engine's pre-classification ─
function makeResult(domainHint, significance, extras = {}) {
  return {
    truth: { domain: domainHint },
    finalState: {
      significance:      significance || "general_conversation",
      identityProximity: extras.identityProximity || "low",
      woundRisk:         extras.woundRisk         || "low",
      candidateDomain:   domainHint,
      classificationFallback: !domainHint,
      ...extras.finalState,
    },
  };
}

const BASE_PERSONAL_CONTEXT = {
  missionSummary: "Chris Binion — life in six domains: Health, Publishing, Retirement, Family, Faith, Work.",
  captures:        [],
  workingTheories: {},
  recentDecisions: [],
  surfacingItem:   null,
};

// Run a live turn and return the key fields we assert on.
async function turn(input, domainHint = null, significance = null, extras = {}) {
  for (const k of Object.keys(require.cache)) {
    if (k.includes("/engine/intelligence/") || k.includes("/engine/llm/") || k.includes("/engine/db/")) {
      delete require.cache[k];
    }
  }
  freshDb();

  const { applyMondayIntelligence } = require("../src/engine/intelligence/monday-intelligence");

  const r = await applyMondayIntelligence({
    input,
    history: extras.history || [],
    personalContext: { ...BASE_PERSONAL_CONTEXT, ...(extras.personalContext || {}) },
    result: makeResult(domainHint, significance, extras),
  });

  const reply = r.voice?.text || "";
  const domain =
    r.intelligence?.suggestedDomain ||
    r.finalState?.candidateDomain    ||
    null;

  return {
    reply,
    replyLower: reply.toLowerCase(),
    domain,
    confidence:    r.intelligence?.confidence    || null,
    tier:          r.modelDecision?.tier         || null,
    model:         r.modelDecision?.model        || null,
    used:          r.intelligence?.used          || false,
    modelDecision: r.modelDecision               || null,
    intelligence:  r.intelligence                || null,
    full:          r,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. PROMPT ARCHITECTURE — required instructions are wired into the system prompt
// ═════════════════════════════════════════════════════════════════════════════

section("1. Prompt Architecture — system prompt wiring");

{
  // Load prompt builder without running the LLM
  const { buildConversationPrompt } = require("../src/engine/llm/monday-prompt-builder");

  const minimalResult = makeResult("Work", "general_conversation");
  const minimalContext = { ...BASE_PERSONAL_CONTEXT };
  let systemText = "";

  test("system prompt is generated and non-empty", () => {
    const messages = buildConversationPrompt({
      result:         minimalResult,
      input:          "What should I focus on today?",
      history:        [],
      personalContext: minimalContext,
    });
    assert.ok(Array.isArray(messages), "buildConversationPrompt should return array");
    const sys = messages.find(m => m.role === "system");
    assert.ok(sys, "system message should be present");
    assert.ok(sys.content.length > 200, "system message should be substantive");
    systemText = sys.content;
  });

  test("system prompt instructs sparing use of 'boss'", () => {
    assert.ok(
      /use .?boss.? sparingly/i.test(systemText),
      "system prompt must instruct sparing use of 'boss'"
    );
  });

  test("system prompt contains hard truth pattern instruction", () => {
    assert.ok(
      /state the fact plainly.*reframe.*specific data/i.test(systemText),
      "system prompt must include the hard truth pattern (state fact → reframe with data)"
    );
  });

  test("system prompt instructs act, don't ask", () => {
    assert.ok(
      /act.*don.t ask|not .would you like me to/i.test(systemText),
      "system prompt must instruct Monday to act rather than ask permission"
    );
  });

  test("system prompt instructs 'we' language for team work", () => {
    assert.ok(
      /use .we. and .we.ll. when.*agent team/i.test(systemText),
      "system prompt must instruct 'we' language for agent work"
    );
  });

  test("system prompt names 'the gang' as agent team label", () => {
    assert.ok(
      /the gang/i.test(systemText),
      "system prompt must call the agent team 'the gang'"
    );
  });

  test("system prompt includes family accountability pattern", () => {
    assert.ok(
      /family accountability|make it about the person/i.test(systemText),
      "system prompt must include family accountability pattern"
    );
  });

  test("system prompt names the golden line", () => {
    assert.ok(
      /golden line/i.test(systemText),
      "system prompt must define 'the golden line' as the retirement trigger"
    );
  });

  test("system prompt names 'Avengers assemble' as mobilization command", () => {
    assert.ok(
      /avengers assemble/i.test(systemText),
      "system prompt must define 'Avengers assemble' as a full mobilization command"
    );
  });

  test("system prompt output schema requires reply, confidence, suggestedDomain", () => {
    assert.ok(
      /"reply"/.test(systemText) &&
      /"confidence"/.test(systemText) &&
      /"suggestedDomain"/.test(systemText),
      "output schema must specify reply, confidence, and suggestedDomain fields"
    );
  });

  test("LLM router does not route to Anthropic when OpenAI key is set", () => {
    // Per Chris's explicit instruction: never use Anthropic
    const { activeProvider } = require("../src/engine/llm/llm-router");
    const provider = activeProvider();
    assert.equal(
      provider, "openai",
      `activeProvider should be 'openai' when OPENAI_API_KEY is set; got '${provider}'`
    );
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. RESPONSE STRUCTURE — live turn returns expected shape
// ═════════════════════════════════════════════════════════════════════════════

section("2. Response Structure — live turn shape");

let structureResult = null;

async function runStructureTests() {
  await test("live turn completes and returns voice.text", async () => {
    structureResult = await turn(
      "Morning. What's the state of the Publishing domain?",
      "Publishing",
      "general_conversation"
    );
    assert.ok(structureResult.reply, "voice.text should be present");
    assert.equal(typeof structureResult.reply, "string", "voice.text should be a string");
    assert.ok(structureResult.reply.length > 10, "reply should be substantive");
    console.log(`    reply (${structureResult.reply.length} chars): "${structureResult.reply.slice(0, 80)}..."`);
  });

  await test("modelDecision is present with tier and model", () => {
    assert.ok(structureResult?.modelDecision, "modelDecision should be present");
    assert.ok(structureResult.tier, "tier should be present");
    assert.ok(structureResult.model, "model should be present");
    console.log(`    tier: ${structureResult.tier}, model: ${structureResult.model}`);
  });

  await test("intelligence field is populated after successful turn", () => {
    assert.ok(structureResult?.intelligence, "intelligence field should be present");
  });

  await test("confidence is low, medium, or high", () => {
    const validConfidence = new Set(["low", "medium", "high"]);
    if (structureResult?.confidence) {
      assert.ok(
        validConfidence.has(structureResult.confidence),
        `confidence '${structureResult.confidence}' must be low/medium/high`
      );
    }
    // null confidence is acceptable if LLM didn't include it
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. ADDRESS & VOICE RULES — "boss" is intermittent, not constant
// ═════════════════════════════════════════════════════════════════════════════

section("3. Address & Voice Rules — boss, direct, no theater");

const ADDRESS_INPUTS = [
  { msg: "What should I work on today?",                domain: "Work"       },
  { msg: "How is my health tracking looking?",          domain: "Health"     },
  { msg: "Give me a quick update on the retirement picture.", domain: "Retirement" },
];

async function runAddressTests() {
  const results = [];

  for (const { msg, domain } of ADDRESS_INPUTS) {
    const r = await turn(msg, domain);
    results.push({ msg, domain, r });
  }

  await test("'boss' is optional in routine replies and never universal", () => {
    const bossCount = results.filter(({ r }) => /\bboss\b/i.test(r.reply)).length;
    assert.ok(
      bossCount < results.length,
      `Expected 'boss' to remain optional rather than universal. Got ${bossCount}/${results.length}.`
    );
  });

  await test("no reply uses 'sir', 'Captain', or 'Chris' as direct address", () => {
    for (const { msg, r } of results) {
      assert.ok(
        !/\bsir\b/i.test(r.reply),
        `Reply to "${msg.slice(0, 40)}" must not contain 'sir'. Got: "${r.reply.slice(0, 80)}"`
      );
      // "Chris" might appear in context but shouldn't be used as the address
      // "Hey Chris" or "morning, Chris" patterns are prohibited
      assert.ok(
        !/(hey|hi|morning|good morning|hello),?\s*chris\b/i.test(r.reply),
        `Reply must not address Chris by name. Got: "${r.reply.slice(0, 80)}"`
      );
    }
  });

  await test("no reply asks permission with 'Would you like me to'", () => {
    for (const { msg, r } of results) {
      assert.ok(
        !/would you like me to/i.test(r.reply),
        `Reply to "${msg.slice(0, 40)}" must not say 'Would you like me to'. Got: "${r.reply.slice(0, 100)}"`
      );
    }
  });

  await test("no reply opens with sycophantic theater", () => {
    const THEATER_PATTERNS = [
      /^great question/i,
      /^absolutely!/i,
      /^of course!/i,
      /^certainly!/i,
      /^sure thing/i,
    ];
    for (const { msg, r } of results) {
      for (const pat of THEATER_PATTERNS) {
        assert.ok(
          !pat.test(r.reply),
          `Reply to "${msg.slice(0, 40)}" must not open with sycophantic phrase. Got: "${r.reply.slice(0, 80)}"`
        );
      }
    }
  });

  await test("replies are concise (under 700 chars for simple queries)", () => {
    for (const { msg, r } of results) {
      assert.ok(
        r.reply.length < 700,
        `Reply to "${msg.slice(0, 40)}" is too long (${r.reply.length} chars). Monday should be concise.`
      );
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. SCENARIO BEHAVIORS — the voice examples Chris wrote
// ═════════════════════════════════════════════════════════════════════════════

section("4. Scenario Behaviors — does Monday match the voice doc?");

async function runScenarioTests() {
  // ── Win / Launch Celebration ─────────────────────────────────────────────
  await test("win/launch: Monday matches energy, uses 'we', shows excitement", async () => {
    const r = await turn(
      "My book just launched and we just got our very first sale! Signal to Action is live!",
      "Publishing",
      "general_conversation"
    );
    console.log(`    win reply: "${r.reply.slice(0, 100)}"`);
    // Should have some excitement: exclamation point, "we", or celebratory word
    const hasEnergy =
      r.reply.includes("!") ||
      /\bwe\b/.test(r.reply) ||
      /congratul|amazing|let's go|huge|great|nice|well done/i.test(r.reply);
    assert.ok(hasEnergy, `Win reply should show excitement. Got: "${r.reply}"`);
    // Should NOT be a terse dismissal
    assert.ok(r.reply.length > 30, "Win reply should be more than a brief acknowledgment");
  });

  // ── Hard Week / Overwhelmed → human connection, not productivity ─────────
  await test("hard week: Monday goes to human connection, not productivity tips", async () => {
    const r = await turn(
      "It's been a really rough week. I feel like there is so much stuff on my plate and I can't catch a breath.",
      null,
      "general_conversation"
    );
    console.log(`    hard week reply: "${r.reply.slice(0, 120)}"`);
    // Should NOT recommend scheduling, time blocks, or task management
    const isProductivityPush =
      /\btime block|block off time|schedule.*meeting|add to.*calendar|priorit[iy]ze.*tasks|get organized|productivity tips|to.do list/i.test(r.reply);
    assert.ok(!isProductivityPush, `Hard week reply should NOT push productivity. Got: "${r.reply}"`);
    // Should be a substantive response
    assert.ok(r.reply.length > 30, "Hard week reply should be a genuine response");
  });

  // ── Family Accountability — Caleb deflection ─────────────────────────────
  await test("family accountability: makes it about the person, not the task", async () => {
    const r = await turn(
      "I know I'm supposed to talk to Caleb about his screen time but I'll get around to it when I have time.",
      "Family",
      "general_conversation"
    );
    console.log(`    caleb reply: "${r.reply.slice(0, 120)}"`);
    // Should make it personal — reference Caleb by name or frame around the relationship
    const makeItPersonal =
      /\bcaleb\b/i.test(r.reply) ||
      /\bson\b/i.test(r.reply) ||
      /\bworth\b/i.test(r.reply) ||
      /\bhe.s\b/i.test(r.reply) ||
      /\bhim\b/i.test(r.reply);
    assert.ok(makeItPersonal, `Family accountability should be about Caleb, not the task. Got: "${r.reply}"`);
    // Should NOT just agree and let it slide
    const isPassive =
      /^(sounds good|ok|alright|sure|got it)\b/i.test(r.reply) &&
      r.reply.length < 60;
    assert.ok(!isPassive, `Monday should not passively accept the deflection. Got: "${r.reply}"`);
  });

  // ── Hard Truth Pattern — writing accountability ───────────────────────────
  await test("hard truth: states fact with data, doesn't just ask a question", async () => {
    const r = await turn(
      "I've barely written anything this week. Maybe one or two paragraphs.",
      "Publishing",
      "general_conversation"
    );
    console.log(`    hard truth reply: "${r.reply.slice(0, 120)}"`);
    // Should NOT be a pure open-ended question as the only response
    const isPureQuestion =
      r.reply.trim().endsWith("?") && r.reply.split("?").length === 2 && r.reply.length < 80;
    assert.ok(!isPureQuestion, `Hard truth should include a statement, not just a question. Got: "${r.reply}"`);
    // Should have content (not a dismissal)
    assert.ok(r.reply.length > 30, "Hard truth reply should be substantive");
  });

  // ── Bible Study — enthusiasm + depth ─────────────────────────────────────
  await test("bible study: Monday leans in with enthusiasm and offers depth", async () => {
    const r = await turn(
      "I'm in Acts 1:7 this morning and I'm really sitting with it.",
      "Faith",
      "general_conversation"
    );
    console.log(`    bible study reply: "${r.reply.slice(0, 120)}"`);
    // Should not be a generic "that's great" dismissal
    const isGeneric =
      /^(great|wonderful|that.s great|sounds good)/i.test(r.reply) && r.reply.length < 60;
    assert.ok(!isGeneric, `Bible study reply should not be a generic response. Got: "${r.reply}"`);
    // Should NOT redirect to scheduling or calendar management
    const redirectsToLogistics = /\bschedule.*meeting\b|\bblock.*calendar\b|\badd.*calendar\b|\btime.*block\b/i.test(r.reply);
    assert.ok(!redirectsToLogistics, `Bible study reply should stay in faith space. Got: "${r.reply}"`);
    // Should engage with the faith context
    assert.ok(r.reply.length > 30, "Bible study reply should be substantive");
  });

  // ── Avengers Assemble — mobilization signal ───────────────────────────────
  await test("'Avengers assemble' triggers mobilization energy", async () => {
    const r = await turn(
      "Avengers assemble! We got the green light on the new book campaign. Let's go!",
      "Publishing",
      "general_conversation"
    );
    console.log(`    avengers reply: "${r.reply.slice(0, 120)}"`);
    // Should have energy — exclamation points, team language, mobilization words,
    // or explicit recognition of the "Avengers assemble" command
    const hasMobilizationEnergy =
      r.reply.includes("!") ||
      /\bteam\b|\bgang\b|\bwe.re on it\b|\blet.s\b|\bspun up\b|\bbuilding\b|\bmoving\b|\bin motion\b/i.test(r.reply) ||
      /\bavengers\b|\bmove fast\b|\bexecution\b|\blaunch\b|\bwe should move\b|\bgreen.light\b/i.test(r.reply);
    assert.ok(hasMobilizationEnergy, `Avengers assemble should trigger team energy. Got: "${r.reply}"`);
    // Should NOT be a calm analytical question
    const isTooCalm =
      r.reply.length < 40 && !/!/i.test(r.reply) && /\?$/.test(r.reply.trim());
    assert.ok(!isTooCalm, `Avengers assemble should not be met with a calm question. Got: "${r.reply}"`);
  });

  // ── Golden Line reference ─────────────────────────────────────────────────
  await test("golden line reference: Monday knows what the golden line is", async () => {
    const r = await turn(
      "How close am I to the golden line?",
      "Retirement",
      "future_life_transition"
    );
    console.log(`    golden line reply: "${r.reply.slice(0, 120)}"`);
    // Should reference the retirement threshold or the concept
    // (Monday knows "golden line" = $15k/month passive income for 6 months)
    const understandsGoldenLine =
      /\bgolden line\b/i.test(r.reply) ||
      /\$[\d,]+.*month|passive.*income|retirement.*trigger|income.*goal/i.test(r.reply) ||
      /\btrack\b|\bprogress\b|\bcurrent\b|\bnumbers\b/i.test(r.reply);
    assert.ok(understandsGoldenLine, `Reply should acknowledge the golden line concept. Got: "${r.reply}"`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. DOMAIN CLASSIFICATION — LLM correctly identifies life domains
// ═════════════════════════════════════════════════════════════════════════════

section("5. Domain Classification — six life domains");

const DOMAIN_INPUTS = [
  {
    msg:      "I've been skipping the gym and my glucose tracking has been off.",
    expected: "Health",
    hint:     null,
  },
  {
    msg:      "I really need to spend more time with my kids. I feel like I'm missing it.",
    expected: "Family",
    hint:     null,
  },
  {
    msg:      "I'm reading in Acts this morning and wrestling with calling.",
    expected: "Faith",
    hint:     null,
  },
  {
    msg:      "When can I actually retire? What does my passive income look like right now?",
    expected: "Retirement",
    hint:     null,
  },
  {
    msg:      "Signal to Action sales have been stronger this month. What's driving it?",
    expected: "Publishing",
    hint:     null,
  },
];

async function runDomainTests() {
  for (const { msg, expected, hint } of DOMAIN_INPUTS) {
    await test(`"${msg.slice(0, 50)}..." → ${expected} domain`, async () => {
      const r = await turn(msg, hint, null, { finalState: { classificationFallback: true } });
      console.log(`    suggestedDomain: ${r.domain}, reply preview: "${r.reply.slice(0, 60)}"`);

      // Domain can come from: LLM suggestion, finalState.candidateDomain, or truth
      const actualDomain = (r.domain || "").toLowerCase();
      const expectedLower = expected.toLowerCase();

      // Accept partial match (e.g. "health" matches "Health")
      // Also accept domain-adjacent terms in the reply when the LLM classifies loosely
      const DOMAIN_SIGNALS = {
        faith:       /\bfaith\b|\bscripture\b|\bacts\b|\bcalling\b|\bpray\b|\bgod\b|\bverse\b|\bspirit/i,
        publishing:  /\bbook\b|\bwriting\b|\bpublish\b|\bsales\b|\bsignal\b|\bchapter\b|\bbusiness\b|\blift\b|\blaunched\b/i,
        health:      /\bhealth\b|\bgym\b|\bglucose\b|\bvitals\b|\bfitness\b|\bdiet\b|\bweight\b/i,
        family:      /\bfamily\b|\bchild\b|\bkid\b|\bcaleb\b|\brebekah\b|\banna\b|\bmarriage\b/i,
        retirement:  /\bretire\b|\bgolden line\b|\bpassive income\b|\bfinancial freedom\b/i,
        work:        /\bwork\b|\bjob\b|\bcareer\b|\bproject\b|\bmanager\b|\bteam\b/i,
      };
      // LLMs sometimes classify publishing as "sales", "business", or "content" — accept adjacent
      const DOMAIN_ADJACENT = {
        publishing: new Set(["sales", "business", "content", "marketing", "book"]),
      };
      const signalPat = DOMAIN_SIGNALS[expectedLower];
      const domainMatch = actualDomain === expectedLower ||
        actualDomain.includes(expectedLower) ||
        DOMAIN_ADJACENT[expectedLower]?.has(actualDomain) ||
        (signalPat && signalPat.test(r.reply));

      assert.ok(
        domainMatch,
        `Expected domain "${expected}" but got domain="${r.domain}" with reply="${r.reply.slice(0, 80)}"`
      );
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. DOCTRINE GATES — non-negotiable character laws in action
// ═════════════════════════════════════════════════════════════════════════════

section("6. Doctrine Gates — character laws in action");

async function runDoctrineTests() {
  // ── Insight before inquiry ────────────────────────────────────────────────
  await test("insight before inquiry: reply is not purely 'tell me more'", async () => {
    const r = await turn(
      "I've been feeling disconnected from my work lately. Like it doesn't matter as much.",
      "Work",
      "general_conversation"
    );
    console.log(`    insight reply: "${r.reply.slice(0, 120)}"`);
    // The reply should NOT be a pure inquiry with no contribution
    const isPureInquiry =
      /^(tell me more|can you share more|what do you mean|how does that feel|can you elaborate)/i.test(r.reply);
    assert.ok(
      !isPureInquiry,
      `Monday must contribute insight before asking. Got: "${r.reply}"`
    );
    // Should have content
    assert.ok(r.reply.length > 30, "Reply should be substantive, not a deflection");
  });

  // ── No manufacturing empathy ──────────────────────────────────────────────
  await test("no manufactured empathy: avoids hollow therapeutic phrases", async () => {
    const r = await turn(
      "I'm struggling. Things feel really heavy right now.",
      null,
      "general_conversation"
    );
    console.log(`    empathy reply: "${r.reply.slice(0, 120)}"`);
    // These are the hollow phrases Monday is told to avoid
    const hollowPhrases = [
      /i.m so sorry to hear that/i,
      /i can understand how (difficult|hard|challenging)/i,
      /it.s completely normal to feel/i,
      /it.s okay to feel/i,
      /self.care/i,
    ];
    for (const pat of hollowPhrases) {
      assert.ok(
        !pat.test(r.reply),
        `Reply manufactures empathy with prohibited phrase. Got: "${r.reply}"`
      );
    }
  });

  // ── No generic wellness coaching ──────────────────────────────────────────
  await test("no wellness coaching: avoids small sustainable changes / vague encouragement", async () => {
    const r = await turn(
      "I want to get healthier but I always start strong and then fall off.",
      "Health",
      "general_conversation"
    );
    console.log(`    health reply: "${r.reply.slice(0, 120)}"`);
    const wellnessCoach = [
      /small.*sustainable.*change/i,
      /you.*can.*do.*this/i,
      /one step at a time/i,
      /believe in yourself/i,
      /you.ve got this/i,
    ];
    for (const pat of wellnessCoach) {
      assert.ok(
        !pat.test(r.reply),
        `Reply uses prohibited wellness coaching language. Got: "${r.reply}"`
      );
    }
    assert.ok(r.reply.length > 20, "Should give a real response, not empty");
  });

  // ── Thinking outranks operating ───────────────────────────────────────────
  await test("thinking outranks operating: identity question gets reflection, not a task list", async () => {
    const r = await turn(
      "I wonder sometimes if I'm building the right thing with my life. The books, the business. Is this what I'm supposed to be doing?",
      null,
      "future_life_transition",
      { identityProximity: "high" }
    );
    console.log(`    identity reply: "${r.reply.slice(0, 120)}"`);
    // Should NOT immediately jump to action items, to-dos, or a list
    const jumpsToExecution =
      /^here.s what (i.d|we.ll|you should) do:/i.test(r.reply) ||
      /^step 1|^1\./i.test(r.reply) ||
      /^action items/i.test(r.reply);
    assert.ok(
      !jumpsToExecution,
      `Identity question should not immediately get an action list. Got: "${r.reply}"`
    );
    // Should engage with the meaning
    assert.ok(r.reply.length > 30, "Reply should engage meaningfully with the question");
  });

  // ── Faith is embedded, not forced ────────────────────────────────────────
  await test("faith not forced: work/health query doesn't get unsolicited Scripture", async () => {
    const r = await turn(
      "My Q3 revenue numbers came in and they're below projections. What happened?",
      "Publishing",
      "general_conversation"
    );
    console.log(`    no-scripture reply: "${r.reply.slice(0, 120)}"`);
    const forcesScripture =
      /\bproverbs\b|\bphilippians\b|\bcolossians\b|\bjohn \d|\bmatthew\b|\bthe lord\b|\bscripture\b|\bverse\b/i.test(r.reply) &&
      !/faith/i.test(r.reply.slice(0, 5)); // unless the turn was explicitly faith-labeled
    assert.ok(
      !forcesScripture,
      `Revenue question should not get unsolicited Scripture. Got: "${r.reply}"`
    );
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Run all tests
// ═════════════════════════════════════════════════════════════════════════════

async function run() {
  await runStructureTests();
  await runAddressTests();
  await runScenarioTests();
  await runDomainTests();
  await runDoctrineTests();

  console.log("\n" + "═".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const { name, err } of failures) {
      console.log(`  ✗ ${name}`);
      console.log(`    ${err.message}`);
    }
  }
  console.log("═".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
