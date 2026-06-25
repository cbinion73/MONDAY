const API_BASE = `${window.location.protocol}//${window.location.host}`;

const subjectNav = document.getElementById("subjectNav");
const stageEyebrow = document.getElementById("stageEyebrow");
const stageTitle = document.getElementById("stageTitle");
const stageSubheading = document.getElementById("stageSubheading");
const presenceBanner = document.getElementById("presenceBanner");
const messageEyebrow = document.getElementById("messageEyebrow");
const messageThread = document.getElementById("messageThread");
const propStage = document.getElementById("propStage");
const nextInsightButton = document.getElementById("nextInsightButton");
const stayHereButton = document.getElementById("stayHereButton");
const askAboutButton = document.getElementById("askAboutButton");
const conversationLog = document.getElementById("conversationLog");
const composer = document.getElementById("presenceComposer");
const input = document.getElementById("presenceInput");

let presenceState = null;
let sendLock = false;
let hiddenProp = false;
let collapsedProp = false;
let lastVisiblePropKey = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readViewParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    subject: params.get("subject") || null,
  };
}

function autosizeComposer() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
}

function buildPropKey(prop) {
  if (!prop) return null;
  return JSON.stringify([
    prop.type || "prop",
    prop.title || "",
    prop.body || "",
    prop.summary || "",
    (prop.entries || []).length,
  ]);
}

function appendConversation(role, text) {
  conversationLog.hidden = false;
  const item = document.createElement("article");
  item.className = `conversation-entry ${role}`;
  item.innerHTML = `
    <span class="conversation-role">${role === "user" ? "Chris" : "Monday"}</span>
    <p>${escapeHtml(text)}</p>
  `;
  conversationLog.appendChild(item);
  conversationLog.scrollTop = conversationLog.scrollHeight;
}

function renderNav() {
  subjectNav.innerHTML = "";
  const items = [
    {
      id: "current-conversation",
      name: presenceState.home?.name || "Current Conversation",
      domain: "Active Conversations",
      state: presenceState.stage.mode,
      summary: "One living conversation at a time.",
    },
    ...(presenceState.navigation || []).map((item) => ({
      ...item,
      summary: presenceState.subjects?.[item.id]?.summary || "",
    })),
  ];

  for (const subject of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "subject-button";
    const isCurrentConversation =
      subject.id === "current-conversation" &&
      presenceState.stage.subjectId === presenceState.conversation?.subjectId;
    button.setAttribute(
      "aria-current",
      subject.id === presenceState.stage.subjectId || isCurrentConversation ? "true" : "false"
    );
    button.innerHTML = `
      <p class="subject-kicker">${escapeHtml(subject.domain || "Subject")}</p>
      <div class="subject-header">
        <h3 class="subject-name">${escapeHtml(subject.name)}</h3>
        <span class="subject-state">${escapeHtml(subject.state || "active")}</span>
      </div>
      <p class="subject-summary">${escapeHtml(subject.summary || "")}</p>
    `;
    if (subject.id === "current-conversation") {
      button.addEventListener("click", () => loadPresenceState().catch(() => {}));
    } else {
      button.addEventListener("click", () => selectSubject(subject.id));
    }
    subjectNav.appendChild(button);
  }
}

function renderTheoryProp(prop, provenance) {
  return `
    <article class="prop-card">
      <p class="prop-kicker">${escapeHtml(prop.signal || "Working theory")}</p>
      <h3 class="prop-title">${escapeHtml(prop.title)}</h3>
      <p class="prop-body">${escapeHtml(prop.body)}</p>
      ${renderProvenance(provenance)}
    </article>
  `;
}

function renderTimelineProp(prop, provenance) {
  const entries = (prop.entries || [])
    .map(
      (entry) => `
        <li class="timeline-item">
          <div class="timeline-row">
            <span>${escapeHtml(entry.label)}</span>
            <span class="timeline-meta">${escapeHtml(entry.meta || "")}</span>
          </div>
          <p class="timeline-note">${escapeHtml(entry.note || "")}</p>
        </li>
      `
    )
    .join("");

  return `
    <article class="prop-card">
      <p class="prop-kicker">Timeline</p>
      <h3 class="prop-title">${escapeHtml(prop.title)}</h3>
      <ul class="timeline-list">${entries}</ul>
      ${renderProvenance(provenance)}
    </article>
  `;
}

function renderDeliverableProp(prop, provenance) {
  return `
    <article class="prop-card">
      <p class="prop-kicker">Deliverable Preview</p>
      <h3 class="prop-title">${escapeHtml(prop.title)}</h3>
      <p class="prop-summary">${escapeHtml(prop.summary)}</p>
      <p class="deliverable-meta">Status: ${escapeHtml(prop.status || "Ready")}</p>
      ${renderProvenance(provenance)}
    </article>
  `;
}

function renderOpportunityProp(prop, provenance) {
  return `
    <article class="prop-card">
      <p class="prop-kicker">Opportunity</p>
      <h3 class="prop-title">${escapeHtml(prop.title)}</h3>
      <p class="prop-summary">${escapeHtml(prop.body)}</p>
      <p class="opportunity-confidence">Confidence: ${escapeHtml(prop.confidence || "Watching")}</p>
      ${renderProvenance(provenance)}
    </article>
  `;
}

function renderContradictionProp(prop, provenance) {
  return `
    <article class="prop-card">
      <p class="prop-kicker">Contradiction</p>
      <h3 class="prop-title">${escapeHtml(prop.title)}</h3>
      <div class="contrast-pair">
        <div class="contrast-line">
          <span class="contrast-label">Declared</span>
          <p>${escapeHtml(prop.declared)}</p>
        </div>
        <div class="contrast-line">
          <span class="contrast-label">Observed</span>
          <p>${escapeHtml(prop.observed)}</p>
        </div>
      </div>
      ${renderProvenance(provenance)}
    </article>
  `;
}

function renderProvenance(provenance) {
  if (!provenance?.label) return "";
  const source = String(provenance.label || "").toLowerCase();
  let prefix = "Prepared by";
  if (source.includes("family office")) prefix = "Noted by";
  else if (source.includes("mission control")) prefix = "Reviewed by";
  return `<p class="prop-provenance">${prefix} ${escapeHtml(provenance.label)}</p>`;
}

function renderPropControls() {
  return `
    <div class="prop-controls" aria-label="Evidence controls">
      <button class="prop-control" type="button" data-prop-action="${collapsedProp ? "expand" : "collapse"}">
        ${collapsedProp ? "Expand evidence" : "Collapse evidence"}
      </button>
      <button class="prop-control" type="button" data-prop-action="hide">
        Hide for now
      </button>
    </div>
  `;
}

function renderHiddenProp() {
  const hiddenState = hiddenProp ? "hidden-state" : "pause-state";
  const title = hiddenProp ? "Evidence is hidden for now." : "No evidence yet. Monday is still framing the thought.";
  const summary = hiddenProp
    ? "You can keep listening without the supporting material on stage."
    : "The stage stays quiet until support adds something the thought cannot carry alone.";
  propStage.innerHTML = `
    <article class="prop-card ${hiddenState}">
      <p class="prop-kicker">Holding</p>
      <h3 class="prop-title">${escapeHtml(title)}</h3>
      <p class="prop-summary">${escapeHtml(summary)}</p>
    </article>
  `;
}

function renderProp() {
  const propState = presenceState.stage.prop || { visible: false, payload: null };
  const provenance = presenceState.stage.provenance || null;

  if (!propState.visible || !propState.payload || hiddenProp) {
    lastVisiblePropKey = propState.visible ? buildPropKey(propState.payload) : null;
    renderHiddenProp();
    return;
  }

  const prop = propState.payload;
  let markup = "";
  if (prop.type === "theory") markup = renderTheoryProp(prop, provenance);
  else if (prop.type === "timeline") markup = renderTimelineProp(prop, provenance);
  else if (prop.type === "deliverable") markup = renderDeliverableProp(prop, provenance);
  else if (prop.type === "opportunity") markup = renderOpportunityProp(prop, provenance);
  else if (prop.type === "contradiction") markup = renderContradictionProp(prop, provenance);
  else {
    renderHiddenProp();
    return;
  }

  const propKey = buildPropKey(prop);
  const revealClass = propKey !== lastVisiblePropKey ? "revealed" : "";
  lastVisiblePropKey = propKey;

  propStage.innerHTML = `
    <div class="prop-shell ${collapsedProp ? "collapsed" : "expanded"}">
      ${markup.replace('class="prop-card"', `class="prop-card ${revealClass}"`)}
      ${renderPropControls()}
    </div>
  `;

  for (const control of propStage.querySelectorAll("[data-prop-action]")) {
    control.addEventListener("click", () => {
      const action = control.getAttribute("data-prop-action");
      if (action === "hide") {
        hiddenProp = true;
      } else if (action === "collapse") {
        collapsedProp = true;
      } else if (action === "expand") {
        collapsedProp = false;
      }
      renderProp();
    });
  }
}

function renderBanner() {
  const mode = presenceState.stage.mode;
  const provenance = presenceState.stage.provenance?.label;
  if (mode === "resume") {
    presenceBanner.hidden = false;
    presenceBanner.className = "presence-banner resume";
    presenceBanner.innerHTML = "<strong>Monday is picking up where you left off.</strong>";
    return;
  }

  if (mode === "interruption") {
    presenceBanner.hidden = false;
    presenceBanner.className = "presence-banner interruption";
    presenceBanner.innerHTML = `<strong>Monday found something.</strong>${provenance ? ` <span>${escapeHtml(formatProvenanceInline(provenance))}</span>` : ""}`;
    return;
  }

  presenceBanner.hidden = true;
  presenceBanner.className = "presence-banner";
  presenceBanner.innerHTML = "";
}

function formatProvenanceInline(label) {
  const source = String(label || "").toLowerCase();
  if (source.includes("family office")) return `Noted by ${label}.`;
  if (source.includes("mission control")) return `Reviewed by ${label}.`;
  return `Prepared by ${label}.`;
}

function renderControls() {
  const stage = presenceState.stage;
  const controls = presenceState.controls || {};
  nextInsightButton.textContent = controls.primaryAction === "pause" ? "Continue" : "Continue";
  nextInsightButton.disabled = false;
  stayHereButton.hidden = false;
  stayHereButton.disabled = false;
  askAboutButton.hidden = false;
  askAboutButton.disabled = false;
  stayHereButton.textContent = "Stay here";
}

function renderStage() {
  const subject = presenceState.subject || null;
  const stage = presenceState.stage;
  stageEyebrow.textContent =
    stage.mode === "resume"
      ? "Resume"
      : stage.mode === "interruption"
        ? "Interruptions"
        : subject?.domain || "Monday Presence";
  stageTitle.textContent =
    stage.subjectId === "daily"
      ? presenceState.greeting
      : subject?.name || presenceState.greeting;
  stageSubheading.textContent =
    stage.subjectId === "daily"
      ? presenceState.subheading
      : subject?.summary || presenceState.subheading;

  messageEyebrow.textContent = stage.eyebrow || "Presence";
  messageThread.innerHTML = `
    <article class="message-block">
      <p>${escapeHtml(stage.title)}</p>
    </article>
    <article class="message-block">
      <p>${escapeHtml(stage.body)}</p>
    </article>
  `;

  renderBanner();
  renderProp();
  renderControls();
}

async function loadPresenceState(subjectId = null) {
  const params = new URLSearchParams();
  if (subjectId) params.set("subject", subjectId);
  const response = await fetch(`${API_BASE}/api/presence/daily${params.toString() ? `?${params}` : ""}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to load presence state");
  presenceState = await response.json();
  renderNav();
  renderStage();
}

async function advancePresence(action = "continue", subjectId = null) {
  const response = await fetch(`${API_BASE}/api/presence/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, subjectId }),
  });
  if (!response.ok) throw new Error("Unable to advance presence");
  presenceState = await response.json();
  hiddenProp = false;
  collapsedProp = false;
  renderNav();
  renderStage();
}

async function selectSubject(subjectId) {
  try {
    await advancePresence("select_subject", subjectId);
  } catch (error) {
    stageTitle.textContent = "Monday could not move the stage.";
    stageSubheading.textContent = error.message;
  }
}

async function sendMessage(text) {
  if (!text || sendLock) return;
  sendLock = true;
  appendConversation("user", text);
  input.value = "";
  autosizeComposer();

  try {
    const response = await fetch(`${API_BASE}/api/presence/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        currentSubjectId: presenceState?.stage?.subjectId || "daily",
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      appendConversation("monday", payload.error || "Monday could not answer right now.");
      return;
    }
    appendConversation("monday", payload.reply || "Monday replied without text.");
    if (payload.presence) {
      presenceState = payload.presence;
      hiddenProp = false;
      collapsedProp = false;
      renderNav();
      renderStage();
    }
  } catch (error) {
    appendConversation("monday", `Connection issue: ${error.message}`);
  } finally {
    sendLock = false;
  }
}

nextInsightButton.addEventListener("click", () => {
  advancePresence("continue").catch((error) => {
    stageTitle.textContent = "Monday could not continue the thread.";
    stageSubheading.textContent = error.message;
  });
});

stayHereButton.addEventListener("click", () => {
  advancePresence("pause").catch((error) => {
    stageTitle.textContent = "Monday could not hold the stage.";
    stageSubheading.textContent = error.message;
  });
});

askAboutButton.addEventListener("click", () => {
  input.focus();
  const subjectName = presenceState?.subject?.name || "this";
  input.placeholder = `Ask about ${subjectName}...`;
  autosizeComposer();
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value.trim());
});

input.addEventListener("input", autosizeComposer);

const initialView = readViewParams();
loadPresenceState(initialView.subject).catch((error) => {
  stageTitle.textContent = "Monday could not load presence.";
  stageSubheading.textContent = error.message;
});

autosizeComposer();
