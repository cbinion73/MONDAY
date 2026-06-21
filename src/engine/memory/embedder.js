"use strict";
// embedder.js — local embeddings via Ollama nomic-embed-text (768 dims).
// No external API, no cost. Falls back gracefully if Ollama is unreachable.

const OLLAMA_BASE = process.env.MONDAY_OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const MODEL = process.env.MONDAY_MODEL_EMBEDDINGS || "nomic-embed-text";
const TIMEOUT_MS = 10000;
const DIM = 768;

// Embed a single string. Returns float[] or null on failure.
async function embed(text) {
  if (!text || typeof text !== "string") return null;

  const clean = text.replace(/\s+/g, " ").trim().slice(0, 4000);

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: clean }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const vec = data?.embeddings?.[0];
    if (!Array.isArray(vec) || vec.length !== DIM) return null;
    return vec;
  } catch {
    return null;
  }
}

// Embed multiple strings in parallel (capped at 8 concurrent).
async function embedBatch(texts) {
  const CONCURRENCY = 8;
  const results = [];
  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const chunk = texts.slice(i, i + CONCURRENCY);
    const vecs = await Promise.all(chunk.map(embed));
    results.push(...vecs);
  }
  return results;
}

// Zero vector fallback for rows that failed to embed — keeps table schema consistent.
function zeroVector() {
  return new Array(DIM).fill(0);
}

module.exports = { embed, embedBatch, zeroVector, DIM, MODEL };
