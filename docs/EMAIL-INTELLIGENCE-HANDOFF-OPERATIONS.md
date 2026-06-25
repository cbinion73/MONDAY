# Email Intelligence Handoff Operations

## 1. Model Strategy

## Recommended Rule

Use local models for ingestion intelligence.
Use cloud models only for final synthesis when needed.

### Local-first tasks

- thread classification
- fact extraction
- preservation decisions
- pruning audits
- retrieval routing

### Cloud-only-at-the-end tasks

- final user-facing plan
- final summary
- strategic synthesis across multiple evidence sources

## 2. Cost Posture

The point of this architecture is to reduce cloud token burn by keeping most inbox work local and deterministic.

### Cheap layers

- provider metadata filtering
- heuristics
- local classification
- local extraction
- local retrieval

### Expensive layer

- final reasoning over the small retrieved evidence set

### Operational principle

Never send all candidate email to the expensive model.

## 3. Storage Model

In Monday, email intelligence currently stores to:

- connector store: `/Volumes/Monday/Monday/connectors`
- SQLite DB: `/Volumes/Monday/Monday/db/monday.db`
- semantic memory: `/Volumes/Monday/Monday/memory`

At the time of writing, observed disk usage was approximately:

- connectors: `16M`
- db: `23M`
- memory: `41M`

These values will grow with corpus size and embedding density.

## 4. What Gets Stored Where

### Connector store

Purpose:

- raw-ish normalized provider thread snapshots
- multi-source merged working set

### SQLite

Purpose:

- canonical thread records
- structured facts
- preserve/drop ledger
- queryable operational state

### Vector store

Purpose:

- preserved correspondence only
- semantic recall

## 5. Retention Guidance

Recommended policy:

- keep raw imported thread records for audit and replay
- keep structured facts for operational use
- preserve only selected threads semantically
- allow re-pruning as policies improve

The pruning path is important.

Without it, bad preservation rules fossilize junk into memory forever.

## 6. Security and Privacy

Recommended controls:

- local processing by default
- encryption at rest if corporate policy requires it
- least-privilege provider scopes
- environment-secret isolation
- explicit retention policy
- audit logs on import and preservation

If the work app is enterprise-facing, add:

- mailbox-scope controls
- workspace/tenant partitioning
- legal hold compatibility
- role-based access to semantic recall

## 7. Historical Import Guidance

Historical import should:

- paginate deeply
- be resumable
- be idempotent
- be separate from daemon sync
- tolerate long local-model runtimes

This job can be slow.
That is acceptable.

It is a corpus-building task, not a chat interaction.

## 8. Incremental Sync Guidance

Incremental sync should:

- use bounded recent windows
- use provider-native filters
- avoid rereading the entire mailbox
- write only changed/new threads

## 9. Operational Health Metrics

Track at minimum:

- imported thread count
- active preserved thread count
- dropped/preserved ratio
- classifier latency
- historical import runtime
- vector store growth
- retrieval precision on gold scenarios

## 10. Recommended Handoff Summary for Engineering Teams

If you need to summarize this architecture in one paragraph:

Build a local-first email intelligence funnel that ingests normalized provider mail, filters junk with provider metadata and heuristics, classifies surviving threads locally, extracts structured facts, preserves only durable correspondence into semantic memory, and sends only ranked evidence to a cloud model for final reasoning. Separate historical import from incremental sync, and treat pruning as a first-class capability rather than an afterthought.
