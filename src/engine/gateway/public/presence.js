const graphCanvas = document.querySelector(".memory-graph");
const graphContainer = document.querySelector(".memory-core");
const artifactSurface = document.querySelector(".artifact-surface");
const artifactFrame = document.getElementById("artifactFrame");
const threadEl = document.getElementById("presenceThread");
const composerEl = document.getElementById("presenceComposer");
const inputEl = document.getElementById("presenceInput");
const chatFocusButton = document.getElementById("chatFocusButton");
const micButton = document.getElementById("presenceMicButton");
const desktopButton = document.getElementById("desktopModeButton");
const closeModalButton = document.getElementById("closeModalButton");
const scene = document.querySelector(".presence-scene");
const floatingBubbles = document.getElementById("floatingBubbles");

const API_BASE = `${window.location.protocol}//${window.location.host}`;

let mondayFadeTimer = null;
let sendLock = false;
let activeSequenceTimers = [];
let currentArtifactKey = null;
let activeVoiceMode = false;

const ARTIFACTS = {
  website: {
    key: "website",
    src: "https://www.foxnews.com/live-news/us-iran-peace-deal-nuclear-talks-switzerland-06-21-26",
    title: "Surfaced website",
    reply: "I found something directly relevant to this thread. I'm bringing it onto the screen now.",
  },
  health: {
    key: "health",
    src: "/health-dashboard.html",
    title: "Surfaced health dashboard",
    reply: "I'm pulling your medical record now.",
  },
  travel: {
    key: "travel",
    src: "/travel-itinerary.html",
    title: "Surfaced travel itinerary",
    reply: "Sure, I'll pass it along to Nick Fury and we'll get back to you.",
  },
  denver: {
    key: "denver",
    src: "/denver-suggestion.html",
    title: "Surfaced Denver travel suggestion",
    reply: "Denver is a strong candidate. I'm pulling together a suggested shape for the trip now.",
  },
  transport: {
    key: "transport",
    src: "/transport-options.html",
    title: "Surfaced transport recommendation",
    reply: "I'm comparing driving, train, and airfare now so I can recommend the best travel mode.",
  },
  quantum: {
    key: "quantum",
    src: "/quantum-survey.html",
    title: "Surfaced quantum computing survey",
    reply: "I'm pulling together a survey of quantum computing so we can look at the field clearly.",
  },
};

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

function autosizeComposer() {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, window.innerHeight * 0.22)}px`;
}

function setBusy(isBusy) {
  inputEl.disabled = isBusy;
}

function addPresenceMessage(text, who, pending = false) {
  threadEl.hidden = false;
  const item = document.createElement("div");
  item.className = `presence-message ${who}${pending ? " pending" : ""}`;
  item.textContent = text;
  threadEl.appendChild(item);
  threadEl.scrollTop = threadEl.scrollHeight;
  return item;
}

function addFloatingBubble(text, who, transient = false) {
  if (activeVoiceMode && who === "monday") return;

  const item = document.createElement("div");
  item.className = `floating-bubble ${who}`;
  item.textContent = text;
  floatingBubbles.appendChild(item);

  if (transient) {
    if (mondayFadeTimer) window.clearTimeout(mondayFadeTimer);
    mondayFadeTimer = window.setTimeout(() => {
      item.classList.add("is-fading");
      window.setTimeout(() => item.remove(), 360);
    }, 5000);
  }
}

function clearFloatingBubbles() {
  floatingBubbles.replaceChildren();
  if (mondayFadeTimer) {
    window.clearTimeout(mondayFadeTimer);
    mondayFadeTimer = null;
  }
}

function clearSequenceTimers() {
  for (const timer of activeSequenceTimers) {
    window.clearTimeout(timer);
  }
  activeSequenceTimers = [];
}

function resolveArtifact(text) {
  const normalized = text.toLowerCase();
  const quantumSignals = ["quantum", "qubit", "qubits", "quantum computing", "superconducting", "trapped ions", "error correction"];
  const transportSignals = ["drive", "driving", "train", "airfare", "flight", "fly", "transport", "transportation", "get there"];
  const denverSignals = ["denver", "colorado", "rockies", "red rocks", "union station", "rocky mountain"];
  const travelSignals = ["trip", "travel", "itinerary", "250th", "philadelphia", "birthday", "national parks", "route"];
  const healthSignals = ["health", "weight", "a1c", "blood pressure", "bp", "exercise", "steps", "dashboard", "medical record"];
  const websiteSignals = ["iran", "website", "site", "page", "fox", "article", "show me"];

  if (quantumSignals.some((signal) => normalized.includes(signal))) {
    return ARTIFACTS.quantum;
  }

  if (transportSignals.some((signal) => normalized.includes(signal))) {
    return ARTIFACTS.transport;
  }

  if (denverSignals.some((signal) => normalized.includes(signal))) {
    return ARTIFACTS.denver;
  }

  if (travelSignals.some((signal) => normalized.includes(signal))) {
    return ARTIFACTS.travel;
  }

  if (healthSignals.some((signal) => normalized.includes(signal))) {
    return ARTIFACTS.health;
  }

  if (websiteSignals.some((signal) => normalized.includes(signal))) {
    return ARTIFACTS.website;
  }

  return null;
}

function resolveArtifactFromPlan(plan) {
  if (!plan || plan.shouldSurface !== true) return null;
  if (plan.artifactKey === "quantum") return ARTIFACTS.quantum;
  if (plan.artifactKey === "transport") return ARTIFACTS.transport;
  if (plan.artifactKey === "denver") return ARTIFACTS.denver;
  if (plan.artifactKey === "travel") return ARTIFACTS.travel;
  if (plan.artifactKey === "health") return ARTIFACTS.health;
  if (plan.artifactKey === "website") return ARTIFACTS.website;
  return null;
}

function setArtifactContent(artifact) {
  if (!artifactFrame) return;
  currentArtifactKey = artifact.key;
  if (artifactFrame.src !== artifact.src) {
    artifactFrame.src = artifact.src;
  }
  artifactFrame.title = artifact.title;
}

function postHealthStage(stage) {
  if (!artifactFrame?.contentWindow) return;
  artifactFrame.contentWindow.postMessage({ type: "health-sequence", stage }, "*");
}

function setSurfaceState(isVisible) {
  artifactSurface.dataset.state = isVisible ? "visible" : "hidden";
  scene.classList.toggle("modal-open", isVisible);
  if (!isVisible) {
    currentArtifactKey = null;
    clearSequenceTimers();
    clearFloatingBubbles();
  }
}

function startHealthSequence() {
  clearSequenceTimers();
  postHealthStage(1);

  activeSequenceTimers.push(
    window.setTimeout(() => {
      const message = "Your A1C is increasing.";
      addPresenceMessage(message, "monday");
      addFloatingBubble(message, "monday", true);
    }, 380)
  );

  activeSequenceTimers.push(window.setTimeout(() => postHealthStage(2), 2300));

  activeSequenceTimers.push(
    window.setTimeout(() => {
      const message = "If you increase your exercise and steps, your A1C would likely decrease.";
      addPresenceMessage(message, "monday");
      addFloatingBubble(message, "monday", true);
    }, 3300)
  );

  activeSequenceTimers.push(window.setTimeout(() => postHealthStage(3), 5200));

  activeSequenceTimers.push(
    window.setTimeout(() => {
      const message = "Metabolic syndrome is directly correlated to your weight, which is also increasing.";
      addPresenceMessage(message, "monday");
      addFloatingBubble(message, "monday", true);
    }, 6200)
  );

  activeSequenceTimers.push(window.setTimeout(() => postHealthStage(4), 8100));

  activeSequenceTimers.push(
    window.setTimeout(() => {
      const message = "Part of metabolic syndrome, in addition to diabetes, is that blood pressure also increases.";
      addPresenceMessage(message, "monday");
      addFloatingBubble(message, "monday", true);
      sendLock = false;
    }, 9100)
  );
}

async function sendPresenceMessage(text, options = {}) {
  const cleaned = text.trim();
  if (!cleaned || inputEl.disabled || sendLock) return;

  activeVoiceMode = options.voice === true;
  let artifact = null;

  setBusy(true);
  addPresenceMessage(cleaned, "user");
  const pending = addPresenceMessage("Monday is thinking...", "monday", true);
  inputEl.value = "";
  autosizeComposer();

  try {
    const response = await fetch(`${API_BASE}/api/presence/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleaned }),
    });
    const payload = await response.json();
    pending.remove();

    if (!response.ok) {
      addPresenceMessage(payload.error || "Monday could not answer right now.", "monday");
      return;
    }

    artifact = resolveArtifactFromPlan(payload.surfacingPlan) || resolveArtifact(cleaned);

    if (artifact) {
      sendLock = true;
      clearFloatingBubbles();

      window.setTimeout(() => {
        setArtifactContent(artifact);
        setSurfaceState(true);
      }, 420);

      window.setTimeout(() => {
        const replyText = payload.reply || artifact.reply || "Monday replied without text.";
        addPresenceMessage(replyText, "monday");
        addFloatingBubble(replyText, "monday", true);
        if (artifact.key === "health") {
          startHealthSequence();
          return;
        }
        sendLock = false;
      }, 760);
      return;
    }

    addPresenceMessage(payload.reply || "Monday replied without text.", "monday");
  } catch (error) {
    pending.remove();
    addPresenceMessage(error.message || "Connection failed.", "monday");
  } finally {
    setBusy(false);
    inputEl.focus();
  }
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
    nodeMap: new Map(),
    payload: null,
    graphLoaded: false,
  };

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

    if (renderState.payload) {
      layoutGraph(renderState.payload);
    }
  }

  function layoutGraph(payload) {
    const visibleNodes = payload.nodes.filter((node) => (node.degree || 0) > 0);
    const degreeMap = new Map(visibleNodes.map((node) => [node.id, node.degree || 0]));
    const maxDegree = Math.max(...visibleNodes.map((node) => node.degree || 0), 1);
    const minDegree = Math.min(...visibleNodes.map((node) => node.degree || 0), maxDegree);
    renderState.links = payload.links.filter((link) => degreeMap.has(link.source) && degreeMap.has(link.target));

    renderState.nodes = visibleNodes.map((node, index) => {
      const seed = hashString(node.id || `${index}`);
      const random = mulberry32(seed);
      const degree = degreeMap.get(node.id) || 0;
      const normalizedDegree = degree / maxDegree;
      const relationshipWeight = maxDegree === minDegree ? 0.5 : (degree - minDegree) / (maxDegree - minDegree);
      return {
        id: node.id,
        degree,
        radius: 1.35 + relationshipWeight * 6.8,
        opacity: 0.7 + normalizedDegree * 0.3,
        relationshipWeight,
        seed,
        pulsePhase: random() * Math.PI * 2,
        pulseSpeed: 0.65 + random() * 0.95,
        orbitAmplitude: degree >= maxDegree * 0.7 ? 1.4 : 2.4 + random() * 2.2,
      };
    });

    renderState.nodes.sort((left, right) => right.degree - left.degree || left.seed - right.seed);
    renderState.nodeMap = new Map(renderState.nodes.map((node) => [node.id, node]));

    const hubCount = Math.min(4, Math.max(2, Math.ceil(renderState.nodes.length * 0.06)));
    const hubs = renderState.nodes.slice(0, hubCount);
    const orbiters = renderState.nodes.slice(hubCount);
    const outerBoundary = renderState.radius * 0.44;
    const innerBoundary = renderState.radius * 0.14;
    const hubOffsets = [
      { x: 0, y: -renderState.radius * 0.035 },
      { x: renderState.radius * 0.038, y: renderState.radius * 0.028 },
      { x: -renderState.radius * 0.042, y: renderState.radius * 0.022 },
      { x: renderState.radius * 0.012, y: -renderState.radius * 0.052 },
    ];

    hubs.forEach((node, index) => {
      const offset = hubOffsets[index] || { x: 0, y: 0 };
      node.x = renderState.centerX + offset.x;
      node.y = renderState.centerY + offset.y;
    });

    const slotSeeds = orbiters.map((node) => {
      const random = mulberry32(node.seed ^ 0x9e3779b9);
      return { node, weight: 0.6 + random() * 1.4, random };
    });

    const totalWeight = slotSeeds.reduce((sum, item) => sum + item.weight, 0) || 1;
    let angleCursor = -Math.PI / 2;

    for (const item of slotSeeds) {
      const { node, weight, random } = item;
      const stepSize = (weight / totalWeight) * Math.PI * 2;
      const angle = angleCursor + random() * stepSize;
      angleCursor += stepSize;
      const degreePull = 1 - Math.min(0.86, node.relationshipWeight * 0.74);
      const radialBias = Math.pow(random(), 1.85);
      const distance = innerBoundary + (outerBoundary - innerBoundary) * radialBias * degreePull;
      node.x = renderState.centerX + Math.cos(angle) * distance;
      node.y = renderState.centerY + Math.sin(angle) * distance;
    }

    for (let step = 0; step < 20; step++) {
      for (const node of orbiters) {
        let adjustX = 0;
        let adjustY = 0;
        for (const other of renderState.nodes) {
          if (other === node) continue;
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const distance = Math.hypot(dx, dy) || 1;
          const minDistance = node.radius + other.radius + 8;
          if (distance < minDistance) {
            const force = (minDistance - distance) / minDistance;
            adjustX += (dx / distance) * force;
            adjustY += (dy / distance) * force;
          }
        }
        node.x += adjustX * 6;
        node.y += adjustY * 6;
        const offsetX = node.x - renderState.centerX;
        const offsetY = node.y - renderState.centerY;
        const clampedDistance = Math.min(outerBoundary, Math.hypot(offsetX, offsetY) || 1);
        const angle = Math.atan2(offsetY, offsetX);
        node.x = renderState.centerX + Math.cos(angle) * clampedDistance;
        node.y = renderState.centerY + Math.sin(angle) * clampedDistance;
      }
    }

    renderState.graphLoaded = true;
  }

  function initializeGraph(payload) {
    renderState.payload = payload;
    layoutGraph(payload);
  }

  function draw() {
    context.clearRect(0, 0, renderState.width, renderState.height);
    const time = performance.now() / 1000;

    for (const node of renderState.nodes) {
      const wobble = Math.sin(time * node.pulseSpeed + node.pulsePhase);
      const wobble2 = Math.cos(time * (node.pulseSpeed * 0.82) + node.pulsePhase * 1.3);
      node.renderX = node.x + wobble * node.orbitAmplitude;
      node.renderY = node.y + wobble2 * node.orbitAmplitude * 0.72;
      node.renderGlow = 0.88 + (wobble + 1) * 0.18;
      node.renderScale = 0.96 + (wobble2 + 1) * 0.05;
    }

    for (const link of renderState.links) {
      const source = renderState.nodeMap.get(link.source);
      const target = renderState.nodeMap.get(link.target);
      if (!source || !target) continue;
      const midpointPulse = Math.sin(time * 0.7 + (source.pulsePhase + target.pulsePhase) * 0.5);
      context.beginPath();
      context.moveTo(source.renderX, source.renderY);
      context.lineTo(target.renderX, target.renderY);
      context.strokeStyle = `rgba(197, 155, 98, ${0.14 + (midpointPulse + 1) * 0.11})`;
      context.lineWidth = 1 + (midpointPulse + 1) * 0.12;
      context.stroke();
    }

    for (const node of renderState.nodes) {
      const animatedRadius = node.radius * node.renderScale;
      const glowRadius = animatedRadius * 1.9;
      const glow = context.createRadialGradient(node.renderX, node.renderY, animatedRadius * 0.2, node.renderX, node.renderY, glowRadius);
      glow.addColorStop(0, `rgba(197, 155, 98, ${0.11 * node.renderGlow})`);
      glow.addColorStop(0.62, `rgba(197, 155, 98, ${0.04 * node.renderGlow})`);
      glow.addColorStop(1, "rgba(197, 155, 98, 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(node.renderX, node.renderY, glowRadius, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = `rgba(197, 155, 98, ${node.opacity})`;
      context.beginPath();
      context.arc(node.renderX, node.renderY, animatedRadius, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "rgba(255, 246, 226, 0.18)";
      context.beginPath();
      context.arc(
        node.renderX - animatedRadius * 0.14,
        node.renderY - animatedRadius * 0.14,
        Math.max(0.3, animatedRadius * 0.12),
        0,
        Math.PI * 2
      );
      context.fill();
    }
  }

  function renderFrame() {
    if (renderState.graphLoaded) {
      draw();
    }
    window.requestAnimationFrame(renderFrame);
  }

  window.addEventListener("resize", resize);
  resize();
  window.requestAnimationFrame(renderFrame);

  return {
    async loadGraph() {
      const response = await fetch(`${API_BASE}/api/presence/graph`);
      if (!response.ok) {
        throw new Error(`Graph load failed: ${response.status}`);
      }
      const payload = await response.json();
      initializeGraph(payload);
    },
  };
}

composerEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendPresenceMessage(inputEl.value, { voice: false });
});

inputEl.addEventListener("input", autosizeComposer);
inputEl.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    await sendPresenceMessage(inputEl.value, { voice: false });
  }
});

chatFocusButton.addEventListener("click", () => inputEl.focus());
desktopButton.addEventListener("click", () => {
  addPresenceMessage("Desktop mode is staged for a future iteration.", "monday");
});
closeModalButton.addEventListener("click", () => setSurfaceState(false));

function setupRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return null;
  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => micButton.classList.add("active");
  recognition.onend = () => micButton.classList.remove("active");
  recognition.onresult = async (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    if (transcript.trim()) {
      await sendPresenceMessage(transcript, { voice: true });
    }
  };
  return recognition;
}

const recognition = setupRecognition();
micButton.addEventListener("click", () => {
  if (!recognition) {
    addPresenceMessage("Microphone input is unavailable in this browser.", "monday");
    return;
  }
  try {
    recognition.start();
  } catch {
    recognition.stop();
  }
});

artifactFrame?.addEventListener("load", () => {
  if (currentArtifactKey === "health") {
    postHealthStage(1);
  }
});

autosizeComposer();
setSurfaceState(false);

const graph = createGraphRenderer(graphCanvas, graphContainer);
if (graph) {
  graph.loadGraph().catch((error) => {
    addPresenceMessage(error.message || "Graph unavailable.", "monday");
  });
}
