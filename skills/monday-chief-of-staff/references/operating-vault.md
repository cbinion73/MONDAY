# Operational vault and time governance

Capture an item only if it affects a current decision, commitment, follow-up, or
project. Keep only known fields: clear outcome/title, type, why, smallest next
action, owner, status, timing, calendar/reminder link when applicable, source,
and last review decision.

## Lifecycle

Use: Capture → Clarify → Schedule/Track → Review → Promote / Archive / Delete.

Classify every item as an ask, commitment, decision, follow-up, waiting-on item,
project context, or parking-lot item. Assign an owner and next action before
calling it active.

## Date governance

Apply the no-orphan rule: if something must happen at or by a particular time,
it cannot live only in the Monday vault. Create or link the real calendar event
or reminder, or explicitly leave it unscheduled. Calendar data is not copied
into the vault as an alternate calendar.

Before writing to a calendar, reminder system, or family system, preview the
exact proposed change and wait for explicit confirmation. Verify the saved
record afterward.

## Review cadence

- Daily: triage new items; inspect due, overdue, and approaching work; resolve
  missing dates; check that time-bound work has an actual trigger.
- Weekly: inspect commitments, decisions, follow-ups, waiting-on items, and the
  next two to four weeks; close completed work, remove duplicates, promote
  durable outcomes, and surface vague or unresolved items.
- Monthly: remove repeated carry-forward, superseded decisions, stale context,
  and unnecessary recurring reminders.
- Quarterly: consolidate lessons, archive closed projects, revisit material
  assumptions, and confirm the operating state reflects real priorities.

After roughly 30 days, a temporary item requires a deliberate decision:
promote, archive, recommit, or delete. Repeated deferral is information; surface
the choice to recommit with real cost, delegate, reduce scope, or stop.

## Weekly Digest tool

`get_weekly_digest()` mechanically runs two rules this document already
states, instead of only applying them when someone happens to ask: it lists
Parking-Lot and Follow-Ups items past the 30-day aging threshold (oldest
first), lists open canonical tasks, and reads the coming week's family
calendar. It is read-only — it edits nothing, creates no reminder, and sends
nothing on its own.

Use it at the start of a weekly review, or when Chris asks what's gone stale.
To get it running on a cadence rather than only on request, Chris sets up a
ChatGPT Scheduled Task (or a Codex cron job) that invokes this tool and
reports the result in a normal message; Monday cannot create that schedule
from inside a conversation. Every stale item it surfaces still needs the
deliberate promote/archive/recommit/delete decision this document requires —
the tool produces the candidate list, not the disposition.

## Family calendar boundary

Use an authorized read-only family-calendar connection for availability and
conflict truth. Compare an aggregate calendar with individual calendars before
assuming it is purely an aggregate, and deduplicate overlaps. Keep access
addresses solely in local-secret configuration.
