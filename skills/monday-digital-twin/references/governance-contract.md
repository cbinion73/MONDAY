# Governed Digital Twin contract

The Twin helps Chris inspect what MONDAY believes, why it believes it, how current it is, and how to correct or forget it. It is a governed claim index. Project Knowledge remains authoritative for professional projects, Personal Project Knowledge for private projects, the Decision Ledger for work decisions and commitments, and journals for their separately governed narratives.

Professional and personal Twin records are physically and logically separate. Cross-domain analysis may compare minimum-necessary signals for Chris, but cannot copy personal records into professional storage, reporting, playbooks, JARVIS, or connected systems.

## Lifecycle

- `active -> superseded` requires an explicit correction and matching current-version guard.
- `active -> forgotten` requires exact record-ID confirmation. Forgetting removes the current record and Twin-held versions. A tombstone retains only record ID, domain, deletion time, reason, prior version numbers, and the governance-event ID. It contains no statement, source locator, or reversible content hash.
- `active -> expired` is a review outcome, not automatic deletion.

Every mutation writes an append-only governance event with actor, action, target, timestamp, reason, before and after version identifiers, and result. Hidden reasoning and raw source bodies are forbidden.

## Consent and opt-out

Professional capture requires `user-supplied`, `governed-record`, or `explicit` consent. Personal capture requires `user-supplied` or `explicit` consent. Every record declares `learningAllowed: true` and a bounded purpose.

Opt-outs can cover all learning, one domain, one source ID, or one record type. They block future capture and correction in that scope. They do not silently delete existing records. Retroactive removal requires exact forgetting for each target or a separately reviewed exact-target batch manifest.

## Evidence and correction

Source access is not truth. Every record has minimum-necessary source references, an evidence class, confidence, source date when known, and review date. Contradictions remain explicit. A Twin correction changes only the Twin. The owning authoritative record or source system must be corrected through its own capability and authorization.

## Redaction and playbooks

Shareable playbooks accept active professional records only. Restricted, personal, secret, opted-out, unresolved, or unreviewed content is blocked. The redactor removes email addresses, URLs, local paths, credentials, identifiers, and source locators, then scans the result again.

Workflow states are `drafted`, `approved`, `prepared`, `attempted`, and `verified`. A prepared local package is not sent. External publication requires Chris's current confirmation. Only destination-native readback with the same playbook ID, package digest, destination, and confirmation ID establishes `verified`.

## Command Center

Command Center receives a schema-versioned, privacy-reduced projection. It may show active record summaries, evidence classes, confidence, review status, governance receipts, opt-outs, contract-audit status, and playbook state. It cannot edit records or expose source locators, raw evidence, forgotten content, secrets, or personal statements unless the record explicitly allows local projection.
