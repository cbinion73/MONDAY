# Apple Capability Evaluation

Status: MVP evidence ledger

Date: 2026-07-13

No external technology is approved or used.

| Capability | Apple technology evaluated | Evidence in this repo | Result | Remaining gate |
| --- | --- | --- | --- | --- |
| Native presence | SwiftUI for macOS, iOS/iPadOS, watchOS | All three app targets compile with Xcode 27; signed app installed and launch-verified on physical M2 iPad Pro with iPadOS 27 | Selected | Distribution signing remains |
| Calendar context and action | EventKit | Shared Mac/iPhone/iPad specialist reads, writes after approval, and verifies by identifier | Selected and implemented | User Calendar permission |
| Reminder context and action | EventKit | Shared Mac/iPhone/iPad specialist reads incomplete reminders, previews a write, requires one-time approval, saves, and verifies by identifier | Selected and implemented | User Reminders permission |
| Local speech output | NSSpeechSynthesizer / AVSpeechSynthesizer | Mac Speak control and automatic mobile spoken reply after a voice turn | Selected and implemented | User voice preference |
| Local continuity | Codable, atomic file persistence | FileContinuityStore | Selected and implemented | None for one device |
| Cross-device continuity | CloudKit / NSUbiquitousKeyValueStore | Shared canonical model is Codable and surface-aware | Apple path selected | Container, conflict policy, account and device testing |
| Watch approval | watchOS SwiftUI, WatchConnectivity | Native approval screen compiles | UI selected | Companion embedding and device transport |
| CarPlay presence | CarPlay framework and scene APIs | CPTemplateApplicationSceneDelegate compiles | UI selected | Apple entitlement, category approval, driving tests |
| Voice input | SpeechAnalyzer / SpeechTranscriber with CaptureInputSequenceProvider | iPadOS 27 uses Apple’s newest fully on-device speech model, manages Apple model assets, streams volatile/final results, and does not depend on Siri or keyboard dictation; older systems retain a disclosed legacy fallback | Selected and implemented | Physical-device conversational quality and interruption evaluation |
| Siri entry points | App Intents / App Shortcuts | Native metadata and spoken-language training generated for opening MONDAY and privately summarizing waiting decisions/open loops | Selected and implemented | Device indexing and Siri-enabled system test |
| Weather | WeatherKit | Not implemented | Evaluation pending | Entitlement, attribution, source-diversity proof |
| Notifications | UserNotifications | Not implemented | Evaluation pending | Interruption and proactive-use defaults |
| Generative intelligence | Foundation Models / Apple Intelligence | Shared governed specialist checks runtime availability and generates locally with no tools; Xcode 27 physical iPad build installed and launched; each invocation is recorded with route, boundary, size, count, surface, and reported cost | Selected and implemented on eligible Mac and iPad | On-device quality remains below MONDAY’s conversational bar for factual questions |
| Apple cloud intelligence | PrivateCloudComputeLanguageModel | Governed route is implemented behind local-only and cloud policy; entitlement file is prepared; Apple PCC access request submitted | Apple-first upgrade pending | Managed `com.apple.developer.private-cloud-compute` entitlement and provisioning approval |

## iPad evaluation surface

The M2 iPad is an Apple Intelligence evaluation and development surface, not a
change to the four-platform MVP commitment. Its adaptive interface exposes the
same canonical workspace, trust policy, evidence labels, approval lifecycle,
Calendar specialist, and completion firewall as the Mac app. The wider layout adds
an intelligence rail for capabilities, open loops, and trust state without creating
a separate iPad identity or orchestration architecture.

## Capability-gap rule

A row marked pending is not a gap declaration. External technology may be proposed
only after:

1. The Apple capability is prototyped on supported hardware.
2. Quality, reliability, latency, compatibility, and availability are measured.
3. The remaining material gap is written down.
4. The external component is shown to remain replaceable.
5. Its data, cloud, background-use, and spend policies are approved.
