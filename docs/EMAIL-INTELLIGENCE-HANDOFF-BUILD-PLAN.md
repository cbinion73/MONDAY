# Email Intelligence Handoff Build Plan

## Objective

Build a local-first email intelligence layer that can support search, planning, summarization, and memory for a larger application without routing the whole inbox through a paid cloud model.

## Phase 1 — Provider Ingestion

### Deliverables

- Gmail connector
- Outlook connector
- normalized thread model
- local email store

### Requirements

- support incremental sync
- support historical import
- preserve provider metadata
- preserve thread/message bodies and snippets

### Exit Criteria

- messages from both providers land in a single normalized store
- historical import can fetch thousands, not just the recent slice

## Phase 2 — Deterministic Filtering

### Deliverables

- provider metadata normalization
- junk/newsletter/marketing suppression
- scoring functions

### Required Scores

- `relationshipScore`
- `junkScore`
- `significanceScore`
- `actionability`

### Exit Criteria

- obvious promotions/social/forums/spam are filtered before LLM classification
- scoring is deterministic and testable

## Phase 3 — Local Classification

### Deliverables

- local classifier prompt
- batch classification worker
- thread/domain taxonomy

### Model Recommendation

- local Qwen-class model or equivalent
- low temperature
- JSON-only output

### Exit Criteria

- surviving mail is classified into thread type + domain
- classification output is stored back onto the thread record

## Phase 4 — Fact Extraction

### Deliverables

- deterministic extractor for dates, times, locations, confirmations, links
- optional local-model assist later if needed

### Exit Criteria

- travel/ticket/order-style messages yield reliable structured facts
- facts are stored relationally

## Phase 5 — Preservation Layer

### Deliverables

- preservation policy engine
- semantic correspondence memory
- preserve/drop ledger
- pruning path

### Design Requirement

Preservation must be more selective than ingestion.

### Exit Criteria

- junk and one-way thematic mail are not preserved
- durable threads become semantically retrievable
- previously preserved junk can be dropped later

## Phase 6 — Retrieval Router

### Deliverables

- ranked local retrieval
- provider-side live search fallback
- query profiles for workflows like travel, receipts, or approvals

### Exit Criteria

- the system can answer a specific operational question with a small evidence set
- live provider search is used only when local evidence is insufficient

## Phase 7 — User-Facing Skills

### Deliverables

- workflow skills built on top of email intelligence
- travel planning
- receipt recovery
- meeting prep
- relationship follow-up
- task extraction

### Exit Criteria

- the user asks for an outcome
- the assistant returns the outcome
- the user is not asked to manually hunt through email unless evidence is missing

## Phase 8 — Historical Import and Ongoing Sync

### Two Different Lanes

#### Lane A — Historical import

- one-time or occasional
- paginated
- expensive in local compute
- builds the corpus

#### Lane B — Incremental sync

- frequent
- bounded
- cheap
- keeps the corpus fresh

### Exit Criteria

- the product no longer confuses "import all history" with "stay up to date"

## Recommended Implementation Order

1. provider ingestion
2. deterministic filtering
3. local classification
4. fact extraction
5. preservation
6. retrieval
7. one canonical skill
8. historical import
9. operational cleanup and pruning

## Recommended First Skill

Travel planning is a strong proving ground because it exercises:

- calendar constraints
- transactional email
- fact extraction
- ranked retrieval
- itinerary synthesis

## Test Strategy

Minimum tests:

- provider ingestion normalization
- promo suppression
- false-travel suppression
- structured fact extraction
- preserve/drop decisions
- retrieval ranking
- one end-to-end scenario

Good gold-standard scenario:

- "I need to plan my trip next week. I have tickets in my email."

