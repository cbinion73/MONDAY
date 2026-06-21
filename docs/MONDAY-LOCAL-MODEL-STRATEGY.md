# Monday Local-First Model Strategy

Monday runs entirely on local Ollama models by default. This document explains the routing strategy, model tiers, and operational constraints.

---

## Hardware

- **Host**: Mac mini M4 (primary inference machine)
- **Client**: iPhone via Tailscale (connects to Mac mini's Ollama endpoint)
- **Ollama endpoint**: `http://localhost:11434` (or `MONDAY_OLLAMA_BASE_URL` override)

---

## Model Tiers

Four tiers serve four distinct task types. Each tier is assigned a specific model and can be overridden via environment variables.

| Tier | Model | Env var | Purpose |
|------|-------|---------|---------|
| ROUTER | `qwen3:4b` | `MONDAY_MODEL_ROUTER` | Intent classification, lightweight routing |
| DEFAULT | `qwen3:14b` | `MONDAY_MODEL_DEFAULT` | Normal Monday conversation |
| THINKING | `qwen3:30b` | `MONDAY_MODEL_THINKING` | Deep thinking-partner: identity, meaning, strategy |
| EMBEDDING | `nomic-embed-text` | `MONDAY_MODEL_EMBEDDINGS` | Vector search (future) |

Paid models (Claude API) are disabled by default (`MONDAY_USE_PAID_MODELS=false`). Set to `"true"` to enable.

---

## Routing Logic

`src/engine/llm/model-router.js` contains all routing decisions. The function `routeModel()` is called early in `monday-intelligence.js` — before any early returns — so every response path carries a `modelDecision`.

### THINKING triggers (any one is sufficient)

1. **Significance** — significance value is in `THINKING_SIGNIFICANCE` set:
   - `future_life_transition`, `work_identity`, `faith_tension`, `retirement_strategy`
   - `family_time_tension`, `publishing_strategy`, `identity_threat`, `legacy`, `existential`
   - `calling`, `deep_meaning`, `wounded_significance`, `creative_strategy`, `future_life_tradeoff`

2. **Identity / wound proximity** — `identityProximity` or `woundRisk` is `"high"` or `"critical"`

3. **Keyword patterns** — message matches one of:
   - retire/retirement, meaning, purpose, calling, legacy, identity
   - "who am I", "what matters", "what is life", "faith", "God", "prayer", "vocation"
   - "80/70/60 hour", "work winning", "family matter", "pattern", "hypothesis", "theory"
   - stuck, "next chapter"

4. **Depth domain + substantive message** — domain is one of `{Retirement, Faith, Family, Publishing}` AND message is >15 words

### CONVERSATION (default)
Everything else routes to the DEFAULT (14b) model.

### ROUTING
`routeInternalTask()` always returns ROUTING tier. Use for classification, intent detection, and lightweight internal tasks that don't need the full 14b model.

### EMBEDDING
`routeEmbedding()` always returns `nomic-embed-text`. No conversation path currently uses this; reserved for future semantic search.

---

## Environment Variables

```bash
# Set in .env or shell before starting the server
MONDAY_HOST_MODE=mac_local          # informational tag
MONDAY_MODEL_ROUTER=qwen3:4b        # intent/classification tasks
MONDAY_MODEL_DEFAULT=qwen3:14b      # normal conversation
MONDAY_MODEL_THINKING=qwen3:30b     # deep thinking partner
MONDAY_MODEL_EMBEDDINGS=nomic-embed-text
MONDAY_USE_PAID_MODELS=false        # set to "true" to enable Claude API
```

The fallback chain: explicit env var → `MONDAY_OLLAMA_MODEL` (legacy) → hardcoded default.

---

## What `modelDecision` Returns

Every response from `applyMondayIntelligence` includes a `modelDecision` object:

```json
{
  "model": "qwen3:30b",
  "taskType": "thinking",
  "reason": "Significance \"future_life_transition\" requires depth",
  "paidBlocked": true,
  "consideredLarger": false,
  "matchedPattern": null
}
```

The sandbox model inspector panel displays this after every turn.

---

## Ollama Setup

```bash
# Install models once (run on Mac mini)
ollama pull qwen3:4b
ollama pull qwen3:14b
ollama pull qwen3:30b
ollama pull nomic-embed-text

# Start Ollama service
ollama serve

# Verify
curl http://localhost:11434/api/tags | jq '.models[].name'
```

The Tailscale setup: ensure `MONDAY_OLLAMA_BASE_URL=http://<mac-mini-tailscale-ip>:11434` is set on the iPhone client.

---

## Testing

```bash
node tests/model-router.test.js
```

10 test cases covering: standard routing, all THINKING triggers, ROUTING tier, EMBEDDING tier, DETERMINISTIC override.

---

## Extending

To add a new THINKING trigger:
- **Significance value**: add to `THINKING_SIGNIFICANCE` set in `model-router.js`
- **Keyword pattern**: add a regex to `THINKING_PATTERNS` array
- **Depth domain**: add to `DEPTH_DOMAINS` set

To add a new model tier:
1. Add to `MODELS` object in `model-router.js`
2. Add to `TASK_TYPES`
3. Add routing condition in `routeModel()`
4. Add env var to `.env` and this document
