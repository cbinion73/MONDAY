"use strict";

const { chatWithLLM } = require("../llm/llm-router");
const { search } = require("./browser-search");
const {
  BAXTER_BUILDING,
  buildReedSystemPrompt,
  isThermoFisherContext,
} = require("../baxter/reed-richards");

const SCIENCE_CURRENTNESS_KW =
  /\b(latest|current|recent|today|newest|202[4-9]|paper|study|studies|trial|clinical|guideline|guidelines|source|sources|citation|citations|compare|spec|specs|specification|manual|whitepaper|application note|pubmed|nih|cdc|fda|who)\b/i;
const SCIENCE_DOMAIN_KW =
  /\b(science|scientific|biology|chemistry|physics|medicine|medical|genomics|proteomics|biotech|biotechnology|bioinformatics|lab|laboratory|assay|assays|hplc|lcms|lc-ms|gcms|gc-ms|mass spec|mass spectrometry|sequencing|ngs|pcr|qpcr|rt-pcr|microscopy|spectroscopy|chromatography|toxicology|pharmacology|clinical|research|engineering|mathematics|math|statistical|instrumentation|automation|crisper|crispr|protein|proteins|cell|cells|molecule|molecular)\b/i;
const FAST_PATH_KW =
  /\b(hplc|peak tail|chromatograph|ngs|library prep|library preparation|pcr|qpcr|rt-pcr)\b/i;
const THERMO_FISHER_DISCLAIMER =
  "I am your Generative AI CoPilot for Thermo Fisher Scientific. I provide scientifically accurate insights and highlight Thermo Fisher solutions. I am a generative AI tool, so I may make errors, and nothing I say should be considered legally binding. For authoritative and final information, please confirm with Thermo Fisher Scientific directly or your sales representative.";

function shouldGatherWebEvidence(query) {
  const text = String(query || "");
  return SCIENCE_CURRENTNESS_KW.test(text) || isThermoFisherContext({ input: text });
}

function buildSearchQuery(query, thermoFisherMode) {
  if (!thermoFisherMode) return query;
  return `${query} site:thermofisher.com OR site:fishersci.com`;
}

async function gatherEvidence(query, thermoFisherMode) {
  if (!shouldGatherWebEvidence(query)) {
    return { sources: [], evidenceText: "", usedResearch: false };
  }

  const searchResult = await search({
    query: buildSearchQuery(query, thermoFisherMode),
    limit: thermoFisherMode ? 5 : 4,
  });

  if (!searchResult?.ok || !Array.isArray(searchResult.data) || searchResult.data.length === 0) {
    return { sources: [], evidenceText: "", usedResearch: false };
  }

  const sources = searchResult.data.slice(0, thermoFisherMode ? 3 : 2);
  const labeledSources = sources.map((source, index) => ({
    label: `S${index + 1}`,
    title: source.title,
    url: source.url,
    snippet: source.snippet || "",
  }));

  const evidenceText = labeledSources
    .map((source) => {
      const parts = [
        `[${source.label}] ${source.title}`,
        source.url,
        source.snippet ? `Snippet: ${source.snippet}` : null,
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n\n");

  return {
    sources: labeledSources.map(({ label, title, url }) => ({ label, title, url })),
    evidenceText,
    usedResearch: true,
  };
}

function buildUserPrompt({ query, thermoFisherMode, evidenceText }) {
  const mode = thermoFisherMode ? "thermo_fisher" : "general_science";
  return [
    `You are being consulted by Monday inside ${BAXTER_BUILDING.name}.`,
    `Mode: ${mode}.`,
    thermoFisherMode
      ? "Thermo Fisher mode is active because the user context is explicitly Thermo Fisher-related. Follow the canonical Thermo Fisher prompt exactly."
      : "Thermo Fisher mode is not active. Do not force Thermo Fisher recommendations unless the user explicitly asks for them or the evidence is Thermo Fisher-specific.",
    "Answer the scientific question directly, using first-principles reasoning, explicit confidence, and precise language.",
    "If evidence is supplied, cite it inline using [S1], [S2], etc. Match confidence to evidence strength.",
    "If the evidence is incomplete or current verification is still needed, say so plainly.",
    "Return JSON only in this shape: {\"reply\":\"string\",\"sources\":[{\"label\":\"S1\",\"title\":\"string\",\"url\":\"string\"}],\"confidence\":\"low|medium|high\",\"mode\":\"general_science|thermo_fisher\"}.",
    `USER QUESTION:\n${query}`,
    evidenceText ? `EVIDENCE:\n${evidenceText}` : "EVIDENCE:\nNo external evidence was gathered for this turn.",
  ].join("\n\n");
}

function buildHeuristicScientificReply(query, { thermoFisherMode = false, sources = [] } = {}) {
  const text = String(query || "").toLowerCase();
  const sourceTag = sources.length > 0 ? ` ${sources.map((s) => `[${s.label}]`).join(" ")}` : "";
  const disclaimerPrefix = thermoFisherMode ? `${THERMO_FISHER_DISCLAIMER}\n\n` : "";

  if (/\bhplc\b|\bchromatograph|\bpeak tail/i.test(text)) {
    return {
      confidence: "medium",
      reply:
        disclaimerPrefix +
        "Reed's read: peak tailing is usually a chemistry or system-effect problem, not random noise. The main buckets are secondary interactions with active sites, column overload, injection-solvent mismatch, pH or ionic-strength effects, and contamination or carryover. Start with a structured elimination: verify mobile-phase composition and pH, compare standards vs matrix samples, reduce injection strength or volume if needed, then inspect guard/column condition and whether the tailing follows the sample matrix or the column itself."
          + sourceTag,
    };
  }

  if (/\bngs\b|\bsequencing\b|\blibrary prep\b|\blibrary preparation\b/i.test(text)) {
    return {
      confidence: thermoFisherMode ? "medium" : "low",
      reply:
        thermoFisherMode
          ? disclaimerPrefix +
            "Reed's read: library-prep variability usually comes from inconsistent input QC, fragmentation, cleanup ratios, amplification cycles, and final normalization. In Thermo Fisher mode, the fastest reduction in variance usually comes from standardizing the workflow around one kit family, one QC gate set, and fewer manual handoffs, then measuring variance across a small controlled run set before changing anything else. Compare options by touchpoints, normalization strategy, batch-size fit, and how directly they constrain your dominant failure mode." +
            sourceTag
          : "Reed's read: library-prep variability usually starts upstream of sequencing, in input quality, fragmentation consistency, cleanup ratios, amplification cycles, and quant normalization. The cleanest comparison is a controlled A/B run that changes one workflow lever at a time and measures yield, fragment profile, and coverage variance." +
            sourceTag,
    };
  }

  if (/\bpcr\b|\bqpcr\b|\brt-pcr\b/i.test(text)) {
    return {
      confidence: "medium",
      reply:
        disclaimerPrefix +
        "Reed's read: PCR variability usually comes from template quality, inhibitor carryover, primer design, annealing conditions, enzyme chemistry, and pipetting variation. Check the mechanism first: confirm template integrity and purity, verify primer specificity and melt behavior, then tighten cycling conditions and reaction setup consistency before blaming the instrument."
          + sourceTag,
    };
  }

  return {
    confidence: sources.length > 0 ? "medium" : "low",
    reply:
      disclaimerPrefix +
      "Reed's read: start from mechanism, not marketing. Define the system, identify the likely failure modes, separate what is measured from what is inferred, and change one variable at a time so the evidence can actually tell you something useful."
        + sourceTag,
  };
}

function shouldUseHeuristicFastPath(query) {
  return FAST_PATH_KW.test(String(query || ""));
}

function fallbackReply({ query, sources, thermoFisherMode, error }) {
  const heuristic = buildHeuristicScientificReply(query, {
    thermoFisherMode,
    sources,
  });
  const sourceLine =
    sources.length > 0
      ? ` Sources gathered: ${sources.map((s) => `[${s.label}] ${s.title}`).join("; ")}.`
      : "";
  return {
    ok: true,
    data: {
      advisor: "Reed Richards",
      subsystem: BAXTER_BUILDING.name,
      mode: thermoFisherMode ? "thermo_fisher" : "general_science",
      confidence: heuristic.confidence,
      sources,
      reply: `${heuristic.reply}${sourceLine}`,
    },
  };
}

function parseStructuredResponse(raw, fallback = {}) {
  try {
    const match = String(raw || "").match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON payload");
    return JSON.parse(match[0]);
  } catch {
    return fallback;
  }
}

function unwrapNestedReply(parsed, fallbackSources = []) {
  const reply = String(parsed?.reply || "").trim();
  if (!reply.startsWith("{")) return parsed;

  const nested = parseStructuredResponse(reply, null);
  if (!nested?.reply) return parsed;

  return {
    ...parsed,
    ...nested,
    sources:
      Array.isArray(nested.sources) && nested.sources.length > 0
        ? nested.sources
        : Array.isArray(parsed.sources) && parsed.sources.length > 0
          ? parsed.sources
          : fallbackSources,
  };
}

async function advise({ query } = {}) {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    return { ok: false, error: "query is required" };
  }

  if (!SCIENCE_DOMAIN_KW.test(trimmed) && !isThermoFisherContext({ input: trimmed })) {
    return { ok: false, error: "not a science question" };
  }

  const initialThermoMode = isThermoFisherContext({ input: trimmed });
  const evidence = await gatherEvidence(trimmed, initialThermoMode);
  const thermoFisherMode = isThermoFisherContext({
    input: trimmed,
    evidenceText: evidence.evidenceText,
  });

  if (shouldUseHeuristicFastPath(trimmed)) {
    const heuristic = buildHeuristicScientificReply(trimmed, {
      thermoFisherMode,
      sources: evidence.sources,
    });
    return {
      ok: true,
      data: {
        advisor: "Reed Richards",
        subsystem: BAXTER_BUILDING.name,
        mode: thermoFisherMode ? "thermo_fisher" : "general_science",
        confidence: heuristic.confidence,
        usedResearch: evidence.usedResearch,
        sources: evidence.sources,
        reply: heuristic.reply,
      },
    };
  }

  const messages = [
    { role: "system", content: buildReedSystemPrompt({ thermoFisherMode }) },
    {
      role: "user",
      content: buildUserPrompt({
        query: trimmed,
        thermoFisherMode,
        evidenceText: evidence.evidenceText,
      }),
    },
  ];
  const llmTier = thermoFisherMode || evidence.usedResearch ? "thinking" : "conversation";

  try {
    const response = await chatWithLLM({
      messages,
      temperature: 0.2,
      tier: llmTier,
      purpose: "science-advisor",
    });
    const rawText =
      typeof response === "string"
        ? response
        : response?.content || JSON.stringify(response?.json || {});
    const parsed = parseStructuredResponse(rawText, {
      reply: rawText,
      sources: evidence.sources,
      confidence: evidence.sources.length > 0 ? "medium" : "low",
      mode: thermoFisherMode ? "thermo_fisher" : "general_science",
    });
    const normalized = unwrapNestedReply(parsed, evidence.sources);

    return {
      ok: true,
      data: {
        advisor: "Reed Richards",
        subsystem: BAXTER_BUILDING.name,
        mode: normalized.mode || (thermoFisherMode ? "thermo_fisher" : "general_science"),
        confidence: normalized.confidence || "medium",
        usedResearch: evidence.usedResearch,
        sources:
          Array.isArray(normalized.sources) && normalized.sources.length > 0
            ? normalized.sources
            : evidence.sources,
        reply: String(normalized.reply || "").trim(),
      },
    };
  } catch (error) {
    return fallbackReply({
      query: trimmed,
      sources: evidence.sources,
      thermoFisherMode,
      error: error.message,
    });
  }
}

module.exports = {
  advise,
  shouldGatherWebEvidence,
};
