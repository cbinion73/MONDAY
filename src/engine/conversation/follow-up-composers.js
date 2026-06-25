"use strict";

const { summarizeText } = require("./conversation-state");

const BANNED_THERAPY_PHRASES = [
  /\btell me more\b/i,
  /\bcan you share more\b/i,
  /\bcan you elaborate\b/i,
  /\bexplore\b/i,
  /\breflect on\b/i,
  /\bhow does that make you feel\b/i,
];

function normalizeText(value) {
  return summarizeText(value || "");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLead(text) {
  return String(text || "")
    .trim()
    .replace(/^(my guess is|i think|one possibility is|it sounds like|the pattern i think i'm seeing is|i may be wrong, but)\s*[:,-]?\s*/i, "")
    .trim();
}

function stripSubjectEcho(subjectName, text) {
  if (!subjectName || !text) return text;
  const subjectPattern = new RegExp(
    `^${escapeRegExp(subjectName)}\\s+(?:appears to be|is really about|is more about|is about|is|looks like|has become|keeps becoming|keeps behaving like|behaves like|has shifted toward|is shifting toward|appears to be shifting toward|has kept tightening around|kept tightening around|is behaving less like|has stopped behaving like|is no longer reading like)\\s+`,
    "i"
  );
  return String(text || "").replace(subjectPattern, "");
}

function toFragment(text, subjectName = "") {
  const cleaned = stripSubjectEcho(
    subjectName,
    stripLead(normalizeText(text)).replace(/^[:\-\s]+/, "")
  );
  if (!cleaned) return "";
  const normalized = cleaned.endsWith(".") ? cleaned.slice(0, -1) : cleaned;
  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function toSentence(text, subjectName = "") {
  const fragment = toFragment(text, subjectName);
  if (!fragment) return "";
  const sentence = fragment.charAt(0).toUpperCase() + fragment.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function firstMeaningful(items = []) {
  for (const item of items) {
    const value = normalizeText(item);
    if (value) return value;
  }
  return "";
}

function significanceSentence(fragment, fallback) {
  if (!fragment) return fallback;
  return `It matters because the real issue is ${fragment}.`;
}

function titleizeSubject(subject) {
  return subject?.name || "This";
}

function buildTheoryProp(subject, body, signal = "Updated read") {
  return {
    type: "theory",
    title: `${titleizeSubject(subject)} Theory`,
    signal,
    body,
  };
}

function buildDeliverableProp(subject, summary, status = "Ready") {
  return {
    type: "deliverable",
    title: `${titleizeSubject(subject)} Next Move`,
    status,
    summary,
  };
}

function buildOpportunityProp(title, body, confidence = "High") {
  return {
    type: "opportunity",
    title,
    confidence,
    body,
  };
}

function buildContradictionProp(title, declared, observed) {
  return {
    type: "contradiction",
    title,
    declared,
    observed,
  };
}

function extractConversationInputs(subject, conversation = {}) {
  const subjectName = titleizeSubject(subject);
  return {
    subjectName,
    previous: firstMeaningful([
      conversation.previousThought,
      conversation.previousHypothesis,
      subject?.summary,
      conversation.currentConversationSummary,
    ]),
    current: firstMeaningful([
      conversation.currentThought,
      conversation.currentConversationSummary,
      conversation.currentHypothesis,
    ]),
    evidence: firstMeaningful([
      conversation.latestWorkforceSignal?.payload,
      conversation.currentThought !== conversation.currentHypothesis
        ? conversation.currentThought
        : "",
      conversation.currentConversationSummary,
    ]),
    recommendation: normalizeText(conversation.currentRecommendation),
  };
}

function looksLiteralSeed(text) {
  return /\b(reading like|timing question|life-shape question)\b/i.test(String(text || ""));
}

const DOMAIN_VOICE_PACKS = {
  retirement: {
    theory(subject, conversation) {
      const { previous, current, evidence } = extractConversationInputs(subject, conversation);
      const previousSentence = previous
        ? /\b(timing|money|date|financial)\b/i.test(previous) && !looksLiteralSeed(previous)
          ? `Earlier, I was treating ${titleizeSubject(subject)} more like ${toFragment(previous, subject.name)}.`
          : `Earlier, I was treating ${titleizeSubject(subject)} like a timing and money question.`
        : `Earlier, I was treating ${titleizeSubject(subject)} like a timing and money question.`;
      const changeSentence = evidence
        ? `What changed is that the newer pattern kept pulling toward ${toFragment(evidence, subject.name)} instead of toward dates or numbers.`
        : `What changed is that the newer pattern stopped behaving like a countdown and started behaving like a role redesign.`;
      const currentSentence = current
        ? `My read now is that ${titleizeSubject(subject)} is really about ${toFragment(current, subject.name)}.`
        : `My read now is that ${titleizeSubject(subject)} is less about stopping work and more about redesigning responsibility.`;
      const mattersSentence =
        "That points us toward a redesign decision, not a retirement date.";
      return {
        reply: [previousSentence, changeSentence, currentSentence, mattersSentence].join(" "),
        revisedThought:
          currentSentence.replace(/^My read now is that\s*/i, "").replace(/\.$/, ""),
        prop: buildTheoryProp(
          subject,
          current
            ? toSentence(current, subject.name)
            : "Retirement is behaving more like a responsibility redesign than a timing decision.",
          "Updated read"
        ),
      };
    },
    why(subject, conversation) {
      const { current } = extractConversationInputs(subject, conversation);
      return {
        reply: [
          significanceSentence(
            toFragment(current, subject.name),
            "It matters because the real question is no longer retirement timing."
          ),
          "The contradiction is that you still want to build, but you do not want work carrying this much responsibility.",
          "If we call this retirement, you will solve it with dates and spreadsheets.",
          "If we call it a redesign of responsibility, a cleaner path to freedom becomes possible.",
        ].join(" "),
        prop: buildContradictionProp(
          "Retirement Naming Tension",
          "Solve retirement as a date-and-money problem.",
          "The live issue is responsibility, identity, and what work is allowed to keep carrying."
        ),
      };
    },
    recommendation(subject, conversation) {
      const currentRecommendation = normalizeText(conversation.currentRecommendation);
      const recommendation =
        currentRecommendation ||
        "I would separate the responsibilities you want to lay down from the work you still want to keep.";
      return {
        recommendation,
        reply: [
          recommendation,
          "The reason is that those are tangled together right now, and that tangle is making the whole decision feel larger than it is.",
          "Next action: make two short lists and mark the first responsibility you could redesign this month.",
          "Do not set a retirement date yet.",
        ].join(" "),
        prop: buildDeliverableProp(
          subject,
          "Two lists: what responsibility to lay down, and what creation to preserve. Circle the first responsibility to redesign before making a retirement decision."
        ),
      };
    },
  },
  family: {
    theory(subject, conversation) {
      const { previous, current, evidence } = extractConversationInputs(subject, conversation);
      return {
        reply: [
          previous
            ? `Earlier, I was reading ${titleizeSubject(subject)} more like ${toFragment(previous, subject.name)}.`
            : `Earlier, I was reading ${titleizeSubject(subject)} more like a scheduling problem.`,
          evidence
            ? `What changed is that the newer pattern keeps pointing to ${toFragment(evidence, subject.name)}.`
            : "What changed is that the issue keeps surfacing around attention, not logistics.",
          current
            ? `My read now is that ${titleizeSubject(subject)} is more about ${toFragment(current, subject.name)}.`
            : `My read now is that ${titleizeSubject(subject)} is really about attention and presence before it becomes a larger relationship problem.`,
          "That means the real risk is not busyness by itself. It is importance and attention drifting apart long enough to matter.",
        ].join(" "),
        revisedThought:
          current || "Family is signaling an attention problem before it becomes a deeper relationship problem.",
        prop: buildTheoryProp(
          subject,
          current
            ? toSentence(current, subject.name)
            : "Family is asking for protected attention, not just cleaner logistics.",
          "Attention mismatch"
        ),
      };
    },
    why(subject, conversation) {
      const { current } = extractConversationInputs(subject, conversation);
      return {
        reply: [
          significanceSentence(
            toFragment(current, subject.name),
            "It matters because families rarely drift all at once. They thin out through repeated partial attention."
          ),
          "The contradiction is that family can remain highest in importance while still receiving what work leaves behind.",
          "If you address it early, this becomes recoverable through intention.",
          "If you ignore it, logistics keep impersonating presence.",
        ].join(" "),
        prop: buildContradictionProp(
          "Importance vs Attention",
          "Family matters most.",
          "Work and logistics keep consuming the best attention."
        ),
      };
    },
    recommendation(subject, conversation) {
      const recommendation =
        normalizeText(conversation.currentRecommendation) ||
        "I would protect one block of undivided attention for the relationship that feels thinnest right now.";
      return {
        recommendation,
        reply: [
          recommendation,
          "The reason is that one real block of presence will tell you more than another week of vague intention.",
          "Next action: put that block on the calendar now and decide who it is for.",
          "Do not turn it into a family optimization project.",
        ].join(" "),
        prop: buildOpportunityProp(
          "Reclaim Presence",
          "Choose one person, one block of real attention, and protect it before work fills the space again.",
          "High"
        ),
      };
    },
  },
  faith: {
    theory(subject, conversation) {
      const { previous, current, evidence } = extractConversationInputs(subject, conversation);
      return {
        reply: [
          previous
            ? `Earlier, I was reading ${titleizeSubject(subject)} more like ${toFragment(previous, subject.name)}.`
            : `Earlier, I was reading ${titleizeSubject(subject)} more like a discipline problem.`,
          evidence
            ? `What changed is that the newer pattern keeps pointing to ${toFragment(evidence, subject.name)}.`
            : "What changed is that the friction seems to be around stillness, not effort alone.",
          current
            ? `My read now is that ${titleizeSubject(subject)} is more about ${toFragment(current, subject.name)}.`
            : `My read now is that ${titleizeSubject(subject)} may be catching whatever has become expensive to meet in quiet.`,
          "That makes this a presence problem before it becomes a practice problem.",
        ].join(" "),
        revisedThought:
          current || "Faith is behaving less like a discipline failure and more like a stillness problem.",
        prop: buildTheoryProp(
          subject,
          current
            ? toSentence(current, subject.name)
            : "Faith is quieter because stillness is carrying more weight than it first appeared to.",
          "Deepening read"
        ),
      };
    },
    why(subject, conversation) {
      const { current } = extractConversationInputs(subject, conversation);
      return {
        reply: [
          significanceSentence(
            toFragment(current, subject.name),
            "It matters because if the real issue is avoidance, more discipline language will miss the point."
          ),
          "The contradiction is that faith can still matter deeply while quiet keeps feeling expensive.",
          "If you address the real tension, prayer becomes approachable again.",
          "If you ignore it, you may keep blaming practice for something that actually lives underneath it.",
        ].join(" "),
        prop: buildContradictionProp(
          "Faith Practice vs Presence",
          "Prayer and faith still matter.",
          "Quiet has become harder to enter, so practice keeps thinning."
        ),
      };
    },
    recommendation(subject, conversation) {
      const recommendation =
        normalizeText(conversation.currentRecommendation) ||
        "I would create one short, honest block of quiet without trying to solve the whole season.";
      return {
        recommendation,
        reply: [
          recommendation,
          "The reason is that you need a truthful re-entry point more than a bigger spiritual plan.",
          "Next action: take ten quiet minutes and write down what silence is making expensive.",
          "Do not turn this into a guilt exercise.",
        ].join(" "),
        prop: buildDeliverableProp(
          subject,
          "Create one short, honest return to quiet. Let it reveal what has become expensive before you widen the practice."
        ),
      };
    },
  },
  publishing: {
    theory(subject, conversation) {
      const { previous, current, evidence } = extractConversationInputs(subject, conversation);
      return {
        reply: [
          previous
            ? `Earlier, I was reading ${titleizeSubject(subject)} more like ${toFragment(previous, subject.name)}.`
            : `Earlier, I was reading ${titleizeSubject(subject)} more like an output problem.`,
          evidence
            ? `What changed is that the newer pattern keeps pointing to ${toFragment(evidence, subject.name)}.`
            : "What changed is that the thread keeps behaving like meaning pressure, not simple inconsistency.",
          current
            ? `My read now is that ${titleizeSubject(subject)} is more about ${toFragment(current, subject.name)}.`
            : `My read now is that ${titleizeSubject(subject)} is tangled up with identity and what the work is allowed to mean.`,
          "That makes clarity the first need, not acceleration.",
        ].join(" "),
        revisedThought:
          current || "Publishing is behaving more like a significance problem than a production problem.",
        prop: buildTheoryProp(
          subject,
          current
            ? toSentence(current, subject.name)
            : "Publishing is carrying meaning pressure, not just output pressure.",
          "Meaning pressure"
        ),
      };
    },
    why(subject, conversation) {
      const { current } = extractConversationInputs(subject, conversation);
      return {
        reply: [
          significanceSentence(
            toFragment(current, subject.name),
            "It matters because if you treat this like discipline alone, you will push harder against the wrong resistance."
          ),
          "The contradiction is that the desire to write can still be alive while the approach path keeps collapsing.",
          "If you name the significance clearly, the work becomes approachable again.",
          "If you ignore it, unfinished work keeps turning into identity pressure.",
        ].join(" "),
        prop: buildContradictionProp(
          "Meaning vs Output",
          "The work still matters and should move.",
          "Approaching it keeps triggering pressure, avoidance, or self-judgment."
        ),
      };
    },
    recommendation(subject, conversation) {
      const recommendation =
        normalizeText(conversation.currentRecommendation) ||
        "I would reset the frame before trying to increase output.";
      return {
        recommendation,
        reply: [
          recommendation,
          "The reason is that pressure is already outrunning meaning.",
          "Next action: write one page on what this work still means and what you are afraid it might prove.",
          "Do not start with a production target.",
        ].join(" "),
        prop: buildDeliverableProp(
          subject,
          "Reset the publishing frame first: what the work still means, what it might expose, and what honest re-approach would look like."
        ),
      };
    },
  },
  health: {
    theory(subject, conversation) {
      const { previous, current, evidence } = extractConversationInputs(subject, conversation);
      return {
        reply: [
          previous
            ? `Earlier, I was reading ${titleizeSubject(subject)} more like ${toFragment(previous, subject.name)}.`
            : `Earlier, I was reading ${titleizeSubject(subject)} more like a motivation problem.`,
          evidence
            ? `What changed is that the newer pattern keeps pointing to ${toFragment(evidence, subject.name)}.`
            : "What changed is that the pattern looks more like scope and sustainability than motivation.",
          current
            ? `My read now is that ${titleizeSubject(subject)} is more about ${toFragment(current, subject.name)}.`
            : `My read now is that ${titleizeSubject(subject)} needs a smaller, more repeatable shape.`,
          "That means consistency matters more than intensity right now.",
        ].join(" "),
        revisedThought:
          current || "Health needs a sustainable shape, not a dramatic restart.",
        prop: buildTheoryProp(
          subject,
          current
            ? toSentence(current, subject.name)
            : "Health is asking for sustainable repetition rather than a total redesign.",
          "Sustainability read"
        ),
      };
    },
    why(subject, conversation) {
      const { current } = extractConversationInputs(subject, conversation);
      return {
        reply: [
          significanceSentence(
            toFragment(current, subject.name),
            "It matters because a health plan can fail even when intention is sincere."
          ),
          "The contradiction is that strong ambition can keep sabotaging repeatable action.",
          "If you address the scope problem, momentum becomes easier to keep.",
          "If you ignore it, each restart becomes proof against yourself instead of against the plan.",
        ].join(" "),
        prop: buildContradictionProp(
          "Ambition vs Sustainability",
          "Health change should matter enough to move.",
          "Each attempt keeps widening until consistency collapses."
        ),
      };
    },
    recommendation(subject, conversation) {
      const recommendation =
        normalizeText(conversation.currentRecommendation) ||
        "I would choose one repeatable health move and make it boringly consistent before adding anything else.";
      return {
        recommendation,
        reply: [
          recommendation,
          "The reason is that health improves faster through continuity than through dramatic resets.",
          "Next action: pick the single habit you can repeat daily this week and track only that.",
          "Do not redesign your whole life in one pass.",
        ].join(" "),
        prop: buildDeliverableProp(
          subject,
          "Choose one repeatable habit, lock it in for a week, and let continuity beat intensity."
        ),
      };
    },
  },
  work: {
    theory(subject, conversation) {
      const { previous, current, evidence } = extractConversationInputs(subject, conversation);
      return {
        reply: [
          previous
            ? `Earlier, I was reading ${titleizeSubject(subject)} more like ${toFragment(previous, subject.name)}.`
            : `Earlier, I was reading ${titleizeSubject(subject)} more like a workload problem.`,
          evidence
            ? `What changed is that the newer pattern keeps pointing to ${toFragment(evidence, subject.name)}.`
            : "What changed is that work keeps showing up as more than output.",
          current
            ? `My read now is that ${titleizeSubject(subject)} is more about ${toFragment(current, subject.name)}.`
            : `My read now is that work may be carrying identity, structure, and refuge at the same time.`,
          "That makes this a design question, not just a productivity question.",
        ].join(" "),
        revisedThought:
          current || "Work is carrying more than output right now.",
        prop: buildTheoryProp(
          subject,
          current
            ? toSentence(current, subject.name)
            : "Work is carrying identity and refuge, not just output.",
          "Load-bearing read"
        ),
      };
    },
    why(subject, conversation) {
      const { current } = extractConversationInputs(subject, conversation);
      return {
        reply: [
          significanceSentence(
            toFragment(current, subject.name),
            "It matters because if work is doing multiple jobs, you cannot redesign it honestly by looking at hours alone."
          ),
          "The contradiction is that work may be producing value while also quietly keeping other questions at bay.",
          "If you address that directly, work can become cleaner and more intentional.",
          "If you ignore it, overload keeps masquerading as necessity.",
        ].join(" "),
        prop: buildContradictionProp(
          "Output vs Refuge",
          "Work should serve contribution and stewardship.",
          "Work may also be serving identity, structure, and avoidance."
        ),
      };
    },
    recommendation(subject, conversation) {
      const recommendation =
        normalizeText(conversation.currentRecommendation) ||
        "I would identify the one responsibility in work that feels heaviest and decide whether to redesign, delegate, or stop it.";
      return {
        recommendation,
        reply: [
          recommendation,
          "The reason is that vague overload stays abstract until one burden gets named clearly.",
          "Next action: pick the heaviest recurring responsibility and decide its fate this week.",
          "Do not try to fix all of work in one conversation.",
        ].join(" "),
        prop: buildDeliverableProp(
          subject,
          "Choose the heaviest recurring responsibility, then redesign, delegate, or stop it before you widen the conversation."
        ),
      };
    },
  },
};

function genericTheory(subject, conversation) {
  const { previous, current, evidence } = extractConversationInputs(subject, conversation);
  return {
    reply: [
      previous
        ? `Earlier, I was reading ${titleizeSubject(subject)} more like ${toFragment(previous, subject.name)}.`
        : `Earlier, I was reading ${titleizeSubject(subject)} more simply than this.`,
      evidence
        ? `What changed is that the newer pattern keeps pointing to ${toFragment(evidence, subject.name)}.`
        : "What changed is that the newer pattern no longer fits the earlier label cleanly.",
      current
        ? `My read now is that ${titleizeSubject(subject)} is more about ${toFragment(current, subject.name)}.`
        : `My read now is that ${titleizeSubject(subject)} has become a deeper question than it first appeared to be.`,
      "That matters because naming the wrong problem nearly always produces the wrong next move.",
    ].join(" "),
    revisedThought: current || `The read on ${titleizeSubject(subject)} has deepened.`,
    prop: buildTheoryProp(
      subject,
      current
        ? toSentence(current, subject.name)
        : `${titleizeSubject(subject)} is asking for a deeper read than the first label allowed.`,
      "Updated read"
    ),
  };
}

function genericWhy(subject, conversation) {
  const { current } = extractConversationInputs(subject, conversation);
  return {
    reply: [
      significanceSentence(
        toFragment(current, subject.name),
        `It matters because ${titleizeSubject(subject)} is no longer the simple version of the problem.`
      ),
      "There is usually a contradiction hiding underneath a subject that keeps resurfacing.",
      "If we name it accurately, the next move gets clearer.",
      "If we do not, we will keep solving around the edges.",
    ].join(" "),
    prop: buildTheoryProp(
      subject,
      current
        ? toSentence(current)
        : `${titleizeSubject(subject)} deserves a more accurate read before action.`,
      "Why it matters"
    ),
  };
}

function genericRecommendation(subject, conversation) {
  const recommendation =
    normalizeText(conversation.currentRecommendation) ||
    "I would name the live tension clearly before widening the plan.";
  return {
    recommendation,
    reply: [
      recommendation,
      "The reason is that precision now will save force later.",
      "Next action: write down the one tension that keeps resurfacing and decide what honest step would reduce it.",
    ].join(" "),
    prop: buildDeliverableProp(
      subject,
      "Name the live tension clearly, then choose the next honest step instead of forcing a full solution."
    ),
  };
}

function getDomainVoicePack(subject) {
  return DOMAIN_VOICE_PACKS[String(subject?.id || "").toLowerCase()] || null;
}

function composeTheoryDelta({ subject, conversation }) {
  const pack = getDomainVoicePack(subject);
  const composed = pack?.theory ? pack.theory(subject, conversation) : genericTheory(subject, conversation);
  return sanitizeComposed(composed);
}

function composeWhyItMatters({ subject, conversation }) {
  const pack = getDomainVoicePack(subject);
  const composed = pack?.why ? pack.why(subject, conversation) : genericWhy(subject, conversation);
  return sanitizeComposed(composed);
}

function composeRecommendation({ subject, conversation }) {
  const pack = getDomainVoicePack(subject);
  const composed = pack?.recommendation
    ? pack.recommendation(subject, conversation)
    : genericRecommendation(subject, conversation);
  return sanitizeComposed(composed);
}

function sanitizeComposed(composed) {
  const next = { ...composed };
  if (next.reply) next.reply = normalizeText(next.reply);
  if (next.recommendation) next.recommendation = normalizeText(next.recommendation);
  if (next.revisedThought) next.revisedThought = normalizeText(next.revisedThought);
  return next;
}

function containsTherapyPhrase(text) {
  return BANNED_THERAPY_PHRASES.some((pattern) => pattern.test(String(text || "")));
}

module.exports = {
  BANNED_THERAPY_PHRASES,
  containsTherapyPhrase,
  composeTheoryDelta,
  composeWhyItMatters,
  composeRecommendation,
  getDomainVoicePack,
};
