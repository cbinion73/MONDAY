# Approved planning context

Roles, goals, constraints, and capacity are deliberate planning inputs. MONDAY does not infer them from project history or personal data. Validate and persist an approved record with:

```bash
python3 scripts/monday_system.py stage-context --input context.json --apply
```

The schema is:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-09-24T05:00:00-04:00",
  "roles": [{"id": "leader", "title": "Program leader", "goal": "Optional role goal"}],
  "goals": [{"id": "ship", "title": "Ship an evidence-backed release", "roleID": "leader"}],
  "constraints": [{"id": "hard-stop", "title": "Hard stop at 17:00", "kind": "time"}],
  "capacity": {
    "availableHours": 4,
    "protectedHours": 1
  }
}
```

Capacity may instead define `workdayStart` and `workdayEnd`, with optional `focusHours`, or `dailyHours`. `availableHours` is treated as an already-approved net daily amount; Calendar load is still reported separately. Without a valid capacity record, capacity remains unknown and the plan raises a condition rather than manufacturing availability.

This record may identify personal roles and goals for Chris's private cross-domain plan, but its contents do not enter professional project records or JARVIS reporting. Updating the record is a deliberate settings action, not an automatic learning behavior.
