# Executive Reporting Architecture

Recurring named reports are report definitions within the plugin, not new skills, personas, or modes. Executive Communication owns report production; Project Intelligence supplies evidence, Analysis supplies reconciled measures, Benefits Realization validates outcomes, Quality Assurance runs the gate, and Monday supplies final synthesis.

Create a dedicated skill only when the capability has an independent outcome, reusable workflow, distinct trigger set, and meaningful boundaries beyond producing one report.

Every report definition must specify:

- name and invocation aliases;
- purpose and decisions supported;
- audience, accountable owner, and approver;
- cadence, reporting period, and source cutoff;
- scope and inclusion/exclusion rules;
- authoritative sources and precedence rules;
- metrics, definitions, formulas, units, and rounding;
- project status and value-stage rules;
- required structure and output format;
- handling for stale, conflicting, duplicated, or missing evidence;
- reconciliation and Quality Assurance checks;
- distribution approval and confidentiality constraints;
- version, last successful run, and change history.

Store report definitions in the Executive Communication skill's `references/report-registry.md`. Store reusable layouts in its `assets` directory. Use deterministic scripts for calculations or transformations that must be repeatable.
