# Project Knowledge Semantic Contract

Inspect the actual vault before applying this contract. Extend established conventions rather than reorganizing the vault unilaterally.

## Core entities

- Project
- Evidence Artifact
- Claim or Fact
- Person/Stakeholder
- Organization/Division/Team
- Decision
- Commitment
- Milestone/Deliverable
- Risk/Issue/Dependency
- Benefit/Metric
- Report Definition/Run
- Crawl Run/Watermark

Use stable IDs for durable entities and maintain aliases for names, acronyms, renamed initiatives, products, teams, and systems. Every promoted claim should link to evidence. Every decision and commitment should link to its source and affected project when applicable. Every benefit should include value stage and measurement definition.

## Minimum metadata principles

- human-readable title and stable identifier;
- created, updated, and source dates with time zones when relevant;
- status from a controlled vocabulary;
- owners as explicit links or `to confirm`;
- source/provenance and confidence;
- relationships to projects, people, decisions, commitments, benefits, and reports;
- supersedes/superseded-by links when meaning changes;
- sensitivity or distribution constraint where needed.

## Architecture rules

1. Keep raw/source artifacts distinct from curated interpretations.
2. Link rather than duplicate; preserve a canonical record for each durable entity.
3. Use Markdown and portable metadata; avoid structures only one application can read.
4. Preserve history and redirects/aliases during renames or migrations.
5. Make unknown values explicit rather than fabricating completeness.
6. Validate broken links, duplicate IDs, orphaned evidence, invalid statuses, missing provenance, and value-stage misuse.
