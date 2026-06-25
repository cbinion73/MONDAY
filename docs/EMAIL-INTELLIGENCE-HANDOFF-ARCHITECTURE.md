# Email Intelligence Handoff Architecture

## 1. System Purpose

The system exists to convert noisy email streams into cheap, retrievable, structured context for downstream reasoning and action.

It is not an inbox UI.
It is not a generic vector dump.
It is not "let the LLM read all my mail."

It is a funnel.

## 2. High-Level Flow

```text
Provider Ingestion
-> Metadata Filtering
-> Heuristic Scoring
-> Local LLM Classification
-> Structured Fact Extraction
-> Durable Preservation
-> Retrieval Router
-> User-Facing Reasoning / Planning
```

## 3. Architecture Components

### 3.1 Provider Ingestion

Responsibilities:

- connect to Gmail / Outlook / other providers
- fetch thread/message metadata
- fetch message body and snippets
- normalize provider-specific shapes into one thread model

Monday reference:

- [src/engine/connectors/gmail-sync.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/connectors/gmail-sync.js)
- [src/engine/connectors/outlook-sync.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/connectors/outlook-sync.js)
- [src/engine/connectors/email-context.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/connectors/email-context.js)

Important pattern:

- separate `incremental sync` from `historical import`
- do not use the lightweight daemon sync path for one-time backfill

### 3.2 Metadata Filtering

Responsibilities:

- use provider-native categories and labels to eliminate obvious noise
- avoid LLM calls on messages already marked promotional, social, forum, spam, or trash

Examples:

- Gmail labels: `CATEGORY_PROMOTIONS`, `CATEGORY_SOCIAL`, `CATEGORY_FORUMS`, `SPAM`, `TRASH`
- Outlook signals: `inferenceClassification`, categories, folders

Why this matters:

- cheapest possible first-pass filtering
- significant token reduction
- less junk leaking into downstream semantic memory

### 3.3 Heuristic Scoring

Responsibilities:

- compute local deterministic scores before any model sees the data

Recommended scores:

- `relationshipScore`
- `junkScore`
- `significanceScore`
- `actionability`

Recommended inputs:

- sender pattern
- prior user participation
- message count
- recency
- star/flag state
- known entity matches
- explicit action language
- marketing/newsletter markers

Monday reference:

- `computeRelationshipScore()`
- `computeJunkScore()`
- `computeSignificanceScore()`
- `computeActionability()`

all in [src/engine/connectors/email-intelligence.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/connectors/email-intelligence.js)

### 3.4 Local LLM Classification

Responsibilities:

- classify surviving threads into domain and thread type
- remain local-first
- feed structured results back into the deterministic pipeline

Recommended class labels:

- `junk`
- `promo`
- `ignore`
- `transactional`
- `personal`
- `travel`
- `family_logistics`
- `work`
- `financial`
- `faith`
- `publishing`

Important rule:

- cloud models should not do this pass
- this pass should be handled by a local model such as Qwen

### 3.5 Structured Fact Extraction

Responsibilities:

- turn high-value threads into structured data
- support downstream planning without rereading raw mail

Recommended fact types:

- `date`
- `time`
- `location`
- `reservation`
- `traveler`
- `entry_instruction`
- `link`

Use cases:

- travel planning
- order and shipment tracking
- calendar/event synthesis
- financial reminders
- relationship/task follow-through

### 3.6 Durable Preservation

Responsibilities:

- decide what correspondence deserves semantic memory
- keep important threads retrievable later
- reject low-value or one-way promotional mail

This is the Katy layer in Monday.

Monday reference:

- [src/engine/correspondence/katy-stampwhistle.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/correspondence/katy-stampwhistle.js)

Preservation is not equal to ingestion.

Everything may be ingested.
Only some threads should be preserved.

### 3.7 Retrieval Router

Responsibilities:

- answer focused requests by retrieving only the relevant subset
- prefer structured facts and preserved correspondence over raw inbox scans
- escalate to provider-side live search only when strong evidence is missing

Pattern:

1. search local structured/fact store
2. search preserved vector memory
3. if needed, run provider-native search
4. pass only ranked evidence into final reasoning

### 3.8 User-Facing Reasoning

Responsibilities:

- synthesize the retrieved evidence
- generate plans, summaries, or actions
- use paid cloud reasoning only at this final layer when necessary

Example:

For "I need to plan my trip next week. I have tickets in my email."

The reasoning model should receive:

- next week calendar slice
- 2-6 ranked ticket/reservation emails
- extracted structured facts
- known constraints

Not the whole inbox.

## 4. Design Rules

### Rule 1: Filter before classify

Do not waste model calls on obvious promo/social/forum mail.

### Rule 2: Classify before preserve

Do not vectorize everything.

### Rule 3: Preserve before retrieve

The preserved memory lane should make repeated tasks faster and cheaper over time.

### Rule 4: Historical import is separate

Backfill and daily sync are different jobs.

### Rule 5: Retrieval is evidence, not conversation

The email layer should deliver ranked facts and threads, not try to be the assistant itself.

