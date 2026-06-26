const API_BASE = `${window.location.protocol}//${window.location.host}`;
const ARTIFACT_STORAGE_KEY = "monday.dynamicArtifactPayload";

const scene = document.querySelector(".presence-scene");
const graphCanvas = document.querySelector(".memory-graph");
const graphContainer = document.querySelector(".memory-core");
const floatingBubbles = document.getElementById("floatingBubbles");
const threadEl = document.getElementById("presenceThread");
const composerEl = document.getElementById("presenceComposer");
const inputEl = document.getElementById("presenceInput");
const sendButton = document.getElementById("sendButton");
const micButton = document.getElementById("presenceMicButton");
const continueButton = document.getElementById("continueButton");
const askAboutButton = document.getElementById("askAboutButton");
const stayHereButton = document.getElementById("stayHereButton");
const closeModalButton = document.getElementById("closeModalButton");
const artifactSurface = document.getElementById("artifactSurface");
const artifactFrame = document.getElementById("artifactFrame");
const artifactEyebrow = document.getElementById("artifactEyebrow");
const artifactTitle = document.getElementById("artifactTitle");
const artifactMeta = document.getElementById("artifactMeta");
const artifactReason = document.getElementById("artifactReason");
const artifactSummary = document.getElementById("artifactSummary");
const artifactNextAction = document.getElementById("artifactNextAction");
const artifactExternalLink = document.getElementById("artifactExternalLink");
const artifactFallback = document.getElementById("artifactFallback");
const artifactFallbackBody = document.getElementById("artifactFallbackBody");
const greetingLine = document.getElementById("greetingLine");
const subjectBadge = document.getElementById("subjectBadge");
const stageSubheading = document.getElementById("stageSubheading");
const brainStatus = document.getElementById("brainStatus");

const state = {
  presence: null,
  recognition: null,
  sendLock: false,
  listening: false,
  speaking: false,
  currentArtifactKey: null,
  dismissedArtifactKey: null,
  currentPresentation: null,
  lastPresentation: null,
  presentationsByType: {},
  iframeFallbackTimer: null,
  floatingTimer: null,
};

function readViewParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    subject: params.get("subject") || null,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function autosizeComposer() {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, window.innerHeight * 0.22)}px`;
}

function currentSubjectId() {
  return state.presence?.stage?.subjectId || state.presence?.conversation?.subjectId || null;
}

function currentBrainState() {
  if (state.listening) return "listening";
  if (state.sendLock) return "thinking";
  if (state.speaking) return "speaking";
  if (artifactSurface.dataset.state === "visible") return "presenting";
  if (state.presence?.stage?.arrivalMode === "still_checking") return "working";
  if (!state.presence?.stage?.title && !state.presence?.conversation?.history?.length) return "waiting";
  return "idle";
}

function setBrainState(nextState = currentBrainState()) {
  scene.dataset.brainState = nextState;
  const labels = {
    idle: "Idle",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    presenting: "Presenting",
    working: "Working",
    waiting: "Waiting",
  };
  brainStatus.textContent = labels[nextState] || "Idle";
}

function setBusy(isBusy) {
  state.sendLock = isBusy;
  inputEl.disabled = isBusy;
  sendButton.disabled = isBusy;
  continueButton.disabled = isBusy;
  autosizeComposer();
  setBrainState();
}

function clearFloatingBubbles() {
  floatingBubbles.replaceChildren();
  if (state.floatingTimer) {
    window.clearTimeout(state.floatingTimer);
    state.floatingTimer = null;
  }
}

function addFloatingBubble(text, who, tone = "") {
  const item = document.createElement("div");
  item.className = `floating-bubble ${who}${tone ? ` ${tone}` : ""}`;
  item.textContent = text;
  floatingBubbles.appendChild(item);
  return item;
}

function fadeFloatingBubbles(delay = 6200) {
  if (state.floatingTimer) window.clearTimeout(state.floatingTimer);
  state.floatingTimer = window.setTimeout(() => {
    for (const bubble of floatingBubbles.children) {
      bubble.classList.add("is-fading");
    }
  }, delay);
}

function addThreadMessage(text, who, pending = false) {
  threadEl.hidden = false;
  const item = document.createElement("div");
  item.className = `presence-message ${who}${pending ? " pending" : ""}`;
  item.textContent = text;
  threadEl.appendChild(item);
  threadEl.scrollTop = threadEl.scrollHeight;
  return item;
}

function renderThread() {
  const history = state.presence?.conversation?.history || [];
  threadEl.innerHTML = "";

  const introParts = [];
  if (state.presence?.stage?.mode === "resume") {
    introParts.push("Monday is picking up where you left off.");
  } else if (state.presence?.stage?.mode === "interruption") {
    introParts.push("Monday found something.");
  }

  if (state.presence?.stage?.title) {
    introParts.push(state.presence.stage.title);
  }
  if (state.presence?.stage?.body) {
    introParts.push(state.presence.stage.body);
  }

  if (introParts.length) {
    addThreadMessage(introParts.join(" "), "monday");
  }

  for (const entry of history) {
    if (entry.user) addThreadMessage(entry.user, "user");
    if (entry.monday) addThreadMessage(entry.monday, "monday");
  }

  threadEl.hidden = !threadEl.children.length;
}

function renderTopline() {
  greetingLine.textContent = state.presence?.greeting || "Good morning, Chris.";
  const subject = state.presence?.subject;
  const arrivalMode = state.presence?.stage?.arrivalMode;
  const badge = subject?.name || "Monday";
  subjectBadge.textContent = arrivalMode
    ? `${badge} · ${arrivalMode.replace(/_/g, " ")}`
    : badge;
  stageSubheading.textContent =
    state.presence?.stage?.arrivalReason ||
    state.presence?.subheading ||
    "";
}

function propPayloadToArtifact(prop) {
  const conversation = state.presence?.conversation || {};
  const evidence = conversation.evidence || {};
  const supporting = (evidence.supportingEvidence || []).slice(0, 4).map((item) => item.statement);
  const opposing = (evidence.opposingEvidence || []).slice(0, 2).map((item) => item.statement);

  const base = {
    version: 1,
    kind: "evidence",
    eyebrow: state.presence?.stage?.eyebrow || "Monday found",
    title: prop?.title || state.presence?.stage?.title || "Supporting information",
    summary: prop?.body || prop?.summary || conversation.read || state.presence?.stage?.body || "",
    blocks: [],
  };

  if (prop?.type === "theory") {
    base.blocks.push({
      type: "focus_grid",
      title: "Current Read",
      cards: [
        {
          title: prop.signal || "Working theory",
          body: prop.body || conversation.whatIThink || "",
          meta: `Confidence ${Math.round((conversation.confidence || 0) * 100)}%`,
        },
        {
          title: "Why it matters",
          body: conversation.recommendation || conversation.opportunity || conversation.summary || "",
          meta: "Next move",
        },
      ],
    });
  } else if (prop?.type === "timeline") {
    base.kind = "timeline";
    base.blocks.push({
      type: "text_block",
      title: "Why this matters",
      body: prop.body || state.presence?.stage?.body || conversation.whatChangedMyMind || "",
    });
    base.blocks.push({
      type: "evidence_list",
      title: "Movement",
      items: (prop.entries || []).map((entry) =>
        `${entry.label || "Signal"}${entry.meta ? ` — ${entry.meta}` : ""}${entry.note ? `: ${entry.note}` : ""}`
      ),
    });
  } else if (prop?.type === "deliverable") {
    base.kind = "deliverable";
    base.blocks.push({
      type: "focus_grid",
      title: "Supporting Deliverable",
      cards: [
        {
          title: prop.title || "Deliverable",
          body: prop.summary || "",
          meta: prop.status || "Ready",
        },
      ],
    });
    if (prop.summary) {
      base.blocks.push({
        type: "text_block",
        title: "Deliverable summary",
        body: prop.summary,
      });
    }
  } else if (prop?.type === "opportunity") {
    base.kind = "recommendation";
    base.blocks.push({
      type: "recommendation",
      title: prop.title || "Opportunity",
      body: prop.body || conversation.recommendation || "",
    });
  } else if (prop?.type === "contradiction") {
    base.blocks.push({
      type: "focus_grid",
      title: "Contradiction",
      cards: [
        {
          title: "Declared",
          body: prop.declared || "",
          meta: "What was said",
        },
        {
          title: "Observed",
          body: prop.observed || "",
          meta: "What keeps happening",
        },
      ],
    });
  }

  if (supporting.length) {
    base.blocks.push({
      type: "evidence_list",
      title: "Supporting Evidence",
      items: supporting,
    });
  }

  if (opposing.length) {
    base.blocks.push({
      type: "evidence_list",
      title: "What is still resisting the read",
      items: opposing,
    });
  }

  if (conversation.recommendation && prop?.type !== "opportunity") {
    base.blocks.push({
      type: "recommendation",
      title: "What I would do next",
      body: conversation.recommendation,
    });
  }

  return base;
}

function buildEvidenceArtifactFromConversation() {
  const conversation = state.presence?.conversation || {};
  const evidence = conversation.evidence || {};
  const supporting = (evidence.supportingEvidence || []).map((item) => item.statement).filter(Boolean);
  const opposing = (evidence.opposingEvidence || []).map((item) => item.statement).filter(Boolean);
  if (!supporting.length && !opposing.length && !conversation.whatWouldChangeMyMind) return null;

  const blocks = [];
  if (supporting.length) {
    blocks.push({
      type: "evidence_list",
      title: "Supporting evidence",
      items: supporting.slice(0, 6),
    });
  }
  if (opposing.length) {
    blocks.push({
      type: "evidence_list",
      title: "What is still resisting the read",
      items: opposing.slice(0, 4),
    });
  }
  if (conversation.whatWouldChangeMyMind) {
    blocks.push({
      type: "text_block",
      title: "What would change my mind",
      body: conversation.whatWouldChangeMyMind,
    });
  }
  if (conversation.recommendation) {
    blocks.push({
      type: "recommendation",
      title: "What I would do next",
      body: conversation.recommendation,
    });
  }

  return {
    version: 1,
    kind: "evidence",
    eyebrow: "Evidence",
    title: `${state.presence?.subject?.name || "This subject"} evidence`,
    summary: conversation.whatChangedMyMind || conversation.read || conversation.thought || "",
    confidence: conversation.confidence || null,
    blocks,
  };
}

function buildResearchArtifactFromPresentation(presentation) {
  const sources = Array.isArray(presentation?.sources) ? presentation.sources.filter((item) => item?.url) : [];
  if (!sources.length) return null;
  return {
    version: 1,
    kind: "research",
    eyebrow: "Research",
    title: `${state.presence?.subject?.name || "Current"} research`,
    summary: presentation.summary || "Monday gathered a small set of sources worth comparing.",
    recommendation: presentation.nextAction || presentation.reason || "",
    blocks: [
      {
        type: "source_list",
        title: "Sources",
        items: sources.slice(0, 6),
      },
      presentation.summary
        ? {
            type: "text_block",
            title: "Monday's read",
            body: presentation.summary,
          }
        : null,
      presentation.nextAction
        ? {
            type: "recommendation",
            title: "Recommendation",
            body: presentation.nextAction,
          }
        : null,
    ].filter(Boolean),
  };
}

function presetPresentation(key) {
  const presets = {
    health: {
      type: "work_surface",
      eyebrow: "Work Surface",
      title: "Health dashboard",
      reason: "Monday placed the relevant health surface on the table.",
      summary: "Use the sequence on screen to inspect the current health read.",
      embedUrl: "/health-dashboard.html",
      nextAction: "Start with the first signal Monday surfaced.",
    },
    travel: {
      type: "deliverable",
      eyebrow: "Deliverable",
      title: "Travel itinerary",
      reason: "Monday prepared a structured itinerary surface for this trip.",
      embedUrl: "/travel-itinerary.html",
      nextAction: "Review the trip shape, then decide what needs to change.",
    },
    denver: {
      type: "recommendation",
      eyebrow: "Recommendation",
      title: "Denver travel suggestion",
      reason: "Monday surfaced the current destination recommendation in one place.",
      embedUrl: "/denver-suggestion.html",
      nextAction: "Check whether the suggested shape still fits the trip.",
    },
    transport: {
      type: "work_surface",
      eyebrow: "Work Surface",
      title: "Transport recommendation",
      reason: "Monday brought the mode comparison forward because the decision is easier to judge visually.",
      embedUrl: "/transport-options.html",
      nextAction: "Compare the options, then choose the mode that best fits the trip.",
    },
    quantum: {
      type: "research",
      eyebrow: "Research",
      title: "Quantum survey",
      reason: "Monday assembled the research briefing into a readable survey surface.",
      embedUrl: "/quantum-survey.html",
      nextAction: "Read the market read first, then decide what deserves deeper follow-up.",
    },
  };
  return presets[key] || null;
}

function normalizePresentationPayload({ presence = state.presence, surfacingPlan = null, trigger = null } = {}) {
  const conversation = presence?.conversation || {};
  const stage = presence?.stage || {};

  if (surfacingPlan?.artifactRuntime?.payload) {
    const payload = surfacingPlan.artifactRuntime.payload;
    if (payload.kind === "website" && payload.url) {
      return {
        type: "website",
        eyebrow: "Website",
        title: payload.title || "Surfaced website",
        reason: payload.reason || "Monday found a live source worth opening.",
        summary: payload.summary || "",
        nextAction: payload.nextAction || "",
        sources: Array.isArray(payload.sources) ? payload.sources : [],
        externalUrl: payload.url,
        embedUrl: payload.url,
        fallbackBody: "This site may block embedding here. Monday can still open it directly in your browser.",
      };
    }

    return {
      type: payload.kind || "artifact",
      eyebrow: stage.eyebrow || titleCase(payload.kind || "supporting brief"),
      title: payload.title || stage.title || "Supporting information",
      reason: stage.arrivalReason || surfacingPlan.rationale || "",
      summary: payload.summary || "",
      nextAction: payload.recommendation || "",
      artifactPayload: payload,
    };
  }

  if (surfacingPlan?.artifactRuntime?.mode === "preset") {
    return presetPresentation(surfacingPlan.artifactRuntime.key);
  }

  if (trigger === "evidence") {
    const evidencePayload = buildEvidenceArtifactFromConversation();
    if (evidencePayload) {
      return {
        type: "evidence",
        eyebrow: "Evidence",
        title: `${presence?.subject?.name || "This subject"} evidence`,
        reason: "This is the evidence Monday is currently leaning on.",
        summary: evidencePayload.summary || "",
        nextAction: conversation.recommendation || "",
        artifactPayload: evidencePayload,
      };
    }
  }

  const propState = stage.prop;
  if (propState?.visible && propState?.payload) {
    const artifactPayload = propPayloadToArtifact(propState.payload);
    return {
      type: artifactPayload.kind || propState.payload.type || "artifact",
      eyebrow: stage.eyebrow || artifactPayload.eyebrow || "Supporting Brief",
      title: propState.payload.title || stage.title || "Supporting information",
      reason: stage.body || "",
      summary: artifactPayload.summary || "",
      nextAction: conversation.recommendation || "",
      artifactPayload,
    };
  }

  return null;
}

function buildArtifactKey(presentation) {
  return JSON.stringify([
    currentSubjectId(),
    presentation?.type || "",
    presentation?.title || "",
    presentation?.summary || "",
    presentation?.externalUrl || "",
    JSON.stringify(presentation?.artifactPayload?.blocks || []),
  ]);
}

function clearIframeFallbackTimer() {
  if (state.iframeFallbackTimer) {
    window.clearTimeout(state.iframeFallbackTimer);
    state.iframeFallbackTimer = null;
  }
}

function applyModalMeta(presentation) {
  artifactEyebrow.textContent = presentation.eyebrow || "Supporting Brief";
  artifactTitle.textContent = presentation.title || "Monday found something worth opening.";

  const reason = normalizeText(presentation.reason);
  const summary = normalizeText(presentation.summary);
  const nextAction = normalizeText(presentation.nextAction);

  artifactMeta.hidden = !(reason || summary || nextAction);
  artifactReason.textContent = reason;
  artifactReason.hidden = !reason;
  artifactSummary.textContent = summary;
  artifactSummary.hidden = !summary;
  artifactNextAction.innerHTML = nextAction ? `<strong>Next action:</strong> ${escapeHtml(nextAction)}` : "";
  artifactNextAction.hidden = !nextAction;

  if (presentation.externalUrl) {
    artifactExternalLink.href = presentation.externalUrl;
    artifactExternalLink.hidden = false;
  } else {
    artifactExternalLink.hidden = true;
    artifactExternalLink.removeAttribute("href");
  }
}

function revealIframePresentation(presentation) {
  artifactFallback.hidden = true;
  artifactFrame.classList.remove("is-hidden");
  artifactFrame.onload = null;
  clearIframeFallbackTimer();

  artifactFrame.onload = () => {
    clearIframeFallbackTimer();
    artifactFallback.hidden = true;
    artifactFrame.classList.remove("is-hidden");
  };

  artifactFrame.src = presentation.embedUrl;

  if (presentation.type === "website" && presentation.externalUrl) {
    state.iframeFallbackTimer = window.setTimeout(() => {
      artifactFallback.hidden = false;
      artifactFallbackBody.textContent =
        presentation.fallbackBody || "This site may block embedding here. Monday can still open it directly in your browser.";
      artifactFrame.classList.add("is-hidden");
    }, 2800);
  }
}

function revealArtifactPayload(presentation) {
  artifactFallback.hidden = true;
  artifactFrame.classList.remove("is-hidden");
  clearIframeFallbackTimer();
  window.sessionStorage.setItem(ARTIFACT_STORAGE_KEY, JSON.stringify(presentation.artifactPayload));
  artifactFrame.src = `/artifact-view.html?ts=${Date.now()}`;
}

function openArtifactModal(presentation = state.currentPresentation, { force = false } = {}) {
  if (!presentation) return;

  const artifactKey = buildArtifactKey(presentation);
  if (!force && artifactKey === state.currentArtifactKey && artifactSurface.dataset.state === "visible") {
    return;
  }

  state.currentPresentation = presentation;
  state.lastPresentation = presentation;
  state.presentationsByType[presentation.type] = presentation;
  state.currentArtifactKey = artifactKey;
  state.dismissedArtifactKey = null;

  applyModalMeta(presentation);

  if (presentation.embedUrl) {
    revealIframePresentation(presentation);
  } else if (presentation.artifactPayload) {
    revealArtifactPayload(presentation);
  } else {
    artifactFallback.hidden = false;
    artifactFallbackBody.textContent = "Monday does not have anything concrete to open for this yet.";
    artifactFrame.classList.add("is-hidden");
  }

  artifactSurface.dataset.state = "visible";
  setBrainState();
}

function closeArtifactModal() {
  clearIframeFallbackTimer();
  state.dismissedArtifactKey = state.currentArtifactKey;
  artifactSurface.dataset.state = "hidden";
  setBrainState();
}

function maybeRevealArtifact(surfacingPlan = null) {
  const presentation = normalizePresentationPayload({ presence: state.presence, surfacingPlan });
  if (!presentation) return;
  state.currentPresentation = presentation;
  state.presentationsByType[presentation.type] = presentation;
  const nextKey = buildArtifactKey(presentation);
  if (!surfacingPlan && artifactSurface.dataset.state !== "visible" && nextKey === state.dismissedArtifactKey) {
    return;
  }
  if (nextKey === state.currentArtifactKey && artifactSurface.dataset.state === "visible") return;
  window.setTimeout(() => openArtifactModal(presentation), state.presence?.stage?.pauseSuggestedMs || 800);
}

function resolveTriggerIntent(text) {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return null;
  if (/\bshow (?:the )?website\b|\bopen (?:that|the website|the site)\b|\bpull it up\b|\bshow the site\b/.test(normalized)) return "website";
  if (/\bshow (?:the )?sources\b|\bshow research\b|\bopen research\b/.test(normalized)) return "research";
  if (/\bshow (?:the )?plan\b|\bbring up the itinerary\b|\bshow (?:the )?itinerary\b|\bshow (?:the )?checklist\b/.test(normalized)) return "deliverable";
  if (/\bshow (?:the )?recommendation\b|\bopen (?:the )?recommendation\b/.test(normalized)) return "recommendation";
  if (/\bshow evidence\b|\bopen evidence\b/.test(normalized)) return "evidence";
  if (/^(show me|open that|pull it up|bring it up|show that)$/i.test(normalized)) return "current";
  return null;
}

function handleLocalPresentationTrigger(text) {
  const trigger = resolveTriggerIntent(text);
  if (!trigger) return false;

  const active = normalizePresentationPayload({
    presence: state.presence,
    trigger: trigger === "current" ? null : trigger,
  });
  const byType = trigger === "current" ? state.currentPresentation || state.lastPresentation : state.presentationsByType[trigger];
  let presentation = byType || active || state.currentPresentation || state.lastPresentation;

  if (trigger === "research" && presentation?.sources?.length) {
    presentation = {
      type: "research",
      eyebrow: "Research",
      title: `${state.presence?.subject?.name || "Current"} sources`,
      reason: "Monday gathered these sources behind the current read.",
      summary: presentation.summary || "",
      nextAction: presentation.nextAction || "",
      artifactPayload: buildResearchArtifactFromPresentation(presentation),
    };
  }

  if (!presentation) {
    addThreadMessage("I do not have supporting material on the table for that yet.", "monday");
    return true;
  }

  openArtifactModal(presentation, { force: true });
  return true;
}

function renderFloatingThought() {
  clearFloatingBubbles();
  const stage = state.presence?.stage || {};
  if (!stage.title && !stage.body) return;

  if (stage.mode === "interruption") {
    addFloatingBubble("Monday found something.", "monday", "meta");
  } else if (stage.mode === "resume") {
    addFloatingBubble("Monday is picking up where you left off.", "monday", "meta");
  }

  addFloatingBubble(stage.title || stage.body, "monday");
  if (stage.body && stage.title) {
    addFloatingBubble(stage.body, "monday");
  }
  fadeFloatingBubbles();
}

function renderPresence() {
  renderTopline();
  renderFloatingThought();
  renderThread();
  maybeRevealArtifact();
  setBrainState();
}

async function loadPresenceState(subjectId = null) {
  const params = new URLSearchParams();
  if (subjectId) params.set("subject", subjectId);
  const response = await fetch(`${API_BASE}/api/presence/daily${params.toString() ? `?${params}` : ""}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to load Monday.");
  state.presence = await response.json();
  renderPresence();
}

async function advancePresence(action = "continue") {
  if (state.sendLock) return;
  setBusy(true);
  try {
    const response = await fetch(`${API_BASE}/api/presence/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        subjectId: currentSubjectId(),
      }),
    });
    if (!response.ok) throw new Error("Unable to continue.");
    state.presence = await response.json();
    renderPresence();
  } catch (error) {
    addThreadMessage(error.message || "Unable to continue right now.", "monday");
  } finally {
    setBusy(false);
    inputEl.focus();
  }
}

async function sendPresenceMessage(text, options = {}) {
  const cleaned = String(text || "").trim();
  if (!cleaned || state.sendLock) return;
  if (handleLocalPresentationTrigger(cleaned)) {
    inputEl.value = "";
    autosizeComposer();
    inputEl.focus();
    return;
  }

  setBusy(true);
  addThreadMessage(cleaned, "user");
  const pending = addThreadMessage("Monday is thinking...", "monday", true);
  inputEl.value = "";
  autosizeComposer();

  try {
    const response = await fetch(`${API_BASE}/api/presence/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: cleaned,
        currentSubjectId: currentSubjectId(),
        voice: options.voice === true,
      }),
    });
    const payload = await response.json();
    pending.remove();

    if (!response.ok) {
      addThreadMessage(payload.error || "Monday could not answer right now.", "monday");
      return;
    }

    if (payload.presence) {
      state.presence = payload.presence;
      const trigger = /\bwhy do you think that\b/i.test(cleaned) ? "evidence" : null;
      const surfaced = normalizePresentationPayload({
        presence: payload.presence,
        surfacingPlan: payload.surfacingPlan || null,
        trigger,
      });
      if (surfaced) {
        state.currentPresentation = surfaced;
        state.lastPresentation = surfaced;
        state.presentationsByType[surfaced.type] = surfaced;
      }
      renderPresence();
      if (surfaced && (payload.surfacingPlan || trigger === "evidence")) {
        window.setTimeout(() => openArtifactModal(surfaced), payload.presence?.stage?.pauseSuggestedMs || 700);
      }
    } else {
      addThreadMessage(payload.reply || "Monday replied without text.", "monday");
      await loadPresenceState(currentSubjectId());
    }
  } catch (error) {
    pending.remove();
    addThreadMessage(error.message || "Connection failed.", "monday");
  } finally {
    setBusy(false);
    inputEl.focus();
  }
}

function initSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    micButton.disabled = true;
    micButton.title = "Speech recognition is unavailable in this browser.";
    return;
  }

  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    state.listening = true;
    setBrainState();
    micButton.classList.add("active");
  };

  recognition.onend = () => {
    state.listening = false;
    setBrainState();
    micButton.classList.remove("active");
  };

  recognition.onerror = () => {
    state.listening = false;
    setBrainState();
    micButton.classList.remove("active");
    addThreadMessage("Microphone input is unavailable right now.", "monday");
  };

  recognition.onresult = async (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    if (!transcript.trim()) return;
    await sendPresenceMessage(transcript, { voice: true });
  };

  state.recognition = recognition;
}

function attachEvents() {
  inputEl.addEventListener("input", autosizeComposer);

  composerEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendPresenceMessage(inputEl.value, { voice: false });
  });

  continueButton.addEventListener("click", async () => {
    await advancePresence("continue");
  });

  askAboutButton.addEventListener("click", () => {
    if (state.currentPresentation || state.presence?.stage?.prop?.visible) {
      openArtifactModal(state.currentPresentation || normalizePresentationPayload(), { force: true });
      return;
    }
    inputEl.value = "Tell me about this.";
    autosizeComposer();
    inputEl.focus();
  });

  stayHereButton.addEventListener("click", () => {
    closeArtifactModal();
    inputEl.focus();
  });

  closeModalButton.addEventListener("click", closeArtifactModal);

  artifactSurface.addEventListener("click", (event) => {
    if (event.target === artifactSurface) {
      closeArtifactModal();
    }
  });

  micButton.addEventListener("click", () => {
    if (!state.recognition) {
      addThreadMessage("Microphone input is unavailable in this browser.", "monday");
      return;
    }
    if (state.listening) {
      state.recognition.stop();
      return;
    }
    state.recognition.start();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && artifactSurface.dataset.state === "visible") {
      closeArtifactModal();
    }
  });
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createGraphRenderer(canvas, container) {
  if (!canvas || !container) return null;
  const context = canvas.getContext("2d");
  const renderState = {
    width: 0,
    height: 0,
    radius: 0,
    centerX: 0,
    centerY: 0,
    nodes: [],
    links: [],
  };

  function buildGraphFromPresence() {
    const subject = state.presence?.subject;
    const conversation = state.presence?.conversation || {};
    const themes = conversation.driftMemory?.dominantThemes || [];
    const nodes = [];
    const links = [];
    const rootId = subject?.id || "monday";
    nodes.push({ id: rootId, degree: 10 });

    const addNode = (id, degree = 4) => {
      if (!nodes.find((node) => node.id === id)) nodes.push({ id, degree });
      links.push({ source: rootId, target: id });
    };

    themes.slice(0, 6).forEach((theme) => addNode(`theme:${theme.theme}`, 5 + Math.min(4, theme.count)));
    (conversation.supportingSignals || []).slice(0, 4).forEach((signal, index) => {
      addNode(`support:${index}:${signal.theme || signal.type || "signal"}`, 3 + Math.round(signal.confidence || 0));
    });
    (conversation.opposingSignals || []).slice(0, 2).forEach((signal, index) => {
      addNode(`oppose:${index}:${signal.theme || signal.type || "signal"}`, 2 + Math.round(signal.confidence || 0));
    });

    if (nodes.length === 1) {
      ["continuity", "current-read", "presence", "evidence", "memory"].forEach((label, index) => {
        nodes.push({ id: label, degree: 4 + index });
        links.push({ source: rootId, target: label });
      });
    }

    return { nodes, links };
  }

  function resize() {
    const box = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    canvas.style.width = `${box.width}px`;
    canvas.style.height = `${box.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderState.width = box.width;
    renderState.height = box.height;
    renderState.centerX = box.width / 2;
    renderState.centerY = box.height / 2;
    renderState.radius = Math.min(box.width, box.height) * 0.48;
  }

  function layoutGraph(payload) {
    const visibleNodes = payload.nodes;
    const degreeMap = new Map(visibleNodes.map((node) => [node.id, node.degree || 0]));
    const maxDegree = Math.max(...visibleNodes.map((node) => node.degree || 0), 1);
    renderState.links = payload.links;

    renderState.nodes = visibleNodes.map((node, index) => {
      const seed = hashString(node.id || `${index}`);
      const random = mulberry32(seed);
      const degree = degreeMap.get(node.id) || 0;
      const normalizedDegree = degree / maxDegree;
      return {
        id: node.id,
        degree,
        radius: 1.5 + normalizedDegree * 7.2,
        opacity: 0.68 + normalizedDegree * 0.26,
        seed,
        pulsePhase: random() * Math.PI * 2,
        pulseSpeed: 0.58 + random() * 0.88,
        orbitAmplitude: degree >= maxDegree * 0.7 ? 1.4 : 2.6 + random() * 2,
      };
    });

    renderState.nodes.sort((left, right) => right.degree - left.degree || left.seed - right.seed);
    const hubCount = Math.min(3, Math.max(1, Math.ceil(renderState.nodes.length * 0.08)));
    const hubs = renderState.nodes.slice(0, hubCount);
    const orbiters = renderState.nodes.slice(hubCount);
    const outerBoundary = renderState.radius * 0.44;
    const innerBoundary = renderState.radius * 0.14;
    const hubOffsets = [
      { x: 0, y: -renderState.radius * 0.035 },
      { x: renderState.radius * 0.04, y: renderState.radius * 0.024 },
      { x: -renderState.radius * 0.042, y: renderState.radius * 0.02 },
    ];

    hubs.forEach((node, index) => {
      const offset = hubOffsets[index] || { x: 0, y: 0 };
      node.x = renderState.centerX + offset.x;
      node.y = renderState.centerY + offset.y;
    });

    const total = orbiters.length || 1;
    orbiters.forEach((node, index) => {
      const seedRandom = mulberry32(node.seed ^ 0x9e3779b9);
      const angle = -Math.PI / 2 + (index / total) * Math.PI * 2 + seedRandom() * 0.24;
      const distance = innerBoundary + (outerBoundary - innerBoundary) * (0.35 + seedRandom() * 0.65);
      node.x = renderState.centerX + Math.cos(angle) * distance;
      node.y = renderState.centerY + Math.sin(angle) * distance;
    });
  }

  function draw(now) {
    const pulseFactor = currentBrainState() === "thinking" || currentBrainState() === "working" ? 1.28 : 1;
    context.clearRect(0, 0, renderState.width, renderState.height);

    const gradient = context.createRadialGradient(
      renderState.centerX,
      renderState.centerY,
      renderState.radius * 0.04,
      renderState.centerX,
      renderState.centerY,
      renderState.radius * 0.68
    );
    gradient.addColorStop(0, "rgba(255,255,255,0.96)");
    gradient.addColorStop(0.42, "rgba(242,245,249,0.88)");
    gradient.addColorStop(1, "rgba(236,241,247,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(renderState.centerX, renderState.centerY, renderState.radius * 0.68, 0, Math.PI * 2);
    context.fill();

    for (const link of renderState.links) {
      const source = renderState.nodes.find((node) => node.id === link.source);
      const target = renderState.nodes.find((node) => node.id === link.target);
      if (!source || !target) continue;
      context.strokeStyle = "rgba(163, 174, 189, 0.22)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    }

    renderState.nodes.forEach((node, index) => {
      const pulse = 0.7 + Math.sin(now / 1000 * node.pulseSpeed + node.pulsePhase) * 0.18 * pulseFactor;
      const radius = node.radius * pulse;
      const wobble = Math.sin(now / 1200 + index) * node.orbitAmplitude;
      const wobble2 = Math.cos(now / 1400 + index * 1.2) * node.orbitAmplitude * 0.7;
      const x = node.x + wobble;
      const y = node.y + wobble2;
      const glow = context.createRadialGradient(x, y, 0, x, y, radius * 4.8);
      glow.addColorStop(0, `rgba(149, 123, 79, ${0.22 * node.opacity})`);
      glow.addColorStop(1, "rgba(149, 123, 79, 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, radius * 4.8, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = `rgba(142, 112, 72, ${0.78 * node.opacity})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    });

    window.requestAnimationFrame(draw);
  }

  function refresh() {
    resize();
    layoutGraph(buildGraphFromPresence());
  }

  window.addEventListener("resize", refresh);
  refresh();
  window.requestAnimationFrame(draw);
  return { refresh };
}

async function bootstrap() {
  autosizeComposer();
  attachEvents();
  initSpeechRecognition();
  const graph = createGraphRenderer(graphCanvas, graphContainer);
  const view = readViewParams();
  await loadPresenceState(view.subject);
  graph?.refresh();
}

bootstrap().catch((error) => {
  addThreadMessage(error.message || "Monday could not load.", "monday");
});
