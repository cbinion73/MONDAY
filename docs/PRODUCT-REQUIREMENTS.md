# MONDAY Product Requirements Document

Status: Approved product foundation

Version: 0.1

Date: 2026-07-13

Product: MONDAY

Initial principal: Chris

## 1. Executive summary

MONDAY is a permissioned, Apple-native personal orchestration and life-intelligence
agent. It maintains one relationship with the user across Mac, iPhone, Apple Watch,
and CarPlay; understands objectives in context; coordinates specialized
applications; reconciles evidence; governs authority through explicit settings; and
carries work through to verified outcomes.

MONDAY is a new product. JARVIS and legacy MONDAY are reference material only. No
legacy implementation, architecture, or dependency is inherited without explicit
evaluation.

## 2. Problem

Digital life is fragmented across applications, devices, accounts, and services.
Each application understands only its own domain. The user must remember context,
compare conflicting sources, move information between apps, decide which tool to
use, supervise actions, and track unfinished work.

Existing assistants can answer isolated questions or invoke limited functions, but
they generally do not provide durable cross-device continuity, evidence
reconciliation, configurable awareness, bounded authority, verified execution, and
one trusted relationship across specialized applications.

MONDAY makes the applications work together while preserving their domain ownership.

## 3. Goals

MONDAY will:

1. Maintain one coherent identity and continuity across its MVP platforms.
2. Understand user objectives using authorized personal and situational context.
3. Discover and orchestrate appropriate Apple capabilities and specialist apps.
4. Compare multiple sources and expose disagreement and uncertainty.
5. Safely control applications through the most reliable supported mechanism.
6. Separate observation, retention, inference, synchronization, and action authority.
7. Carry objectives through to verified completion rather than stopping at an answer.
8. Remain useful in local-only or degraded operation.
9. Make all consequential actions and paid intelligence usage visible and auditable.
10. Evaluate Apple technology before adding external technology.

## 4. Non-goals

The initial product will not:

- Rebuild every specialist application inside MONDAY.
- Duplicate authoritative health, calendar, weather, navigation, or document stores.
- Promise unrestricted control of every iPhone, Mac, Watch, or CarPlay application.
- Continuously record or retain everything visible on a screen.
- Perform autonomous financial, legal, medical, public, destructive, or irreversible
  actions without narrowly defined authority.
- Depend on undisclosed paid models or background token usage.
- Depend on unreleased or unavailable Apple technology for core operation.
- Import JARVIS or legacy MONDAY code by default.
- Launch a third-party capability marketplace in the MVP.

## 5. Target user

The first product is designed for one principal, Chris. This permits deep personal
use and rigorous trust boundaries before generic or multi-user behavior is attempted.

Future users may include individuals with complex personal and professional lives,
families, caregivers, creators, executives, and people with accessibility needs.
Multi-user support must preserve explicit identity, consent, ownership, and delegated
authority.

## 6. Product principles

### 6.1 One relationship, many specialists

The user speaks with MONDAY. Specialists and applications normally remain behind the
experience. MONDAY may expose its sources when doing so helps the user judge an answer.

### 6.2 Permissioned awareness

MONDAY is aware only through explicit user authorization. Access to observe does not
grant authority to retain, synchronize, infer, share, or act.

### 6.3 Truth before fluency

MONDAY distinguishes observation, source claims, memory, inference, recommendation,
attempted action, and verified outcome.

### 6.4 Apple technology first

Apple capabilities are evaluated before MONDAY introduces external technology. A
non-Apple dependency requires a documented capability gap and must remain replaceable.

### 6.5 Applications first, screen automation last

MONDAY prefers supported intents, APIs, frameworks, and shortcuts over accessibility
or visual interface automation.

### 6.6 Preview, permission, execution, verification

Consequential actions are previewed, authorized, executed, and verified as distinct
stages.

### 6.7 Graceful degradation

MONDAY remains useful when the internet, an Apple intelligence capability, a model,
a connector, an app, or a secondary device is unavailable.

## 7. Representative journeys

### 7.1 Multi-source weather decision

Chris asks whether afternoon weather is likely to require canceling golf. MONDAY
establishes the relevant place and time, consults approved Apple weather capabilities
and other sources only if a documented gap requires them, normalizes the forecasts,
detects shared underlying providers, identifies agreement and disagreement, and
returns a decision-oriented recommendation with confidence. It can offer to notify
participants or modify the calendar, but must obtain the applicable approval and
verify the result.

### 7.2 Cross-device continuity

Chris begins trip planning on the Mac, later asks the iPhone what was decided about
Thursday, approves a change on Apple Watch, and receives a departure update through
CarPlay. Each surface uses the same active objective, decisions, and open loops while
presenting only what is appropriate for that device and context.

### 7.3 Health orchestration

Chris asks why he has felt more tired. MONDAY consults an approved Health specialist
that owns HealthKit access and health-domain logic. MONDAY distinguishes observation
from diagnosis, explains evidence and limitations, helps prepare next steps, and does
not share or cloud-process health data outside its policy.

### 7.4 Cross-application execution

Chris asks MONDAY to find a document, summarize its decision, add its deadline to the
calendar, and create a reminder. MONDAY finds the correct source, preserves provenance,
checks the proposed changes, obtains required approval, acts through supported Apple
interfaces, and verifies the saved records.

### 7.5 Proactive driving assistance

Before a scheduled appointment, MONDAY identifies travel time, weather risk, charging
needs, a calendar conflict, and an unanswered related message. CarPlay provides one
concise, safe intervention and offers bounded actions. Complex review is deferred to
the iPhone or Mac when driving context makes it unsafe.

## 8. Functional requirements

### 8.1 Identity and continuity

- **FR-001:** MONDAY shall maintain one coherent user identity across authorized devices.
- **FR-002:** MONDAY shall synchronize active conversations, decisions, commitments, and open loops across devices.
- **FR-003:** MONDAY shall allow work to begin on one platform and continue on another.
- **FR-004:** MONDAY shall distinguish short-lived conversational context from durable memory.
- **FR-005:** The user shall be able to inspect, correct, delete, or prevent retention of remembered information.
- **FR-006:** Important remembered facts shall preserve source and confidence.
- **FR-007:** MONDAY shall support separate contexts for personal, household, health, financial, and professional information.

### 8.2 Natural interaction

- **FR-008:** MONDAY shall support conversational text and voice interaction.
- **FR-009:** Voice shall be available but shall not be required.
- **FR-010:** MONDAY shall resolve references to prior conversations, people, projects, places, and commitments when authorized context supports the interpretation.
- **FR-011:** MONDAY shall clarify materially consequential ambiguity.
- **FR-012:** MONDAY shall provide concise answers first and expose supporting detail when useful.
- **FR-013:** Responses shall distinguish facts, claims, inferences, recommendations, and uncertainty.
- **FR-014:** MONDAY shall report truthful progress during long-running work.
- **FR-015:** MONDAY shall state actual failures and limitations instead of presenting empty fallback language.

### 8.3 Awareness

- **FR-016:** MONDAY shall maintain an authorized context model spanning devices, apps, people, places, time, activities, and commitments.
- **FR-017:** Each awareness source shall have separate policy for observation, retention, synchronization, inference, proactive use, and action.
- **FR-018:** MONDAY shall indicate when awareness is active and identify sources that materially influenced a response.
- **FR-019:** MONDAY shall support permitted foreground context such as the active app, selected item, or visible document.
- **FR-020:** MONDAY shall support screen understanding where the platform and user permissions allow it.
- **FR-021:** Screen-derived content shall be treated as untrusted input and protected against instruction injection.
- **FR-022:** MONDAY shall not continuously retain screenshots or screen contents by default.
- **FR-023:** The user shall be able to pause awareness globally or by device or domain.

### 8.4 Capability and specialist registry

- **FR-024:** MONDAY shall maintain a registry of available applications, specialists, connectors, and device capabilities.
- **FR-025:** Each capability shall declare supported actions, permissions, data categories, risk, availability, and verification method.
- **FR-026:** MONDAY shall select the appropriate capability or combination of capabilities for an objective.
- **FR-027:** MONDAY shall detect unavailable, expired, unhealthy, or incompatible capabilities.
- **FR-028:** MONDAY shall prevent conflicting concurrent mutation unless a workflow explicitly supports it.
- **FR-029:** Specialists shall return structured attempted, completed, failed, and unverified results.
- **FR-030:** Specialists shall be replaceable without redesigning MONDAY's core identity or conversation.

### 8.5 Application control

- **FR-031:** MONDAY shall prefer supported intents and APIs over interface automation.
- **FR-032:** MONDAY shall support approved operating-system automation and shortcuts.
- **FR-033:** On Mac, MONDAY shall support permissioned accessibility-based control when no stronger interface exists.
- **FR-034:** Visual interface interpretation shall be used only when more reliable mechanisms are unavailable.
- **FR-035:** MONDAY shall validate application and interface state before acting.
- **FR-036:** MONDAY shall verify resulting application state after acting.
- **FR-037:** MONDAY shall stop and request help when state is materially ambiguous.
- **FR-038:** MONDAY shall not enter credentials, reveal secrets, bypass security controls, or approve authentication prompts without explicit authority.
- **FR-039:** MONDAY shall provide a visible history of application actions.

### 8.6 Multi-source intelligence

- **FR-040:** MONDAY shall consult multiple approved sources when a question warrants corroboration.
- **FR-041:** MONDAY shall normalize source outputs into comparable claims.
- **FR-042:** MONDAY shall identify agreement, disagreement, missing information, freshness, and source limitations.
- **FR-043:** Reconciled recommendations shall include an appropriate confidence assessment.
- **FR-044:** MONDAY shall preserve enough provenance for the user to understand the conclusion.
- **FR-045:** MONDAY shall support domain-specific source weighting.
- **FR-046:** Verified outcomes may inform source reliability without silently changing user policy.
- **FR-047:** MONDAY shall detect false consensus caused by shared underlying providers where feasible.

### 8.7 Settings and policy

- **FR-048:** MONDAY shall provide unified settings for every device, app, domain, capability, and model.
- **FR-049:** Settings shall independently govern access, observation, retention, synchronization, inference, proactive use, suggestion, drafting, action, approval, cloud use, spending, and audit.
- **FR-050:** MONDAY shall provide understandable policy defaults.
- **FR-051:** The user shall be able to authorize temporary exceptions without silently changing permanent policy.
- **FR-052:** Policy conflicts shall resolve toward the more restrictive applicable rule.
- **FR-053:** MONDAY shall explain which policy prevented an action.
- **FR-054:** Settings changes shall be auditable and reversible.
- **FR-055:** MONDAY shall provide global local-only, do-not-act, do-not-listen, and stop-background-intelligence controls.

### 8.8 Action authority

- **FR-056:** Every action shall have a consequence level.
- **FR-057:** Low-risk reversible actions may be pre-authorized by policy.
- **FR-058:** Financial, legal, medical, security-sensitive, public, destructive, or irreversible actions shall require explicit approval unless governed by a narrow explicit policy.
- **FR-059:** Approval shall describe the action, target, material consequences, and reversibility.
- **FR-060:** Approval for one action shall not imply approval for related actions.
- **FR-061:** MONDAY shall support draft-only operation.
- **FR-062:** MONDAY shall support undo or compensating actions where the underlying application permits them.
- **FR-063:** Retrieved content shall never grant MONDAY additional authority.

### 8.9 Proactive assistance

- **FR-064:** MONDAY shall identify important conflicts, risks, deadlines, and open loops from authorized context.
- **FR-065:** Proactive intervention shall be governed by importance, urgency, domain, time, and interruption policy.
- **FR-066:** Related observations should be combined into one useful intervention.
- **FR-067:** MONDAY shall respect quiet periods, focus modes, location rules, and device-specific notification policy.
- **FR-068:** MONDAY shall explain why it chose to interrupt.
- **FR-069:** The user shall be able to rate an intervention as useful, unnecessary, mistimed, or inappropriate.
- **FR-070:** Feedback may improve timing but shall not expand authority.

### 8.10 Cross-device synchronization

- **FR-071:** MONDAY shall synchronize canonical decisions, open loops, approved memories, policies, and action state.
- **FR-072:** MONDAY shall not require every raw source record to be copied into a central store.
- **FR-073:** Domain applications may remain authoritative for their records.
- **FR-074:** Synchronized information shall preserve source, version, time, and device provenance.
- **FR-075:** Synchronization conflicts shall be surfaced rather than silently overwritten.
- **FR-076:** Sensitive domains shall support device-local storage and selective synchronization.
- **FR-077:** MONDAY shall operate with reduced capability while devices are offline.
- **FR-078:** Offline actions shall reconcile when connectivity returns without duplicating consequential work.

### 8.11 Apple ecosystem experience

- **FR-079:** MONDAY shall provide native experiences for Mac, iPhone, Apple Watch, and CarPlay.
- **FR-080:** MONDAY shall expose appropriate actions through Apple-supported intent and automation surfaces.
- **FR-081:** MONDAY shall respect platform permissions, entitlements, and sandbox boundaries.
- **FR-082:** Apple Watch shall focus on immediate context, approvals, brief responses, alerts, and handoff.
- **FR-083:** Mac shall support deep work, multi-app orchestration, visible workspace context, and approved accessibility control.
- **FR-084:** iPhone shall provide mobile conversation, personal-data access, sensors, notifications, and mobile action control.
- **FR-085:** Core MONDAY behavior shall remain available when Apple-provided generative intelligence is unavailable.
- **FR-086:** Apple intelligence may be a local capability but shall not become MONDAY's identity, memory authority, or sole reasoning engine.

### 8.12 Intelligence and model governance

- **FR-087:** MONDAY shall route work among Apple capabilities, local models, approved cloud models, deterministic logic, and specialists.
- **FR-088:** Routing shall consider privacy, quality, latency, availability, energy use, and cost.
- **FR-089:** The user shall be able to prohibit cloud intelligence globally or by domain.
- **FR-090:** MONDAY shall not generate hidden token spend.
- **FR-091:** Background model use shall require enabled policy, defined purpose, and enforceable budget.
- **FR-092:** MONDAY shall provide understandable model usage and spending records.
- **FR-093:** Loss of quota or model access shall produce an explicit capability status.
- **FR-094:** High-consequence recommendations shall require stronger evidence and verification than ordinary conversation.

### 8.13 Audit, recovery, and control

- **FR-095:** MONDAY shall audit consequential observations, decisions, approvals, actions, and outcomes.
- **FR-096:** Audit records shall identify initiator, device, source, capability, policy, and result.
- **FR-097:** The user shall be able to inspect why MONDAY acted or declined to act.
- **FR-098:** A global stop control shall cancel cancellable work and block new actions.
- **FR-099:** MONDAY shall recover unfinished work without repeating completed consequential actions.
- **FR-100:** Open loops shall have explicit blocked, awaiting-approval, scheduled, completed, or abandoned state.
- **FR-101:** Applications, devices, specialists, models, and accounts shall be safely revocable.

### 8.14 CarPlay

- **FR-102:** CarPlay shall be an MVP platform.
- **FR-103:** CarPlay shall prioritize voice, driving relevance, minimal visual complexity, and low distraction.
- **FR-104:** CarPlay shall support permitted navigation coordination, destination context, schedule awareness, arrival preparation, weather and hazard interpretation, communication drafting, reminders, and home actions.
- **FR-105:** MONDAY shall make driving responses shorter, more actionable, and less visually dependent.
- **FR-106:** Complex or attention-intensive interaction shall be deferred until the vehicle is stopped or another device is available.
- **FR-107:** Work begun through CarPlay shall remain available on iPhone, Mac, and Apple Watch.
- **FR-108:** MONDAY shall distinguish supported CarPlay capability from platform-restricted actions and shall not imply universal CarPlay control.

### 8.15 Apple technology governance

- **FR-109:** Every major capability shall receive an Apple-native feasibility evaluation before an external dependency is approved.
- **FR-110:** Evaluation shall document the Apple technology considered, evidence or prototype, result, and remaining gap.
- **FR-111:** External technology may be introduced only to address a documented material gap.
- **FR-112:** External components shall remain replaceable and shall not unnecessarily own MONDAY's identity, continuity, policies, or personal memory.
- **FR-113:** MONDAY shall reevaluate external dependencies when Apple later closes a relevant gap.
- **FR-114:** MONDAY shall degrade honestly when an Apple capability is unavailable because of hardware, OS version, region, entitlement, account, or permission.

## 9. Settings model

Settings are MONDAY's constitutional layer, not an administrative afterthought.

| Dimension | Meaning |
| --- | --- |
| Access | May MONDAY connect to the source? |
| Observe | May MONDAY read current information? |
| Retain | May MONDAY remember it after the task? |
| Sync | May it cross devices? |
| Infer | May MONDAY derive conclusions from it? |
| Proactive use | May it be used without a direct request? |
| Suggest | May MONDAY recommend an action? |
| Draft | May MONDAY prepare but not execute an action? |
| Act | May MONDAY execute? |
| Approval | When must MONDAY ask first? |
| Cloud | May the information leave the local trust boundary? |
| Spend | Which paid resources may be used? |
| Audit | Which history must be preserved? |

For example, Health information may be readable on iPhone, summarized to Mac,
prohibited from cloud processing, available for proactive fatigue detection, and
never shareable without explicit approval.

## 10. Canonical information types

MONDAY shall maintain stable meaning across applications through these concepts:

- **Observation:** Something directly reported or detected
- **Claim:** A statement made by a source
- **Fact:** A sufficiently verified claim accepted for current use
- **Entity:** A person, place, organization, device, account, project, or object
- **Event:** Something that happened or is scheduled
- **Commitment:** Something a person agreed to do
- **Open loop:** Work that remains unresolved
- **Preference:** How the user usually wants something handled
- **Policy:** What MONDAY is permitted to do
- **Recommendation:** An advised course of action
- **Intent:** What the user wants accomplished
- **Action:** A proposed or executed change
- **Outcome:** The verified result of an action
- **Memory:** Information intentionally preserved for continuity

## 11. MVP scope

### 11.1 Platforms

- Mac
- iPhone
- Apple Watch
- CarPlay

### 11.2 Required proof

The MVP shall demonstrate:

1. One MONDAY identity across all four platforms.
2. Text and voice conversation.
3. Cross-device conversation and open-loop continuity.
4. Unified settings, approvals, and global stop controls.
5. A capability registry for applications and specialists.
6. At least three structured Apple integrations.
7. One permissioned Mac application-control workflow.
8. One multi-source adjudication workflow.
9. Action preview, approval, execution, and outcome verification.
10. Visible action and model-usage history.
11. One useful CarPlay workflow that uses driving context.
12. Apple-native feasibility evidence before any non-Apple dependency.
13. Useful local-only operation.
14. No undisclosed background model activity.

### 11.3 Candidate proof workflows

- Multi-source weather recommendation
- Calendar and reminder coordination
- Chronicle continuity capture
- Cross-device resumption
- A bounded Mac workflow that reads from one app and acts through another
- A proactive daily briefing
- A CarPlay departure, navigation, weather, and arrival-preparation workflow

### 11.4 MVP exclusions

- Universal support for every application
- Unrestricted autonomous control
- Autonomous purchases or money movement
- Medical diagnosis
- Production-grade family support
- Continuous screen recording
- Full email-client replacement
- Complete migration of prior product code
- Dependence on unavailable Apple capability
- A third-party developer marketplace

## 12. Success metrics

### Utility

- At least 70% of supported multi-app tasks reach a verified outcome without manual rerouting.
- At least 80% of cross-device resumptions recover the correct active context.
- At least 80% of proactive interventions are rated useful or neutral during initial use.
- Supported workflows reduce manual application transitions by at least 50%.

### Quality

- No claimed completion without outcome evidence in tested consequential workflows.
- Material source disagreement is surfaced in at least 95% of evaluation cases.
- High-consequence recommendations identify uncertainty and provenance.
- Context retrieval selects the correct conversation, project, or commitment in at least 90% of a curated evaluation set.

### Performance

- Text or voice requests normally receive acknowledgement within two seconds.
- Simple local interactions normally provide a useful response within five seconds.
- Longer work provides truthful progress instead of silent waiting.
- Online devices normally synchronize relevant state within several seconds.

### Trust

- Zero unauthorized consequential actions.
- Zero undisclosed paid model usage.
- Every consequential action is attributable to a request or approved policy.
- Every integration is independently revocable.
- Sensitive information remains within its configured boundary.

### Counter-metrics

MONDAY shall not improve completion metrics by interrupting excessively,
over-collecting information, asking for blanket permissions, defaulting to cloud
processing, lowering approval thresholds, hiding uncertainty, treating attempts as
completions, or requiring the user to manually manage orchestration.

## 13. Non-functional requirements

### Privacy and security

- Prefer local processing for sensitive and routine work when Apple capability is sufficient.
- Encrypt sensitive information in transit and at rest.
- Minimize data collection and apply per-domain retention.
- Keep secrets out of logs, prompts, and diagnostics.
- Use least-privilege integration access and platform credential storage.
- Defend against prompt injection from messages, documents, websites, and screens.
- Never permit retrieved content to escalate authority.

### Reliability

- Make consequential actions idempotent where possible.
- Recover from app crashes, network loss, model failure, and device handoff.
- Prevent retries from repeating sends, purchases, posts, or deletions.
- Expose connector and capability health.

### Performance and energy

- Stream progress for long-running work.
- Use local execution for latency-sensitive interaction when sufficient.
- Make background work battery-aware.
- Retrieve relevant context without loading the user's entire history.

### Accessibility

- Provide text alternatives to voice.
- Support system accessibility features.
- Allow speech, interruption, verbosity, and notification adjustment.
- Provide safe alternatives when speech or vision interaction is unavailable.

### Maintainability

- Use versioned specialist contracts.
- Separate orchestration, policy, execution, and presentation.
- Avoid dependence on one model provider.
- Test workflows without live personal data or real consequential actions.

## 14. Major risks

### Platform limits

Apple platforms do not permit arbitrary inspection and control of every app. MONDAY
must use supported integrations and describe limitations truthfully.

### CarPlay constraints and safety

CarPlay functionality depends on Apple-supported categories, entitlements, interface
rules, and driving-safety constraints. The MVP requirement is a useful, compliant
MONDAY driving surface, not unrestricted in-vehicle control.

### Screen-control fragility

Interfaces change and screen content can be malicious. Screen control requires narrow
scope, state checks, confidence thresholds, injection resistance, and immediate stop.

### Excessive awareness

Broad awareness can become invasive. Visible status, purpose limits, granular policy,
and retention controls are core product features.

### False confidence

Multiple sources may share underlying data, and polished synthesis can conceal
uncertainty. MONDAY must preserve provenance and distinguish corroboration from
duplication.

### Cross-device conflict

Offline or simultaneous activity can cause stale state and repeated actions. MONDAY
requires conflict detection and one canonical action lifecycle.

### Model availability and spending

Cloud intelligence can become unavailable or expensive. MONDAY must enforce policy
and budgets and preserve useful local operation.

### Scope expansion

Universal awareness and app control are long-term directions. Growth must occur
through proven integrations and stable contracts.

## 15. Release gates

MONDAY is not ready for personal daily use until:

- Every active integration can be inspected and revoked.
- Background intelligence can be stopped globally.
- Paid model usage is visible and capped.
- Consequential actions apply the correct approval policy.
- Application actions are verified after execution.
- Cross-device recovery does not duplicate consequential actions.
- Screen content is treated as untrusted.
- Sensitive data follows its configured boundary.
- Unavailable capabilities are reported accurately.
- Audit history explains actions without exposing secrets.
- Integration failure cannot corrupt core continuity.
- Local-only mode remains useful.
- CarPlay behavior is compliant, safe, and appropriately constrained.
- Non-Apple technology has documented gap evidence and approval.

## 16. Roadmap

### Phase 0: Apple capability and constitutional foundation

- Inventory applicable Apple technologies and entitlement boundaries.
- Prototype uncertain capabilities before selecting replacements.
- Define trust, settings, awareness, action-risk, specialist, continuity, audit, and model-use contracts.
- Create a capability-gap record for any proposed external technology.

### Phase 1: Personal orchestration core

- Native Mac and iPhone presence
- Apple Watch companion
- CarPlay presence
- One identity and conversation
- Cross-device continuity
- Capability registry
- Settings, approvals, open loops, and action history
- Useful local-only mode

### Phase 2: Orchestration proof

- Multi-source weather decision
- Calendar and reminder coordination
- Chronicle continuity
- Reliable Mac cross-app workflow
- Daily briefing
- CarPlay driving workflow

### Phase 3: Life-domain specialists

- Health
- Navigation and travel
- Communications
- Documents and knowledge
- Forge and project work
- Home and household
- Finance with strict observation/action separation

### Phase 4: Proactive life operations

- Context-sensitive interventions
- Conflict detection and event preparation
- Outcome learning and source reliability
- Bounded routine action delegation

### Phase 5: Extensible ecosystem

- Third-party specialist contracts
- Capability certification
- Multi-user and household delegation
- Portable policy profiles
- Secure external developer tooling

## 17. Binding decisions

- MONDAY is a new product and clean restart.
- Chris is the initial principal.
- Mac, iPhone, Apple Watch, and CarPlay are MVP platforms.
- MONDAY owns orchestration, identity, continuity, policy, and verified follow-through.
- Specialist apps own domain execution and domain records.
- Voice is important but not the only interface.
- Awareness and authority are independently governed through settings.
- Apple technology is evaluated before external technology.
- A documented capability gap is required before adding non-Apple technology.
- No hidden paid model or background autonomous activity is authorized by default.

## 18. Open decisions before architecture

1. Whether the first release preserves household identity boundaries from day one.
2. Which specialist applications form the first complete proof.
3. Whether Chronicle owns canonical durable memory or remains one governed source.
4. Which information may synchronize through Apple cloud services and which remains device-local.
5. Which device coordinates canonical state when multiple devices are available.
6. Default approval levels for messages, calendars, files, and application control.
7. Required support across hardware generations and operating-system versions.
8. MONDAY's personality, voice, interruption style, and visual presence.
9. Whether an optional coordinator is needed when personal devices are offline.
10. The first end-to-end workflow selected for implementation.

## 19. Final product definition

MONDAY is a permissioned, Apple-native personal orchestration and life-intelligence
agent that maintains continuity across devices, coordinates specialized applications,
reconciles evidence, and safely carries the user's intentions through to verified
outcomes.
