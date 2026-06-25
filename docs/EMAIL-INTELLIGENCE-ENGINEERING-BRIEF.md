# Email Intelligence Engineering Brief

## Purpose

Build a local-first email intelligence layer that turns a noisy inbox into structured, retrievable operational context.

The system should:

- ingest mail from Gmail and Outlook
- suppress junk before expensive reasoning
- classify useful threads locally
- extract structured facts
- preserve only durable correspondence into semantic memory
- hand a small ranked evidence set to a cloud model only when final synthesis is needed

This is not generic email search.
It is an intelligence funnel.

## Core Thesis

Do not send the inbox to a paid model.

Instead:

1. ingest locally
2. filter with provider metadata
3. score heuristically
4. classify with a local LLM
5. extract structured facts
6. preserve only durable threads
7. send only ranked evidence to the expensive model

This reduces:

- token cost
- junk contamination
- latency on repeated workflows
- privacy exposure

## High-Level Architecture

```text
Provider Ingestion
-> Metadata Filtering
-> Heuristic Scoring
-> Local LLM Classification
-> Structured Fact Extraction
-> Durable Preservation
-> Retrieval Router
-> Final User-Facing Reasoning
```

## What Makes This Different

### 1. Metadata-first filtering

Use Gmail categories and Outlook inference/folder metadata before any model sees the mail.

Examples:

- `CATEGORY_PROMOTIONS`
- `CATEGORY_SOCIAL`
- `CATEGORY_FORUMS`
- spam / trash
- Outlook focused/other/inbox classification

### 2. Local-first intelligence

The local model handles:

- thread classification
- domain labeling
- fact extraction assistance
- preservation decisions

The cloud model is reserved for:

- final synthesis
- planning
- concise user-facing output

### 3. Preservation is selective

Everything may be ingested.
Only some threads should be preserved in semantic memory.

Preserve:

- travel/ticket/reservation mail
- order and shipment evidence
- relational mail with participation
- durable work threads
- high-signal family, faith, publishing, or financial threads

Do not preserve:

- promotions
- newsletters
- social/forum mail
- one-way thematic mail with no action
- weak transactional lookalikes

### 4. Historical import is separate from daily sync

These are two different jobs.

Historical import:

- paginated
- slow
- one-time or occasional
- builds the corpus

Incremental sync:

- bounded
- cheap
- frequent
- keeps the corpus fresh

## Recommended Data Model

### Canonical thread record

Each normalized thread should include:

- source
- subject
- from
- provider category/labels
- unread/starred
- attachment signal
- relationship score
- junk score
- significance score
- domain
- thread type
- actionability
- entities
- structured facts
- classification confidence
- user participation
- message count
- body hash
- updated timestamp

### Structured facts

Recommended fact types:

- date
- time
- location
- reservation
- traveler
- entry instruction
- link

### Preservation ledger

Track:

- preserved vs dropped
- preserve score
- preserve reason
- vector document id
- summary
- last preserved timestamp

## Storage Pattern

Use three layers:

### 1. Connector store

Purpose:

- normalized imported provider mail

### 2. Relational store

Purpose:

- canonical thread records
- structured facts
- preservation ledger

### 3. Vector store

Purpose:

- preserved correspondence only

This separation makes pruning, replay, and retrieval much safer.

## Recommended First Workflow

Travel planning is the best proving ground.

Prompt:

`I need to plan my trip next week. I have tickets in my email.`

Expected system behavior:

1. look at calendar constraints
2. retrieve likely transactional travel mail
3. suppress junk automatically
4. extract reservation facts locally
5. build itinerary
6. present the plan

Not:

`Want me to look through your email?`

## Build Priorities

### Phase 1

- Gmail + Outlook ingestion
- normalized thread model
- local store

### Phase 2

- provider-side filtering
- deterministic scoring

### Phase 3

- local thread classification
- structured fact extraction

### Phase 4

- preservation layer
- vector memory
- pruning path

### Phase 5

- retrieval router
- one canonical user-facing skill

### Phase 6

- historical import
- incremental sync operations

## Operational Guidance

Track at minimum:

- imported thread count
- active preserved count
- dropped/preserved ratio
- historical import runtime
- vector store growth
- retrieval precision on gold scenarios

## Risks

### Risk 1: Junk fossilization

If preserve logic is too loose, newsletters and promo mail contaminate memory.

Mitigation:

- strong metadata filtering
- pruning as a first-class capability

### Risk 2: Cloud cost creep

If classification or retrieval routes too much mail to a paid model, cost balloons quickly.

Mitigation:

- local-first classification
- small evidence handoff only

### Risk 3: Historical import confusion

If the daily sync path is used for full import, performance and maintenance both degrade.

Mitigation:

- separate historical import command and workflow

## Recommendation

Build this as an email intelligence subsystem, not as “email chat.”

The architecture should produce:

- ranked evidence
- structured facts
- durable memory

Then let the assistant or workflow engine turn that into a user-facing answer.

That separation is what keeps the system useful, cheap, and explainable.
