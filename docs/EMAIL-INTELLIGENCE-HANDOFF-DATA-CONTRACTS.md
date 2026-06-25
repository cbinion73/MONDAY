# Email Intelligence Handoff Data Contracts

## 1. Canonical Thread Object

This is the normalized unit of email intelligence.

```json
{
  "threadId": "string",
  "source": "gmail|outlook|other",
  "subject": "string|null",
  "fromAddress": "string|null",
  "providerCategory": "string|null",
  "providerLabels": ["string"],
  "folder": "string|null",
  "receivedAt": "ISO timestamp|null",
  "unread": true,
  "starred": false,
  "hasAttachments": false,
  "relationshipScore": 0.0,
  "junkScore": 0.0,
  "significanceScore": 0.0,
  "domain": "Family|Work|Faith|Publishing|Retirement|null",
  "threadType": "junk|promo|ignore|transactional|personal|travel|family_logistics|work|financial|faith|publishing|null",
  "actionability": 0.0,
  "entities": ["string"],
  "structuredFacts": [],
  "localClassification": {},
  "classificationConfidence": 0.0,
  "userParticipated": false,
  "messageCount": 1,
  "bodyHash": "sha256",
  "updatedAt": "ISO timestamp"
}
```

Monday reference:

- [src/engine/db/email-intelligence-store.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/db/email-intelligence-store.js)

## 2. Structured Fact Object

```json
{
  "type": "date|time|location|reservation|traveler|entry_instruction|link",
  "key": null,
  "value": "string",
  "confidence": 0.82
}
```

Guidance:

- store facts in a dedicated relational table for filtering and joins
- also embed them indirectly through preserved thread summaries

## 3. Preservation Ledger Object

This tracks whether a thread was elevated into durable memory.

```json
{
  "threadId": "string",
  "bodyHash": "sha256|null",
  "preserveState": "preserved|dropped",
  "preserveReason": "string|null",
  "preserveScore": 0.0,
  "vectorDocId": "string|null",
  "summary": "string|null",
  "lastPreservedAt": "ISO timestamp"
}
```

Monday reference:

- [src/engine/db/email-memory-store.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/db/email-memory-store.js)

## 4. Required Relational Tables

Minimum recommended tables:

### `email_threads`

Purpose:

- canonical normalized record per thread/conversation

Key fields:

- provider metadata
- computed scores
- classification outputs
- structured facts blob

### `email_thread_facts`

Purpose:

- relational fact table for fast filtering and planning

Key fields:

- `thread_id`
- `fact_type`
- `fact_key`
- `fact_value`
- `confidence`
- `created_at`

### `email_memory_records`

Purpose:

- preservation ledger
- vector linkage
- audit trail for preserve/drop decisions

## 5. Vector Record Contract

For preserved correspondence only.

```json
{
  "id": "corr_<threadId>",
  "threadId": "string",
  "subject": "string",
  "fromAddress": "string",
  "text": "string",
  "summary": "string",
  "domain": "string",
  "source": "email",
  "threadType": "string",
  "significanceScore": 0.0,
  "relationshipScore": 0.0,
  "entities": "[json-stringified-array]",
  "ts": 0
}
```

Monday reference:

- [src/engine/memory/memory-writer.js](/Users/chris/Desktop/CODE/MONDAY/MONDAY/src/engine/memory/memory-writer.js)

## 6. Retrieval Return Shape

For downstream reasoning or planning calls:

```json
{
  "ok": true,
  "data": [],
  "count": 0,
  "totalCandidates": 0,
  "filteredOut": 0,
  "query": "string",
  "source": "local|multi"
}
```

Each returned item should already include:

- thread metadata
- scores
- classification
- structured facts

## 7. Separation of Concerns

Do not collapse these three layers into one table:

1. raw/normalized email thread storage
2. structured fact storage
3. durable preserved semantic memory

Keeping them separate is what makes:

- pruning safe
- retrieval explainable
- historical import reversible
- memory drift manageable

