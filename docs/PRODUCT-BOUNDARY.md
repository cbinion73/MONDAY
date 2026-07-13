# Product Boundary

This repo is a clean restart.

## Binding boundaries

- MONDAY is a new product, not a continuation of JARVIS or legacy MONDAY.
- Legacy MONDAY and JARVIS code are reference material only until explicitly imported.
- Specialized functions should live in standalone apps or bounded services coordinated by MONDAY.
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

## Specialist applications own

- Domain records and calculations
- Domain-specific platform entitlements
- Domain validation and safety rules
- Execution within their declared authority
- Structured reporting of outcomes

## Out of scope for the clean start

- transferring legacy code
- binding to old runtimes
- rebuilding prior modules
- importing old docs without explicit review
- universal or unrestricted application control
- undisclosed background model activity or spending
