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
const { syncAppleCalendar } = require("../engine/connectors/apple-calendar-sync");
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
const {
  initFromMissions,
  processAfterTurn,
  getWorkspaceSummaries,
} = require("../engine/workspace/workspace-manager");
const workspaceStore = require("../engine/workspace/workspace-store");
const obsidian = require("../engine/obsidian/obsidian-service");
const memory = require("../engine/memory/memory-index");

loadSandboxEnv(path.resolve(__dirname, "../.."));
process.env.MONDAY_CLOSED_LOOP_LEARNING ??= "true";

// Ensure all six domain workspaces exist on startup
try { initFromMissions(); } catch (e) { console.warn("[workspace] init warning:", e.message); }

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
      priorWorkingTheory: session.context?.workingTheory || null,
    };

    const result = await runMondayTurn({
      input: body.input,
      context: mergedContext,
      councilEnabled: body.councilEnabled === true,
    });
    const enrichedPersonalContext = {
      ...personalContext,
      relevantThread: getRelevantThreadContext({
        significance: result.finalState.significance,
      }),
    };

    // ── JARVIS loop: skill invocation ────────────────────────────────────────
    // Intent detection → trust gate → parallel execution → normalization → theory update
    // Runs between engine resolution and LLM call so Monday answers from live data.
    const { invokeSkillsForTurn } = require("../engine/skills/skill-invoker");
    const { updateTheoryFromEvidence } = require("../engine/skills/theory-from-evidence");

    const turnDomain = result.truth?.domain || result.finalState?.domain || null;
    const turnWorkspaceId = turnDomain ? turnDomain.toLowerCase() : null;

    let skillInvocation = { used: false, skills: [], failed: [] };
    try {
      skillInvocation = await invokeSkillsForTurn(body.input, {
        workspaceId: turnWorkspaceId,
        domain: turnDomain,
        channel: "sandbox",
      });
    } catch (err) {
      console.warn("[server] skill invocation error:", err.message);
    }

    const theoryEvidence = skillInvocation.used
      ? updateTheoryFromEvidence(enrichedPersonalContext.priorWorkingTheory, skillInvocation.skills)
      : null;

    // ── Vector recall ─────────────────────────────────────────────────────────
    // Pull semantically relevant past context (notes, captures, turns) before LLM call.
    let memoryRecall = [];
    try {
      memoryRecall = await memory.recall(body.input, {
        domain: turnDomain ? turnDomain.toLowerCase() : null,
        limit: 4,
      });
    } catch (err) {
      console.warn("[memory] recall error:", err.message);
    }

    const finalPersonalContext = {
      ...enrichedPersonalContext,
      skillResults: skillInvocation.skills,
      theoryEvidence,
      memoryRecall: memoryRecall.length > 0 ? memoryRecall : null,
    };
    // ── end JARVIS loop ───────────────────────────────────────────────────────

    const intelligentResult = await applyMondayIntelligence({
      result,
      input: body.input,
      history: session.messages,
      personalContext: finalPersonalContext,
    });

    session.context = {
      ...intelligentResult.nextContext,
      workingTheory: intelligentResult.workingTheory || null,
    };
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

    // Log exchange to domain workspace
    const turnDomainFinal = intelligentResult.finalState?.domain || intelligentResult.truth?.domain || null;

    // Index this turn into vector memory (fire-and-forget)
    memory.indexTurn({ role: "user", text: body.input, session: sessionInfo.id }).catch(() => {});
    memory.indexTurn({ role: "monday", text: intelligentResult.voice.text, session: sessionInfo.id }).catch(() => {});

    processAfterTurn({
      domain: turnDomainFinal,
      userText: body.input,
      mondayReply: intelligentResult.voice.text,
      workingTheory: intelligentResult.workingTheory || null,
      skillsUsed: skillInvocation.skills.map((s) => s.skillId),
      channel: "sandbox",
    });

    // ── Mission detection ────────────────────────────────────────────────────
    // Check if this domain's conversation history has reached mission threshold.
    let missionSuggestion = null;
    if (turnDomainFinal) {
      try {
        const { detectMissionOpportunity } = require("../engine/missions/mission-engine");
        const wsLog = workspaceStore.getLog(turnDomainFinal.toLowerCase(), { limit: 40 });
        missionSuggestion = detectMissionOpportunity(turnDomainFinal, wsLog);
        if (missionSuggestion.suggested) {
          console.log(`[mission] suggestion triggered for ${turnDomainFinal}: ${missionSuggestion.reason}`);
        }
      } catch (err) {
        console.warn("[mission] detection error:", err.message);
      }
    }
    // ── end mission detection ─────────────────────────────────────────────────

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

    // Index capture into vector memory (fire-and-forget)
    if (capture) {
      memory.indexCapture({
        text: body.input,
        domain: intelligentResult.finalState?.candidateDomain?.toLowerCase() || "",
        source: "text",
      }).catch(() => {});
    }

    // ── Obsidian writes ───────────────────────────────────────────────────────
    // Capture → Inbox. Significant turns → theory export. Never blocks the reply.
    if (capture) {
      try {
        obsidian.handleCapture({
          content: body.input,
          significance: intelligentResult.finalState?.significance,
          domain: intelligentResult.finalState?.candidateDomain,
          missionId: intelligentResult.finalState?.candidateDomain?.toLowerCase(),
        });
      } catch (err) {
        console.warn("[obsidian] capture write:", err.message);
      }
    }
    try {
      obsidian.handleTurnEnd({
        significance: intelligentResult.finalState?.significance,
        domain: intelligentResult.finalState?.candidateDomain || intelligentResult.truth?.domain,
        workingTheory: intelligentResult.workingTheory,
        modelDecision: intelligentResult.modelDecision,
      });
    } catch (err) {
      console.warn("[obsidian] theory export:", err.message);
    }
    // ── end Obsidian writes ───────────────────────────────────────────────────

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
        council: intelligentResult.council || null,
        skillsUsed: skillInvocation.used ? skillInvocation.skills.map((s) => {
          // Pass raw result for research skills so the UI can render
          // clickable search results and page read cards (Phase 4).
          const RESEARCH_SKILLS = new Set(["browser-search", "browser-read"]);
          return {
            skillId: s.skillId,
            reason: s.reason,
            confidence: s.confidence,
            observations: s.observations,
            patterns: s.patterns,
            summary: s.summary,
            ms: s.ms,
            _raw: RESEARCH_SKILLS.has(s.skillId) ? (s.raw || null) : null,
          };
        }) : [],
        missionSuggestion: missionSuggestion?.suggested ? missionSuggestion : null,
        voiceMemory: body.channel === "voice" ? (() => {
          try {
            const { logVoiceTurn } = require("../engine/voice/voice-memory");
            return logVoiceTurn(body.input, intelligentResult.finalState, intelligentResult.truth);
          } catch { return null; }
        })() : null,
        interruptibility: intelligentResult.finalState?.interruptibility || null,
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

async function handleWorkspaceThread(req, res) {
  try {
    const body = await parseBody(req);
    const { domain, thread } = body;
    if (!domain || !thread?.id) return sendJson(res, 400, { ok: false, error: "Missing domain or thread.id" });
    const { upsertWorkspaceThread } = require("../engine/workspace/workspace-manager");
    const result = upsertWorkspaceThread(domain, thread);
    sendJson(res, 200, { ok: true, thread: result });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleWorkspaceLifecycle(req, res) {
  try {
    const body = await parseBody(req);
    const { id, status } = body;
    if (!id || !status) return sendJson(res, 400, { ok: false, error: "Missing id or status" });
    const { transitionLifecycle } = require("../engine/workspace/workspace-manager");
    const result = transitionLifecycle(id, status);
    sendJson(res, result.ok ? 200 : 400, result);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

// ── Skills handlers ───────────────────────────────────────────────────────────

async function handleSkillManage(req, res) {
  try {
    const body = await parseBody(req);
    const { workspaceId, skillId, action } = body;
    if (!workspaceId || !skillId || !action) {
      return sendJson(res, 400, { ok: false, error: "Missing workspaceId, skillId, or action" });
    }
    const { installSkill, removeSkill } = require("../engine/skills/index");
    if (action === "install") {
      return sendJson(res, 200, installSkill(workspaceId, skillId));
    }
    if (action === "remove") {
      return sendJson(res, 200, removeSkill(workspaceId, skillId));
    }
    sendJson(res, 400, { ok: false, error: `Unknown action: ${action}. Use 'install' or 'remove'.` });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleSkillAutonomy(req, res) {
  try {
    const body = await parseBody(req);
    const { workspaceId, tier } = body;
    if (!workspaceId || tier === undefined) {
      return sendJson(res, 400, { ok: false, error: "Missing workspaceId or tier" });
    }
    const { setAutonomyTier } = require("../engine/skills/index");
    sendJson(res, 200, setAutonomyTier(workspaceId, tier));
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleSkillExecute(req, res) {
  try {
    const body = await parseBody(req);
    const { workspaceId, skillId, params = {} } = body;
    if (!skillId) return sendJson(res, 400, { ok: false, error: "Missing skillId" });
    const { executeSkill } = require("../engine/skills/index");
    const result = await executeSkill(skillId, params, {
      workspaceId: workspaceId || null,
      channel: "sandbox",
      bypassTier: true, // sandbox test execution bypasses tier enforcement
    });
    sendJson(res, result.ok ? 200 : 400, result);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

// ── Mission Engine handlers ───────────────────────────────────────────────────

const missionEngine = require("../engine/missions/mission-engine");
const missionStore = require("../engine/missions/mission-store");
const { MISSION_TYPES, LIFECYCLE_STAGES } = require("../engine/missions/mission-types");

async function handleMissionList(req, res) {
  const missions = missionStore.listMissions();
  sendJson(res, 200, { missions, types: MISSION_TYPES, stages: LIFECYCLE_STAGES });
}

async function handleMissionGet(req, res, id) {
  const mission = missionStore.getMission(id);
  if (!mission) return sendJson(res, 404, { error: "Mission not found" });
  sendJson(res, 200, mission);
}

async function handleMissionCreate(req, res) {
  const body = await parseBody(req);
  const { title, domain, type, seedTheory } = body;
  if (!title || !domain || !type) {
    return sendJson(res, 400, { error: "title, domain, and type are required" });
  }
  const meta = missionEngine.createMission({ title, domain, type, seedTheory: seedTheory || "" });
  sendJson(res, 200, { ok: true, meta });
}

async function handleMissionAdvance(req, res, id) {
  const result = missionEngine.advanceMission(id);
  sendJson(res, result.ok ? 200 : 422, result);
}

async function handleMissionDocGet(req, res, id, docName) {
  const content = missionStore.getDoc(id, docName);
  if (content === null) return sendJson(res, 404, { error: "Document not found" });
  sendJson(res, 200, { id, docName, content });
}

async function handleMissionDocPut(req, res, id, docName) {
  const body = await parseBody(req);
  if (!body.content) return sendJson(res, 400, { error: "content is required" });
  const result = missionEngine.updateDoc(id, docName, body.content);
  sendJson(res, result.ok ? 200 : 404, result);
}

async function handleMissionTheory(req, res, id) {
  const body = await parseBody(req);
  const { statement, confidence, evidence } = body;
  if (!statement || confidence == null) {
    return sendJson(res, 400, { error: "statement and confidence are required" });
  }
  const content = missionEngine.updateWorkingTheory(id, { statement, confidence, evidence: evidence || [] });
  sendJson(res, content ? 200 : 404, { ok: !!content });
}

async function handleMissionContradiction(req, res, id) {
  const body = await parseBody(req);
  const { claim, observed, status } = body;
  if (!claim || !observed) return sendJson(res, 400, { error: "claim and observed are required" });
  missionEngine.addContradiction(id, { claim, observed, status: status || "Unresolved" });
  sendJson(res, 200, { ok: true });
}

// ── Phase 4: Pending Action Confirm ──────────────────────────────────────────
// Observe → Synthesize → Recommend → Execute.
// browser-open and notification-send are Tier 2/3 — Monday recommends, user confirms.
// This endpoint is the Execute step after user clicks "Open" in the workspace UI.

async function handleActionConfirm(req, res) {
  try {
    const body = await parseBody(req);
    const { skill, params = {} } = body;

    if (!skill) return sendJson(res, 400, { ok: false, error: "skill is required" });

    // Only Tier 2/3 confirm-able actions allowed here — not auto-invocable research skills
    const CONFIRMABLE = new Set(["browser-open", "notification-send"]);
    if (!CONFIRMABLE.has(skill)) {
      return sendJson(res, 400, {
        ok: false,
        error: `Skill "${skill}" is not a pending-action skill. Use /skill/execute for direct invocation.`,
      });
    }

    const { executeSkill } = require("../engine/skills/executor");
    const result = await executeSkill(skill, params, {
      channel: "sandbox",
      bypassTier: true, // user confirmed — bypass tier check
    });

    sendJson(res, result.ok ? 200 : 400, result);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleMissionOpportunity(req, res, id) {
  const body = await parseBody(req);
  const { title, description, domain } = body;
  if (!title || !description) return sendJson(res, 400, { error: "title and description are required" });
  missionEngine.addOpportunity(id, { title, description, domain: domain || "" });
  sendJson(res, 200, { ok: true });
}

// ── Obsidian handlers (async — called from createServer router) ───────────────

async function handleObsidianCreateNote(req, res) {
  try {
    const body = await parseBody(req);
    const { title, content, domain, type } = body;
    if (!title || !content) return sendJson(res, 400, { ok: false, error: "title and content required" });
    const result = obsidian.createNote(title, content, { domain, type });
    sendJson(res, result.ok ? 200 : 500, result);
  } catch (err) { sendJson(res, 500, { ok: false, error: err.message }); }
}

async function handleObsidianMissionInit(req, res) {
  try {
    const body = await parseBody(req);
    const { missionId, purpose, focus, theory } = body;
    if (!missionId) return sendJson(res, 400, { ok: false, error: "missionId required" });
    const result = obsidian.createMissionDocs(missionId, { purpose, focus, theory });
    sendJson(res, result.ok ? 200 : 500, result);
  } catch (err) { sendJson(res, 500, { ok: false, error: err.message }); }
}

async function handleObsidianTheory(req, res) {
  try {
    const body = await parseBody(req);
    const { domain, theory, confidence, evidence = [] } = body;
    if (!domain || !theory) return sendJson(res, 400, { ok: false, error: "domain and theory required" });
    const result = obsidian.saveWorkingTheory(domain, theory, confidence, evidence);
    sendJson(res, result.ok ? 200 : 500, result);
  } catch (err) { sendJson(res, 500, { ok: false, error: err.message }); }
}

async function handleObsidianDecision(req, res) {
  try {
    const body = await parseBody(req);
    const { title, reason, domain, context } = body;
    if (!title || !reason) return sendJson(res, 400, { ok: false, error: "title and reason required" });
    const result = obsidian.saveDecision(title, reason, { domain, context });
    sendJson(res, result.ok ? 200 : 500, result);
  } catch (err) { sendJson(res, 500, { ok: false, error: err.message }); }
}

async function handleObsidianContradiction(req, res) {
  try {
    const body = await parseBody(req);
    const { domain, declaredValue, observedPattern } = body;
    if (!domain || !declaredValue || !observedPattern) {
      return sendJson(res, 400, { ok: false, error: "domain, declaredValue, and observedPattern required" });
    }
    const result = obsidian.saveContradiction(domain, declaredValue, observedPattern);
    sendJson(res, result.ok ? 200 : 500, result);
  } catch (err) { sendJson(res, 500, { ok: false, error: err.message }); }
}

async function handleObsidianJournal(req, res) {
  try {
    const body = await parseBody(req);
    const result = obsidian.writeDailyJournal({
      significant:   body.significant || [],
      decisions:     body.decisions || [],
      theories:      body.theories || [],
      openQuestions: body.openQuestions || [],
    });
    sendJson(res, result.ok ? 200 : 500, result);
  } catch (err) { sendJson(res, 500, { ok: false, error: err.message }); }
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

  if (req.method === "POST" && pathname === "/api/monday-sandbox/apple-calendar/sync") {
    syncAppleCalendar()
      .then((r) => sendJson(res, r.ok ? 200 : 500, r))
      .catch((err) => sendJson(res, 500, { ok: false, error: err.message }));
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

  // ── Persistent state endpoints (Task 8) ─────────────────────────────
  // ── Workspace endpoints ──────────────────────────────────────────────────
  if (req.method === "GET" && pathname === "/api/monday-sandbox/workspaces") {
    try {
      sendJson(res, 200, { ok: true, workspaces: getWorkspaceSummaries() });
    } catch (err) {
      sendJson(res, 503, { ok: false, error: err.message, workspaces: [] });
    }
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/monday-sandbox/workspace/") && !pathname.endsWith("/skills")) {
    const id = pathname.replace("/api/monday-sandbox/workspace/", "").trim();
    try {
      const ws = workspaceStore.getWorkspace(id);
      if (!ws) return sendJson(res, 404, { ok: false, error: `Workspace '${id}' not found` });
      const log = workspaceStore.getLog(id, { limit: 30 });
      sendJson(res, 200, { ok: true, workspace: { ...ws, log } });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/workspace/thread") {
    handleWorkspaceThread(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/workspace/lifecycle") {
    handleWorkspaceLifecycle(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/triage") {
    try {
      const store = require("../engine/persistence/state-store");
      sendJson(res, 200, { ok: true, triage: store.getTriageState() });
    } catch (err) {
      sendJson(res, 503, { ok: false, error: err.message, triage: { significantNow: [], watching: [], background: [] } });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/heartbeat") {
    try {
      const store = require("../engine/persistence/state-store");
      const { getJobs } = require("../engine/daemon/scheduler");
      const log = store.getHeartbeatLog({ limit: 20 });
      sendJson(res, 200, { ok: true, log, jobs: getJobs() });
    } catch (err) {
      sendJson(res, 503, { ok: false, error: err.message, log: [], jobs: [] });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/threads") {
    try {
      const store = require("../engine/persistence/state-store");
      sendJson(res, 200, { ok: true, threads: store.getActiveThreads(), theories: store.getWorkingTheories() });
    } catch (err) {
      sendJson(res, 503, { ok: false, error: err.message, threads: [], theories: {} });
    }
    return;
  }

  // ── Skills endpoints ─────────────────────────────────────────────────────────

  if (req.method === "GET" && pathname === "/api/monday-sandbox/skills") {
    try {
      const { getAllSkills } = require("../engine/skills/index");
      sendJson(res, 200, { ok: true, skills: getAllSkills() });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message, skills: [] });
    }
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/monday-sandbox/workspace/") && pathname.endsWith("/skills")) {
    const id = pathname.replace("/api/monday-sandbox/workspace/", "").replace("/skills", "").trim();
    try {
      const { listSkillsForWorkspace } = require("../engine/skills/index");
      sendJson(res, 200, { ok: true, workspaceId: id, skills: listSkillsForWorkspace(id) });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message, skills: [] });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/skill") {
    handleSkillManage(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/skill/autonomy") {
    handleSkillAutonomy(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/skill/execute") {
    handleSkillExecute(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/action/confirm") {
    handleActionConfirm(req, res);
    return;
  }

  // ── Mission Engine routes ──────────────────────────────────────────────────
  if (req.method === "GET" && pathname === "/api/monday-sandbox/mission-engine") {
    handleMissionList(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/mission-engine") {
    handleMissionCreate(req, res);
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/monday-sandbox/mission-engine/")) {
    const parts = pathname.replace("/api/monday-sandbox/mission-engine/", "").split("/");
    if (parts.length === 1) {
      handleMissionGet(req, res, parts[0]);
      return;
    }
    if (parts.length === 3 && parts[1] === "doc") {
      handleMissionDocGet(req, res, parts[0], decodeURIComponent(parts[2]));
      return;
    }
  }

  if (req.method === "PUT" && pathname.startsWith("/api/monday-sandbox/mission-engine/")) {
    const parts = pathname.replace("/api/monday-sandbox/mission-engine/", "").split("/");
    if (parts.length === 3 && parts[1] === "doc") {
      handleMissionDocPut(req, res, parts[0], decodeURIComponent(parts[2]));
      return;
    }
  }

  if (req.method === "POST" && pathname.startsWith("/api/monday-sandbox/mission-engine/") && pathname.endsWith("/advance")) {
    const id = pathname.replace("/api/monday-sandbox/mission-engine/", "").replace("/advance", "");
    handleMissionAdvance(req, res, id);
    return;
  }

  if (req.method === "POST" && pathname.startsWith("/api/monday-sandbox/mission-engine/") && pathname.endsWith("/working-theory")) {
    const id = pathname.replace("/api/monday-sandbox/mission-engine/", "").replace("/working-theory", "");
    handleMissionTheory(req, res, id);
    return;
  }

  if (req.method === "POST" && pathname.startsWith("/api/monday-sandbox/mission-engine/") && pathname.endsWith("/contradiction")) {
    const id = pathname.replace("/api/monday-sandbox/mission-engine/", "").replace("/contradiction", "");
    handleMissionContradiction(req, res, id);
    return;
  }

  if (req.method === "POST" && pathname.startsWith("/api/monday-sandbox/mission-engine/") && pathname.endsWith("/opportunity")) {
    const id = pathname.replace("/api/monday-sandbox/mission-engine/", "").replace("/opportunity", "");
    handleMissionOpportunity(req, res, id);
    return;
  }

  // ── Obsidian routes ──────────────────────────────────────────────────────────

  if (req.method === "GET" && pathname === "/api/monday-sandbox/obsidian/status") {
    try {
      sendJson(res, 200, { ok: true, ...obsidian.getVaultStatus() });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/obsidian/init") {
    try {
      const result = obsidian.ensureVault();
      sendJson(res, result.ok ? 200 : 500, result);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/obsidian/recent") {
    try {
      const limit = Number(url.searchParams.get("limit") || 10);
      sendJson(res, 200, { ok: true, notes: obsidian.recentNotes(limit) });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message, notes: [] });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/obsidian/search") {
    try {
      const q = url.searchParams.get("q") || "";
      sendJson(res, 200, { ok: true, results: obsidian.findNotes(q) });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message, results: [] });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/obsidian/note") {
    try {
      const notePath = url.searchParams.get("path") || "";
      const note = obsidian.getNote(notePath);
      if (!note) return sendJson(res, 404, { ok: false, error: "Note not found" });
      sendJson(res, 200, { ok: true, note });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/obsidian/note") {
    handleObsidianCreateNote(req, res);
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/monday-sandbox/obsidian/mission/")) {
    try {
      const missionId = pathname.replace("/api/monday-sandbox/obsidian/mission/", "").trim();
      sendJson(res, 200, { ok: true, missionId, docs: obsidian.getMissionDocs(missionId) });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/obsidian/mission/init") {
    handleObsidianMissionInit(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/obsidian/theory") {
    handleObsidianTheory(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/obsidian/decision") {
    handleObsidianDecision(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/obsidian/contradiction") {
    handleObsidianContradiction(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/obsidian/journal") {
    handleObsidianJournal(req, res);
    return;
  }

  // ── Vault Indexer routes ──────────────────────────────────────────────────

  if (req.method === "GET" && pathname === "/api/monday-sandbox/obsidian/index/status") {
    try {
      sendJson(res, 200, { ok: true, ...obsidian.getIndexingStatus() });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/obsidian/index/sync") {
    // Runs async — responds immediately with runId, then indexes in background
    obsidian.syncVault().then((result) => {
      console.log("[obsidian] sync complete:", result);
    }).catch((err) => {
      console.warn("[obsidian] sync error:", err.message);
    });
    sendJson(res, 202, { ok: true, status: "sync started" });
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/obsidian/index/reindex") {
    obsidian.reindexVault().then((result) => {
      console.log("[obsidian] reindex complete:", result);
    }).catch((err) => {
      console.warn("[obsidian] reindex error:", err.message);
    });
    sendJson(res, 202, { ok: true, status: "reindex started" });
    return;
  }

  if (req.method === "POST" && pathname === "/api/monday-sandbox/obsidian/embed/sync") {
    obsidian.embedVault().then((result) => {
      console.log("[obsidian] embed sync complete:", result);
    }).catch((err) => {
      console.warn("[obsidian] embed sync error:", err.message);
    });
    sendJson(res, 202, { ok: true, status: "embed sync started" });
    return;
  }

  if (req.method === "GET" && pathname === "/api/monday-sandbox/obsidian/search") {
    const q      = url.searchParams.get("q") || "";
    const domain = url.searchParams.get("domain") || null;
    const limit  = Number(url.searchParams.get("limit") || 8);
    if (!q) { sendJson(res, 400, { ok: false, error: "q is required" }); return; }
    obsidian.searchVault(q, { domain: domain || undefined, limit }).then((result) => {
      sendJson(res, 200, result);
    }).catch((err) => {
      sendJson(res, 500, { ok: false, error: err.message });
    });
    return;
  }

  // GET  /api/monday-sandbox/obsidian/graph/status
  if (req.method === "GET" && pathname === "/api/monday-sandbox/obsidian/graph/status") {
    sendJson(res, 200, { ok: true, ...obsidian.getExtractionStatus() });
    return;
  }

  // POST /api/monday-sandbox/obsidian/graph/extract  — extract all changed notes
  if (req.method === "POST" && pathname === "/api/monday-sandbox/obsidian/graph/extract") {
    obsidian.extractGraphEntities().then((result) => {
      console.log("[obsidian] graph extract:", result);
      sendJson(res, 200, result);
    }).catch((err) => {
      sendJson(res, 500, { ok: false, error: err.message });
    });
    return;
  }

  // POST /api/monday-sandbox/obsidian/graph/extract/:notePath — single note
  if (req.method === "POST" && pathname.startsWith("/api/monday-sandbox/obsidian/graph/extract/")) {
    const notePath = decodeURIComponent(pathname.replace("/api/monday-sandbox/obsidian/graph/extract/", ""));
    if (!notePath) { sendJson(res, 400, { ok: false, error: "notePath required" }); return; }
    obsidian.extractNoteEntities(notePath).then((result) => {
      sendJson(res, 200, result);
    }).catch((err) => {
      sendJson(res, 500, { ok: false, error: err.message });
    });
    return;
  }

  // GET /api/monday-sandbox/obsidian/context?q=&domain=&limit=&channels=semantic,keyword,graph
  if (req.method === "GET" && pathname === "/api/monday-sandbox/obsidian/context") {
    const q        = url.searchParams.get("q") || "";
    const domain   = url.searchParams.get("domain") || null;
    const limit    = Number(url.searchParams.get("limit") || 10);
    const chParam  = url.searchParams.get("channels") || "";
    const channels = chParam ? chParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    if (!q) { sendJson(res, 400, { ok: false, error: "q is required" }); return; }
    obsidian.retrieveContext(q, { domain: domain || undefined, limit, channels }).then((result) => {
      sendJson(res, 200, result);
    }).catch((err) => {
      sendJson(res, 500, { ok: false, error: err.message });
    });
    return;
  }

  // ── end Obsidian routes ───────────────────────────────────────────────────

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Monday Sandbox running at http://localhost:${PORT}/monday-sandbox`);

  // Init Obsidian vault directories on startup (no-op if already present or volume not mounted)
  try {
    const vaultResult = obsidian.ensureVault();
    if (vaultResult?.ok) {
      console.log(`[obsidian] Vault ready at ${process.env.MONDAY_VAULT_ROOT || "/Volumes/Monday/Obsidian/Monday"}`);
    }
  } catch (err) {
    console.warn("[obsidian] Vault init skipped:", err.message);
  }

  // Incremental vault sync on startup, then embed changed notes
  obsidian.syncVault().then((syncResult) => {
    if (syncResult.ok) {
      console.log(`[obsidian] vault sync: ${syncResult.indexed} indexed, ${syncResult.skipped} skipped, ${syncResult.deleted} deleted`);
    } else if (!syncResult.skipped) {
      console.warn("[obsidian] vault sync:", syncResult.error || syncResult.reason);
    }
    // Embed any notes whose chunks are missing or stale, then extract graph entities
    return obsidian.embedVault();
  }).then((embedResult) => {
    if (embedResult?.embedded > 0 || embedResult?.deleted > 0) {
      console.log(`[obsidian] embed: ${embedResult.embedded} chunks written, ${embedResult.deleted} stale removed`);
    }
    return obsidian.extractGraphEntities();
  }).then((graphResult) => {
    if (graphResult?.processed > 0) {
      console.log(`[obsidian] graph: ${graphResult.processed} notes, ${graphResult.entitiesWritten} entities, ${graphResult.relationsWritten} relations`);
    }
  }).catch((err) => console.warn("[obsidian] graph extract error:", err.message));

  // Bootstrap vector memory (fire-and-forget — safe if drive not mounted)
  memory.bootstrap().catch((err) => {
    console.warn("[memory] bootstrap failed:", err.message);
  });

  // Sync Apple Calendar on startup (fire-and-forget — requires Calendar permission)
  syncAppleCalendar().then((r) => {
    if (r.ok) console.log(`[calendar] Apple sync: ${r.count} events`);
    else console.warn("[calendar] Apple sync skipped:", r.error);
  }).catch((err) => console.warn("[calendar] Apple sync error:", err.message));
});
