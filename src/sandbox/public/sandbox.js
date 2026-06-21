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
  triageSidebar: document.getElementById("triageSidebar"),
  triageSignificantNow: document.getElementById("triageSignificantNow"),
  triageWatching: document.getElementById("triageWatching"),
  triageBackground: document.getElementById("triageBackground"),
  triageEmpty: document.getElementById("triageEmpty"),
  refreshTriage: document.getElementById("refreshTriage"),
  toggleTriage: document.getElementById("toggleTriage"),
  councilToggle: document.getElementById("councilToggle"),
  councilReadsPanel: document.getElementById("councilReadsPanel"),
  councilReadsList: document.getElementById("councilReadsList"),
  workspaceList: document.getElementById("workspaceList"),
  refreshWorkspaces: document.getElementById("refreshWorkspaces"),
  skillsWorkspaceSelect: document.getElementById("skillsWorkspaceSelect"),
  loadSkillsBtn: document.getElementById("loadSkillsBtn"),
  skillsPanel: document.getElementById("skillsPanel"),
  skillExecSelect: document.getElementById("skillExecSelect"),
  skillExecBtn: document.getElementById("skillExecBtn"),
  skillExecResult: document.getElementById("skillExecResult"),
  modelInspector: document.getElementById("modelInspector"),
  modelInspectorContent: document.getElementById("modelInspectorContent"),
  obsidianStatus: document.getElementById("obsidianStatus"),
  obsidianRefreshBtn: document.getElementById("obsidianRefreshBtn"),
  obsidianInitBtn: document.getElementById("obsidianInitBtn"),
  obsidianJournalBtn: document.getElementById("obsidianJournalBtn"),
  obsidianMissionSelect: document.getElementById("obsidianMissionSelect"),
  obsidianMissionInitBtn: document.getElementById("obsidianMissionInitBtn"),
  obsidianMissionViewBtn: document.getElementById("obsidianMissionViewBtn"),
  obsidianMissionDocs: document.getElementById("obsidianMissionDocs"),
  obsidianNoteTitle: document.getElementById("obsidianNoteTitle"),
  obsidianNoteContent: document.getElementById("obsidianNoteContent"),
  obsidianNoteCreateBtn: document.getElementById("obsidianNoteCreateBtn"),
  obsidianRecentNotes: document.getElementById("obsidianRecentNotes"),
  obsidianNoteViewer: document.getElementById("obsidianNoteViewer"),
  obsidianNoteViewerTitle: document.getElementById("obsidianNoteViewerTitle"),
  obsidianNoteViewerClose: document.getElementById("obsidianNoteViewerClose"),
  obsidianNoteViewerContent: document.getElementById("obsidianNoteViewerContent"),
  curatorPanel: document.getElementById("curatorPanel"),
  curatorStats: document.getElementById("curatorStats"),
  curatorQueue: document.getElementById("curatorQueue"),
  curatorRefreshBtn: document.getElementById("curatorRefreshBtn"),
  curatorQueueEntitiesBtn: document.getElementById("curatorQueueEntitiesBtn"),
  curatorWriteApprovedBtn: document.getElementById("curatorWriteApprovedBtn"),
  vaultCtxPanel: document.getElementById("vaultCtxPanel"),
  vaultCtxInput: document.getElementById("vaultCtxInput"),
  vaultCtxSearchBtn: document.getElementById("vaultCtxSearchBtn"),
  vaultCtxSemantic: document.getElementById("vaultCtxSemantic"),
  vaultCtxKeyword: document.getElementById("vaultCtxKeyword"),
  vaultCtxGraph: document.getElementById("vaultCtxGraph"),
  vaultCtxResults: document.getElementById("vaultCtxResults"),
  vaultCtxRecall: document.getElementById("vaultCtxRecall"),
  vaultCtxRecallList: document.getElementById("vaultCtxRecallList"),
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

  // Research Brief — rich card for browser-search and browser-read results
  if (result.skillsUsed && result.skillsUsed.length > 0) {
    const searchSkill = result.skillsUsed.find((s) => s.skillId === "browser-search" && s._raw?.data?.length);
    const readSkill = result.skillsUsed.find((s) => s.skillId === "browser-read" && s._raw?.data);

    if (searchSkill) {
      elements.workspace.appendChild(renderResearchBriefCard(searchSkill));
    }
    if (readSkill) {
      elements.workspace.appendChild(renderPageReadCard(readSkill));
    }
  }

  if (result.skillsUsed && result.skillsUsed.length > 0) {
    const skillCard = document.createElement("div");
    skillCard.className = "workspace-card skills-used-card";

    const rows = result.skillsUsed.map((s) => {
      const obsHtml = (s.observations || []).map((o) => `<li>${escapeHtml(o)}</li>`).join("");
      const patHtml = (s.patterns || []).map((p) => `<li class="skill-pattern">${escapeHtml(p)}</li>`).join("");
      const conf = s.confidence ? Math.round(s.confidence * 100) : "?";
      return `
        <div class="skill-used-row">
          <div class="skill-used-header">
            <span class="skill-used-id">${escapeHtml(s.skillId)}</span>
            <span class="skill-used-conf">${conf}% confidence</span>
            <span class="skill-used-ms">${s.ms || 0}ms</span>
          </div>
          <div class="skill-used-reason">I checked this because ${escapeHtml(s.reason || "")}.</div>
          ${obsHtml ? `<ul class="skill-used-obs">${obsHtml}</ul>` : ""}
          ${patHtml ? `<ul class="skill-used-patterns">${patHtml}</ul>` : ""}
        </div>
      `;
    }).join("");

    skillCard.innerHTML = `<h3>Skills Used This Turn</h3>${rows}`;
    elements.workspace.appendChild(skillCard);
  }
}

function renderResearchBriefCard(searchSkill) {
  const raw = searchSkill._raw || {};
  const results = raw.data || [];
  const query = raw.query || "";

  const card = document.createElement("div");
  card.className = "workspace-card research-brief-card";

  const rows = results.map((r) => `
    <div class="research-result-row">
      <div class="research-result-title">${escapeHtml(r.title || "")}</div>
      ${r.snippet ? `<div class="research-result-snippet">${escapeHtml(r.snippet.slice(0, 140))}</div>` : ""}
      <div class="research-result-actions">
        <span class="research-result-url">${escapeHtml(truncateUrl(r.url || ""))}</span>
        <button class="research-open-btn" type="button" data-url="${escapeAttr(r.url || "")}">Open</button>
      </div>
    </div>
  `).join("");

  card.innerHTML = `
    <h3>Research Brief</h3>
    <div class="workspace-meta">Query: "${escapeHtml(query)}" · ${results.length} results · Observe → Synthesize → Recommend → Execute</div>
    <div class="research-results-list">${rows || "<div class='workspace-meta'>No results returned.</div>"}</div>
    <div id="researchActionStatus" class="research-action-status" style="display:none"></div>
  `;

  // Wire Open buttons — each opens via /action/confirm (Tier 2 user-confirmed action)
  card.querySelectorAll(".research-open-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.url;
      if (!url) return;
      btn.disabled = true;
      btn.textContent = "Opening…";
      try {
        const res = await fetch(`${API_BASE}/api/monday-sandbox/action/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skill: "browser-open", params: { url } }),
        });
        const payload = await res.json();
        btn.textContent = payload.ok ? "Opened" : "Failed";
        if (!payload.ok) {
          btn.title = payload.result?.error || payload.error || "Unknown error";
        }
      } catch (err) {
        btn.textContent = "Error";
        btn.title = err.message;
      }
    });
  });

  return card;
}

function renderPageReadCard(readSkill) {
  const raw = readSkill._raw || {};
  const card = document.createElement("div");
  card.className = "workspace-card research-brief-card";

  const title = raw.title || raw.url || "Page";
  const excerpt = (raw.data || "").slice(0, 600).replace(/\s+/g, " ").trim();

  card.innerHTML = `
    <h3>Page Read</h3>
    <div class="workspace-meta">${escapeHtml(title)} · ${raw.wordCount || 0} words${raw.truncated ? " (truncated)" : ""}</div>
    <div class="research-result-snippet">${escapeHtml(excerpt)}…</div>
    <div class="research-result-actions">
      <span class="research-result-url">${escapeHtml(truncateUrl(raw.url || ""))}</span>
      <button class="research-open-btn" type="button" data-url="${escapeAttr(raw.url || "")}">Open Original</button>
    </div>
  `;

  card.querySelectorAll(".research-open-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.url;
      if (!url) return;
      btn.disabled = true;
      btn.textContent = "Opening…";
      try {
        const res = await fetch(`${API_BASE}/api/monday-sandbox/action/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skill: "browser-open", params: { url } }),
        });
        const payload = await res.json();
        btn.textContent = payload.ok ? "Opened" : "Failed";
      } catch {
        btn.textContent = "Error";
      }
    });
  });

  return card;
}

function truncateUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.length > 30 ? u.pathname.slice(0, 30) + "…" : u.pathname;
    return host + path;
  } catch {
    return url.slice(0, 50);
  }
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

async function sendMessage(input, voiceOpts = null) {
  addMessage(input, "user");
  addPendingReply();
  setComposerBusy(true);

  const isVoice = voiceOpts?.channel === "voice" || state.presenceMode !== "off";

  try {
    const response = await fetchWithTimeout(`${API_BASE}/api/monday-sandbox/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: state.sessionId,
        input,
        context: state.context,
        councilEnabled: elements.councilToggle?.checked === true,
        channel: isVoice ? "voice" : "sandbox",
        voiceThread: state.voiceThread || null,
      }),
    }, 45000);

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
    renderCouncilReads(payload.result.council);
    renderModelDecision(payload.result.modelDecision);
    renderMemoryRecall(payload.result?.intelligence?.memoryRecall || null);
    if (payload.result.missionSuggestion?.suggested) {
      renderMissionSuggestion(payload.result.missionSuggestion);
    }
    if (payload.result.interruptibility) {
      showInterruptibilityBadge(payload.result.interruptibility);
    }

    // Update voice thread state from response domain
    if (isVoice && state.presenceMode !== "off") {
      const domain = payload.result.finalState?.domain || null;
      if (state.voiceThread) {
        state.voiceThread.turnCount = (state.voiceThread.turnCount || 0) + 1;
        if (domain) state.voiceThread.domain = domain;
        if (!state.voiceThread.topic) state.voiceThread.topic = input.slice(0, 60);
      }
    }

    // In voice modes: auto-speak response, then chain next turn
    if (isVoice && state.lastReplyText) {
      await autoSpeakText(state.lastReplyText);
      if (state.presenceMode === "conversation") {
        listenForConversationTurn();
      }
    }

    await loadLearningInspection();
    await refreshReview();
    loadWorkspaces();
  } catch (error) {
    clearPendingReply();
    addMessage(`Diagnostic failure: ${error.message}`, "monday");
    if (state.presenceMode === "conversation") exitConversationMode();
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

// ── Presence & Voice Modes ────────────────────────────────────────────────────
// Three modes: PTT (default), Standby (wake word), Conversation (continuous)

const VOICE_EXIT_PHRASES = /^(goodbye|that's all|thanks monday|stop listening|exit|never mind)/i;
const WAKE_WORD = /^monday[,.]?\s*/i;
const CONV_TIMEOUT_MS = 90_000;

let _convTimeoutId = null;

function initSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    elements.micButton.disabled = true;
    elements.pttButton.disabled = true;
    const presenceGroup = document.getElementById("presenceModeGroup");
    if (presenceGroup) {
      presenceGroup.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    }
    return;
  }

  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  // Default PTT behaviour — just fill the textarea
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    elements.input.value = transcript;
  };

  recognition.onerror = (event) => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    if (event.error === "not-allowed") {
      // Mic permission denied — stop retry loop and mark buttons unavailable
      state.presenceMode = "off";
      updatePresenceUI();
      document.getElementById("presenceModeGroup")
        ?.querySelectorAll("button:not(#presenceOff)")
        .forEach((b) => { b.disabled = true; b.title = "Mic permission required"; });
      return;
    }
    console.warn("[voice] recognition error:", event.error);
  };

  state.recognition = recognition;
  state.presenceMode = "off"; // "off" | "standby" | "conversation"
  state.voiceThread = null;   // { domain, topic, turnCount, startedAt }
}

// ── Standby mode (continuous wake-word listening) ─────────────────────────────

function activateStandby() {
  if (!state.recognition) return;
  state.presenceMode = "standby";
  updatePresenceUI();

  state.recognition.continuous = true;
  state.recognition.onresult = handleStandbyResult;
  state.recognition.onend = () => {
    if (state.presenceMode === "standby") {
      try { state.recognition.start(); } catch {}
    }
  };
  try { state.recognition.start(); } catch {}
}

function deactivateStandby() {
  state.presenceMode = "off";
  updatePresenceUI();
  try { state.recognition.continuous = false; state.recognition.stop(); } catch {}
  state.recognition.onend = null;
}

function handleStandbyResult(event) {
  const transcript = event.results[event.resultIndex]?.[0]?.transcript?.trim() || "";
  if (!WAKE_WORD.test(transcript)) return;

  const command = transcript.replace(WAKE_WORD, "").trim();
  if (command) {
    sendVoiceMessage(command);
  } else {
    // Wake word only — acknowledge and enter conversation
    enterConversationMode("Monday?");
  }
}

// ── Conversation mode (continuous back-and-forth) ─────────────────────────────

function enterConversationMode(ack = null) {
  if (!state.recognition) return;
  state.presenceMode = "conversation";
  state.voiceThread = state.voiceThread || {
    topic: null,
    domain: null,
    turnCount: 0,
    startedAt: Date.now(),
  };
  updatePresenceUI();

  if (ack) {
    addMessage(ack, "monday");
    autoSpeakText(ack).then(() => listenForConversationTurn());
  } else {
    listenForConversationTurn();
  }
}

function listenForConversationTurn() {
  if (!state.recognition || state.presenceMode !== "conversation") return;
  state.recognition.continuous = false;
  state.recognition.onresult = handleConversationResult;
  state.recognition.onend = null;

  // Auto-exit after silence
  clearTimeout(_convTimeoutId);
  _convTimeoutId = setTimeout(exitConversationMode, CONV_TIMEOUT_MS);

  try { state.recognition.start(); } catch {}
}

function handleConversationResult(event) {
  clearTimeout(_convTimeoutId);
  const transcript = event.results[0]?.[0]?.transcript?.trim() || "";
  if (VOICE_EXIT_PHRASES.test(transcript)) {
    exitConversationMode();
    return;
  }
  sendVoiceMessage(transcript);
}

function exitConversationMode() {
  clearTimeout(_convTimeoutId);
  const wasConversation = state.presenceMode === "conversation";
  state.presenceMode = "off";
  state.voiceThread = null;
  updatePresenceUI();
  try { state.recognition?.stop(); } catch {}
  if (wasConversation) addMessage("— conversation ended —", "monday");
}

// ── Voice message send ────────────────────────────────────────────────────────

async function sendVoiceMessage(text) {
  if (!text) return;
  elements.input.value = "";
  await sendMessage(text, { channel: "voice" });
}

// ── Auto-speak with conversation chaining ────────────────────────────────────

async function autoSpeakText(text) {
  if (!text) return;
  try {
    const response = await fetch(`${API_BASE}/api/monday-sandbox/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) return;
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    await new Promise((resolve) => { audio.onended = resolve; audio.onerror = resolve; audio.play(); });
  } catch {}
}

// ── Presence UI ───────────────────────────────────────────────────────────────

function updatePresenceUI() {
  const mode = state.presenceMode || "off";

  const offBtn = document.getElementById("presenceOff");
  const standbyBtn = document.getElementById("presenceStandby");
  const convoBtn = document.getElementById("presenceConversation");
  const indicator = document.getElementById("presenceIndicator");
  const label = document.getElementById("presenceLabel");

  if (offBtn) offBtn.classList.toggle("presence-active", mode === "off");
  if (standbyBtn) standbyBtn.classList.toggle("presence-active", mode === "standby");
  if (convoBtn) convoBtn.classList.toggle("presence-active", mode === "conversation");

  if (indicator) {
    indicator.className = "presence-dot";
    if (mode === "standby") indicator.classList.add("presence-dot--standby");
    if (mode === "conversation") indicator.classList.add("presence-dot--conversation");
  }

  if (label) {
    const labels = { off: "Offline", standby: "Standby", conversation: "In Conversation" };
    label.textContent = labels[mode] || mode;
  }

  // Disable PTT/Mic buttons when in non-PTT modes (they'd conflict)
  const pttBlocked = mode !== "off";
  if (elements.micButton) elements.micButton.disabled = pttBlocked;
  if (elements.pttButton) elements.pttButton.disabled = pttBlocked;
}

function showInterruptibilityBadge(interruptibility) {
  const badge = document.getElementById("interruptibilityBadge");
  if (!badge) return;
  const blocked = ["blocked", "family_time", "worship", "deep_work", "recovery"].includes(interruptibility);
  badge.textContent = blocked ? `⚠ ${interruptibility}` : "";
  badge.style.display = blocked ? "inline" : "none";
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
  await autoSpeakText(state.lastReplyText);
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

// ── Triage Sidebar ────────────────────────────────────────────────────
function renderTriageList(el, items, cls) {
  el.innerHTML = "";
  if (!items || items.length === 0) return;
  for (const item of items) {
    const li = document.createElement("li");
    li.className = ["triage-item", cls, item.protected ? "triage-item--protected" : ""].filter(Boolean).join(" ");
    li.textContent = item.label || item.id || "—";
    if (item.domain) li.title = item.domain;
    el.appendChild(li);
  }
}

async function loadTriage() {
  try {
    const res = await fetch("/api/monday-sandbox/triage");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { triage } = await res.json();
    const hasItems =
      (triage.significantNow?.length || 0) +
      (triage.watching?.length || 0) +
      (triage.background?.length || 0) > 0;

    elements.triageEmpty.classList.toggle("visible", !hasItems);
    renderTriageList(elements.triageSignificantNow, triage.significantNow, "");
    renderTriageList(elements.triageWatching, triage.watching, "triage-item--watching");
    renderTriageList(elements.triageBackground, triage.background, "");
  } catch {
    elements.triageEmpty.classList.add("visible");
    elements.triageEmpty.textContent = "Triage unavailable — daemon not running";
  }
}

// ── Model Inspector ───────────────────────────────────────────────────
function renderModelDecision(decision) {
  if (!elements.modelInspector || !elements.modelInspectorContent) return;
  if (!decision) {
    elements.modelInspector.style.display = "none";
    return;
  }

  const TIER_LABELS = {
    deterministic: { label: "DETERMINISTIC", cls: "model-tier-deterministic" },
    routing: { label: "ROUTING (4b)", cls: "model-tier-routing" },
    conversation: { label: "CONVERSATION (14b)", cls: "model-tier-default" },
    thinking: { label: "THINKING (30b)", cls: "model-tier-thinking" },
    embedding: { label: "EMBEDDING", cls: "model-tier-routing" },
  };

  const tier = TIER_LABELS[decision.taskType] || { label: decision.taskType, cls: "" };
  const model = decision.model || "none";

  let html = `<div class="model-decision-row">
    <span class="model-tier-badge ${tier.cls}">${tier.label}</span>
    <span class="model-name">${model}</span>
    ${decision.paidBlocked ? '<span class="model-paid-blocked">paid blocked</span>' : ""}
    ${decision.consideredLarger ? '<span class="model-considered-larger">↑ larger considered</span>' : ""}
  </div>
  <div class="model-reason">${decision.reason || ""}</div>`;

  if (decision.matchedPattern) {
    html += `<div class="model-matched-pattern">matched: <code>${decision.matchedPattern}</code></div>`;
  }

  elements.modelInspectorContent.innerHTML = html;
  elements.modelInspector.style.display = "block";
}

// ── Council Reads ─────────────────────────────────────────────────────
function renderCouncilReads(council) {
  if (!council || !council.reads || council.reads.length === 0) {
    elements.councilReadsPanel.style.display = "none";
    return;
  }

  elements.councilReadsPanel.style.display = "block";
  elements.councilReadsList.innerHTML = "";

  for (const read of council.reads) {
    if (!read.ok || !read.read) continue;
    const card = document.createElement("div");
    card.className = `council-read${read.flag ? " flagged" : ""}`;

    const header = document.createElement("div");
    header.className = "council-read-header";
    header.innerHTML = `
      <span>${read.emoji || "◆"}</span>
      <span class="council-read-name">${read.agent}</span>
      <span class="council-read-domain">${read.domain}</span>
      ${read.flag ? '<span class="council-read-flag">⚑ FLAGGED</span>' : ""}
    `;

    const body = document.createElement("div");
    body.className = "council-read-body";
    body.textContent = read.read;

    card.appendChild(header);
    card.appendChild(body);

    if (read.concern) {
      const concern = document.createElement("div");
      concern.className = "council-read-concern";
      concern.textContent = `→ ${read.concern}`;
      card.appendChild(concern);
    }

    if (read.theory) {
      const theory = document.createElement("div");
      theory.className = "council-read-theory";
      theory.textContent = `Theory: ${read.theory}`;
      card.appendChild(theory);
    }

    elements.councilReadsList.appendChild(card);
  }

  if (council.synthesis) {
    const synth = document.createElement("div");
    synth.className = "council-synthesis";
    const label = document.createElement("div");
    label.className = "council-synthesis-label";
    label.textContent = "Council Synthesis";
    const text = document.createElement("div");
    text.textContent = council.synthesis;
    synth.appendChild(label);
    synth.appendChild(text);
    elements.councilReadsList.appendChild(synth);
  }
}

// ── Obsidian Vault Explorer ───────────────────────────────────────────

async function loadObsidianStatus() {
  try {
    const res = await fetch("/api/monday-sandbox/obsidian/status");
    const data = await res.json();
    renderObsidianStatus(data);
    if (data.available) loadObsidianRecentNotes();
  } catch {
    if (elements.obsidianStatus) {
      elements.obsidianStatus.innerHTML = '<div class="obsidian-offline">Vault unavailable — check /Volumes/Monday/Obsidian/Monday</div>';
    }
  }
}

function renderObsidianStatus(data) {
  if (!elements.obsidianStatus) return;
  if (!data.available) {
    elements.obsidianStatus.innerHTML = `<div class="obsidian-offline">Volume not mounted.<br><small>${data.root || ""}</small></div>`;
    return;
  }
  const structure = data.structure;
  const totalFiles = (structure?.dirs || []).reduce((n, d) => n + (d.entries?.filter((e) => e.type === "file").length || 0), 0);
  const dirs = (structure?.dirs || []).map((d) => {
    const count = d.entries?.filter((e) => e.type === "file").length || 0;
    return `<span class="obsidian-dir${count > 0 ? " has-files" : ""}">${d.name}${count > 0 ? ` <em>${count}</em>` : ""}</span>`;
  }).join("");
  elements.obsidianStatus.innerHTML = `
    <div class="obsidian-online">
      <span class="obsidian-online-badge">● Vault connected</span>
      <span class="obsidian-file-count">${totalFiles} note${totalFiles !== 1 ? "s" : ""}</span>
    </div>
    <div class="obsidian-dirs">${dirs}</div>`;
}

async function loadObsidianRecentNotes() {
  if (!elements.obsidianRecentNotes) return;
  try {
    const res = await fetch("/api/monday-sandbox/obsidian/recent?limit=8");
    const data = await res.json();
    renderObsidianRecentNotes(data.notes || []);
  } catch {
    elements.obsidianRecentNotes.innerHTML = '<div class="obsidian-empty">Could not load recent notes</div>';
  }
}

function renderObsidianRecentNotes(notes) {
  if (!elements.obsidianRecentNotes) return;
  if (!notes.length) {
    elements.obsidianRecentNotes.innerHTML = '<div class="obsidian-empty">No notes yet</div>';
    return;
  }
  elements.obsidianRecentNotes.innerHTML = notes.map((n) => `
    <div class="obsidian-note-row" data-path="${escapeHtml(n.path)}">
      <span class="obsidian-note-title">${escapeHtml(n.title)}</span>
      <span class="obsidian-note-path">${escapeHtml(n.path)}</span>
      ${n.snippet ? `<span class="obsidian-note-snippet">${escapeHtml(n.snippet.slice(0, 80))}</span>` : ""}
    </div>`).join("");

  elements.obsidianRecentNotes.querySelectorAll(".obsidian-note-row").forEach((row) => {
    row.addEventListener("click", () => openObsidianNote(row.dataset.path));
  });
}

async function openObsidianNote(notePath) {
  try {
    const res = await fetch(`/api/monday-sandbox/obsidian/note?path=${encodeURIComponent(notePath)}`);
    const data = await res.json();
    if (!data.ok || !data.note) return;
    if (elements.obsidianNoteViewerTitle) elements.obsidianNoteViewerTitle.textContent = data.note.frontmatter?.title || notePath;
    if (elements.obsidianNoteViewerContent) elements.obsidianNoteViewerContent.textContent = data.note.raw;
    if (elements.obsidianNoteViewer) elements.obsidianNoteViewer.style.display = "block";
  } catch {
    // ignore
  }
}

async function obsidianInitMission() {
  const missionId = elements.obsidianMissionSelect?.value;
  if (!missionId) return;
  try {
    const res = await fetch("/api/monday-sandbox/obsidian/mission/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missionId }),
    });
    const data = await res.json();
    if (elements.obsidianMissionDocs) {
      elements.obsidianMissionDocs.innerHTML = data.ok
        ? `<div class="obsidian-success">Mission "${data.mission}" initialized in Missions/${data.mission}/</div>`
        : `<div class="obsidian-error">${data.errors?.join(", ") || "Failed"}</div>`;
    }
    loadObsidianStatus();
  } catch (err) {
    if (elements.obsidianMissionDocs) elements.obsidianMissionDocs.innerHTML = `<div class="obsidian-error">${err.message}</div>`;
  }
}

async function obsidianViewMission() {
  const missionId = elements.obsidianMissionSelect?.value;
  if (!missionId) return;
  try {
    const res = await fetch(`/api/monday-sandbox/obsidian/mission/${encodeURIComponent(missionId)}`);
    const data = await res.json();
    const docs = data.docs || {};
    const files = Object.keys(docs);
    if (!files.length) {
      if (elements.obsidianMissionDocs) elements.obsidianMissionDocs.innerHTML = '<div class="obsidian-empty">No mission docs yet — click Init Docs first</div>';
      return;
    }
    if (elements.obsidianMissionDocs) {
      elements.obsidianMissionDocs.innerHTML = files.map((f) => {
        const note = docs[f];
        const preview = note?.body?.split("\n").find((l) => l.trim()) || "";
        return `<div class="obsidian-mission-file" data-path="${escapeHtml(note?.path || "")}">
          <span class="obsidian-mission-filename">${f}</span>
          <span class="obsidian-note-snippet">${escapeHtml(preview.slice(0, 80))}</span>
        </div>`;
      }).join("");
      elements.obsidianMissionDocs.querySelectorAll(".obsidian-mission-file").forEach((row) => {
        row.addEventListener("click", () => openObsidianNote(row.dataset.path));
      });
    }
  } catch (err) {
    if (elements.obsidianMissionDocs) elements.obsidianMissionDocs.innerHTML = `<div class="obsidian-error">${err.message}</div>`;
  }
}

async function obsidianCreateNote() {
  const title = elements.obsidianNoteTitle?.value?.trim();
  const content = elements.obsidianNoteContent?.value?.trim();
  if (!title || !content) return;
  try {
    const res = await fetch("/api/monday-sandbox/obsidian/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    const data = await res.json();
    if (data.ok) {
      if (elements.obsidianNoteTitle) elements.obsidianNoteTitle.value = "";
      if (elements.obsidianNoteContent) elements.obsidianNoteContent.value = "";
      loadObsidianRecentNotes();
      loadObsidianStatus();
    }
  } catch {
    // ignore
  }
}

async function obsidianWriteJournal() {
  // Pull recent significant captures and theories from session state
  const turns = [];
  try {
    const res = await fetch("/api/monday-sandbox/obsidian/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        significant: ["Journal written from sandbox"],
        openQuestions: [],
      }),
    });
    const data = await res.json();
    if (data.ok && elements.obsidianStatus) {
      const note = document.createElement("div");
      note.className = "obsidian-success";
      note.textContent = "Journal entry written";
      elements.obsidianStatus.prepend(note);
      setTimeout(() => note.remove(), 3000);
    }
  } catch {
    // ignore
  }
}

// ── Mission Workspaces ────────────────────────────────────────────────
const AGENT_EMOJI = { thor: "⚡", wanda: "✨", vision: "🔮", steve: "🛡️", strange: "🌀", fury: "🎯" };

async function loadWorkspaces() {
  try {
    const res = await fetch("/api/monday-sandbox/workspaces");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { workspaces } = await res.json();
    renderWorkspaces(workspaces || []);
  } catch {
    elements.workspaceList.innerHTML = '<div class="learning-empty">Workspaces unavailable</div>';
  }
}

function renderWorkspaces(workspaces) {
  elements.workspaceList.innerHTML = "";
  if (!workspaces.length) {
    elements.workspaceList.innerHTML = '<div class="learning-empty">No workspaces yet</div>';
    return;
  }
  for (const ws of workspaces) {
    const card = document.createElement("div");
    card.className = `workspace-card workspace-card--${ws.status}`;

    const emoji = AGENT_EMOJI[ws.agent] || "◆";
    const threads = ws.openThreadCount > 0 ? `${ws.openThreadCount} thread${ws.openThreadCount !== 1 ? "s" : ""}` : "no threads";
    const updated = ws.updatedAt ? new Date(ws.updatedAt).toLocaleDateString() : "—";
    const theoryText = ws.workingTheory
      ? (typeof ws.workingTheory === "string" ? ws.workingTheory : ws.workingTheory.statement || "")
      : "";

    card.innerHTML = `
      <div class="workspace-card-header">
        <span class="workspace-card-emoji">${emoji}</span>
        <span class="workspace-card-name">${ws.name}</span>
        <span class="workspace-card-status">${ws.status}</span>
      </div>
      ${theoryText ? `<div class="workspace-card-theory">"${theoryText}"</div>` : ""}
      <div class="workspace-card-meta">
        <span>${threads}</span>
        <span>updated ${updated}</span>
      </div>
    `;
    elements.workspaceList.appendChild(card);
  }
}

elements.refreshWorkspaces.addEventListener("click", loadWorkspaces);

// ── Mission Engine ────────────────────────────────────────────────────────────

let _missionState = { missions: [], activeMissionId: null };

const STAGE_LABELS = {
  intake: "Intake",
  planning: "Planning",
  active: "Active",
  complete: "Complete",
  archived: "Archived",
};

const STAGE_COLORS = {
  intake: "#888",
  planning: "#3a7fd5",
  active: "#27ae60",
  complete: "#8e44ad",
  archived: "#555",
};

const TYPE_LABELS = {
  personal: "Personal",
  family: "Family",
  faith: "Faith",
  business: "Business",
  product: "Product",
  project: "Project",
};

async function loadMissionEngine() {
  const el = document.getElementById("missionEngineList");
  if (!el) return;
  try {
    const res = await fetch(`${API_BASE}/api/monday-sandbox/mission-engine`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _missionState.missions = data.missions || [];
    renderMissionList(_missionState.missions, el);
  } catch (err) {
    if (el) el.innerHTML = `<div class="learning-empty">Mission Engine unavailable: ${err.message}</div>`;
  }
}

function renderMissionList(missions, el) {
  el.innerHTML = "";
  if (!missions.length) {
    el.innerHTML = '<div class="learning-empty">No missions yet — create one below</div>';
    return;
  }
  for (const m of missions) {
    const card = document.createElement("div");
    card.className = "mission-card";
    card.dataset.id = m.id;
    const stageColor = STAGE_COLORS[m.stage] || "#888";
    card.innerHTML = `
      <div class="mission-card-header">
        <span class="mission-card-title">${escapeHtml(m.title)}</span>
        <span class="mission-card-stage" style="color:${stageColor}">${STAGE_LABELS[m.stage] || m.stage}</span>
      </div>
      <div class="mission-card-meta">${TYPE_LABELS[m.type] || m.type} · ${escapeHtml(m.domain)}</div>
    `;
    card.addEventListener("click", () => openMissionDetail(m.id));
    el.appendChild(card);
  }
}

async function openMissionDetail(id) {
  _missionState.activeMissionId = id;
  const el = document.getElementById("missionDetail");
  if (!el) return;
  el.innerHTML = '<div class="learning-empty">Loading…</div>';
  el.style.display = "block";

  try {
    const res = await fetch(`${API_BASE}/api/monday-sandbox/mission-engine/${id}`);
    const data = await res.json();
    renderMissionDetail(data, el);
  } catch (err) {
    el.innerHTML = `<div class="learning-empty">Error: ${err.message}</div>`;
  }
}

function renderMissionDetail({ meta, docs }, el) {
  const stageColor = STAGE_COLORS[meta.stage] || "#888";
  const docNames = Object.keys(docs || {}).sort();

  const docRows = docNames.map((name) => {
    const preview = (docs[name] || "").slice(0, 120).replace(/\n/g, " ");
    return `
      <div class="mission-doc-row" data-doc="${escapeHtml(name)}" data-id="${escapeHtml(meta.id)}">
        <span class="mission-doc-name">${escapeHtml(name)}</span>
        <span class="mission-doc-preview">${escapeHtml(preview)}…</span>
      </div>
    `;
  }).join("");

  el.innerHTML = `
    <div class="mission-detail-header">
      <strong>${escapeHtml(meta.title)}</strong>
      <span class="mission-card-stage" style="color:${stageColor}">${STAGE_LABELS[meta.stage] || meta.stage}</span>
      <span class="mission-card-meta">${TYPE_LABELS[meta.type] || meta.type} · ${escapeHtml(meta.domain)}</span>
    </div>
    <div class="mission-detail-actions">
      <button class="mission-advance-btn" data-id="${escapeHtml(meta.id)}">Advance Stage →</button>
      <button class="mission-close-btn">✕ Close</button>
    </div>
    <div id="missionAdvanceResult" class="mission-advance-result"></div>
    <div class="mission-docs-list">${docRows || '<div class="learning-empty">No documents yet</div>'}</div>
  `;

  el.querySelector(".mission-advance-btn").addEventListener("click", () => advanceMission(meta.id));
  el.querySelector(".mission-close-btn").addEventListener("click", () => {
    el.style.display = "none";
    _missionState.activeMissionId = null;
  });

  el.querySelectorAll(".mission-doc-row").forEach((row) => {
    row.addEventListener("click", () => openMissionDoc(row.dataset.id, row.dataset.doc, docs[row.dataset.doc] || ""));
  });
}

async function advanceMission(id) {
  const resultEl = document.getElementById("missionAdvanceResult");
  if (resultEl) resultEl.textContent = "Checking gate…";
  try {
    const res = await fetch(`${API_BASE}/api/monday-sandbox/mission-engine/${id}/advance`, { method: "POST" });
    const data = await res.json();
    if (resultEl) {
      resultEl.textContent = data.ok
        ? `Advanced to ${STAGE_LABELS[data.to] || data.to}`
        : `Gate: ${data.reason}`;
      resultEl.style.color = data.ok ? "#27ae60" : "#c0392b";
    }
    if (data.ok) {
      await loadMissionEngine();
      await openMissionDetail(id);
    }
  } catch (err) {
    if (resultEl) resultEl.textContent = `Error: ${err.message}`;
  }
}

async function openMissionDoc(id, docName, content) {
  const el = document.getElementById("missionDocEditor");
  if (!el) return;
  el.style.display = "block";
  el.dataset.id = id;
  el.dataset.doc = docName;

  const titleEl = el.querySelector(".mission-doc-editor-title");
  const textarea = el.querySelector(".mission-doc-editor-textarea");
  if (titleEl) titleEl.textContent = docName;
  if (textarea) textarea.value = content;
}

function renderMissionSuggestion(suggestion) {
  const el = document.getElementById("missionSuggestionBanner");
  if (!el) return;
  el.style.display = "block";
  el.innerHTML = `
    <div class="mission-suggestion-text">
      💡 <strong>Monday noticed:</strong> ${escapeHtml(suggestion.reason)}.
      This might be worth a mission brief.
    </div>
    <div class="mission-suggestion-actions">
      <button class="mission-suggestion-create" data-domain="${escapeHtml(suggestion.domain)}" data-type="${escapeHtml(suggestion.suggestedType || 'personal')}" data-title="${escapeHtml(suggestion.suggestedTitle || '')}">
        Create Mission Brief
      </button>
      <button class="mission-suggestion-dismiss">Dismiss</button>
    </div>
  `;

  el.querySelector(".mission-suggestion-create").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const titleInput = document.getElementById("missionCreateTitle");
    const domainInput = document.getElementById("missionCreateDomain");
    const typeSelect = document.getElementById("missionCreateType");
    if (titleInput) titleInput.value = btn.dataset.title;
    if (domainInput) domainInput.value = btn.dataset.domain;
    if (typeSelect) typeSelect.value = btn.dataset.type;
    el.style.display = "none";
    document.getElementById("missionCreateForm")?.scrollIntoView({ behavior: "smooth" });
  });

  el.querySelector(".mission-suggestion-dismiss").addEventListener("click", () => {
    el.style.display = "none";
  });
}

async function createMission() {
  const title = document.getElementById("missionCreateTitle")?.value?.trim();
  const domain = document.getElementById("missionCreateDomain")?.value?.trim();
  const type = document.getElementById("missionCreateType")?.value;
  const seedTheory = document.getElementById("missionCreateSeed")?.value?.trim();
  const resultEl = document.getElementById("missionCreateResult");

  if (!title || !domain || !type) {
    if (resultEl) { resultEl.textContent = "Title, domain, and type are required."; resultEl.style.color = "#c0392b"; }
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/monday-sandbox/mission-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, domain, type, seedTheory }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Create failed");
    if (resultEl) { resultEl.textContent = `Mission created: ${data.meta.id}`; resultEl.style.color = "#27ae60"; }
    // Clear form
    ["missionCreateTitle","missionCreateDomain","missionCreateSeed"].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
    await loadMissionEngine();
  } catch (err) {
    if (resultEl) { resultEl.textContent = `Error: ${err.message}`; resultEl.style.color = "#c0392b"; }
  }
}

// ── Skills ────────────────────────────────────────────────────────────────────

const TIER_LABELS = ["silent", "notify", "suggest", "delegate", "blocked"];
const TIER_COLORS = ["#888", "#3a7fd5", "#d5813a", "#c0392b", "#333"];

let _allSkills = [];
let _activeSkillsWorkspace = null;

async function loadSkillsForWorkspace(workspaceId) {
  _activeSkillsWorkspace = workspaceId;
  elements.skillsPanel.innerHTML = '<div class="learning-empty">Loading…</div>';

  try {
    const url = workspaceId
      ? `/api/monday-sandbox/workspace/${workspaceId}/skills`
      : `/api/monday-sandbox/skills`;
    const res = await fetch(url);
    const data = await res.json();
    const skills = data.skills || [];
    _allSkills = skills;
    renderSkillsPanel(skills, workspaceId);
    populateSkillExecSelect(skills);
  } catch (err) {
    elements.skillsPanel.innerHTML = `<div class="learning-empty">Error: ${err.message}</div>`;
  }
}

function renderSkillsPanel(skills, workspaceId) {
  elements.skillsPanel.innerHTML = "";
  if (!skills.length) {
    elements.skillsPanel.innerHTML = '<div class="learning-empty">No skills found</div>';
    return;
  }

  // Autonomy tier row (only shown when workspace selected)
  if (workspaceId) {
    const ws = skills[0]; // any skill to get workspace tools
    const tierRow = document.createElement("div");
    tierRow.className = "autonomy-tier-row";
    tierRow.innerHTML = `
      <span>Workspace autonomy tier:</span>
      <select id="autonomyTierSelect">
        ${[0,1,2,3].map(t => `<option value="${t}">${t} — ${TIER_LABELS[t]}</option>`).join("")}
      </select>
      <button type="button" id="autonomyTierSave">Save</button>
    `;
    elements.skillsPanel.appendChild(tierRow);

    // Load current tier
    fetch(`/api/monday-sandbox/workspace/${workspaceId}/skills`)
      .then(r => r.json())
      .then(d => {
        const select = document.getElementById("autonomyTierSelect");
        if (select) select.value = d.skills?.[0] ? "1" : "1"; // default
        // We need the tools object — fetch workspace directly
        return fetch(`/api/monday-sandbox/workspace/${workspaceId}`);
      })
      .then(r => r.json())
      .then(d => {
        const select = document.getElementById("autonomyTierSelect");
        if (select && d.workspace?.tools?.autonomyTier !== undefined) {
          select.value = d.workspace.tools.autonomyTier;
        }
        document.getElementById("autonomyTierSave")?.addEventListener("click", async () => {
          const tier = Number(document.getElementById("autonomyTierSelect")?.value);
          await fetch("/api/monday-sandbox/skill/autonomy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId, tier }),
          });
          loadSkillsForWorkspace(workspaceId);
        });
      })
      .catch(() => {});
  }

  // Group by category
  const groups = {};
  for (const skill of skills) {
    if (!groups[skill.category]) groups[skill.category] = [];
    groups[skill.category].push(skill);
  }

  for (const [category, catSkills] of Object.entries(groups)) {
    const section = document.createElement("div");
    section.className = "skills-category";
    section.innerHTML = `<div class="skills-category-label">${category}</div>`;

    for (const skill of catSkills) {
      const row = document.createElement("div");
      row.className = `skill-row${skill.installed ? " skill-row--installed" : ""}`;

      const tierLabel = TIER_LABELS[skill.autonomyTier] || "?";
      const btnText = workspaceId ? (skill.installed ? "Remove" : "Install") : "";
      const btnHtml = workspaceId
        ? `<button class="skill-install-btn" data-skill="${skill.id}" data-action="${skill.installed ? "remove" : "install"}">${btnText}</button>`
        : "";

      row.innerHTML = `
        <span class="skill-name">${skill.installed ? "✓ " : ""}${skill.name}</span>
        <span class="skill-tier skill-tier--${skill.autonomyTier}" title="Autonomy tier">${skill.autonomyTier} ${tierLabel}</span>
        ${btnHtml}
        <span class="skill-desc">${skill.description}</span>
      `;
      section.appendChild(row);
    }
    elements.skillsPanel.appendChild(section);
  }

  // Wire install/remove buttons
  elements.skillsPanel.querySelectorAll(".skill-install-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { skill, action } = btn.dataset;
      btn.disabled = true;
      btn.textContent = "…";
      await fetch("/api/monday-sandbox/skill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, skillId: skill, action }),
      });
      loadSkillsForWorkspace(workspaceId);
    });
  });
}

function populateSkillExecSelect(skills) {
  elements.skillExecSelect.innerHTML = '<option value="">Select skill…</option>';
  for (const skill of skills) {
    const opt = document.createElement("option");
    opt.value = skill.id;
    opt.textContent = `${skill.name} (tier ${skill.autonomyTier})`;
    elements.skillExecSelect.appendChild(opt);
  }
}

elements.loadSkillsBtn.addEventListener("click", () => {
  const ws = elements.skillsWorkspaceSelect.value;
  loadSkillsForWorkspace(ws || null);
});

elements.skillExecBtn.addEventListener("click", async () => {
  const skillId = elements.skillExecSelect.value;
  if (!skillId) return;
  const workspaceId = _activeSkillsWorkspace || null;

  elements.skillExecResult.style.display = "block";
  elements.skillExecResult.textContent = `Executing ${skillId}…`;

  try {
    const res = await fetch("/api/monday-sandbox/skill/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillId, workspaceId, params: {} }),
    });
    const data = await res.json();
    elements.skillExecResult.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    elements.skillExecResult.textContent = `Error: ${err.message}`;
  }
});

// Load skills registry on startup (no workspace selected = just the list)
loadSkillsForWorkspace(null);

elements.refreshTriage.addEventListener("click", loadTriage);
elements.toggleTriage.addEventListener("click", () => {
  elements.triageSidebar.classList.toggle("hidden");
  elements.toggleTriage.textContent = elements.triageSidebar.classList.contains("hidden")
    ? "Show Triage"
    : "Hide Triage";
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
loadTriage();
loadWorkspaces();
loadMissionEngine();
loadObsidianStatus();

// ── Memory Curator UI ────────────────────────────────────────────────────────

async function loadCuratorQueue() {
  if (!elements.curatorQueue) return;
  elements.curatorQueue.innerHTML = '<div class="review-empty">Loading…</div>';
  try {
    const [qRes, sRes] = await Promise.all([
      fetch(`${API_BASE}/api/monday-sandbox/curator/queue?limit=50`),
      fetch(`${API_BASE}/api/monday-sandbox/curator/stats`),
    ]);
    const qData = await qRes.json();
    const sData = await sRes.json();
    renderCuratorStats(sData);
    renderCuratorQueue(qData.candidates || []);
  } catch (err) {
    if (elements.curatorQueue) elements.curatorQueue.innerHTML = `<div class="review-empty">Error: ${err.message}</div>`;
  }
}

function renderCuratorStats(stats) {
  if (!elements.curatorStats) return;
  const { pending = 0, approved = 0, rejected = 0 } = stats;
  elements.curatorStats.innerHTML = `
    <span class="curator-stat">Pending: <strong>${pending}</strong></span>
    <span class="curator-stat">Approved: <strong>${approved}</strong></span>
    <span class="curator-stat">Rejected: <strong>${rejected}</strong></span>
  `;
}

function renderCuratorQueue(candidates) {
  if (!elements.curatorQueue) return;
  if (!candidates.length) {
    elements.curatorQueue.innerHTML = '<div class="review-empty">Queue is empty. Run "Queue from Entities" to populate.</div>';
    return;
  }
  elements.curatorQueue.innerHTML = candidates.map((c) => {
    const conf = Math.round((c.confidence || 0) * 100);
    const confClass = conf >= 75 ? "conf-high" : conf >= 50 ? "conf-mid" : "conf-low";
    return `
      <div class="curator-item" data-id="${escapeHtml(c.id)}">
        <div class="curator-item-header">
          <span class="curator-item-type">${escapeHtml(c.type || "note")}</span>
          <span class="curator-item-domain">${escapeHtml(c.domain || "—")}</span>
          <span class="curator-conf ${confClass}">${conf}%</span>
        </div>
        <div class="curator-item-content">${escapeHtml((c.content || "").slice(0, 180))}${(c.content || "").length > 180 ? "…" : ""}</div>
        ${c.reason ? `<div class="curator-item-reason">${escapeHtml(c.reason)}</div>` : ""}
        <div class="curator-item-actions">
          <button class="curator-approve-btn" data-id="${escapeHtml(c.id)}">✓ Approve</button>
          <button class="curator-reject-btn" data-id="${escapeHtml(c.id)}">✗ Reject</button>
        </div>
      </div>
    `;
  }).join("");

  elements.curatorQueue.querySelectorAll(".curator-approve-btn").forEach((btn) => {
    btn.addEventListener("click", () => curatorApprove(btn.dataset.id));
  });
  elements.curatorQueue.querySelectorAll(".curator-reject-btn").forEach((btn) => {
    btn.addEventListener("click", () => curatorReject(btn.dataset.id));
  });
}

async function curatorApprove(id) {
  try {
    await fetch(`${API_BASE}/api/monday-sandbox/curator/${encodeURIComponent(id)}/approve`, { method: "PATCH" });
    loadCuratorQueue();
  } catch (err) {
    console.warn("[curator] approve error:", err.message);
  }
}

async function curatorReject(id) {
  try {
    await fetch(`${API_BASE}/api/monday-sandbox/curator/${encodeURIComponent(id)}/reject`, { method: "PATCH" });
    loadCuratorQueue();
  } catch (err) {
    console.warn("[curator] reject error:", err.message);
  }
}

async function curatorQueueFromEntities() {
  try {
    await fetch(`${API_BASE}/api/monday-sandbox/curator/queue/from-entities`, { method: "POST" });
    loadCuratorQueue();
  } catch (err) {
    console.warn("[curator] queue-entities error:", err.message);
  }
}

async function curatorWriteApproved() {
  try {
    const res = await fetch(`${API_BASE}/api/monday-sandbox/write-back/approved`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      addMessage(`Wrote ${data.written} approved candidates to vault. ${data.skipped} skipped.`, "monday");
    } else {
      addMessage(`Write-back failed: ${data.error || "unknown error"}`, "monday");
    }
    loadCuratorQueue();
  } catch (err) {
    console.warn("[curator] write-approved error:", err.message);
  }
}

// ── Vault Context UI ──────────────────────────────────────────────────────────

async function searchVaultCtx() {
  const query = elements.vaultCtxInput?.value?.trim();
  if (!query) return;

  const channels = [];
  if (elements.vaultCtxSemantic?.checked) channels.push("semantic");
  if (elements.vaultCtxKeyword?.checked)  channels.push("keyword");
  if (elements.vaultCtxGraph?.checked)    channels.push("graph");

  if (elements.vaultCtxResults) elements.vaultCtxResults.innerHTML = '<div class="review-empty">Searching…</div>';

  try {
    const qs = new URLSearchParams({ q: query, channels: channels.join(","), limit: "8" });
    const res = await fetch(`${API_BASE}/api/monday-sandbox/vault/search?${qs}`);
    const data = await res.json();
    renderVaultCtxResults(data);
  } catch (err) {
    if (elements.vaultCtxResults) elements.vaultCtxResults.innerHTML = `<div class="review-empty">Error: ${err.message}</div>`;
  }
}

function renderVaultCtxResults(data) {
  if (!elements.vaultCtxResults) return;
  const results = data.results || [];
  if (!results.length) {
    elements.vaultCtxResults.innerHTML = '<div class="review-empty">No results found.</div>';
    return;
  }
  elements.vaultCtxResults.innerHTML = results.map((r) => {
    const score = r.score != null ? `<span class="vault-ctx-score">${(r.score * 100).toFixed(0)}%</span>` : "";
    const channel = r.channel ? `<span class="vault-ctx-channel">${escapeHtml(r.channel)}</span>` : "";
    return `
      <div class="vault-ctx-result">
        <div class="vault-ctx-result-header">
          <strong>${escapeHtml(r.title || r.notePath || "—")}</strong>
          ${channel}${score}
        </div>
        <div class="vault-ctx-excerpt">${escapeHtml((r.excerpt || r.body || "").slice(0, 200))}</div>
        ${r.domain ? `<div class="vault-ctx-domain">${escapeHtml(r.domain)}</div>` : ""}
      </div>
    `;
  }).join("");
}

function renderMemoryRecall(recall) {
  if (!elements.vaultCtxRecall || !elements.vaultCtxRecallList) return;
  if (!recall || !recall.length) {
    elements.vaultCtxRecall.style.display = "none";
    return;
  }
  elements.vaultCtxRecall.style.display = "block";
  elements.vaultCtxRecallList.innerHTML = recall.map((r) => `
    <div class="vault-ctx-result">
      <div class="vault-ctx-result-header">
        <strong>${escapeHtml(r.title || r.table || "memory")}</strong>
        ${r.score != null ? `<span class="vault-ctx-score">${(r.score * 100).toFixed(0)}%</span>` : ""}
      </div>
      <div class="vault-ctx-excerpt">${escapeHtml((r.excerpt || "").slice(0, 160))}</div>
    </div>
  `).join("");
}

// Wire curator panel buttons
if (elements.curatorRefreshBtn) elements.curatorRefreshBtn.addEventListener("click", loadCuratorQueue);
if (elements.curatorQueueEntitiesBtn) elements.curatorQueueEntitiesBtn.addEventListener("click", curatorQueueFromEntities);
if (elements.curatorWriteApprovedBtn) elements.curatorWriteApprovedBtn.addEventListener("click", curatorWriteApproved);

// Wire vault context panel
if (elements.vaultCtxSearchBtn) elements.vaultCtxSearchBtn.addEventListener("click", searchVaultCtx);
if (elements.vaultCtxInput) {
  elements.vaultCtxInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchVaultCtx();
  });
}

// Load curator queue on startup
loadCuratorQueue();

// ── Obsidian Vault UI wiring ──────────────────────────────────────────────────

const _obsidianRefreshBtn = document.getElementById("obsidianRefreshBtn");
const _obsidianInitBtn = document.getElementById("obsidianInitBtn");
const _obsidianJournalBtn = document.getElementById("obsidianJournalBtn");
const _obsidianMissionInitBtn = document.getElementById("obsidianMissionInitBtn");
const _obsidianMissionViewBtn = document.getElementById("obsidianMissionViewBtn");
const _obsidianNoteCreateBtn = document.getElementById("obsidianNoteCreateBtn");
const _obsidianNoteViewerClose = document.getElementById("obsidianNoteViewerClose");

if (_obsidianRefreshBtn) _obsidianRefreshBtn.addEventListener("click", loadObsidianStatus);
if (_obsidianInitBtn) {
  _obsidianInitBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/monday-sandbox/obsidian/init", { method: "POST" });
      const data = await res.json();
      loadObsidianStatus();
    } catch { /* ignore */ }
  });
}
if (_obsidianJournalBtn) _obsidianJournalBtn.addEventListener("click", obsidianWriteJournal);
if (_obsidianMissionInitBtn) _obsidianMissionInitBtn.addEventListener("click", obsidianInitMission);
if (_obsidianMissionViewBtn) _obsidianMissionViewBtn.addEventListener("click", obsidianViewMission);
if (_obsidianNoteCreateBtn) _obsidianNoteCreateBtn.addEventListener("click", obsidianCreateNote);
if (_obsidianNoteViewerClose) {
  _obsidianNoteViewerClose.addEventListener("click", () => {
    if (elements.obsidianNoteViewer) elements.obsidianNoteViewer.style.display = "none";
  });
}

// ── Mission Engine UI wiring ──────────────────────────────────────────────────
const _missionRefreshBtn = document.getElementById("missionEngineRefresh");
const _missionCreateBtn = document.getElementById("missionCreateBtn");
const _missionDocSaveBtn = document.getElementById("missionDocSaveBtn");
const _missionDocCloseBtn = document.getElementById("missionDocCloseBtn");

if (_missionRefreshBtn) _missionRefreshBtn.addEventListener("click", loadMissionEngine);
if (_missionCreateBtn) _missionCreateBtn.addEventListener("click", createMission);

if (_missionDocSaveBtn) {
  _missionDocSaveBtn.addEventListener("click", async () => {
    const editorEl = document.getElementById("missionDocEditor");
    if (!editorEl) return;
    const docId = editorEl.dataset.id;
    const docName = editorEl.dataset.doc;
    const content = editorEl.querySelector(".mission-doc-editor-textarea")?.value;
    if (!docId || !docName || content == null) return;
    try {
      const res = await fetch(`${API_BASE}/api/monday-sandbox/mission-engine/${docId}/doc/${encodeURIComponent(docName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      const statusEl = editorEl.querySelector(".mission-doc-editor-status");
      if (statusEl) {
        statusEl.textContent = data.ok ? "Saved." : `Error: ${data.reason}`;
        statusEl.style.color = data.ok ? "#27ae60" : "#c0392b";
      }
    } catch (err) {
      console.warn("[mission-doc-save]", err.message);
    }
  });
}

if (_missionDocCloseBtn) {
  _missionDocCloseBtn.addEventListener("click", () => {
    const editorEl = document.getElementById("missionDocEditor");
    if (editorEl) editorEl.style.display = "none";
  });
}

// ── Presence Mode button wiring ───────────────────────────────────────────────

const _presenceOff = document.getElementById("presenceOff");
const _presenceStandby = document.getElementById("presenceStandby");
const _presenceConvo = document.getElementById("presenceConversation");

if (_presenceOff) {
  _presenceOff.addEventListener("click", () => {
    if (state.presenceMode === "standby") deactivateStandby();
    else if (state.presenceMode === "conversation") exitConversationMode();
    else { state.presenceMode = "off"; updatePresenceUI(); }
  });
}

if (_presenceStandby) {
  _presenceStandby.addEventListener("click", () => {
    if (state.presenceMode === "conversation") exitConversationMode();
    if (state.presenceMode !== "standby") activateStandby();
  });
}

if (_presenceConvo) {
  _presenceConvo.addEventListener("click", () => {
    if (state.presenceMode === "standby") deactivateStandby();
    enterConversationMode();
  });
}
