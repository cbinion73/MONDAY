# MONDAY Product Vision

Status: Approved foundation

Date: 2026-07-13

Initial principal: Chris

## Vision

MONDAY is a trusted personal intelligence that lives across the Apple ecosystem and
coordinates the applications, devices, information, and services that make up a
person's life.

Today, applications operate as isolated islands. Health information is in one place.
Messages are somewhere else. Calendars, documents, weather, finances, navigation,
home systems, work projects, and personal history all have separate interfaces and
separate notions of context. The person is forced to serve as the integration layer.

MONDAY reverses that relationship.

The user tells MONDAY what they need. MONDAY determines:

- What the user is actually trying to accomplish
- What personal and situational context is relevant
- Which device or application has authoritative information
- Which specialist should analyze or execute the work
- Whether multiple sources should be consulted
- What conflicts or uncertainty exist
- What actions are permitted
- Whether approval is required
- How to carry the work through to completion
- What should be remembered for next time

MONDAY becomes the coherent intelligence above the application layer. It does not
replace every app. It makes the apps work together.

## Product promise

> MONDAY knows what matters, finds the right capabilities, gives you an honest
> answer, and follows through across your devices.

MONDAY should feel like:

- A trusted friend who understands the user and their context
- A chief of staff who remembers obligations and open loops
- An analyst who compares evidence instead of repeating one source
- An operator who can use applications and complete work
- A guardian who respects privacy, authority, and consequences
- A continuous presence that can resume on another device without losing the thread

MONDAY should not feel like:

- A chatbot waiting for isolated prompts
- A dashboard containing disconnected widgets
- A voice remote for launching apps
- A collection of agents the user must manually manage
- A system that claims actions or knowledge it does not possess
- An autonomous process that silently spends money or changes things
- A surveillance system collecting everything merely because it can

## Product thesis

Applications should remain specialized, but intelligence and continuity should be
unified.

MONDAY owns the relationship with the user. Specialist applications own their
domains. A Health application can own HealthKit access and health workflows.
Chronicle can own durable personal history. Forge can own structured creative or
project work. A navigation application can own maps, routes, and vehicle-specific
entitlements. Weather applications and services can own forecasts.

MONDAY sits above them and provides:

- One identity
- One conversation
- One continuity model
- One settings and permission system
- One capability registry
- One orchestration system
- One approval model
- One audit history
- One synchronized understanding of what is happening

## The fundamental loop

Every meaningful MONDAY interaction follows one loop:

1. Understand the request.
2. Recover relevant personal and situational context.
3. Decide which applications, devices, data, or specialists are needed.
4. Gather evidence.
5. Reconcile disagreement and uncertainty.
6. Form a recommendation or action plan.
7. Verify authority and request approval when required.
8. Execute through the appropriate application.
9. Confirm the real outcome.
10. Record the result and preserve continuity.

A successful interaction does not end when text is generated. It ends when the
user's objective is completed, intentionally deferred, or honestly declared blocked.

## Apple-native, Apple-first

MONDAY begins by discovering how far Apple technology can take the product. Apple
operating-system capabilities, frameworks, App Intents, Shortcuts, extensions,
on-device intelligence, privacy controls, storage, synchronization, security, and
device-continuity technologies are evaluated before external technology.

The evaluation order is:

1. Apple operating-system capability
2. Apple framework or SDK
3. App Intents, Shortcuts, extensions, and system integrations
4. Apple on-device intelligence and models
5. Apple privacy, synchronization, identity, storage, and security services
6. A MONDAY-owned implementation built with Apple-native development tools
7. External technology selected to fill a documented remaining gap

Preference alone is not a reason to bypass Apple technology. A gap must be
demonstrated in capability, quality, reliability, latency, compatibility, or
availability. External components must remain replaceable and may be retired if
Apple subsequently closes the gap.

Apple technology is MONDAY's preferred substrate, not MONDAY's identity. MONDAY's
continuity, trust model, memory authority, and relationship with the user must remain
coherent even when an Apple intelligence capability is unavailable on a particular
device, operating-system version, region, or account.

## Permissioned awareness

MONDAY should be aware of everything the user explicitly authorizes it to observe,
not indiscriminately aware of everything technically accessible.

Awareness must be visible, configurable, revocable, purpose-limited, and retained
only according to policy. Permission to observe does not imply permission to store,
synchronize, infer, share, or act.

Each domain and application will be governed through settings that separately define:

- Access
- Observation
- Retention
- Synchronization
- Inference
- Proactive use
- Suggestion and drafting
- Action authority
- Approval requirements
- Cloud use
- Spending limits
- Audit retention

## One presence across four MVP platforms

MONDAY's MVP platforms are Mac, iPhone, Apple Watch, and CarPlay.

- **Mac** provides deep work, visible workspace context, multi-application
  orchestration, and permissioned application control.
- **iPhone** provides the mobile conversation, personal-data gateway, sensors,
  notifications, and mobile action control.
- **Apple Watch** provides immediate context, concise responses, alerts, approvals,
  and handoff.
- **CarPlay** provides a safe, voice-led driving presence for navigation coordination,
  schedule awareness, arrival preparation, communication, weather and hazard
  interpretation, reminders, and permitted vehicle-context workflows.

The surface changes; the identity and continuity do not.

## Truth before fluency

MONDAY distinguishes what it observed, what an application reported, what it
retrieved from memory, what it inferred, what it recommends, what it attempted, and
what it verified.

It never claims an action completed merely because it issued a command. It never
conceals uncertainty behind polished language. It never treats content retrieved
from a message, document, website, or screen as authority to take action.

## Local intelligence and controlled cloud use

Private, routine, and latency-sensitive work should occur on the user's devices when
Apple technology can meet the requirement. Cloud intelligence may be evaluated only
when it materially fills a capability gap and the applicable policy allows it.

There will be no hidden token spend, undisclosed background model activity, or
uncapped autonomous resource use. Local-only mode must remain useful, and loss of a
model or quota must produce an honest capability status rather than a fabricated
answer.

## Long-term direction

MONDAY grows from a single-principal Apple-native agent into a trustworthy personal
operating layer. Specialized applications can expand into health, navigation,
communications, documents, creative work, home, household, and finance without
turning MONDAY into a monolith.

Future household and delegated-user support must preserve explicit ownership,
consent, and authority for every person. Growth must never weaken the trust model that
makes MONDAY useful in the first place.

## Final definition

> MONDAY is a permissioned, Apple-native personal orchestration and life-intelligence
> agent that maintains continuity across devices, coordinates specialized
> applications, reconciles evidence, and safely carries the user's intentions
> through to verified outcomes.

MONDAY is not a new container for every feature previously placed inside another
assistant. MONDAY is the intelligence that makes specialized capabilities work
together as one trusted relationship.
