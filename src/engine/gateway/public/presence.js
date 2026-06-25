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
    base.blocks.push({
      type: "evidence_list",
      title: "Movement",
      items: (prop.entries || []).map((entry) =>
        `${entry.label || "Signal"}${entry.meta ? ` — ${entry.meta}` : ""}${entry.note ? `: ${entry.note}` : ""}`
      ),
    });
  } else if (prop?.type === "deliverable") {
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
  } else if (prop?.type === "opportunity") {
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

function buildArtifactKey(prop) {
  return JSON.stringify([
    currentSubjectId(),
    prop?.type || "",
    prop?.title || "",
    prop?.body || prop?.summary || "",
  ]);
}

function openArtifactModal(force = false) {
  const propState = state.presence?.stage?.prop;
  if (!propState?.visible || !propState?.payload) return;

  const artifactPayload = propPayloadToArtifact(propState.payload);
  const artifactKey = buildArtifactKey(propState.payload);
  if (!force && artifactKey === state.currentArtifactKey && artifactSurface.dataset.state === "visible") {
    return;
  }

  state.currentArtifactKey = artifactKey;
  artifactEyebrow.textContent = state.presence?.stage?.eyebrow || "Supporting Brief";
  artifactTitle.textContent = propState.payload.title || "Monday found something worth opening.";
  window.sessionStorage.setItem(ARTIFACT_STORAGE_KEY, JSON.stringify(artifactPayload));
  artifactFrame.src = `/artifact-view.html?ts=${Date.now()}`;
  artifactSurface.dataset.state = "visible";
  setBrainState();
}

function closeArtifactModal() {
  artifactSurface.dataset.state = "hidden";
  setBrainState();
}

function maybeRevealArtifact() {
  const propState = state.presence?.stage?.prop;
  if (!propState?.visible || !propState?.payload) return;
  const nextKey = buildArtifactKey(propState.payload);
  if (nextKey === state.currentArtifactKey && artifactSurface.dataset.state === "visible") return;
  window.setTimeout(() => openArtifactModal(), state.presence?.stage?.pauseSuggestedMs || 800);
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
      renderPresence();
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
    if (state.presence?.stage?.prop?.visible) {
      openArtifactModal(true);
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
