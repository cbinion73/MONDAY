const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadSandboxEnv } = require("./load-env");
const { runMondayTurn } = require("../engine/runtime/run-turn");
const {
  applyMondayIntelligence,
  intelligenceEnabled,
} = require("../engine/intelligence/monday-intelligence");
const {
  recordTurnLearning,
  recordClarifiedLearning,
  getLearningSummary,
  getLearningInspection,
} = require("../engine/learning/closed-loop-learning");
const {
  buildPersonalContext,
  detectCaptureIntent,
  getMissionSummary,
  getRecentCaptures,
  getRelevantThreadContext,
  recordCapture,
} = require("../engine/personal/personal-store");
const {
  getCalendarSummary,
  importCalendarEvents,
} = require("../engine/connectors/calendar-context");
const {
  getDocumentsSummary,
  importDocuments,
} = require("../engine/connectors/documents-context");
const {
  getEmailSummary,
  importEmailThreads,
} = require("../engine/connectors/email-context");
const {
  getFinancialSummary,
  importFinancialAccounts,
} = require("../engine/connectors/financial-context");
const { generateDailyBrief } = require("../engine/intelligence/monday-intelligence");
const {
  evaluateCanonicalConversations,
} = require("../engine/evals/canonical-conversations");
const {
  evaluateUsefulness,
} = require("../engine/evals/usefulness-evaluator");
const {
  summarizeReviewPayload,
  toFieldNotesMarkdown,
} = require("./review-analysis");

loadSandboxEnv(path.resolve(__dirname, "../.."));
process.env.MONDAY_CLOSED_LOOP_LEARNING ??= "true";

const PORT = Number(process.env.MONDAY_SANDBOX_PORT || 4311);
const PUBLIC_DIR = path.join(__dirname, "public");
const sessions = new Map();
const REVIEW_DIR = path.resolve(__dirname, "../../data/review");

function getOrCreateSession(sessionId) {
  if (!sessionId || !sessions.has(sessionId)) {
    const newId = sessionId || crypto.randomUUID();
    if (!sessions.has(newId)) {
      sessions.set(newId, {
        context: {},
        messages: [],
        turns: [],
      });
    }
    return { sessionId: newId, session: sessions.get(newId) };
  }

  return { sessionId, session: sessions.get(sessionId) };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function serveFile(res, filePath, contentType) {
  const fullPath = path.join(PUBLIC_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(fullPath).pipe(res);
}

function ensureReviewDir() {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

function getReviewPath(sessionId) {
  ensureReviewDir();
  return path.join(REVIEW_DIR, `${sessionId}.json`);
}

function readReview(sessionId) {
  const filePath = getReviewPath(sessionId);
  if (!fs.existsSync(filePath)) {
    return { tags: [] };
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return { tags: [] };
  }
}

function writeReview(sessionId, review) {
  fs.writeFileSync(getReviewPath(sessionId), `${JSON.stringify(review, null, 2)}\n`);
}

function summarizeTurn(turn) {
  return {
    id: turn.id,
    user: turn.user,
    monday: turn.monday,
    timestamp: turn.timestamp,
    significance: turn.runtime?.finalState?.significance || null,
    situationClassification:
      turn.runtime?.finalState?.situationClassification || null,
    activeRole: turn.runtime?.finalState?.activeRole || null,
    secondaryRole: turn.runtime?.finalState?.secondaryRole || null,
    recommendedOutcome:
      turn.runtime?.finalState?.recommendedOutcome || null,
    continuityThread:
      turn.runtime?.finalState?.continuity?.activeSignificanceThread || null,
    progression:
      turn.runtime?.finalState?.continuity?.meaningProgression || null,
    voiceMode: turn.runtime?.voice?.voiceMode || null,
    workspaceMode: turn.runtime?.workspace?.workspaceMode || null,
    supportIntent: turn.runtime?.workspace?.supportIntent || null,
    classificationFallback:
      turn.runtime?.finalState?.classificationFallback || false,
    candidateDomain: turn.runtime?.finalState?.candidateDomain || null,
    candidateClassification:
      turn.runtime?.finalState?.candidateClassification || null,
    contractAdjustments: turn.runtime?.contract?.adjustments || [],
    contractBlocked: turn.runtime?.contract?.blocked || [],
  };
}

function sanitizePromptDebug(promptDebug = null) {
  if (!promptDebug) return null;

  return {
    ...promptDebug,
    conversationHistory: Array.isArray(promptDebug.conversationHistory)
      ? promptDebug.conversationHistory.slice(-4)
      : [],
    finalPrompt: Array.isArray(promptDebug.finalPrompt)
      ? promptDebug.finalPrompt.map((entry) => ({
          role: entry.role,
          contentPreview:
            typeof entry.content === "string"
              ? `${entry.content.slice(0, 1200)}${
                  entry.content.length > 1200 ? "\n...[truncated]" : ""
                }`
              : "",
        }))
      : [],
  };
}

function sanitizeIntelligence(intelligence = null) {
  if (!intelligence) return null;

  return {
    ...intelligence,
    rawResponse: intelligence.rawResponse
      ? {
          reply: intelligence.rawResponse.reply || null,
          followUp: intelligence.rawResponse.followUp || null,
          suggestedDomain: intelligence.rawResponse.suggestedDomain || null,
          suggestedClassification:
            intelligence.rawResponse.suggestedClassification || null,
          confidence: intelligence.rawResponse.confidence || null,
        }
      : null,
    promptDebug: sanitizePromptDebug(intelligence.promptDebug),
  };
}

function sanitizeRuntimeForClient(runtime) {
  return {
    ...runtime,
    intelligence: sanitizeIntelligence(runtime.intelligence),
  };
}

function sanitizeRuntimeForSession(runtime) {
  return {
    finalState: runtime.finalState,
    truth: runtime.truth,
    contract: runtime.contract,
    voice: runtime.voice,
    workspace: runtime.workspace,
    intelligence: sanitizeIntelligence(runtime.intelligence),
    learningRecovery: runtime.learningRecovery,
    classificationAssist: runtime.classificationAssist,
    nextContext: runtime.nextContext,
  };
}

function buildSessionPayload(sessionId, session) {
  const review = readReview(sessionId);
  const payload = {
    sessionId,
    turnCount: session.turns.length,
    turns: session.turns.map(summarizeTurn),
    tags: review.tags || [],
  };
  return {
    ...payload,
    reviewSummary: summarizeReviewPayload(payload),
  };
}

function toMarkdownTranscript(payload) {
  const lines = [
    "# Monday Sandbox Transcript",
    "",
    `Session: ${payload.sessionId}`,
    `Turns: ${payload.turnCount}`,
    "",
  ];

  for (const turn of payload.turns) {
    lines.push(`## Turn ${turn.id}`);
    lines.push("");
    lines.push(`User: ${turn.user}`);
    lines.push("");
    lines.push(`Monday: ${turn.monday}`);
    lines.push("");
    lines.push(`- significance: ${turn.significance || "unknown"}`);
    lines.push(
      `- situation_classification: ${turn.situationClassification || "unknown"}`
    );
    lines.push(`- active_role: ${turn.activeRole || "unknown"}`);
    lines.push(`- recommended_outcome: ${turn.recommendedOutcome || "unknown"}`);
    lines.push("");
  }

  if (payload.tags.length) {
    lines.push("## Failure Tags");
    lines.push("");
    for (const tag of payload.tags) {
      lines.push(
        `- turn ${tag.turnId}: ${tag.category}${tag.note ? ` - ${tag.note}` : ""}`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function handleMessage(req, res) {
  try {
    const body = await parseBody(req);
    const sessionInfo = getOrCreateSession(body.sessionId);
    const session = sessionInfo.session;

    if (!body.input || typeof body.input !== "string") {
      sendJson(res, 400, { error: "Missing input." });
      return;
    }

    const mergedContext = {
      ...session.context,
      ...(body.context || {}),
    };
    const personalContext = {
      ...buildPersonalContext(),
      captureIntent: detectCaptureIntent(body.input),
      calendar: getCalendarSummary(),
      documents: getDocumentsSummary({ limit: 6 }),
      email: getEmailSummary({ limit: 6 }),
      finances: getFinancialSummary({ limit: 6 }),
    };

    const result = await runMondayTurn({
      input: body.input,
      context: mergedContext,
    });
    const enrichedPersonalContext = {
      ...personalContext,
      relevantThread: getRelevantThreadContext({
        significance: result.finalState.significance,
      }),
    };

    const intelligentResult = await applyMondayIntelligence({
      result,
      input: body.input,
      history: session.messages,
      personalContext: enrichedPersonalContext,
    });

    session.context = intelligentResult.nextContext;
    const timestamp = new Date().toISOString();
    session.messages.push({
      user: body.input,
      monday: intelligentResult.voice.text,
      timestamp,
    });
    const sessionRuntime = sanitizeRuntimeForSession(intelligentResult);
    session.turns.push({
      id: session.turns.length + 1,
      user: body.input,
      monday: intelligentResult.voice.text,
      timestamp,
      runtime: sessionRuntime,
    });

    const learning = recordTurnLearning({
      input: body.input,
      sessionId: sessionInfo.sessionId,
      result: intelligentResult,
    });
    const priorTurn = session.turns.at(-2);
    const clarifiedExample =
      priorTurn?.runtime?.finalState?.classificationFallback &&
      !intelligentResult.finalState.classificationFallback
        ? recordClarifiedLearning({
            input: priorTurn.user,
            finalState: intelligentResult.finalState,
          })
        : null;
    const capture =
      personalContext.captureIntent
        ? recordCapture({
            input: body.input,
            finalState: intelligentResult.finalState,
            truth: intelligentResult.truth,
            context: mergedContext,
          })
        : null;

    sendJson(res, 200, {
      sessionId: sessionInfo.sessionId,
      result: {
        ...sanitizeRuntimeForClient(intelligentResult),
        capture,
        personalContext: enrichedPersonalContext,
        learning: {
          ...learning,
          clarifiedExample,
        },
      },
    });
  } catch (error) {
    sendJson(res, 500, {
      error: "Sandbox message handling failed.",
      details: error.message,
    });
  }
}

async function handleSession(req, res, url) {
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId || !sessions.has(sessionId)) {
    sendJson(res, 404, { error: "Session not found." });
    return;
  }

  sendJson(res, 200, buildSessionPayload(sessionId, sessions.get(sessionId)));
}

async function handleTag(req, res) {
  try {
    const body = await parseBody(req);
    const sessionId = body.sessionId;
    if (!sessionId || !sessions.has(sessionId)) {
      sendJson(res, 404, { error: "Session not found." });
      return;
    }

    if (!body.turnId || !body.category) {
      sendJson(res, 400, { error: "Missing turnId or category." });
      return;
    }

    const review = readReview(sessionId);
    review.tags = review.tags || [];
    review.tags.push({
      turnId: Number(body.turnId),
      category: String(body.category),
      note: typeof body.note === "string" ? body.note.trim() : "",
      timestamp: new Date().toISOString(),
    });
    writeReview(sessionId, review);

    sendJson(res, 200, buildSessionPayload(sessionId, sessions.get(sessionId)));
  } catch (error) {
    sendJson(res, 500, {
      error: "Failed to save failure tag.",
      details: error.message,
    });
  }
}

async function handleExport(req, res, url) {
  const sessionId = url.searchParams.get("sessionId");
  const format = url.searchParams.get("format") || "json";
  if (!sessionId || !sessions.has(sessionId)) {
    sendJson(res, 404, { error: "Session not found." });
    return;
  }

  const payload = buildSessionPayload(sessionId, sessions.get(sessionId));
  if (format === "md") {
    res.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="monday-transcript-${sessionId}.md"`,
    });
    res.end(toMarkdownTranscript(payload));
    return;
  }

  if (format === "field-notes") {
    res.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="monday-field-notes-${sessionId}.md"`,
    });
    res.end(toFieldNotesMarkdown(payload));
    return;
  }

  sendJson(res, 200, payload);
}

async function handleMissions(req, res) {
  sendJson(res, 200, {
    missions: getMissionSummary(),
    captures: getRecentCaptures(12),
    calendar: getCalendarSummary(),
    documents: getDocumentsSummary({ limit: 6 }),
    email: getEmailSummary({ limit: 6 }),
    finances: getFinancialSummary({ limit: 6 }),
  });
}

async function handleDailyBrief(req, res) {
  const missions = getMissionSummary();
  const captures = getRecentCaptures(20);
  const calendar = getCalendarSummary();
  const documents = getDocumentsSummary({ limit: 6 });
  const email = getEmailSummary({ limit: 6 });
  const finances = getFinancialSummary({ limit: 6 });
  const brief = await generateDailyBrief({
    missions,
    captures,
    calendar,
    documents,
    email,
    finances,
  });
  sendJson(res, 200, {
    generatedAt: new Date().toISOString(),
    missions,
    captures,
    calendar,
    documents,
    email,
    finances,
    brief,
  });
}

async function handleCalendar(req, res) {
  if (req.method === "GET") {
    sendJson(res, 200, getCalendarSummary());
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const events = Array.isArray(body.events) ? body.events : [];
      const store = importCalendarEvents(events, {
        source: body.source || "manual",
      });
      sendJson(res, 200, {
        ok: true,
        calendar: {
          updatedAt: store.updatedAt,
          source: store.source,
          totalEvents: store.events.length,
          upcomingEvents: store.events.slice(0, 8),
        },
      });
      return;
    } catch (error) {
      sendJson(res, 500, {
        error: "Failed to import calendar events.",
        details: error.message,
      });
      return;
    }
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

async function handleDocuments(req, res) {
  if (req.method === "GET") {
    sendJson(res, 200, getDocumentsSummary({ limit: 10 }));
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const documents = Array.isArray(body.documents) ? body.documents : [];
      const store = importDocuments(documents, {
        source: body.source || "manual",
      });
      sendJson(res, 200, {
        ok: true,
        documents: {
          updatedAt: store.updatedAt,
          source: store.source,
          totalDocuments: store.documents.length,
          documents: store.documents.slice(0, 8),
        },
      });
      return;
    } catch (error) {
      sendJson(res, 500, {
        error: "Failed to import documents.",
        details: error.message,
      });
      return;
    }
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

async function handleEmail(req, res) {
  if (req.method === "GET") {
    sendJson(res, 200, getEmailSummary({ limit: 10 }));
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const threads = Array.isArray(body.threads) ? body.threads : [];
      const store = importEmailThreads(threads, {
        source: body.source || "manual",
      });
      sendJson(res, 200, {
        ok: true,
        email: {
          updatedAt: store.updatedAt,
          source: store.source,
          totalThreads: store.threads.length,
          unreadCount: store.threads.filter((thread) => thread.unread).length,
          threads: store.threads.slice(0, 8),
        },
      });
      return;
    } catch (error) {
      sendJson(res, 500, {
        error: "Failed to import email threads.",
        details: error.message,
      });
      return;
    }
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

async function handleFinances(req, res) {
  if (req.method === "GET") {
    sendJson(res, 200, getFinancialSummary({ limit: 10 }));
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const accounts = Array.isArray(body.accounts) ? body.accounts : [];
      const store = importFinancialAccounts(accounts, {
        source: body.source || "manual",
      });
      sendJson(res, 200, {
        ok: true,
        finances: {
          updatedAt: store.updatedAt,
          source: store.source,
          totalAccounts: store.accounts.length,
          accounts: store.accounts.slice(0, 8),
        },
      });
      return;
    } catch (error) {
      sendJson(res, 500, {
        error: "Failed to import financial accounts.",
        details: error.message,
      });
      return;
    }
  }

  sendJson(res, 405, { error: "Method not allowed." });
}

async function handleCanonicalEval(req, res) {
  try {
    const report = await evaluateCanonicalConversations();
    sendJson(res, 200, report);
  } catch (error) {
    sendJson(res, 500, {
      error: "Canonical evaluation failed.",
      details: error.message,
    });
  }
}

async function handleUsefulnessEval(req, res) {
  try {
    const report = await evaluateUsefulness();
    sendJson(res, 200, report);
  } catch (error) {
    sendJson(res, 500, {
      error: "Usefulness evaluation failed.",
      details: error.message,
    });
  }
}

async function handleTts(req, res) {
  try {
    const body = await parseBody(req);
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE || "Adam";
    const text = body.text;

    if (!text || typeof text !== "string") {
      sendJson(res, 400, { error: "Missing text." });
      return;
    }

    if (!apiKey || apiKey.includes("YOUR-ELEVENLABS-KEY-HERE")) {
      sendJson(res, 400, {
        error: "ElevenLabs is not configured.",
      });
      return;
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      sendJson(res, response.status, {
        error: "ElevenLabs synthesis failed.",
        details: errorText,
      });
      return;
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    res.writeHead(200, { "Content-Type": "audio/mpeg" });
    res.end(audioBuffer);
  } catch (error) {
    sendJson(res, 500, {
      error: "TTS request failed.",
      details: error.message,
    });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/") {
    res.writeHead(302, { Location: "/monday-sandbox" });
    res.end();
    return;
  }

  if (
    req.method === "GET" &&
    (pathname === "/monday-sandbox" || pathname === "/monday-sandbox/")
  ) {
    serveFile(res, "index.html", "text/html; charset=utf-8");
    return;
  }

  if (
    req.method === "GET" &&
    (pathname === "/sandbox.css" || pathname === "/monday-sandbox/sandbox.css")
  ) {
    serveFile(res, "sandbox.css", "text/css; charset=utf-8");
    return;
  }

  if (
    req.method === "GET" &&
    (pathname === "/sandbox.js" || pathname === "/monday-sandbox/sandbox.js")
  ) {
    serveFile(res, "sandbox.js", "application/javascript; charset=utf-8");
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/message") {
    handleMessage(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/tts") {
    handleTts(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/session") {
    handleSession(req, res, url);
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/tag") {
    handleTag(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/export") {
    handleExport(req, res, url);
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/missions") {
    handleMissions(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/daily-brief") {
    handleDailyBrief(req, res);
    return;
  }

  if (
    (req.method === "GET" || req.method === "POST") &&
    pathname === "/api/monday-sandbox/calendar"
  ) {
    handleCalendar(req, res);
    return;
  }

  if (
    (req.method === "GET" || req.method === "POST") &&
    pathname === "/api/monday-sandbox/documents"
  ) {
    handleDocuments(req, res);
    return;
  }

  if (
    (req.method === "GET" || req.method === "POST") &&
    pathname === "/api/monday-sandbox/email"
  ) {
    handleEmail(req, res);
    return;
  }

  if (
    (req.method === "GET" || req.method === "POST") &&
    pathname === "/api/monday-sandbox/finances"
  ) {
    handleFinances(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/canonical-eval") {
    handleCanonicalEval(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/usefulness-eval") {
    handleUsefulnessEval(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/health") {
    sendJson(res, 200, {
      ok: true,
      port: PORT,
      tts: {
        provider: process.env.JARVIS_TTS_PROVIDER || "elevenlabs",
        elevenLabsConfigured: Boolean(
          process.env.ELEVENLABS_API_KEY &&
            !process.env.ELEVENLABS_API_KEY.includes("YOUR-ELEVENLABS-KEY-HERE")
        ),
        voice: process.env.ELEVENLABS_VOICE || "Adam",
      },
      intelligence: {
        provider: "ollama",
        enabled: intelligenceEnabled(),
        model: process.env.MONDAY_OLLAMA_MODEL || "qwen2.5:7b",
        baseUrl: process.env.MONDAY_OLLAMA_BASE_URL || "http://127.0.0.1:11434",
      },
      learning: getLearningSummary(),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/learning") {
    const detailed = url.searchParams.get("detailed") === "1";
    sendJson(res, 200, detailed ? getLearningInspection() : getLearningSummary());
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Monday Sandbox running at http://localhost:${PORT}/monday-sandbox`);
});
