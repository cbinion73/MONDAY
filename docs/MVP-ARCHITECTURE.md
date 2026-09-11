# MONDAY MVP Architecture

Status: Implemented vertical slice

Date: 2026-07-13

## Product proof

The first MONDAY slice proves one complete constitutional loop:

> Understand a request → recover authorized context → route to a specialist →
> gather evidence → recommend an action → verify authority → execute through the
> specialist → verify the real result → preserve continuity and audit.

The reference workflow is: **inspect today's Apple Calendar, find a free hour,
prepare a focus block, obtain one-time approval, save it, and read it back before
claiming completion.**

## Boundaries

### MONDAYCore owns

- Conversation and surface provenance
- Canonical workspace and open loops
- Capability discovery and routing
- Action lifecycle
- Trust policy and global stop
- Audit records
- Model-use records and device-boundary disclosure
- Continuity persistence

### Apple Calendar and Reminders specialists own

- EventKit authorization state
- Calendar-domain reads
- Free-window calculation from domain records
- Event creation
- Read-after-write verification
- Structured attempted, failed, and verified results

The core does not import EventKit. The specialist can be replaced without changing
MONDAY's identity, policy, conversation, or action lifecycle.

## Runtime flow

~~~text
SwiftUI surface
      │
      ▼
 MondayEngine actor
      │
      ├── TrustSettings (observe / act / local-only / stop)
      ├── ContinuityStore (versioned JSON, atomic local write)
      ├── Capability registry
      └── MondaySpecialist contract
                  │
                  ▼
          Apple domain specialists
          EventKit read → proposal
          approval → EventKit write → identifier read-back
~~~

## Platform surfaces

- **Mac:** complete reference workflow, Trust Center, evidence lens, audit history,
  local continuity, Apple speech playback, and on-device Apple Intelligence.
- **iPhone:** native text and foreground voice conversation, spoken replies, action
  approval, model-use history, and handoff surface using the shared core.
- **iPad evaluation:** adaptive two-column conversation and intelligence workspace
  using the same mobile target, shared Calendar specialist, and on-device Apple
  Intelligence specialist. This accelerates Apple Intelligence testing without
  promoting iPad to a fifth binding MVP platform.
- **Apple Watch:** glanceable, one-time approval interaction.
- **CarPlay:** concise Apple CarPlay template containing only driving-relevant,
  truthfully available context.

The platform screens intentionally change density while preserving MONDAY's
identity and constitutional vocabulary.

## Truth model

Every supporting item is labeled as one of:

- observed
- source claim
- remembered
- inferred
- recommended
- attempted
- verified

Issuing a save does not complete an action. The reference specialist must retrieve
the resulting EKEvent by identifier and compare its title and start time before
the action moves to verified.

## Trust model

The checked-in default is:

- awareness on
- actions on, but consequential actions require explicit approval
- Calendar observation on
- approved Calendar writes on
- local-only on
- cloud intelligence off
- background intelligence off
- Apple on-device intelligence on, with no action tools
- separate Reminders observation and approved-write controls

The global stop disables new actions and background intelligence and declines every
pending proposal.

## Honest MVP boundary

This repository proves the working core and a complete Mac vertical slice. It also
contains a compile-verified adaptive iPhone/iPad implementation and native shells
for the Watch and CarPlay surfaces.

The following are not represented as complete:

- CloudKit-backed cross-device synchronization
- device-to-device approval transport
- production CarPlay entitlement
- Watch companion embedding and signing
- target-side MONDAY Bridge adapters for NAV, VITALS, and Chronicle
- WeatherKit and multi-source weather adjudication

Each depends on an Apple capability, entitlement, account decision, or subsequent
product decision. No non-Apple dependency has been introduced to bypass those gates.

The mobile target now includes working App Intents for opening MONDAY, reading status,
and sending a request into MONDAY while returning the response as a Shortcuts value.
The versioned bridge envelope, mailbox, persistent connection registry, and Connections
Center are implemented on the MONDAY side; see `docs/MONDAY-BRIDGE.md`.
