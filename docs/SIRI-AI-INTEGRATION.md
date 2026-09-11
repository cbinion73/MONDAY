# Siri AI integration

MONDAY participates in Siri AI as an Apple-native intelligence provider. Siri owns invocation, speech, natural-language understanding, system context, and provider routing. MONDAY owns durable context, capacity judgment, specialist orchestration, trust, approval, audit, and verified follow-through.

## Automatic discovery

MONDAY publishes authorized context as `MondayContextEntity` values through Core Spotlight. The indexed entity set includes active commitments, pending approvals, and active Monday Knowledge notes classified as knowledge, decisions, or projects. Deleted notes and completed or abandoned loops are not published.

On iOS 27 and macOS 27, `SearchMondayInAppIntent` adopts Apple's `.system.searchInApp` App Schema. This gives Siri a system-understood semantic search capability for MONDAY and allows Siri to open MONDAY directly into the requested knowledge search.

MONDAY also exposes discoverable intents for:

- Reviewing priorities
- Finding decisions, commitments, projects, and knowledge
- Capturing Monday Knowledge
- Recording a commitment
- Assessing capacity for a proposed initiative
- Finding pending approval requests
- Routing an open-ended request into MONDAY

## Learning from behavior

When Chris directly creates a commitment through MONDAY or captures knowledge in MONDAY's interface, MONDAY donates the matching intent to Siri. Donations describe completed user-initiated interactions; Siri-initiated requests are not donated again. Apple controls whether and when the resulting suggestions appear.

## Authority boundary

Siri may perform read-only retrieval, priority review, and capacity assessment. An explicit capture request may create a knowledge note or active commitment. Consequential work remains proposal-only and must return to MONDAY for review. No Siri intent can approve or execute a consequential MONDAY action.

The boundary is enforced in `MondaySiriRoutingPolicy` and covered by automated tests. Siri's ability to invoke an intent does not expand the authority of that intent.

The Trust Center independently controls Siri AI access and whether Monday Knowledge is published to Spotlight. Disabling Siri AI empties MONDAY's Spotlight entity index. Disabling knowledge publication preserves commitment and approval discovery while removing knowledge notes, decisions, and projects sourced from Monday Knowledge.

## Personality

MONDAY supplies custom Siri dialogue for its intents. Responses are concise enough for voice, witty where appropriate, direct about uncertainty, and deliberately serious around consequential work. Apple retains control of Siri's selected voice, system transitions, safety prompts, and final provider-selection behavior.

## Expected behavior

System-schema search and Spotlight entities give Siri the strongest available signals for automatic routing. Apple still owns the router, so no third-party app can guarantee interception of every ambiguous Siri request. Explicit phrases remain a reliable fallback while donations and normal use improve suggestion quality.
