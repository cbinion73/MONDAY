# Monday Artifact Surfacing Behavior

## Purpose

This document captures the expected UX and behavioral rules for how Monday brings artifacts onto the screen during live interaction.

This is not a doctrine replacement.
It is an interface-behavior document that sits underneath the existing doctrine and interaction model.

Its purpose is to preserve the hard-won expectations that emerged from iterative mockup work:

- what the resting Monday surface should feel like
- when artifacts should appear
- how they should be introduced
- how much chrome should remain visible
- how graphs, websites, and data displays should behave once surfaced

## Core Principle

Monday should be quiet until needed, then fully present.

The default state is not a dashboard.
The default state is an empty, calm presence centered on relationship.

Artifacts are not ambient furniture.
They are summoned into visibility only when the conversation requires them.

The screen should feel like:

- blank until meaning requires content
- centered on Monday rather than on application chrome
- reactive to conversation rather than pre-populated with panels

## Resting State

When Monday is not actively surfacing an artifact, the interface should remain minimal:

- Monday centered in the available space
- no persistent floating documents, dashboards, or panels
- only the essential primary controls visible
- the chat entry point available
- microphone and desktop-mode affordances available as icons, not text-heavy controls

The resting state should feel calm, sparse, and ready.
It should not feel like work has already begun before the conversation begins.

## Artifact Surfacing Contract

When Monday decides to show something, the artifact should be introduced from the conversation itself.

The expected sequence is:

1. the user asks or the conversation makes a display useful
2. Monday briefly names what she is doing
3. the artifact appears on the screen
4. Monday explains what matters about what is being shown

This sequence matters.
Monday should not silently throw content on the screen without relational framing.
She should also not over-explain before the artifact is visible.

The artifact should usually appear slightly before the explanation so the user can see what Monday is talking about while she speaks.

## Modal Rules

The surfaced artifact should use a full-screen modal pattern.

When the modal is open:

- the artifact fills the screen
- the bottom icon tray disappears
- the floating chat bar remains
- the floating close affordance remains
- the chat bar and close affordance should feel like hovering glass over the artifact

The modal is not a card in the middle of the page.
It is the page while it is active.

## Floating Controls

When an artifact is open:

- the chat box stays anchored at the bottom of the screen
- the close button sits beside it
- both should visually hover above the artifact
- both should be highly transparent so the content remains visible beneath them

These controls should not introduce extra bars, frames, or secondary containers.
The chat field itself and the close control are the only persistent overlay controls.

## Website Surfacing Rules

When Monday surfaces a website:

- use the real website directly when embedding permits it
- do not rebuild the page unnecessarily if the actual page can be shown
- retain the same modal shell and floating controls
- let the underlying website scroll naturally inside the modal

If a site blocks direct embedding, Monday may fall back to a rendered or reconstructed view, but the preferred behavior is source fidelity when technically possible.

## Conversation Overlay Rules

While an artifact is open:

- Monday's short spoken-or-text explanation may appear as a transient floating bubble
- that floating bubble should disappear automatically after a few seconds
- the underlying conversational record should still exist outside the modal context

The user message should not be duplicated visually in two places at once.
The overlay should support orientation, not clutter.

### Voice Mode Rule

If Monday is audibly speaking, visible chat bubbles are usually unnecessary.

In voice mode:

- prefer voice as the primary explanation channel
- suppress transient chat bubbles by default
- keep the artifact itself visually prominent

In silent mode:

- use transient chat bubbles so the user can still follow the explanation
- keep them brief, contextual, and automatically dismissing

The screen should not repeat information across voice and text unless redundancy is explicitly helpful.

## Data And Graph Surfacing Rules

The same artifact system should be reusable for:

- graphs
- charts
- dashboards
- tables
- images
- videos
- presentations
- emails
- structured records

The system is universal.
The thing that changes is the surfaced content, not the interaction pattern.

## Health Dashboard Sequence Pattern

One especially important expected behavior emerged from the health scenario:

Monday should be able to progressively build an explanatory view over time, not only dump a complete dashboard at once.

Example sequence:

1. Monday says she is pulling the medical record
2. the first graph appears full-screen
3. Monday explains the first signal
4. the second graph appears before the second explanation
5. Monday explains the relationship
6. the third graph appears before the third explanation
7. Monday explains the expanding pattern
8. the fourth graph appears before the fourth explanation
9. Monday completes the causal picture

This means the display can evolve during speech.
Monday is not just showing static reports.
She is assembling evidence in support of a developing explanation.

## Graph Layout Rules

For graph and data displays:

- at any given time a modal page should show at most 4 graphs or comparable factors
- if more than 4 are needed, create another page
- only when there is more than one page should left/right paging arrows appear
- graphs should scale to fit the visible page
- the view should avoid unnecessary browser-like scrolling chrome
- the screen should show the reading, the insight, and the graph itself
- the display should not be crowded with extra narration panels or decorative UI

The content should feel analytical and legible, not like a dashboard template.

## Focus Mode Rules

Any surfaced graph should be tappable/clickable into a temporary full-screen focus state.

In focus mode:

- the selected graph expands to full-screen
- the user can zoom and inspect it
- a small red close control appears at the upper left
- closing the focus state returns the user to the prior modal layout

This should feel like temporarily holding one signal closer, not navigating to a different application.

## Presence Over Dashboard

The strongest recurring lesson from the mockup work is this:

Monday should feel like a presence that can surface artifacts, not a dashboard that happens to contain an AI.

That means:

- relationship-first resting state
- artifact-on-demand behavior
- minimal persistent chrome
- calm transitions
- evidence assembled in support of meaning

The user should feel that Monday is bringing the right thing forward at the right moment, then letting it recede when no longer needed.
