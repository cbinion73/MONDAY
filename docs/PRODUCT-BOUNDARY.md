# Product Boundary

This repo is the native Apple application for the consolidated MONDAY operating system.

## Binding boundaries

- The primary `monday` Codex plugin owns MONDAY's reusable operating methods, source-health controls, and planning pipeline.
- This native app owns conversation, permissioned Apple capabilities, and the read-only Command Center projection.
- Atlas, Nexus, and CRG Notebook Reviewer remain independent products. Planning, Personal, and Thermo are capability families inside MONDAY.
- Legacy MONDAY and JARVIS material remains reference-only until explicitly evaluated and imported.
- Device awareness, sync, trust, and orchestration are first-class concerns.
- MONDAY owns the relationship with the user, not every domain implementation.
- Apple technology must be evaluated before third-party technology is introduced.
- A non-Apple dependency requires a documented capability gap.

## MONDAY owns

- Identity and conversation
- Cross-device continuity
- Intent understanding and orchestration
- Capability discovery and routing
- Evidence reconciliation
- Settings, trust, approvals, and audit
- Open-loop tracking and verified follow-through
- Synchronization and model-use policy
- Versioned Command Center publication and native-app readback verification

## Specialist applications own

- Domain records and calculations
- Domain-specific platform entitlements
- Domain validation and safety rules
- Execution within their declared authority
- Structured reporting of outcomes

## Durable record boundaries

- Professional project truth: `~/Knowledge Vault/Project Knowledge`
- Personal project truth: `~/Knowledge Vault/Personal Project Knowledge`
- Chris's journal: `~/Knowledge Vault/Chris Knowledge/500 Personal Journal`
- MONDAY operations: `~/Knowledge Vault/Monday Knowledge`
- Command Center files under `~/.codex/monday-planner` are projections, not authoritative records.

## Out of scope

- transferring legacy code
- binding to old runtimes
- duplicating plugin procedures inside app personalization
- importing old docs without explicit review
- universal or unrestricted application control
- undisclosed background model activity or spending
