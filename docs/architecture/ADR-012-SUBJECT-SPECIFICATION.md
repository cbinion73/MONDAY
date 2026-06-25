# ADR-012 Subject Specification

Status: Approved  
Authority: Architecture Office  
Scope: Monday 1.0+ canonical object model  
Implementation Status: Architecture only. No implementation code is implied by this document.

## 1. Purpose

`Subject` is Monday's canonical object.

It exists because Monday is not fundamentally a chat system, a task manager, or a mission tracker. Monday is a stewardship system for the meaningful things in Chris's life. Those meaningful things are the stable centers Monday must remember, reason about, monitor, and present over time.

Examples:

- Chris
- Retirement
- Faith
- Health
- Caleb
- Rebekah
- Publishing
- Thermo Fisher
- Summer Camp
- Book
- Workshop

A Subject is the durable home for significance. Everything else in Monday attaches to it:

- threads
- working theories
- missions
- deliverables
- decisions
- contradictions
- opportunities
- commitments
- skills
- worker jobs
- memory
- documents

The runtime may still think in turns, threads, and execution arcs. The product, memory, and stewardship model revolve around Subject.

## 2. Philosophy

### Why Subject is the center of Monday

Monday's job is to preserve significance across time.

Significance does not primarily live inside:

- a message
- a turn
- a session
- a mission document
- a workspace

It lives in meaningful things.

Those meaningful things are Subjects.

### Why this matters

If Monday centers the wrong object, the product will fragment.

If Monday centers Subject:

- memory has a durable home
- theories accumulate around something real
- presenter logic becomes object-first
- workers know what they are stewarding
- users see the same thing Monday sees

### How Subject supports the Presenter Model

The presenter should answer from the state of a Subject, not from disconnected turn-level fragments.  
Example:

- Not: "In this thread, you mentioned retirement."
- But: "Retirement has shifted from a financial question toward an identity question."

That statement belongs to the Subject `Retirement`.

### How Subject supports OOUX

Subject is the primary noun of the product.

Users naturally think:

- open Caleb
- check Retirement
- review Summer Camp
- see what's happening with Publishing

That is clean OOUX. Subject is the primary object. Everything else becomes a view, attachment, or action concerning that object.

### How Subject supports the Background Workforce

Workers should not merely monitor generic queues. They should steward Subjects.

Examples:

- Monitor `Health` for quiet drift and contradictory evidence.
- Re-synthesize `Retirement` after new decisions and work signals arrive.
- Preserve new durable correspondence into `Summer Camp`.

Subject gives the invisible workforce a durable target.

### How Subject supports the Working Theory Engine

A working theory should belong to the thing being understood.

Examples:

- Subject: `Work`
- Theory: "Work is currently providing identity, obligation, and avoidance."

- Subject: `Faith`
- Theory: "The issue may not be prayer itself. It may be avoidance of silence."

Threads may have local hypotheses. Subject holds the durable theory of record.

### How Subject supports Memory

Memory requires durable gravity.

Without a canonical object, facts drift into disconnected stores. With Subject:

- memories can be linked
- contradictions can accumulate
- decisions remain attached
- related artifacts stay discoverable

### How Subject supports Stewardship

Stewardship is the care of something meaningful over time.

Subject is the "something."

## 3. Canonical Schema

## 3.1 Subject Core Schema

```json
{
  "id": "subject_retirement",
  "type": "life_transition",
  "name": "Retirement",
  "canonicalName": "Retirement",
  "domain": "Retirement",
  "status": "active",
  "significanceLevel": "high",
  "stewardshipState": "active",
  "summary": "Chris's evolving relationship to retirement, identity, freedom, and work.",
  "currentTheoryId": "theory_retirement_current",
  "primaryThreadId": "thread_retirement_identity_shift",
  "parentSubjectId": null,
  "relatedSubjectIds": ["subject_work", "subject_chris"],
  "tags": ["retirement", "identity", "freedom"],
  "ownerScope": "personal",
  "sourceOfTruth": "subject",
  "createdAt": "2026-06-24T12:00:00.000Z",
  "updatedAt": "2026-06-24T12:00:00.000Z",
  "lastActiveAt": "2026-06-24T12:00:00.000Z",
  "lastSurfacedAt": null,
  "metadata": {}
}
```

## 3.2 Required Fields

- `id`
  - Stable unique identifier.
- `type`
  - Subject classification.
- `name`
  - Human-facing display name.
- `canonicalName`
  - Stable canonical form used for normalization and matching.
- `domain`
  - Primary Monday domain association, if any.
- `status`
  - Lifecycle state.
- `significanceLevel`
  - Relative importance of the Subject in Chris's life.
- `stewardshipState`
  - Monday's current mode of care toward the Subject.
- `summary`
  - Short durable description.
- `createdAt`
- `updatedAt`

## 3.3 Optional but Expected Fields

- `currentTheoryId`
- `primaryThreadId`
- `parentSubjectId`
- `relatedSubjectIds`
- `tags`
- `ownerScope`
- `lastActiveAt`
- `lastSurfacedAt`
- `metadata`

## 3.4 Enumerations

### `significanceLevel`

- `low`
- `medium`
- `high`
- `critical`

### `stewardshipState`

- `emerging`
- `active`
- `quiet`
- `watched`
- `resolved`
- `archived`

### `ownerScope`

- `personal`
- `family`
- `work`
- `shared`
- `system`

## 3.5 Canonical Relationships

A Subject may own:

- many Threads
- many Theory Revisions
- many Deliverables
- many Decisions
- many Contradictions
- many Opportunities
- many Commitments
- many Skill Runs
- many Worker Jobs
- many Memory Links
- many Documents

A Subject may relate to:

- one Parent Subject
- many Child Subjects
- many Related Subjects
- many Cross-linked Subjects

## 4. Subject Types

Supported Subject types should be broad enough to model life without becoming vague.

### 4.1 Person

Represents an individual human being.

Examples:

- Chris
- Caleb
- Rebekah

### 4.2 Relationship

Represents the relationship between people rather than a person alone.

Examples:

- Chris ↔ Caleb
- Chris ↔ Rebekah
- Binion Family

### 4.3 Domain

Represents one of Monday's major life domains.

Examples:

- Health
- Faith
- Work
- Publishing
- Family
- Retirement

### 4.4 Mission

Represents a formal initiative with strategic and/or executional structure.

Examples:

- Summer Camp
- Build Monday 1.0

### 4.5 Project

Represents bounded creative or operational work.

Examples:

- Book
- Workshop Renovation
- Travel Itinerary

### 4.6 Life Transition

Represents a long-horizon change in identity, structure, or season.

Examples:

- Retirement
- Career Change

### 4.7 Organization

Represents a company, institution, or ongoing organizational context.

Examples:

- Thermo Fisher
- Church

### 4.8 Place

Represents a meaningful location.

Examples:

- Workshop
- Home
- Philadelphia

### 4.9 Artifact

Represents a created thing that matters in its own right.

Examples:

- Book Manuscript
- Strategic Plan
- Itinerary

### 4.10 Concern

Represents a persistent issue or emerging problem.

Examples:

- Weight Gain
- Prayer Drift
- Burnout Risk

### 4.11 Decision

Represents a decision important enough to persist as a meaningful object.

Examples:

- Delay retirement
- Rent the trailer

Note: most decisions attach to a Subject. Only major, independent decisions should become Subjects themselves.

### 4.12 Commitment

Represents a durable promise, vow, or intention.

Examples:

- Rebuild prayer rhythm
- Be more present with Caleb

### 4.13 Optional Future Types

- Event
- Opportunity
- Contradiction
- Habit
- Resource

These may remain attachments rather than top-level Subject types unless product needs prove otherwise.

## 5. Subject Lifecycle

Subject lifecycle is a stewardship lifecycle, not a task lifecycle.

### 5.1 States

#### Emerging

The Subject has been detected but is not yet fully understood.

Examples:

- retirement is surfacing repeatedly
- a new book idea is returning

#### Active

The Subject is presently significant, discussed, worked on, or changing.

#### Quiet

The Subject still matters, but recent observable activity has decreased.

Quiet is not failure.

#### Watched

The Subject is not active in conversation, but Monday intentionally continues monitoring it.

#### Resolved

The current significant arc has reached closure.

This does not necessarily mean the Subject disappears forever.

#### Archived

The Subject is no longer under active stewardship and is preserved mainly for memory and historical continuity.

### 5.2 Transition Rules

#### Emerging -> Active

When:

- significance is confirmed
- a thread deepens
- meaningful activity begins
- theory confidence crosses the threshold for stewardship

#### Active -> Quiet

When:

- activity decreases
- urgency falls
- no immediate work remains
- significance still remains

#### Quiet -> Watched

When:

- Monday determines continued background awareness is warranted
- the Subject remains important enough to preserve

#### Watched -> Active

When:

- new evidence appears
- user re-engages
- workers detect drift, contradiction, risk, or opportunity

#### Active or Watched -> Resolved

When:

- the current arc is meaningfully concluded
- the theory stabilizes
- there is no active contradiction or expected next action

#### Resolved -> Archived

When:

- there has been sustained inactivity
- the Subject is still worth preserving historically
- active stewardship is no longer needed

### 5.3 Prohibited Transition Logic

Do not force Subjects to:

- become missions
- become active merely because they exist
- become archived just because they are quiet

## 6. Relationship Model

## 6.1 Parent Subjects

Parent Subjects represent containing meaning structures.

Examples:

- `Publishing` -> parent of `Book`
- `Family` -> parent of `Caleb`, `Rebekah`, `Summer Camp`
- `Work` -> parent of `Thermo Fisher`

Rule:
Use Parent Subject when one Subject is structurally contained by another.

## 6.2 Child Subjects

Child Subjects inherit context, not control.

Examples:

- `Retirement` may have child Subjects:
  - `Financial Readiness`
  - `Identity After Work`
  - `Building After Retirement`

## 6.3 Related Subjects

Related Subjects are meaningfully associated but not hierarchically contained.

Examples:

- `Retirement` related to `Work`
- `Faith` related to `Silence`
- `Summer Camp` related to `Caleb`

## 6.4 Cross-linked Subjects

Cross-linked Subjects indicate recurring interplay that should be surfaced to intelligence and the presenter.

Examples:

- `Work` <-> `Family`
- `Retirement` <-> `Publishing`
- `Health` <-> `Energy`

## 6.5 Relationship Rules

- Parent/child should be used sparingly and structurally.
- Related should be used for ordinary association.
- Cross-linked should be used where repeated interaction matters to reasoning.

## 7. Attachment Specifications

Each attachment belongs to exactly one primary Subject, though it may reference others.

## 7.1 Threads

Purpose: bounded conversational or operational arcs concerning a Subject.

Ownership:

- A Thread has one primary Subject.
- A Thread may reference secondary Subjects.

Rule:
Thread is an operational child object of Subject.

## 7.2 Working Theories

Purpose: explain what Monday currently believes is happening with the Subject.

Ownership:

- Every significant Subject should have one current theory of record.
- Theory revisions remain attached to the same Subject.

Rule:
The durable theory belongs to the Subject, not the session.

## 7.3 Deliverables

Purpose: structured outputs produced for or about a Subject.

Examples:

- itinerary
- brief
- recommendation
- review note

Ownership:

- Every Deliverable attaches to one primary Subject.
- It may cite a generating Thread and one or more Worker Jobs.

## 7.4 Opportunities

Purpose: emerging possibilities worth preserving.

Ownership:

- Opportunity attaches to the Subject it concerns.

Rule:
An Opportunity may later become its own Subject if it gains durable importance.

## 7.5 Contradictions

Purpose: preserve tensions between values, behavior, theory, or evidence.

Ownership:

- Contradiction attaches to the Subject most directly affected.

Examples:

- Subject: `Family`
- Contradiction: family matters most, work takes most attention

## 7.6 Commitments

Purpose: preserve durable intentions, promises, and explicit priorities.

Ownership:

- Commitment attaches to the Subject it concerns.

Examples:

- Subject: `Faith`
- Commitment: return to prayer consistently

## 7.7 Skills

Purpose: record evidence gathering or task execution around a Subject.

Ownership:

- Skill runs attach to the Subject they served.

Rule:
Skill history is part of Subject intelligence, not just turn history.

## 7.8 Worker Jobs

Purpose: background monitoring, synthesis, review, research, or execution.

Ownership:

- Each Worker Job should target one Subject, even if it synthesizes across related Subjects.

## 7.9 Memory

Purpose: preserve facts, recall, correspondence, entities, notes, and related history.

Ownership:

- Memory links attach to Subjects.
- A single memory item may reference multiple Subjects.

Rule:
Memory should resolve toward Subjects first, not only toward notes or turns.

## 7.10 Documents

Purpose: mission briefs, plans, notes, artifacts, vault docs, structured records.

Ownership:

- Documents attach to Subjects.
- Mission documents are a special case of Subject-linked documents.

## 7.11 Relationships

Purpose: represent enduring relational reality among Subjects.

Ownership:

- Relationship records should be first-class links between Subjects.

## 8. OOUX Mapping

Subject is Monday's primary object.

### Core OOUX implications

- Users open a Subject.
- Users inspect a Subject.
- Users see what's active around a Subject.
- Monday surfaces changes in a Subject.
- Monday creates artifacts for a Subject.

### Primary object views

- Subject overview
- Subject timeline
- Subject theory
- Subject threads
- Subject artifacts
- Subject decisions
- Subject contradictions
- Subject opportunities

### Core OOUX verbs

- open
- review
- compare
- link
- watch
- archive
- surface
- brief

## 9. Presenter Mapping

The presenter should read from Subject state first.

### Presenter order of operations

1. Identify active Subject.
2. Read Subject summary.
3. Read current theory.
4. Read active thread.
5. Read contradictions/opportunities/commitments if relevant.
6. Read recent deliverables and worker findings.
7. Construct Monday response.

### Presenter examples

#### Retirement

"Retirement is no longer behaving like a money question. It is behaving like an identity question with a freedom question underneath it."

#### Summer Camp

"Summer Camp is in good shape. Transportation is still the only meaningful weak spot."

The presenter should sound like it knows the Subject, not just the latest message.

## 10. Background Workforce Mapping

Workers operate on Subjects.

### Worker patterns

- monitor a Subject
- synthesize a Subject
- enrich a Subject
- preserve correspondence into a Subject
- surface a Subject when ripeness changes
- review deliverables for a Subject

### Example

- Worker: `monitor-operative`
- Subject: `Faith`
- Job: detect quiet drift and surface if significance is threatened

### Benefits

- workers gain stable long-lived targets
- background intelligence becomes accumulative
- surfacing becomes object-based rather than queue-only

## 11. Active Intelligence Mapping

Monday should reason from Subjects, not only from turns.

### Runtime reasoning order

1. Resolve probable Subject(s)
2. Select primary Subject
3. Read current Subject state
4. Attach relevant thread
5. revise or reinforce theory
6. gather skill evidence
7. determine presenter posture
8. respond from Subject state

### Theory revision

Every new message should be evaluated as:

- reinforces current Subject theory
- weakens current Subject theory
- introduces contradiction
- opens opportunity
- requires new thread
- requires new child Subject

## 12. API Implications

APIs should move from turn-centric and workspace-centric design toward Subject-centric design.

### Future shape

- `GET /subjects`
- `GET /subjects/:id`
- `GET /subjects/:id/threads`
- `GET /subjects/:id/theory`
- `GET /subjects/:id/deliverables`
- `GET /subjects/:id/contradictions`
- `GET /subjects/:id/opportunities`
- `GET /subjects/:id/commitments`
- `GET /subjects/:id/skills`
- `GET /subjects/:id/workers`
- `GET /subjects/:id/memory`

### Existing APIs likely to evolve

- workspace APIs become Subject views
- mission APIs become Subject-linked mission projections
- thread APIs become Subject child APIs

## 13. Database Implications

This document does not prescribe implementation, but the model implies the following durable storage concepts.

### Core tables

- `subjects`
- `subject_relationships`
- `subject_threads`
- `subject_theories`
- `subject_theory_revisions`
- `subject_deliverables`
- `subject_decisions`
- `subject_contradictions`
- `subject_opportunities`
- `subject_commitments`
- `subject_skill_runs`
- `subject_worker_jobs`
- `subject_memory_links`
- `subject_documents`

### Recommended indexes

- `subjects(type)`
- `subjects(domain)`
- `subjects(status)`
- `subjects(significance_level)`
- `subjects(last_active_at)`
- `subject_relationships(from_subject_id, to_subject_id, relationship_type)`
- `subject_threads(subject_id, status, updated_at)`
- `subject_theories(subject_id, updated_at)`

### Storage guidance

- Subject becomes the canonical foreign-key center.
- Threads, theories, deliverables, contradictions, and decisions should all point to Subject.
- Workspace and mission state should become projections over Subject rather than parallel sources of truth.

## 14. UI Implications

Subject changes the product from a collection of tools into an object-centered operating environment.

### Navigation

Primary navigation should prefer Subjects.

Examples:

- Chris
- Retirement
- Faith
- Caleb
- Publishing
- Work

### Presenter Stage

Presenter stage should display:

- active Subject
- current theory
- active thread
- most important tension or recommendation

### Object Tray

The object tray should be a Subject tray, not a workspace tray.

Possible tray categories:

- Active
- Quiet
- Watched
- Emerging

### Inspector

Inspector should read Subject state:

- Subject metadata
- theory
- recent threads
- contradictions
- opportunities
- skill history
- worker history
- memory links

## 15. Migration Strategy

High-level only.

### Migration principles

- Subject-first, not thread-first
- dual-write before cutover
- convert existing stores into Subject projections
- preserve current runtime until Subject stabilizes

### Expected phases

1. Introduce Subject as architecture and storage concept.
2. Map current Threads, Workspaces, Missions, Theories, and Deliverables to Subjects.
3. Make runtime resolve Subjects before Threads.
4. Convert presenter to Subject-first reads.
5. Convert workers and skills to Subject-targeted operations.
6. Deprecate overlapping stores only after projections are stable.

## 16. Example Subjects

## 16.1 Chris

### Subject

- type: `person`
- domain: `personal`
- status: `active`
- significanceLevel: `critical`

### Attachments

- Threads:
  - life direction
  - daily clarity
  - identity under work load
- Working Theory:
  - "Chris is trying to move from reactive complexity toward intentional stewardship."
- Deliverables:
  - daily brief
  - annual review
- Decisions:
  - high-cost model approvals
- Contradictions:
  - stated priorities vs attention allocation
- Opportunities:
  - emerging calling themes
- Commitments:
  - faith, family, health priorities
- Skills:
  - summarize, calendar-read, financial-read
- Workers:
  - morning digest
  - synthesis
  - monitor-operative
- Memory:
  - identity statements
  - long-term preferences
  - recurring themes

## 16.2 Retirement

### Subject

- type: `life_transition`
- domain: `Retirement`
- status: `active`

### Attachments

- Threads:
  - "I think I want to retire"
  - "It's not about money anymore"
  - "I still want to build things"
- Working Theory:
  - "Retirement is shifting from financial planning toward identity, freedom, and purpose."
- Deliverables:
  - retirement option brief
  - scenario analysis
- Decisions:
  - defer retirement
  - reduce responsibility first
- Contradictions:
  - wants freedom, still wants meaningful work
- Opportunities:
  - redesign next chapter
- Commitments:
  - explore what stays after work changes
- Skills:
  - financial-read
  - browser-search
  - summarize
- Workers:
  - synthesis-worker
- Memory:
  - past retirement remarks
  - relevant notes and decisions

## 16.3 Faith

### Subject

- type: `domain`
- domain: `Faith`
- status: `watched`

### Attachments

- Threads:
  - prayer drift
  - silence avoidance
- Working Theory:
  - "The issue may not be prayer itself. It may be avoidance of what silence surfaces."
- Contradictions:
  - says faith matters, silence is avoided
- Commitments:
  - return to stillness honestly
- Workers:
  - monitor-operative
- Memory:
  - faith notes
  - spiritual captures

## 16.4 Caleb

### Subject

- type: `person`
- domain: `Family`
- status: `active`

### Attachments

- Threads:
  - connection concern
  - summer camp coordination
- Working Theory:
  - "Caleb needs more intentional relational attention, not just logistical contact."
- Deliverables:
  - camp prep artifacts
- Contradictions:
  - family matters most, work absorbs attention
- Commitments:
  - invest directly in connection
- Memory:
  - prior moments
  - camp plans
  - family references

## 16.5 Publishing

### Subject

- type: `domain`
- domain: `Publishing`
- status: `active`

### Attachments

- Child Subjects:
  - Book
- Working Theory:
  - "Publishing remains significant but is vulnerable to shame and drift."
- Opportunities:
  - recurring creative themes
- Contradictions:
  - wants to write, avoids approaching the book
- Skills:
  - documents-read
  - summarize
- Memory:
  - book notes
  - vault recall

## 16.6 Summer Camp

### Subject

- type: `mission`
- domain: `Family`
- status: `active`

### Attachments

- Threads:
  - readiness assessment
  - trailer decision
  - itinerary planning
- Working Theory:
  - "Camp is in strong shape overall; transportation remains the only material risk."
- Deliverables:
  - itinerary
  - transport recommendation
- Decisions:
  - rent trailer
- Opportunities:
  - smooth family experience
- Commitments:
  - ensure readiness without chaos
- Skills:
  - calendar-read
  - email-read
  - travel-plan
- Workers:
  - travel specialist
- Memory:
  - ticket evidence
  - calendar constraints

## 16.7 Thermo Fisher

### Subject

- type: `organization`
- domain: `Work`
- status: `active`

### Attachments

- Threads:
  - work responsibility
  - avoidance and identity
- Working Theory:
  - "Thermo Fisher is not just work context; it is part of the current identity and responsibility structure."
- Contradictions:
  - wants freedom, work expands
- Opportunities:
  - redesign role boundaries
- Skills:
  - science-advisor
  - documents-read
- Memory:
  - work notes
  - organization references

## 16.8 Book

### Subject

- type: `project`
- domain: `Publishing`
- status: `quiet`

### Attachments

- Threads:
  - wounded significance
  - truthful re-approach
- Working Theory:
  - "The book still matters, but shame has made truthful re-approach expensive."
- Deliverables:
  - outline
  - draft plan
- Contradictions:
  - unfinished has become interpreted as failed
- Opportunities:
  - healing before execution
- Commitments:
  - re-approach honestly
- Memory:
  - prior book notes
  - relevant captures

## 16.9 Workshop

### Subject

- type: `place`
- domain: `Work`
- status: `watched`

### Attachments

- Threads:
  - workshop ideas
  - tool planning
- Working Theory:
  - "Workshop represents both practical utility and a place of creation."
- Opportunities:
  - future build environment
- Skills:
  - documents-read
  - browser-search
- Memory:
  - plans
  - references

---

This specification defines Subject as the canonical object for Monday. Future architectural work should treat any competing center of gravity as provisional unless explicitly approved by the Architecture Office.
