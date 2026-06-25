"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { getWorkingTheories, getActiveThreads, getHeartbeatLog } = require("../db/state-store");
const { getDecisions, getContradictions } = require("../db/knowledge-store");
const { listWorkspaces, getWorkspace } = require("../workspace/workspace-store");
const { nextSurfacingItem, getPendingItems } = require("../db/surfacing-store");
const { formatLocalDate, formatLocalTime } = require("../utils/local-time");

const SUBJECT_ORDER = [
  "daily",
  "chris",
  "retirement",
  "family",
  "faith",
  "publishing",
  "work",
  "health",
  "summer-camp",
];

function safeReadMissionDoc(slug, fileName) {
  try {
    const fullPath = path.join(process.cwd(), "data", "missions", slug, fileName);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, "utf8");
  } catch {
    return null;
  }
}

function summarizeMarkdownSection(markdown) {
  if (!markdown) return null;
  return markdown
    .replace(/^#.*$/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\[(.*?)\]/g, "$1")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
}

function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function buildTheoryProp(subjectName, theory, signal = "Working theory") {
  return {
    type: "theory",
    title: `${subjectName} Theory`,
    signal,
    body: theory || "I do not have a durable theory here yet.",
  };
}

function buildTimelineProp(entries = []) {
  return {
    type: "timeline",
    title: "Recent Movement",
    entries,
  };
}

function buildDeliverableProp(title, summary, status = "Ready") {
  return {
    type: "deliverable",
    title,
    status,
    summary,
  };
}

function buildOpportunityProp(title, body, confidence = "Watching") {
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

function getDomainWorkspace(domain) {
  try {
    return getWorkspace(domain.toLowerCase());
  } catch {
    return null;
  }
}

function getTheoryForDomain(domain) {
  const theories = getWorkingTheories();
  return theories[domain]?.text || null;
}

function getThreadsForDomain(domain) {
  return getActiveThreads().filter((thread) => thread.domain === domain);
}

function getDecisionsForDomain(domain, limit = 3) {
  return getDecisions({ domain, limit });
}

function getContradictionsForDomain(domain) {
  return getContradictions({ domain, status: "active" });
}

function mapTimelineFromThreads(threads = [], fallback = []) {
  const entries = threads
    .slice(0, 4)
    .map((thread) => ({
      label: thread.title || thread.id,
      meta: formatLocalDate(thread.updatedAt, {
        month: "short",
        day: "numeric",
      }) || "Recent",
      note: thread.significance ? `${thread.significance} significance` : "Active",
    }));
  return entries.length > 0 ? entries : fallback;
}

function buildRetirementSubject() {
  const theory =
    getTheoryForDomain("Retirement") ||
    getDomainWorkspace("retirement")?.memory?.workingTheory ||
    "Retirement appears to be behaving less like a financial problem and more like a question about identity, freedom, and what remains after obligation changes shape.";
  const threads = getThreadsForDomain("Retirement");
  const missionBrief = summarizeMarkdownSection(
    safeReadMissionDoc("retirement-planning-t8qk", "mission-brief.md")
  );

  return {
    id: "retirement",
    name: "Retirement",
    domain: "Retirement",
    state: "active",
    summary: "Identity, freedom, and what life should feel like after work stops being the center.",
    sequence: [
      {
        eyebrow: "Monday Found",
        title: "I found something in Retirement.",
        body: "This is no longer reading like a timing question. It is reading like a life-shape question.",
        prop: buildTheoryProp("Retirement", theory, "Shift detected"),
      },
      {
        eyebrow: "Pattern",
        title: "The signal has tightened.",
        body: "Work, freedom, and identity keep showing up together. That usually means the real issue is not whether you stop working. It is what work has been carrying for you.",
        prop: buildTimelineProp(
          mapTimelineFromThreads(threads, [
            { label: "Identity after work", meta: "Recent", note: "High significance thread" },
            { label: "Freedom language increasing", meta: "Observed", note: "Financial language receding" },
            { label: "Building still matters", meta: "Ongoing", note: "Creation remains alive" },
          ])
        ),
      },
      {
        eyebrow: "Supporting Brief",
        title: "I pulled one brief worth reading.",
        body: "Before treating this as a retirement decision, name the parts of work you want freedom from and the parts you still want to keep.",
        prop: buildDeliverableProp(
          "Retirement Reframe",
          missionBrief ||
            "A short strategic brief framing retirement as a redesign of role, responsibility, and identity rather than a binary stop-working event."
        ),
      },
    ],
  };
}

function buildFamilySubject() {
  const theory =
    getTheoryForDomain("Family") ||
    getDomainWorkspace("family")?.memory?.workingTheory ||
    "Family matters most in stated priority, but work is still winning the competition for attention.";

  return {
    id: "family",
    name: "Family",
    domain: "Family",
    state: "active",
    summary: "Presence, attention, and whether the people who matter most are getting more than logistics.",
    sequence: [
      {
        eyebrow: "Monday Found",
        title: "I found a tension in Family.",
        body: "Nothing here reads like indifference. It reads like importance that is being outrun.",
        prop: buildTheoryProp("Family", theory, "Attention mismatch"),
      },
      {
        eyebrow: "Contradiction",
        title: "The contradiction is clear enough to name.",
        body: "Family keeps winning the competition for importance. Work keeps winning the competition for time.",
        prop: buildContradictionProp(
          "Importance vs Attention",
          "Family matters most.",
          "Work expands until family mostly receives what remains."
        ),
      },
      {
        eyebrow: "Opportunity",
        title: "This is still recoverable.",
        body: "The next move is not a guilt response. It is one intentional block of real attention placed where logistics have been doing too much of the relationship's work.",
        prop: buildOpportunityProp(
          "Reclaim Presence",
          "Use one protected block this week for direct, relational family time instead of catching up through logistics.",
          "High"
        ),
      },
    ],
  };
}

function buildPublishingSubject() {
  const theory =
    getTheoryForDomain("Publishing") ||
    getDomainWorkspace("publishing")?.memory?.workingTheory ||
    "The writing thread appears to be exposing more than output. It is touching identity, fear, and whether the work still feels alive.";
  const contradictions = getContradictionsForDomain("publishing");
  const decisions = getDecisionsForDomain("publishing");

  return {
    id: "publishing",
    name: "Publishing",
    domain: "Publishing",
    state: "active",
    summary: "Writing, significance, and whether the work can be approached honestly again.",
    sequence: [
      {
        eyebrow: "Monday Found",
        title: "I found something in Publishing.",
        body: "The problem does not look like discipline. It looks like meaning and identity getting tangled together.",
        prop: buildTheoryProp("Publishing", theory, "Meaning pressure"),
      },
      {
        eyebrow: "Contradiction",
        title: "One contradiction is already in the system.",
        body: "The desire to write is still present. The approach path keeps collapsing under email, avoidance, or pressure.",
        prop: buildContradictionProp(
          contradictions[0]?.declaredValue || "Write consistently.",
          contradictions[0]?.declaredValue || "Commit to meaningful writing time.",
          contradictions[0]?.observedPattern || "Execution keeps dissolving into lower-friction work."
        ),
      },
      {
        eyebrow: "Supporting Deliverable",
        title: "There is one supporting move ready now.",
        body: "Reset the frame before expanding the plan. The meaningful question is not output volume. It is whether the work still feels like it is going somewhere that matters.",
        prop: buildDeliverableProp(
          decisions[0]?.title || "Publishing Reset",
          decisions[0]?.reason ||
            "A supporting note to help Monday frame the next publishing move around significance and truthful re-approach instead of pure production."
        ),
      },
    ],
  };
}

function buildStaticSubject(id, name, domain, summary, state = "watched") {
  return {
    id,
    name,
    domain,
    state,
    summary,
    sequence: [
      {
        eyebrow: "Subject",
        title: name,
        body: summary,
        prop: null,
      },
    ],
  };
}

function buildHomeSequence(subjects, pendingSurfacing) {
  const retirement = subjects.find((subject) => subject.id === "retirement");
  const family = subjects.find((subject) => subject.id === "family");
  const publishing = subjects.find((subject) => subject.id === "publishing");

  return [
    {
      eyebrow: "Daily Briefing",
      title: "I've been working while you were away.",
      body: pendingSurfacing
        ? "Three things deserve your attention. One of them was already ripe enough that the background systems tried to surface it."
        : "Three things deserve your attention.",
      prop: null,
    },
    {
      eyebrow: "First",
      title: "Retirement is shifting.",
      body: "The center of gravity has moved away from money and toward identity, freedom, and what life is for after work stops carrying so much.",
      prop: retirement?.sequence?.[0]?.prop || null,
      subjectId: "retirement",
    },
    {
      eyebrow: "Second",
      title: "Family is asking for intention.",
      body: "This does not read like a relationship crisis. It reads like importance and attention drifting apart long enough to matter.",
      prop: family?.sequence?.[1]?.prop || family?.sequence?.[0]?.prop || null,
      subjectId: "family",
    },
    {
      eyebrow: "Third",
      title: "Publishing still has heat in it.",
      body: "The writing signal is not dead. It is burdened. That is a different problem, and it means the right response is clarity before pressure.",
      prop: publishing?.sequence?.[2]?.prop || publishing?.sequence?.[0]?.prop || null,
      subjectId: "publishing",
    },
  ];
}

function buildPresenterState() {
  const now = new Date();
  const pendingSurfacing = nextSurfacingItem();
  const pendingCount = getPendingItems().length;
  const workspaces = listWorkspaces({ status: "active" });
  const heartbeat = getHeartbeatLog({ limit: 1 })[0] || null;

  const subjects = [
    buildStaticSubject(
      "chris",
      "Chris",
      "Personal",
      "The central subject. Daily clarity, alignment, and what life is becoming."
    ),
    buildRetirementSubject(),
    buildFamilySubject(),
    buildStaticSubject(
      "faith",
      "Faith",
      "Faith",
      getTheoryForDomain("Faith") ||
        getDomainWorkspace("faith")?.memory?.workingTheory ||
        "Faith is quieter than it should be, which usually means something meaningful is waiting on the other side of stillness."
    ),
    buildPublishingSubject(),
    buildStaticSubject(
      "work",
      "Work",
      "Work",
      getTheoryForDomain("Work") ||
        getDomainWorkspace("work")?.memory?.workingTheory ||
        "Work appears to be carrying more than output. It may be doing identity and refuge work too."
    ),
    buildStaticSubject(
      "health",
      "Health",
      "Health",
      getTheoryForDomain("Health") ||
        getDomainWorkspace("health")?.memory?.workingTheory ||
        "Health is a watched domain right now. There is not enough strong runtime evidence yet to make it the lead signal this morning."
    ),
    buildStaticSubject(
      "summer-camp",
      "Summer Camp",
      "Family",
      "A bounded family mission where readiness is high and transportation remains the primary operational variable.",
      "active"
    ),
  ];

  const orderedSubjects = SUBJECT_ORDER
    .map((id) => subjects.find((subject) => subject.id === id))
    .filter(Boolean);

  return {
    generatedAt: now.toISOString(),
    greeting: `${greetingForHour(now.getHours())}, Chris.`,
    subheading: `Local time ${formatLocalTime(now.toISOString(), {
      hour: "numeric",
      minute: "2-digit",
    })}. Monday has ${workspaces.length} active domains in view${pendingCount ? ` and ${pendingCount} queued signal${pendingCount === 1 ? "" : "s"}` : ""}.`,
    runtime: {
      source: pendingSurfacing ? "runtime+demo" : "runtime-guided-demo",
      pendingSurfacing: pendingSurfacing
        ? {
            domain: pendingSurfacing.domain,
            payload: pendingSurfacing.payload,
            priority: pendingSurfacing.priority,
          }
        : null,
      lastHeartbeatAt: heartbeat?.at || null,
    },
    navigation: orderedSubjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      domain: subject.domain,
      state: subject.state,
    })),
    home: {
      id: "daily",
      name: "Monday Daily",
      sequence: buildHomeSequence(orderedSubjects, pendingSurfacing),
    },
    subjects: orderedSubjects.reduce((acc, subject) => {
      if (subject.id !== "daily") acc[subject.id] = subject;
      return acc;
    }, {}),
  };
}

module.exports = {
  buildPresenterState,
};
