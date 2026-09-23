# Priority 1 release, general MONDAY Core

Priority 1 makes the primary `monday` plugin self-contained as MONDAY's
operating intelligence. Global personalization remains responsible for
identity, values, durable preferences, and the instruction to start with
`monday-core`. The plugin now owns the reusable orchestration contract.

## Completion requirements

1. **Cross-domain intake and routing**
   - `monday-core/SKILL.md` defines the complete operating loop.
   - `scripts/monday_core.py preflight` validates a bounded orchestration
     request and resolves required capabilities and dependencies.
2. **Capability registry**
   - `capability-registry.json` registers every packaged MONDAY skill.
   - Atlas, Nexus, and CRG Notebook Reviewer remain independent plugins.
   - Validation fails for missing skills, unregistered skills, invalid record
     owners, dependency cycles, or missing canonical source lanes.
3. **Source selection and evidence labeling**
   - Calendar, Email, OneDrive, Teams, and SharePoint have separate canonical
     source IDs and routes.
   - Current completeness claims require explicit source health.
   - Empty, partial, stale, unavailable, blocked, and unknown remain distinct.
4. **Project, personal, journal, and operations boundaries**
   - Each durable record has an owning capability.
   - Personal evidence cannot silently fill a professional gap or enter
     professional reporting.
   - Captain's Log and Research Chronicle retain separate authorship and review
     rules.
5. **Approval boundaries**
   - Unconfirmed external effects create a deterministic stop.
   - Confirmation authorizes an attempt; verification still requires source
     readback.
6. **Final synthesis and QA**
   - Consequential Thermo work routes through independent QA.
   - Structured synthesis validation checks source completeness, evidence
     traceability, QA verdicts, action verification, and exact completion
     states.
7. **Command Center publication**
   - Publication routes through the Planning Pipeline and Command Center.
   - Display claims require matching plan identifiers and schema readback.
8. **Global personalization**
   - Keeps MONDAY's identity, judgment, values, privacy, and high-level routing.
   - Defers operational workflows, schemas, source contracts, and capability
     methods to the primary plugin.

## Release gates

- Every packaged skill appears exactly once in the capability registry.
- Core, existing plugin, and specialist test suites pass.
- All shipped Python scripts compile.
- Every skill and the full plugin validate.
- The source is reinstalled through the personal marketplace with a fresh
  cachebuster.
- Authoritative source and installed cache match byte-for-byte, excluding Git
  metadata.
- A fresh task exposes `monday:monday-core` from the new installed version.
- A schema-3 Command Center plan receives matching native-app readback.
