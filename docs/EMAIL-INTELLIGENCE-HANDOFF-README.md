# Email Intelligence Handoff

This document set describes the local-first email intelligence strategy implemented in Monday and packages it for reuse in another application.

The goal is not generic "email RAG."
The goal is a production-worthy email intelligence funnel that:

- suppresses junk before expensive reasoning
- extracts structured facts from high-value mail
- preserves only durable correspondence in semantic memory
- hands clean context to a user-facing assistant or workflow engine

## What This Packet Contains

1. [EMAIL-INTELLIGENCE-HANDOFF-ARCHITECTURE.md](/Users/chris/Desktop/CODE/MONDAY/MONDAY/docs/EMAIL-INTELLIGENCE-HANDOFF-ARCHITECTURE.md)
   The end-to-end system design.

2. [EMAIL-INTELLIGENCE-HANDOFF-DATA-CONTRACTS.md](/Users/chris/Desktop/CODE/MONDAY/MONDAY/docs/EMAIL-INTELLIGENCE-HANDOFF-DATA-CONTRACTS.md)
   The core objects, schemas, and storage model.

3. [EMAIL-INTELLIGENCE-HANDOFF-BUILD-PLAN.md](/Users/chris/Desktop/CODE/MONDAY/MONDAY/docs/EMAIL-INTELLIGENCE-HANDOFF-BUILD-PLAN.md)
   A phased implementation plan for a new team.

4. [EMAIL-INTELLIGENCE-HANDOFF-OPERATIONS.md](/Users/chris/Desktop/CODE/MONDAY/MONDAY/docs/EMAIL-INTELLIGENCE-HANDOFF-OPERATIONS.md)
   Runtime model strategy, cost posture, storage locations, and operating guidance.

## Core Thesis

Do not send the full inbox to a paid cloud model.

Instead:

1. Ingest provider mail locally.
2. Use provider metadata to remove obvious trash.
3. Score threads heuristically.
4. Use a local model to classify survivors.
5. Extract structured facts locally.
6. Preserve only durable correspondence in vector memory.
7. Send only the smallest useful slice to an expensive model.

That gives you:

- lower cost
- better recall
- better latency on repeated tasks
- stronger privacy
- clearer system behavior

## Monday Reference Implementation

The source implementation in this repo lives primarily in:

- [src/engine/connectors/email-intelligence.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/connectors/email-intelligence.js)
- [src/engine/correspondence/katy-stampwhistle.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/correspondence/katy-stampwhistle.js)
- [src/engine/db/email-intelligence-store.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/db/email-intelligence-store.js)
- [src/engine/db/email-memory-store.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/db/email-memory-store.js)
- [src/engine/connectors/gmail-sync.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/connectors/gmail-sync.js)
- [src/engine/connectors/outlook-sync.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/connectors/outlook-sync.js)

## Intended Audience

This handoff is for:

- engineering leads
- platform/backend engineers
- applied AI engineers
- product architects
- technical PMs working on email intelligence, assistant memory, or workflow automation

## What To Reuse vs What To Adapt

Reuse directly:

- provider-metadata-first filtering
- heuristic scoring before LLMs
- local classifier before cloud reasoning
- structured fact extraction
- preserved-correspondence memory lane
- historical import separate from incremental sync

Adapt for the target app:

- domain taxonomy
- sender/entity vocabulary
- preservation thresholds
- compliance and retention policy
- final user-facing orchestration skills

