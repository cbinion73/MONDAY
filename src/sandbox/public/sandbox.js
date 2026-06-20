const state = {
  sessionId: createSessionId(),
  contextName: "general",
  context: {},
  lastReplyText: "",
  recognition: null,
  pendingReplyEl: null,
  review: null,
  learning: null,
  canonicalEval: null,
  usefulnessEval: null,
};

const API_BASE = `${window.location.protocol}//${window.location.host}`;

const presetContexts = {
  general: {},
  "summer-camp": {
    activeMission: "Summer Camp",
    threadKey: "summer-camp",
  },
  "wounded-significance": {
    activeMission: "Book",
    threadKey: "wounded-significance",
  },
};

const elements = {
  messages: document.getElementById("messages"),
  workspace: document.getElementById("workspace"),
  engineState: document.getElementById("engineState"),
  composer: document.getElementById("composer"),
  input: document.getElementById("input"),
  contextSelect: document.getElementById("contextSelect"),
  toggleInspector: document.getElementById("toggleInspector"),
  inspector: document.getElementById("inspector"),
  micButton: document.getElementById("micButton"),
  pttButton: document.getElementById("pttButton"),
  speakButton: document.getElementById("speakButton"),
  statusRoute: document.getElementById("statusRoute"),
  statusIntelligence: document.getElementById("statusIntelligence"),
  statusTts: document.getElementById("statusTts"),
  statusVoice: document.getElementById("statusVoice"),
  learningSummary: document.getElementById("learningSummary"),
  learningDecision: document.getElementById("learningDecision"),
  learningExamples: document.getElementById("learningExamples"),
  learningRecoveries: document.getElementById("learningRecoveries"),
  learningState: document.getElementById("learningState"),
  reviewList: document.getElementById("reviewList"),
  reviewSummary: document.getElementById("reviewSummary"),
  refreshReview: document.getElementById("refreshReview"),
  exportTranscript: document.getElementById("exportTranscript"),
  exportFieldNotes: document.getElementById("exportFieldNotes"),
  dailyBriefButton: document.getElementById("dailyBriefButton"),
  missionsButton: document.getElementById("missionsButton"),
  calendarButton: document.getElementById("calendarButton"),
  documentsButton: document.getElementById("documentsButton"),
  emailButton: document.getElementById("emailButton"),
  financesButton: document.getElementById("financesButton"),
  canonicalEvalButton: document.getElementById("canonicalEvalButton"),
  runCanonicalEval: document.getElementById("runCanonicalEval"),
  canonicalEvalSummary: document.getElementById("canonicalEvalSummary"),
  canonicalEvalList: document.getElementById("canonicalEvalList"),
  runUsefulnessEval: document.getElementById("runUsefulnessEval"),
  usefulnessEvalSummary: document.getElementById("usefulnessEvalSummary"),
  usefulnessEvalList: document.getElementById("usefulnessEvalList"),
};

const FAILURE_TAGS = [
  "Ontology Failure",
  "Posture Failure",
  "Continuity Failure",
  "Voice Failure",
  "Contract Failure",
  "Workspace Failure",
  "Positive Surprise",
];

function createSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }

  return `monday-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function addMessage(text, who) {
  const div = document.createElement("div");
  div.className = `message ${who}`;
  div.textContent = text;
  elements.messages.appendChild(div);
  elements.messages.scrollTop = elements.messages.scrollHeight;
  return div;
}

function setComposerBusy(isBusy) {
  const buttons = elements.composer.querySelectorAll("button");
  for (const button of buttons) {
    if (button.id === "toggleInspector") continue;
    button.disabled = isBusy || (button.id === "speakButton" && !state.lastReplyText);
  }
  elements.input.disabled = isBusy;
  elements.input.placeholder = isBusy ? "Monday is thinking..." : "Talk to Monday...";
}

function addPendingReply() {
  const div = addMessage("Monday is thinking...", "monday");
  div.classList.add("pending");
  state.pendingReplyEl = div;
}

function clearPendingReply() {
  if (state.pendingReplyEl?.parentNode) {
    state.pendingReplyEl.parentNode.removeChild(state.pendingReplyEl);
  }
  state.pendingReplyEl = null;
}

function renderWorkspace(result) {
  const workspace = result.workspace;
  elements.workspace.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "workspace-card";
  summary.innerHTML = `
    <h3>${workspace.workspaceMode}</h3>
    <div class="workspace-meta">Support intent: ${workspace.supportIntent}</div>
    <div class="workspace-meta">Answer required first: ${workspace.answerRequiredFirst}</div>
  `;
  elements.workspace.appendChild(summary);

  for (const section of workspace.sections) {
    const card = document.createElement("div");
    card.className = "workspace-card";
    card.innerHTML = `
      <h3>${section.key}</h3>
      <div class="workspace-meta">${section.purpose}</div>
      <div>${section.summary}</div>
    `;
    elements.workspace.appendChild(card);
  }

  if (result.capture) {
    const missionLabel = result.capture.missionId
      ? capitalizeLabel(result.capture.missionId)
      : "Unassigned";
    const captureCard = document.createElement("div");
    captureCard.className = "workspace-card";
    captureCard.innerHTML = `
      <h3>Captured</h3>
      <div class="workspace-meta">Monday is carrying this now.</div>
      <div>${escapeHtml(result.capture.content || "")}</div>
      <div class="workspace-meta">Mission thread: ${escapeHtml(missionLabel)} · Significance: ${escapeHtml(result.capture.significance || "unknown")}</div>
    `;
    elements.workspace.appendChild(captureCard);
  }
}

function renderDailyBrief(payload) {
  const brief = payload.brief;
  const briefSourceLabel = {
    live: "Live Ollama brief",
    cached: "Cached continuity",
    fallback: "Fallback brief",
    deterministic: "Deterministic fallback",
  };
  const briefSource = briefSourceLabel[brief.source] || (
    brief.cached
      ? "Cached continuity"
      : brief.enabled
        ? "Live Ollama brief"
        : "Deterministic fallback"
  );
  const cacheAge = brief.cached && Number.isFinite(brief.cacheAgeMs)
    ? formatDuration(brief.cacheAgeMs)
    : null;
  const statusBits = [
    briefSource,
    brief.provider ? `Provider: ${brief.provider}` : null,
    brief.model ? `Model: ${brief.model}` : null,
    cacheAge ? `Cache age: ${cacheAge}` : null,
  ].filter(Boolean);
  elements.workspace.innerHTML = `
    <div class="workspace-card">
      <h3>Daily Brief</h3>
      <div class="workspace-meta">Meaning first. No dashboard.</div>
      <div class="workspace-meta">${escapeHtml(statusBits.join(" · "))}</div>
      ${brief.error ? `<div class="workspace-meta">Runtime note: ${escapeHtml(brief.error)}</div>` : ""}
      <div>${escapeHtml(brief.brief)}</div>
    </div>
  `;

  const sections = [
    ["What Changed", brief.changed],
    ["What Still Matters", brief.stillMatters],
    ["What Needs Attention", brief.needsAttention],
    ["What Deserves Protection", brief.deservesProtection],
  ];

  for (const [title, items] of sections) {
    const card = document.createElement("div");
    card.className = "workspace-card";
    const list = (items || []).length
      ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<div class="workspace-meta">Nothing meaningful surfaced yet.</div>`;
    card.innerHTML = `<h3>${title}</h3>${list}`;
    elements.workspace.appendChild(card);
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function renderMissions(payload) {
  elements.workspace.innerHTML = "";
  const summary = document.createElement("div");
  summary.className = "workspace-card";
  summary.innerHTML = `
    <h3>Mission Threads</h3>
    <div class="workspace-meta">Persistent significance threads Monday is carrying.</div>
  `;
  elements.workspace.appendChild(summary);

  for (const mission of payload.missions || []) {
    const card = document.createElement("div");
    card.className = "workspace-card";
    const captures = (mission.recentCaptures || [])
      .slice(0, 3)
      .map((capture) => `<li>${escapeHtml(capture.content)}</li>`)
      .join("");
    card.innerHTML = `
      <h3>${escapeHtml(mission.name)}</h3>
      <div class="workspace-meta">Threads: ${(mission.significanceThreads || []).join(", ") || "None yet"}</div>
      ${captures ? `<ul>${captures}</ul>` : `<div class="workspace-meta">No captures yet.</div>`}
    `;
    elements.workspace.appendChild(card);
  }
}

function renderCalendar(payload) {
  const calendar = payload || {};
  elements.workspace.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "workspace-card";
  summary.innerHTML = `
    <h3>Calendar Context</h3>
    <div class="workspace-meta">Reality first. Monday should know what the day is already carrying.</div>
    <div class="workspace-meta">Source: ${escapeHtml(calendar.source || "manual")} · Updated: ${escapeHtml(calendar.updatedAt || "Not yet synced")}</div>
  `;
  elements.workspace.appendChild(summary);

  if (!(calendar.upcomingEvents || []).length) {
    const empty = document.createElement("div");
    empty.className = "workspace-card";
    empty.innerHTML = `
      <h3>No Upcoming Events</h3>
      <div class="workspace-meta">Add calendar events through the API and Monday will start carrying the shape of the day.</div>
    `;
    elements.workspace.appendChild(empty);
    return;
  }

  for (const event of calendar.upcomingEvents) {
    const card = document.createElement("div");
    card.className = "workspace-card";
    card.innerHTML = `
      <h3>${escapeHtml(event.title)}</h3>
      <div class="workspace-meta">${escapeHtml(formatEventTime(event.startAt, event.endAt))}</div>
      ${event.location ? `<div>${escapeHtml(event.location)}</div>` : ""}
      ${event.notes ? `<div class="workspace-meta">${escapeHtml(event.notes)}</div>` : ""}
    `;
    elements.workspace.appendChild(card);
  }
}

function renderDocuments(payload) {
  const documents = payload || {};
  elements.workspace.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "workspace-card";
  summary.innerHTML = `
    <h3>Documents Context</h3>
    <div class="workspace-meta">Monday should carry source material, not just conclusions.</div>
    <div class="workspace-meta">Source: ${escapeHtml(documents.source || "manual")} · Updated: ${escapeHtml(documents.updatedAt || "Not yet synced")}</div>
  `;
  elements.workspace.appendChild(summary);

  if (!(documents.documents || []).length) {
    const empty = document.createElement("div");
    empty.className = "workspace-card";
    empty.innerHTML = `
      <h3>No Documents Yet</h3>
      <div class="workspace-meta">Add notes or documents through the API and Monday will begin carrying their significance.</div>
    `;
    elements.workspace.appendChild(empty);
    return;
  }

  for (const doc of documents.documents) {
    const card = document.createElement("div");
    card.className = "workspace-card";
    card.innerHTML = `
      <h3>${escapeHtml(doc.title)}</h3>
      <div class="workspace-meta">Mission: ${escapeHtml(doc.missionId || "unmapped")}</div>
      ${doc.summary ? `<div>${escapeHtml(doc.summary)}</div>` : ""}
      ${doc.excerpt ? `<div class="workspace-meta">${escapeHtml(doc.excerpt)}</div>` : ""}
      ${doc.url ? `<div><a href="${escapeHtml(doc.url)}" target="_blank" rel="noreferrer">Open source</a></div>` : ""}
    `;
    elements.workspace.appendChild(card);
  }
}

function renderEmail(payload) {
  const email = payload || {};
  elements.workspace.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "workspace-card";
  summary.innerHTML = `
    <h3>Email Context</h3>
    <div class="workspace-meta">Monday should notice relationship and responsibility signals arriving through the inbox.</div>
    <div class="workspace-meta">Source: ${escapeHtml(email.source || "manual")} · Updated: ${escapeHtml(email.updatedAt || "Not yet synced")} · Unread: ${escapeHtml(String(email.unreadCount || 0))}</div>
  `;
  elements.workspace.appendChild(summary);

  if (!(email.threads || []).length) {
    const empty = document.createElement("div");
    empty.className = "workspace-card";
    empty.innerHTML = `
      <h3>No Inbox Threads Yet</h3>
      <div class="workspace-meta">Add inbox threads through the API and Monday will begin carrying their significance.</div>
    `;
    elements.workspace.appendChild(empty);
    return;
  }

  for (const thread of email.threads) {
    const card = document.createElement("div");
    card.className = "workspace-card";
    card.innerHTML = `
      <h3>${escapeHtml(thread.subject)}</h3>
      <div class="workspace-meta">From: ${escapeHtml(thread.from || "unknown sender")} · Mission: ${escapeHtml(thread.missionId || "unmapped")} · ${thread.unread ? "Unread" : "Read"}</div>
      ${thread.snippet ? `<div>${escapeHtml(thread.snippet)}</div>` : ""}
    `;
    elements.workspace.appendChild(card);
  }
}

function renderFinances(payload) {
  const finances = payload || {};
  elements.workspace.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "workspace-card";
  summary.innerHTML = `
    <h3>Financial Context</h3>
    <div class="workspace-meta">Monday should carry enough financial reality to notice pressure without becoming a dashboard.</div>
    <div class="workspace-meta">Source: ${escapeHtml(finances.source || "manual")} · Updated: ${escapeHtml(finances.updatedAt || "Not yet synced")}</div>
  `;
  elements.workspace.appendChild(summary);

  if (!(finances.accounts || []).length) {
    const empty = document.createElement("div");
    empty.className = "workspace-card";
    empty.innerHTML = `
      <h3>No Financial Context Yet</h3>
      <div class="workspace-meta">Add account context through the API and Monday will start carrying it in the brief.</div>
    `;
    elements.workspace.appendChild(empty);
    return;
  }

  for (const account of finances.accounts) {
    const card = document.createElement("div");
    card.className = "workspace-card";
    card.innerHTML = `
      <h3>${escapeHtml(account.name)}</h3>
      <div class="workspace-meta">Type: ${escapeHtml(account.type || "general")}${account.balance != null ? ` · Balance: ${escapeHtml(formatMoney(account.balance))}` : ""}</div>
      ${account.watchLabel ? `<div>${escapeHtml(account.watchLabel)}</div>` : ""}
    `;
    elements.workspace.appendChild(card);
  }
}

function renderLearningInspector(learning) {
  state.learning = learning;
  renderLearningSummary(learning);
  renderLearningExamples(learning);
  renderLearningRecoveries(learning);
  elements.learningState.textContent = JSON.stringify(learning, null, 2);
}

function renderLearningSummary(learning) {
  if (!learning?.enabled) {
    elements.learningSummary.innerHTML = `<div class="learning-empty">Closed-loop learning is disabled.</div>`;
    return;
  }

  const summary = learning.summary || learning;
  const topDomains = (summary.topFallbackDomains || [])
    .map((item) => `${escapeHtml(item.value)} (${item.count})`)
    .join(", ");
  const sourceCounts = (summary.sourceCounts || [])
    .map((item) => `${escapeHtml(item.value)} (${item.count})`)
    .join(", ");
  const counters = summary.counters || {};

  elements.learningSummary.innerHTML = `
    <div class="learning-card">
      <h4>Learning Health</h4>
      <div class="learning-grid">
        <div><strong>${summary.learnedExamples || 0}</strong><span> learned examples</span></div>
        <div><strong>${summary.totalLoggedTurns || 0}</strong><span> logged turns</span></div>
        <div><strong>${summary.recoveryRate || 0}</strong><span> recovery rate</span></div>
        <div><strong>${summary.ttlDays || learning.ttlDays || 0}</strong><span> day TTL</span></div>
      </div>
      <div class="workspace-meta">Learnable only: ${(learning.policy?.learnable || []).join(", ")}</div>
      <div class="workspace-meta">Clarifications: ${escapeHtml(String(counters.clarifiedTurns || 0))} · Recoveries: ${escapeHtml(String(counters.recoveredTurns || 0))} · Assist accepts: ${escapeHtml(String(counters.assistAcceptedTurns || 0))}</div>
      <div class="workspace-meta">Learning sources: ${sourceCounts || "No learned sources yet."}</div>
      <div class="workspace-meta">Recent fallback pressure: ${topDomains || "No fallback domains surfaced yet."}</div>
    </div>
  `;
}

function renderLearningExamples(learning) {
  const examples = learning?.examples || learning?.summary?.recentLearnedExamples || [];
  const hypotheses = learning?.hypotheses || learning?.summary?.recentHypotheses || [];
  if (!examples.length) {
    elements.learningExamples.innerHTML = `<div class="learning-empty">No learned examples yet.</div>`;
  } else {
    elements.learningExamples.innerHTML = `
      <div class="learning-card">
        <h4>What Monday Learned</h4>
        ${examples.slice(0, 6).map((example) => `
          <div class="learning-item">
            <div class="learning-item-head">
              <strong>${escapeHtml(example.significance || "unknown")}</strong>
              <span>${escapeHtml(example.source || "deterministic")}</span>
            </div>
            <div class="learning-quote">${escapeHtml(example.sampleInput || example.phraseKey || "")}</div>
            <div class="workspace-meta">
              Classification: ${escapeHtml(example.situationClassification || "unknown")} ·
              Confidence: ${escapeHtml(example.confidence || "n/a")} ·
              Uses: ${escapeHtml(String(example.useCount || 0))}
            </div>
            <div class="workspace-meta">
              Source history: ${escapeHtml((example.sourceHistory || [example.source || "deterministic"]).join(", "))}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  if (!hypotheses.length) {
    elements.learningExamples.innerHTML += `
      <div class="learning-card">
        <h4>Fallback Hypotheses</h4>
        <div class="learning-empty">No fallback hypotheses yet.</div>
      </div>
    `;
    return;
  }

  elements.learningExamples.innerHTML += `
    <div class="learning-card">
      <h4>Fallback Hypotheses</h4>
      ${hypotheses.slice(0, 6).map((hypothesis) => `
        <div class="learning-item">
          <div class="learning-item-head">
            <strong>${escapeHtml(hypothesis.candidateDomain || "unknown")}</strong>
            <span>${escapeHtml(hypothesis.status || "pending")}</span>
          </div>
          <div class="learning-quote">${escapeHtml(hypothesis.sampleInput || "")}</div>
          <div class="workspace-meta">
            Hint: ${escapeHtml(hypothesis.candidateClassification || "unknown")} ·
            Confidence: ${escapeHtml(String(hypothesis.candidateConfidence ?? "n/a"))} ·
            Uses: ${escapeHtml(String(hypothesis.useCount || 0))}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderLearningRecoveries(learning) {
  const recoveries = learning?.recentRecoveries || [];
  const fallbacks = learning?.recentFallbacks || [];

  elements.learningRecoveries.innerHTML = `
    <div class="learning-card">
      <h4>Recovery Audit</h4>
      ${
        recoveries.length
          ? recoveries.map((item) => `
            <div class="learning-item">
              <div class="learning-item-head">
                <strong>${escapeHtml(item.significance || "unknown")}</strong>
                <span>similarity ${escapeHtml(String(item.similarity ?? "n/a"))}</span>
              </div>
              <div class="workspace-meta">Input: ${escapeHtml(item.input || "")}</div>
              <div class="workspace-meta">Recovered from: ${escapeHtml(item.sourceInput || "unknown prior example")}</div>
            </div>
          `).join("")
          : `<div class="learning-empty">No learned recoveries yet. That is healthy if deterministic classification is still carrying the load.</div>`
      }
    </div>
    <div class="learning-card">
      <h4>Recent Fallbacks</h4>
      ${
        fallbacks.length
          ? fallbacks.map((item) => `
            <div class="learning-item">
              <div class="learning-item-head">
                <strong>${escapeHtml(item.candidateDomain || "unknown")}</strong>
                <span>${escapeHtml(item.candidateClassification || "unknown")}</span>
              </div>
              <div class="workspace-meta">${escapeHtml(item.input || "")}</div>
              <div class="workspace-meta">${escapeHtml(item.fallbackReason || "Fallback occurred.")}</div>
            </div>
          `).join("")
          : `<div class="learning-empty">No recent fallbacks.</div>`
      }
    </div>
  `;
}

function renderConversationReview(review) {
  state.review = review;

  if (!review || !review.turns || review.turns.length === 0) {
    elements.reviewSummary.innerHTML = `<div class="learning-empty">No review summary yet.</div>`;
    elements.reviewList.innerHTML = `<div class="review-empty">No conversation review yet.</div>`;
    return;
  }

  renderReviewSummary(review.reviewSummary);

  const tagsByTurn = new Map();
  for (const tag of review.tags || []) {
    const current = tagsByTurn.get(tag.turnId) || [];
    current.push(tag);
    tagsByTurn.set(tag.turnId, current);
  }

  elements.reviewList.innerHTML = "";
  for (const turn of review.turns.slice().reverse()) {
    const turnTags = tagsByTurn.get(turn.id) || [];
    const activeCategories = new Set(turnTags.map((tag) => tag.category));
    const card = document.createElement("div");
    card.className = "review-turn";
    card.innerHTML = `
      <div class="review-turn-header">
        <strong>Turn ${turn.id}</strong>
        <span>${new Date(turn.timestamp).toLocaleString()}</span>
      </div>
      <p><strong>User:</strong> ${escapeHtml(turn.user)}</p>
      <p><strong>Monday:</strong> ${escapeHtml(turn.monday)}</p>
      <div class="review-meta">
        ${escapeHtml(turn.significance || "unknown")} ·
        ${escapeHtml(turn.situationClassification || "unknown")} ·
        ${escapeHtml(turn.activeRole || "unknown")}
      </div>
      <div class="tag-row">
        ${FAILURE_TAGS.map((category) => `
          <button
            type="button"
            class="tag-button ${activeCategories.has(category) ? "active" : ""}"
            data-turn-id="${turn.id}"
            data-category="${category}"
          >${category}</button>
        `).join("")}
      </div>
    `;
    elements.reviewList.appendChild(card);
  }

  elements.reviewList.querySelectorAll(".tag-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const turnId = Number(button.dataset.turnId);
      const category = button.dataset.category;
      const note = window.prompt(`Optional note for ${category}:`, "") ?? "";
      await saveFailureTag(turnId, category, note);
    });
  });
}

function renderReviewSummary(summary) {
  if (!summary) {
    elements.reviewSummary.innerHTML = `<div class="learning-empty">No review summary yet.</div>`;
    return;
  }

  const categories = (summary.categoryCounts || [])
    .map((item) => `${escapeHtml(item.category)} (${escapeHtml(String(item.count))})`)
    .join(" · ");
  const patterns = (summary.recentPatterns || [])
    .slice(0, 4)
    .map((item) => {
      const flags = [];
      if (item.classificationFallback) flags.push("fallback");
      if (item.contractAdjusted) flags.push("contract adjusted");
      if (item.contractBlocked) flags.push("contract blocked");
      if ((item.categories || []).length) {
        flags.push(...item.categories);
      }
      return `
        <div class="learning-item">
          <div class="learning-item-head">
            <strong>Turn ${escapeHtml(String(item.turnId))}</strong>
            <span>${escapeHtml(item.significance || "unknown")}</span>
          </div>
          <div class="learning-quote">${escapeHtml(item.prompt || "")}</div>
          <div class="workspace-meta">${escapeHtml(flags.join(" · ") || "No failure pattern logged.")}</div>
        </div>
      `;
    })
    .join("");

  elements.reviewSummary.innerHTML = `
    <div class="learning-card">
      <h4>Review Summary</h4>
      <div class="learning-grid">
        <div><strong>${escapeHtml(String(summary.taggedTurns || 0))}</strong><span> tagged turns</span></div>
        <div><strong>${escapeHtml(String(summary.fallbackTurns || 0))}</strong><span> fallback turns</span></div>
        <div><strong>${escapeHtml(String(summary.contractAdjustedTurns || 0))}</strong><span> contract-adjusted</span></div>
        <div><strong>${escapeHtml(String(summary.contractBlockedTurns || 0))}</strong><span> contract-blocked</span></div>
      </div>
      <div class="workspace-meta">${categories || "No categories tagged yet."}</div>
      ${patterns || `<div class="learning-empty">No recent review patterns yet.</div>`}
    </div>
  `;
}

function renderCanonicalEval(report) {
  state.canonicalEval = report;

  if (!report || !Array.isArray(report.results)) {
    elements.canonicalEvalSummary.innerHTML = `<div class="learning-empty">Canonical evaluation unavailable.</div>`;
    elements.canonicalEvalList.innerHTML = "";
    return;
  }

  const passLabel = report.passed ? "Passing" : "Needs Attention";
  elements.canonicalEvalSummary.innerHTML = `
    <div class="learning-card">
      <h4>${passLabel}</h4>
      <div class="learning-grid">
        <div><strong>${report.passedTurns}</strong><span> passed turns</span></div>
        <div><strong>${report.failedTurns}</strong><span> failed turns</span></div>
        <div><strong>${report.totalTurns}</strong><span> total turns</span></div>
      </div>
      <div class="workspace-meta">Generated: ${escapeHtml(new Date(report.generatedAt).toLocaleString())}</div>
    </div>
  `;

  elements.canonicalEvalList.innerHTML = report.results
    .map((item) => `
      <div class="review-turn">
        <div class="review-turn-header">
          <strong>${escapeHtml(item.conversation)} turn ${item.turn}</strong>
          <span>${item.passed ? "pass" : "fail"}</span>
        </div>
        <p><strong>Prompt:</strong> ${escapeHtml(item.prompt)}</p>
        <p><strong>Monday:</strong> ${escapeHtml(item.reply)}</p>
        <div class="review-meta">
          ${escapeHtml(item.significance)} ·
          ${escapeHtml(item.role)} ·
          ${escapeHtml(item.responseSource || "deterministic")}
        </div>
      </div>
    `)
    .join("");
}

function renderEngineState(result) {
  const payload = {
    continuity_thread: result.finalState.continuity?.activeSignificanceThread ?? null,
    progression: result.finalState.continuity?.meaningProgression ?? null,
    thread_inheritance_confidence: result.finalState.threadInheritanceConfidence,
    significance: result.finalState.significance,
    situation_classification: result.finalState.situationClassification,
    candidate_domain: result.finalState.candidateDomain,
    candidate_classification: result.finalState.candidateClassification,
    candidate_confidence: result.finalState.candidateConfidence,
    active_role: result.finalState.activeRole,
    secondary_role: result.finalState.secondaryRole,
    recommended_outcome: result.finalState.recommendedOutcome,
    voice_mode: result.voice.voiceMode,
    workspace_mode: result.workspace.workspaceMode,
    classification_fallback: result.finalState.classificationFallback,
    fallback_reason: result.finalState.fallbackReason,
    ripeness_state: result.finalState.ripenessState,
    interruptibility: result.finalState.interruptibility,
    human_company_required: result.finalState.humanCompanyRequired,
    wound_risk: result.finalState.woundRisk,
    shame_present: result.finalState.shamePresent,
    identity_proximity: result.finalState.identityProximity,
    healing_vs_execution: result.finalState.healingVsExecution,
    contract_adjustments: result.contract.adjustments,
    contract_blocked: result.contract.blocked,
    response_source: result.voice.responseSource ?? "deterministic",
    base_text: result.voice.baseText ?? result.voice.text,
    classification_assist: result.classificationAssist ?? null,
    intelligence: result.intelligence ?? null,
    learning_recovery: result.learningRecovery ?? null,
    learning: result.learning ?? null,
    explanation: result.finalState.explanation,
  };

  elements.engineState.textContent = JSON.stringify(payload, null, 2);
  elements.statusVoice.textContent =
    result.voice.responseSource === "ollama-refined"
      ? `${result.voice.voiceMode} via Ollama`
      : `${result.voice.voiceMode} deterministic`;
  renderLearningDecision(result.learning, result.finalState);
}

function renderLearningDecision(learning, finalState) {
  if (!learning) {
    elements.learningDecision.innerHTML = `<div class="learning-empty">No turn-level learning decision yet.</div>`;
    return;
  }

  const items = [];
  if (learning.learnedExample) {
    items.push(`
      <div class="learning-item">
        <div class="learning-item-head">
          <strong>Stored Example</strong>
          <span>${escapeHtml(learning.learnedExample.significance || "unknown")}</span>
        </div>
        <div class="workspace-meta">
          Monday stored this phrasing as a reusable example for future continuity and classification recovery.
        </div>
      </div>
    `);
  }

  if (learning.fallbackHypothesis) {
    items.push(`
      <div class="learning-item">
        <div class="learning-item-head">
          <strong>Recorded Hypothesis</strong>
          <span>${escapeHtml(learning.fallbackHypothesis.candidateDomain || "unknown")}</span>
        </div>
        <div class="workspace-meta">
          Candidate hint: ${escapeHtml(learning.fallbackHypothesis.candidateClassification || "unknown")} ·
          Confidence: ${escapeHtml(String(learning.fallbackHypothesis.candidateConfidence ?? "n/a"))}
        </div>
      </div>
    `);
  }

  if (learning.clarifiedExample) {
    items.push(`
      <div class="learning-item">
        <div class="learning-item-head">
          <strong>Clarified Prior Turn</strong>
          <span>${escapeHtml(learning.clarifiedExample.significance || "unknown")}</span>
        </div>
        <div class="workspace-meta">
          Monday upgraded a prior fallback after later meaning became clear.
        </div>
      </div>
    `);
  }

  if (!items.length) {
    const reason = finalState?.classificationFallback
      ? "Monday stayed humble here. The input remained unresolved, but nothing crossed the learning threshold."
      : "Monday responded without adding new learning because deterministic understanding already carried the turn.";
    elements.learningDecision.innerHTML = `
      <div class="learning-card">
        <h4>Learning Decision</h4>
        <div class="learning-empty">${escapeHtml(reason)}</div>
      </div>
    `;
    return;
  }

  elements.learningDecision.innerHTML = `
    <div class="learning-card">
      <h4>Learning Decision</h4>
      ${items.join("")}
    </div>
  `;
}

function renderHealthStatus(health) {
  elements.statusRoute.textContent = `Live on :${health.port}`;
  elements.statusIntelligence.textContent = health.intelligence?.enabled
    ? `${health.intelligence.model} ready`
    : "Disabled";

  if (health.tts?.elevenLabsConfigured) {
    elements.statusTts.textContent = `ElevenLabs · ${health.tts.voice}`;
  } else {
    elements.statusTts.textContent = `${health.tts?.provider || "TTS"} fallback`;
  }

  if (health.learning?.learnedExamples > 0) {
    elements.statusVoice.textContent = `Learning · ${health.learning.learnedExamples} examples`;
  }

  loadLearningInspection();
}

async function loadHealthStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/monday-sandbox/health`);
    const health = await response.json();
    if (!response.ok) {
      throw new Error(health.error || "Health request failed.");
    }
    renderHealthStatus(health);
  } catch (error) {
    elements.statusRoute.textContent = "Unavailable";
    elements.statusIntelligence.textContent = "Unavailable";
    elements.statusTts.textContent = "Unavailable";
    elements.statusVoice.textContent = "Unavailable";
  }
}

async function loadLearningInspection() {
  try {
    const response = await fetch(`${API_BASE}/api/monday-sandbox/learning?detailed=1`);
    const learning = await response.json();
    if (!response.ok) {
      throw new Error(learning.error || "Learning inspection failed.");
    }
    renderLearningInspector(learning);
  } catch (error) {
    elements.learningSummary.innerHTML = `<div class="learning-empty">Learning inspector unavailable.</div>`;
    elements.learningDecision.innerHTML = `<div class="learning-empty">Learning decision unavailable.</div>`;
    elements.learningExamples.innerHTML = "";
    elements.learningRecoveries.innerHTML = "";
    elements.learningState.textContent = "Learning inspection unavailable.";
  }
}

async function sendMessage(input) {
  addMessage(input, "user");
  addPendingReply();
  setComposerBusy(true);

  try {
    const response = await fetchWithTimeout(`${API_BASE}/api/monday-sandbox/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: state.sessionId,
        input,
        context: state.context,
      }),
    }, 20000);

    const payload = await safeJson(response);
    clearPendingReply();

    if (!response.ok) {
      addMessage(`Diagnostic failure: ${payload.error}${payload.details ? ` - ${payload.details}` : ""}`, "monday");
      return;
    }

    state.sessionId = payload.sessionId;
    state.lastReplyText = payload.result.voice.text;
    elements.speakButton.disabled = !state.lastReplyText;

    addMessage(payload.result.voice.text, "monday");
    renderWorkspace(payload.result);
    renderEngineState(payload.result);
    await loadLearningInspection();
    await refreshReview();
  } catch (error) {
    clearPendingReply();
    addMessage(`Diagnostic failure: ${error.message}`, "monday");
  } finally {
    setComposerBusy(false);
  }
}

async function loadDailyBrief() {
  const response = await fetch(`${API_BASE}/api/monday-sandbox/daily-brief`);
  const payload = await safeJson(response);
  if (!response.ok) {
    addMessage(`Diagnostic failure: ${payload.error || "Daily brief failed."}`, "monday");
    return;
  }
  renderDailyBrief(payload);
}

async function loadMissions() {
  const response = await fetch(`${API_BASE}/api/monday-sandbox/missions`);
  const payload = await safeJson(response);
  if (!response.ok) {
    addMessage(`Diagnostic failure: ${payload.error || "Mission load failed."}`, "monday");
    return;
  }
  renderMissions(payload);
}

async function loadCalendar() {
  const response = await fetch(`${API_BASE}/api/monday-sandbox/calendar`);
  const payload = await safeJson(response);
  if (!response.ok) {
    addMessage(`Diagnostic failure: ${payload.error || "Calendar load failed."}`, "monday");
    return;
  }
  renderCalendar(payload);
}

async function loadDocuments() {
  const response = await fetch(`${API_BASE}/api/monday-sandbox/documents`);
  const payload = await safeJson(response);
  if (!response.ok) {
    addMessage(`Diagnostic failure: ${payload.error || "Documents load failed."}`, "monday");
    return;
  }
  renderDocuments(payload);
}

async function loadEmail() {
  const response = await fetch(`${API_BASE}/api/monday-sandbox/email`);
  const payload = await safeJson(response);
  if (!response.ok) {
    addMessage(`Diagnostic failure: ${payload.error || "Email load failed."}`, "monday");
    return;
  }
  renderEmail(payload);
}

async function loadFinances() {
  const response = await fetch(`${API_BASE}/api/monday-sandbox/finances`);
  const payload = await safeJson(response);
  if (!response.ok) {
    addMessage(`Diagnostic failure: ${payload.error || "Financial context load failed."}`, "monday");
    return;
  }
  renderFinances(payload);
}

async function runCanonicalEval() {
  const response = await fetch(`${API_BASE}/api/monday-sandbox/canonical-eval`);
  const payload = await safeJson(response);
  if (!response.ok) {
    addMessage(`Diagnostic failure: ${payload.error || "Canonical evaluation failed."}`, "monday");
    return;
  }

  renderCanonicalEval(payload);
  elements.workspace.innerHTML = `
    <div class="workspace-card">
      <h3>Canonical Evaluation</h3>
      <div class="workspace-meta">Usefulness report for the five core Monday conversations.</div>
      <div>${escapeHtml(payload.passedTurns)} of ${escapeHtml(payload.totalTurns)} turns passed.</div>
      <div class="workspace-meta">${payload.failedTurns === 0 ? "All canonical turns are currently in-character." : `${payload.failedTurns} turn(s) need attention.`}</div>
    </div>
  `;
}

function renderUsefulnessEval(report) {
  state.usefulnessEval = report;
  if (!report) {
    elements.usefulnessEvalSummary.innerHTML = `<div class="learning-empty">Usefulness evaluation unavailable.</div>`;
    elements.usefulnessEvalList.innerHTML = "";
    return;
  }

  elements.usefulnessEvalSummary.innerHTML = `
    <div><strong>${escapeHtml(report.passedTurns)}</strong> of <strong>${escapeHtml(report.totalTurns)}</strong> usefulness turns passed.</div>
    <div class="workspace-meta">${report.failedTurns === 0 ? "Monday is currently passing the daily-companion benchmark." : `${report.failedTurns} usefulness turn(s) need attention.`}</div>
  `;

  elements.usefulnessEvalList.innerHTML = report.results
    .map((item) => {
      const failedChecks = Object.entries(item.checks || {})
        .filter(([, passed]) => !passed)
        .map(([check]) => check);

      return `
        <div class="review-turn">
          <div class="review-turn-header">
            <strong>${escapeHtml(item.kind === "primary" ? item.prompt : item.name)}</strong>
            <span>${item.passed ? "PASS" : "FAIL"}</span>
          </div>
          <div class="workspace-meta">Role: ${escapeHtml(item.role)} · Significance: ${escapeHtml(item.significance)} · Source: ${escapeHtml(item.responseSource || "unknown")}</div>
          <div class="review-turn-text">${escapeHtml(item.reply)}</div>
          ${
            failedChecks.length
              ? `<div class="workspace-meta">Failed checks: ${escapeHtml(failedChecks.join(", "))}</div>`
              : `<div class="workspace-meta">All usefulness checks passed.</div>`
          }
        </div>
      `;
    })
    .join("");
}

async function runUsefulnessEval() {
  const response = await fetch(`${API_BASE}/api/monday-sandbox/usefulness-eval`);
  const payload = await safeJson(response);
  if (!response.ok) {
    addMessage(`Diagnostic failure: ${payload.error || "Usefulness evaluation failed."}`, "monday");
    return;
  }

  renderUsefulnessEval(payload);
  elements.workspace.innerHTML = `
    <div class="workspace-card">
      <h3>Usefulness Evaluation</h3>
      <div class="workspace-meta">Daily-companion benchmark for Monday's real-world prompts.</div>
      <div>${escapeHtml(payload.passedTurns)} of ${escapeHtml(payload.totalTurns)} turns passed.</div>
      <div class="workspace-meta">${payload.failedTurns === 0 ? "The current usefulness benchmark is fully passing." : `${payload.failedTurns} turn(s) need attention before this feels trustworthy every day.`}</div>
    </div>
  `;
}

async function refreshReview() {
  if (!state.sessionId) return;

  const response = await fetch(
    `${API_BASE}/api/monday-sandbox/session?sessionId=${encodeURIComponent(state.sessionId)}`
  );
  const payload = await safeJson(response);
  if (!response.ok) {
    elements.reviewList.innerHTML = `<div class="review-empty">${payload.error || "Unable to load review."}</div>`;
    return;
  }
  renderConversationReview(payload);
}

async function saveFailureTag(turnId, category, note) {
  const response = await fetch(`${API_BASE}/api/monday-sandbox/tag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: state.sessionId,
      turnId,
      category,
      note,
    }),
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    addMessage(`Diagnostic failure: ${payload.error}`, "monday");
    return;
  }
  renderConversationReview(payload);
}

function exportTranscript() {
  if (!state.sessionId) return;
  const url = `${API_BASE}/api/monday-sandbox/export?sessionId=${encodeURIComponent(state.sessionId)}&format=md`;
  window.open(url, "_blank");
}

function exportFieldNotes() {
  if (!state.sessionId) return;
  const url = `${API_BASE}/api/monday-sandbox/export?sessionId=${encodeURIComponent(state.sessionId)}&format=field-notes`;
  window.open(url, "_blank");
}

function initSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    elements.micButton.disabled = true;
    elements.pttButton.disabled = true;
    return;
  }

  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    elements.input.value = transcript;
  };

  state.recognition = recognition;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatEventTime(startAt, endAt) {
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : null;
  if (Number.isNaN(start.getTime())) return "Time unknown";

  const startLabel = start.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!end || Number.isNaN(end.getTime())) return startLabel;

  const endLabel = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startLabel} - ${endLabel}`;
}

function formatMoney(amount) {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "unknown";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function capitalizeLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.slice(0, 1).toUpperCase() + raw.slice(1);
}

async function speakLastReply() {
  if (!state.lastReplyText) return;

  const response = await fetch(`${API_BASE}/api/monday-sandbox/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: state.lastReplyText }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "TTS failed." }));
    addMessage(`Diagnostic failure: ${payload.error}${payload.details ? ` - ${payload.details}` : ""}`, "monday");
    return;
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  audio.play();
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    let text = "";
    try {
      text = await response.text();
    } catch (readError) {
      text = "";
    }
    return {
      error: text || `Request failed with status ${response.status}.`,
    };
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out while waiting for Monday to reply.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

elements.composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = elements.input.value.trim();
  if (!input) return;
  elements.input.value = "";
  await sendMessage(input);
});

elements.contextSelect.addEventListener("change", () => {
  state.contextName = elements.contextSelect.value;
  state.context = { ...presetContexts[state.contextName] };
  state.sessionId = createSessionId();
  elements.messages.innerHTML = "";
  elements.workspace.textContent = "Send a message to materialize support intent.";
  elements.engineState.textContent = "No engine state yet.";
  elements.learningSummary.innerHTML = `<div class="learning-empty">No learning state yet.</div>`;
  elements.learningDecision.innerHTML = `<div class="learning-empty">No turn-level learning decision yet.</div>`;
  elements.learningExamples.innerHTML = "";
  elements.learningRecoveries.innerHTML = "";
  elements.learningState.textContent = "No learning state yet.";
  renderConversationReview(null);
  state.lastReplyText = "";
  elements.speakButton.disabled = true;
  elements.statusVoice.textContent = "Waiting…";
  state.pendingReplyEl = null;
});

elements.toggleInspector.addEventListener("click", () => {
  elements.inspector.classList.toggle("hidden");
  elements.toggleInspector.textContent = elements.inspector.classList.contains("hidden")
    ? "Show Inspector"
    : "Hide Inspector";
});

elements.micButton.addEventListener("click", () => {
  state.recognition?.start();
});

elements.pttButton.addEventListener("mousedown", () => {
  state.recognition?.start();
});
elements.pttButton.addEventListener("mouseup", () => {
  state.recognition?.stop();
});
elements.pttButton.addEventListener("mouseleave", () => {
  state.recognition?.stop();
});

elements.speakButton.addEventListener("click", speakLastReply);
elements.refreshReview.addEventListener("click", refreshReview);
elements.exportTranscript.addEventListener("click", exportTranscript);
elements.exportFieldNotes.addEventListener("click", exportFieldNotes);
elements.dailyBriefButton.addEventListener("click", loadDailyBrief);
elements.missionsButton.addEventListener("click", loadMissions);
elements.calendarButton.addEventListener("click", loadCalendar);
elements.documentsButton.addEventListener("click", loadDocuments);
elements.emailButton.addEventListener("click", loadEmail);
elements.financesButton.addEventListener("click", loadFinances);
elements.canonicalEvalButton.addEventListener("click", runCanonicalEval);
elements.runCanonicalEval.addEventListener("click", runCanonicalEval);
elements.runUsefulnessEval.addEventListener("click", runUsefulnessEval);

state.context = { ...presetContexts[state.contextName] };
initSpeechRecognition();
loadHealthStatus();
renderConversationReview(null);
