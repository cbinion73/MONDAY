# MONDAY

MONDAY is a permissioned, Apple-native personal orchestration and life-intelligence
agent. It maintains continuity across devices, coordinates specialized applications,
reconciles evidence, and safely carries the user's intentions through to verified
outcomes.

The native application and the consolidated `monday` Codex plugin are one operating
system with separate responsibilities. The plugin prepares a versioned, evidence-bounded
projection. The app validates that projection, displays it, and writes a matching readback
receipt. Publication alone is not proof that the app displayed the plan.

## Product definition

- [Product vision](docs/PRODUCT-VISION.md)
- [Product requirements](docs/PRODUCT-REQUIREMENTS.md)
- [Product boundary](docs/PRODUCT-BOUNDARY.md)
- [Repository structure](docs/REPO-STRUCTURE.md)

## Current posture

MONDAY now has a native Apple-platform MVP vertical slice:

- A shared Swift orchestration and continuity core
- Native Mac and adaptive iPhone/iPad conversations with Apple Calendar observation
- On-device Apple Intelligence conversation on eligible Mac and iPad hardware through
  the Foundation Models framework
- Approval-gated Calendar execution with read-after-write verification
- Explicit provenance, open loops, action state, audit history, and global stop
- A versioned Command Center with Today, Projects, Personal Projects, Meeting Continuity,
  Activity Ledger, MONDAY Operations, and Research Chronicle pages
- Calendar source manifests that distinguish available, empty, stale, blocked, unavailable,
  partial, and unknown coverage
- Current-date, expiry, schema, and plan-identifier validation before a daily plan is shown
- Native-app readback receipts for verified Command Center display
- Native iPhone continuity, Apple Watch approval, and CarPlay driving surfaces
- Monday Knowledge: portable Markdown, daily notes, tags, wiki links, backlinks, search,
  revision history, and an agent-readable JSON index synchronized through iCloud Documents
- Siri AI provider integration with indexed MONDAY context, system-schema semantic search,
  natural-language abilities, behavior donations, and proposal-only consequential work
- Governed read-only Obsidian context on Mac with curated evidence tiers, complete-note
  retrieval, deterministic source links, and on-device-only grounding
- Local-only defaults with Apple’s on-device model, no cloud model, and no background model activity
- Explicit boundaries around legacy material and external capability systems

The Mac slice is functional today. The iPad evaluation surface is physically
installed and launch-verified on an M2 12.9-inch iPad Pro running iPadOS 27. It shares the real
Calendar and Apple Intelligence specialists and has a dedicated wide-screen evidence
workspace. iPhone, Watch, and CarPlay compile as native surfaces; production
Monday Knowledge includes its iCloud synchronization implementation and entitlements;
physical cross-device activation and CarPlay deployment still require matching Apple
Developer containers and provisioning profiles. These are recorded as explicit gates rather than
represented as complete.

## Run the MVP

Requirements: Xcode 26+, macOS 15+, and XcodeGen. Use Xcode 27 to exercise the
current iPadOS 27 Apple Intelligence runtime.

~~~sh
xcodegen generate
open MONDAY.xcodeproj
~~~

Select the MONDAY scheme and run on My Mac. Or build from Terminal:

~~~sh
xcodebuild -project MONDAY.xcodeproj -scheme MONDAY \
  -destination 'platform=macOS' build
~~~

Inside the app, choose **Plan my day and protect a focus hour**. MONDAY will:

1. Ask for Calendar permission at the moment it is needed.
2. Read today's timed events through EventKit.
3. Find a conflict-free hour.
4. Show the exact reversible change without acting.
5. Wait for one-time approval.
6. Save the event through Apple Calendar.
7. Read it back by identifier before claiming completion.

Use **Trust Center** to independently disable awareness or action authority. Use
**Activity & proof** to inspect the resulting audit trail.

For open-ended conversation, MONDAY routes to Apple’s on-device Foundation Model
when it is available and enabled. The model receives recent authorized conversation
context but no action tools. Calendar mutations remain in the deterministic,
approval-gated specialist path.

## Verification

~~~sh
swift test
xcodebuild -project MONDAY.xcodeproj -scheme MONDAY \
  -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project MONDAY.xcodeproj -scheme MONDAYMobile \
  -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
xcodebuild -project MONDAY.xcodeproj -target MONDAYWatch -configuration Release \
  -sdk watchsimulator CODE_SIGNING_ALLOWED=NO build
~~~

See [MVP architecture](docs/MVP-ARCHITECTURE.md) and
[Apple capability evaluation](docs/APPLE-CAPABILITY-EVALUATION.md).

To configure an OpenAI credential for local development or an authorized
server deployment without placing it in the repository, follow the
[OpenAI API key setup](docs/OPENAI-KEY-SETUP.md). Provider secrets are never
compiled into MONDAY's Apple apps.

See [Monday Knowledge](docs/MONDAY-KNOWLEDGE.md) for its portable storage contract,
link graph, iCloud synchronization boundary, and deployment requirement.

See [Siri AI integration](docs/SIRI-AI-INTEGRATION.md) for MONDAY's semantic routing,
published entities, intent donations, personality, and authority boundary.

See [Obsidian vault context](docs/OBSIDIAN-VAULT.md) for the read-only retrieval scope,
provenance rules, excluded raw sources, and on-device privacy boundary.

Legacy JARVIS and MONDAY material is reference material only. Nothing enters this
repository without explicit evaluation against the current product definition and
durable-record boundaries.
