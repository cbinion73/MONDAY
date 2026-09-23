# MONDAY cross-domain operating contract

## Ownership

MONDAY Core owns intake, routing, source selection, evidence labeling, authority boundaries, challenge, quality gates, final synthesis, and Command Center handoff. It coordinates domain skills but never becomes the authoritative record.

| Domain | Authoritative record | Owning capability |
|---|---|---|
| Thermo projects and project evidence | `$MONDAY_PROJECT_KNOWLEDGE_VAULT`, default `/Users/chris.binion/Knowledge Vault/Project Knowledge` | `monday-thermo-project-intelligence`, with governed project changes through `monday-thermo-project-management` |
| Work decisions and commitments | Decision Ledger under Project Knowledge | `monday-thermo-decision-ledger` |
| Completed-meeting control and reconciliation | Meeting Continuity under Project Knowledge | `monday-thermo-meeting-continuity` |
| Private personal projects | `$MONDAY_PERSONAL_PROJECTS_VAULT`, default `/Users/chris.binion/Knowledge Vault/Personal Project Knowledge` | `monday-personal-projects` |
| MONDAY activity and system operations | `$MONDAY_KNOWLEDGE_ROOT`, default `/Users/chris.binion/Knowledge Vault/Monday Knowledge` | `monday-activity-ledger`, `monday-operations` |
| Captain's Log | Chris Knowledge `500 Personal Journal` | `monday-captains-log`, only from Chris-supplied or approved first-person content |
| Research Chronicle | Monday Knowledge `500 Research Journal` | `monday-research-chronicle`, with review before durable promotion |
| Visual projection | Versioned Command Center payload | `monday-planning-pipeline`, `monday-command-center`; projection only |

Connected systems are evidence sources, not durable memory. Conversation and model memory may help locate evidence but never replace the owning record for consequential facts.

## Intake contract

For substantive work establish:

- request and intended outcome;
- intent: information, exploration, judgment, decision, planning, execution, review, accountability, or conversation;
- time horizon and cutoff;
- domains and records in scope;
- current sources required and access authorized;
- sensitivity and minimum-necessary handling;
- requested durable writes;
- requested external effects;
- consequence and reversibility;
- completion evidence.

Do not ask for information that can be safely discovered. Ask when the missing choice changes the target, authority, privacy boundary, or external consequence.

## Routing contract

1. Start with `monday-core` when Monday is invoked or more than one family is involved.
2. Select the narrowest capabilities from `capability-registry.json`.
3. Add `monday-source-health` whenever the result depends on current coverage.
4. Add `monday-thermo-core` when professional work crosses Thermo specialist boundaries.
5. Add `monday-thermo-quality-assurance` before consequential Thermo work is final.
6. Add planning and Command Center capabilities only when an integrated plan or cockpit projection is needed.
7. Use Atlas, Nexus, and CRG Notebook Reviewer as independent products; MONDAY may coordinate them but never absorbs their records or methods.

## Cross-domain reconciliation

Cross-domain synthesis may compare professional commitments, personal projects, protected commitments, approved goals, capacity, and consequences. It must preserve domain separation in both evidence and durable writes.

- A cross-domain brief may contain minimum-necessary private signals for Chris.
- Professional reports must exclude personal-project status unless Chris explicitly authorizes that disclosure.
- Personal evidence cannot cure missing professional evidence.
- A source conflict remains visible until reconciled or explicitly carried as unresolved.
- Urgency does not silently outrank faith, family, health, or existing commitments; the synthesis names what is protected, deferred, delegated, renegotiated, or stopped.

## Completion states

Use exact states: drafted, validated, rendered, installed, packaged, shared, published, sent, delivered, displayed, and verified. They are not synonyms. Verification requires the readback or authoritative evidence appropriate to the action.
