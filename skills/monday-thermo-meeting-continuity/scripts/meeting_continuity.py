#!/usr/bin/env python3
"""Durable, fail-closed ledger for MONDAY Meeting Continuity."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
DEFAULT_MEETING_NOTES_ROOT = Path(
    os.environ.get(
        "MONDAY_MEETING_NOTES_VAULT",
        Path.home() / "Knowledge Vault" / "Meeting Notes",
    )
)
STATES = {"discovered", "artifact_check_due", "reviewed", "impact_classified", "project_updated", "reconciliation_verified"}
DISPOSITIONS = {"no_project_route", "reviewed_no_change", "project_updated", "routing_pending", "source_blocked"}
BLOCKED = {"chat_inaccessible", "recording_expired", "awaiting_delayed_recap", "project_routing_unresolved"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_frontmatter(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return {}
    result: dict[str, Any] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key, value = key.strip(), value.strip().strip('"')
        if value.startswith("[") and value.endswith("]"):
            result[key] = [item.strip().strip('"') for item in value[1:-1].split(",") if item.strip()]
        else:
            result[key] = value
    return result


def blank_ledger(vault: Path, meeting_notes_root: Path | None = None) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "updated_at": now_iso(),
        "vault": str(vault),
        "meeting_notes_root": str(meeting_notes_root or DEFAULT_MEETING_NOTES_ROOT),
        "occurrences": {},
        "runs": [],
    }


def load_ledger(path: Path, vault: Path, meeting_notes_root: Path | None = None) -> dict[str, Any]:
    if not path.exists():
        return blank_ledger(vault, meeting_notes_root)
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schema_version") != SCHEMA_VERSION or not isinstance(value.get("occurrences"), dict):
        raise ValueError("unsupported Meeting Continuity ledger schema")
    return value


def resolved_ledger_path(value: str | None, vault: Path) -> Path:
    return Path(value).expanduser().resolve() if value else vault / "04 Portfolio" / "Meeting Continuity" / "meeting-continuity-ledger.json"


def note_occurrence(note: Path) -> dict[str, Any] | None:
    meta = read_frontmatter(note)
    stable_id = meta.get("stable_meeting_key")
    if not stable_id:
        return None
    status = meta.get("meeting_chat_status", "missing")
    transcript = meta.get("transcript_status", "missing")
    existing_state = meta.get("continuity_state")
    existing_disposition = meta.get("routing_disposition")
    state = existing_state if existing_state in STATES else "artifact_check_due"
    disposition = existing_disposition if existing_disposition in DISPOSITIONS else "routing_pending"
    blockers: list[str] = []
    if status == "inaccessible": blockers.append("chat_inaccessible")
    # Do not infer expiry from an inaccessible transcript. Expiry is a specific
    # source fact, while inaccessible may be a permission, retention, or sync issue.
    if transcript == "expired": blockers.append("recording_expired")
    # A legacy note without a routing decision is pending review, not proof that
    # routing failed. Add project_routing_unresolved only when a reviewer records it.
    return {
        "stable_meeting_key": stable_id,
        "meeting_title": meta.get("meeting_title", note.stem),
        "meeting_date": meta.get("meeting_date", "unknown"),
        "note_path": str(note.resolve()),
        "source_locator_hash": meta.get("source_locator_hash", ""),
        "source_system": meta.get("source_system", "unknown"),
        "projects": meta.get("projects", []),
        "transcript_status": transcript,
        "meeting_chat_status": status,
        "evidence_status": meta.get("evidence_status", "unknown"),
        "continuity_state": state,
        "routing_disposition": disposition,
        "blocked_reasons": blockers,
        "project_updates": [],
        "last_reviewed_at": None,
        "last_run_id": None,
    }


def in_window(date: str, start: str | None, end: str | None) -> bool:
    return (not start or date >= start) and (not end or date <= end)


def normalized_project_name(value: str) -> str:
    stripped = value.strip()
    if stripped.startswith("[[") and stripped.endswith("]]" ):
        stripped = stripped[2:-2].split("|", 1)[0].strip()
    return stripped


def bootstrap(args: argparse.Namespace) -> dict[str, Any]:
    vault = Path(args.vault).expanduser().resolve()
    notes = Path(args.meeting_notes_root).expanduser().resolve()
    ledger_path = resolved_ledger_path(args.ledger, vault)
    ledger = load_ledger(ledger_path, vault, notes)
    ledger["meeting_notes_root"] = str(notes)
    discovered = 0
    for note in notes.rglob("*.md"):
        occurrence = note_occurrence(note)
        if not occurrence or not in_window(occurrence["meeting_date"], args.start, args.end):
            continue
        prior = ledger["occurrences"].get(occurrence["stable_meeting_key"])
        if prior:
            occurrence["project_updates"] = prior.get("project_updates", [])
            occurrence["last_reviewed_at"] = prior.get("last_reviewed_at")
            occurrence["last_run_id"] = prior.get("last_run_id")
            if prior.get("continuity_state") in STATES:
                occurrence["continuity_state"] = prior["continuity_state"]
            if prior.get("routing_disposition") in DISPOSITIONS:
                occurrence["routing_disposition"] = prior["routing_disposition"]
        ledger["occurrences"][occurrence["stable_meeting_key"]] = occurrence
        discovered += 1
    ledger["updated_at"] = now_iso()
    if args.write:
        atomic_json(ledger_path, ledger)
    return {"ledger": ledger, "ledger_path": str(ledger_path), "discovered": discovered, "written": args.write}


def ingest_occurrences(args: argparse.Namespace) -> dict[str, Any]:
    """Upsert normalized collector output without advancing a source watermark."""
    vault = Path(args.vault).expanduser().resolve()
    ledger_path = resolved_ledger_path(args.ledger, vault)
    ledger = load_ledger(ledger_path, vault, Path(args.meeting_notes_root).expanduser().resolve())
    raw = json.loads(Path(args.input).expanduser().read_text(encoding="utf-8"))
    occurrences = raw.get("occurrences", raw) if isinstance(raw, (dict, list)) else None
    if not isinstance(occurrences, list):
        raise ValueError("input must be an occurrence list or an object with occurrences")
    imported = 0
    for value in occurrences:
        if not isinstance(value, dict):
            raise ValueError("each imported occurrence must be an object")
        key = value.get("stable_meeting_key")
        date = value.get("meeting_date")
        title = value.get("meeting_title")
        if not all(isinstance(item, str) and item for item in (key, date, title)):
            raise ValueError("imported occurrence needs stable_meeting_key, meeting_date, and meeting_title")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            raise ValueError("meeting_date must be YYYY-MM-DD")
        prior = ledger["occurrences"].get(key, {})
        item = {
            "stable_meeting_key": key,
            "meeting_title": title,
            "meeting_date": date,
            "note_path": value.get("note_path", prior.get("note_path", "")),
            "source_locator_hash": value.get("source_locator_hash", prior.get("source_locator_hash", "")),
            "source_system": value.get("source_system", prior.get("source_system", "unknown")),
            "projects": value.get("projects", prior.get("projects", [])),
            "transcript_status": value.get("transcript_status", prior.get("transcript_status", "pending")),
            "meeting_chat_status": value.get("meeting_chat_status", prior.get("meeting_chat_status", "pending")),
            "evidence_status": value.get("evidence_status", prior.get("evidence_status", "unknown")),
            "continuity_state": prior.get("continuity_state", "discovered"),
            "routing_disposition": prior.get("routing_disposition", "routing_pending"),
            "blocked_reasons": prior.get("blocked_reasons", []),
            "project_updates": prior.get("project_updates", []),
            "last_reviewed_at": prior.get("last_reviewed_at"),
            "last_run_id": args.run_id,
        }
        ledger["occurrences"][key] = item
        imported += 1
    ledger["updated_at"] = now_iso()
    if args.write:
        atomic_json(ledger_path, ledger)
    return {"imported": imported, "written": args.write, "watermark_advanced": False}


def revisit_plan(args: argparse.Namespace) -> dict[str, Any]:
    vault = Path(args.vault).expanduser().resolve()
    ledger = load_ledger(resolved_ledger_path(args.ledger, vault), vault, Path(args.meeting_notes_root).expanduser().resolve())
    due: list[dict[str, Any]] = []
    for item in ledger["occurrences"].values():
        if not in_window(item["meeting_date"], args.start, args.end):
            continue
        state = item["continuity_state"]
        if state == "reconciliation_verified":
            continue
        cadence = "initial artifact check" if state in {"discovered", "artifact_check_due"} else "delayed artifact check"
        if item["blocked_reasons"]:
            cadence = "blocked-source retry"
        due.append({
            "meeting_key": item["stable_meeting_key"], "meeting_date": item["meeting_date"], "title": item["meeting_title"],
            "cadence": cadence, "state": state, "disposition": item["routing_disposition"], "blocked_reasons": item["blocked_reasons"],
        })
    result = {"generated_at": now_iso(), "as_of": args.as_of or now_iso(), "due_count": len(due), "revisit_queue": sorted(due, key=lambda item: (item["meeting_date"], item["meeting_key"]))}
    if args.output:
        atomic_json(Path(args.output).expanduser().resolve(), result)
    return result


def classify(args: argparse.Namespace) -> dict[str, Any]:
    vault = Path(args.vault).expanduser().resolve()
    ledger_path = resolved_ledger_path(args.ledger, vault)
    ledger = load_ledger(ledger_path, vault, Path(args.meeting_notes_root).expanduser().resolve())
    item = ledger["occurrences"].get(args.meeting_key)
    if not item:
        raise ValueError(f"unknown meeting key: {args.meeting_key}")
    if args.state not in STATES or args.disposition not in DISPOSITIONS:
        raise ValueError("invalid lifecycle state or routing disposition")
    item["continuity_state"] = args.state
    item["routing_disposition"] = args.disposition
    item["blocked_reasons"] = args.blocked_reason or []
    if any(reason not in BLOCKED for reason in item["blocked_reasons"]):
        raise ValueError("invalid blocked reason")
    item["last_reviewed_at"] = now_iso()
    item["last_run_id"] = args.run_id
    ledger["updated_at"] = now_iso()
    if args.write:
        atomic_json(ledger_path, ledger)
    return {"occurrence": item, "written": args.write}


def record_project_update(args: argparse.Namespace) -> dict[str, Any]:
    if not args.approved:
        raise ValueError("project updates require --approved; the tool will not change a project by implication")
    vault = Path(args.vault).expanduser().resolve()
    ledger_path = resolved_ledger_path(args.ledger, vault)
    ledger = load_ledger(ledger_path, vault, Path(args.meeting_notes_root).expanduser().resolve())
    item = ledger["occurrences"].get(args.meeting_key)
    project_path = vault / "03 Projects" / args.project
    if not item:
        raise ValueError(f"unknown meeting key: {args.meeting_key}")
    if not project_path.exists() or project_path.suffix != ".md":
        raise ValueError("project must name an existing markdown record in 03 Projects")
    receipt = {
        "project_path": str(project_path.relative_to(vault)),
        "summary": args.summary,
        "source_locator": item["note_path"],
        "evidence_status": item["evidence_status"],
        "confidence": args.confidence,
        "uncertainty": args.uncertainty,
        "continuity_run_id": args.run_id,
        "recorded_at": now_iso(),
    }
    marker = f"<!-- meeting-continuity:{args.meeting_key}:{args.run_id} -->"
    if args.write:
        project_text = project_path.read_text(encoding="utf-8")
        if marker in project_text:
            raise ValueError("this continuity run already wrote an update to the target project")
        claim_label = item["evidence_status"].replace("_", " ")
        entry = (
            f"\n\n{marker}\n"
            f"## Meeting Continuity Updates\n\n"
            f"### {item['meeting_date']} | {item['meeting_title']}\n\n"
            f"- **Supported change:** {args.summary}\n"
            f"- **Evidence classification:** {claim_label}\n"
            f"- **Confidence:** {args.confidence}\n"
            f"- **Uncertainty:** {args.uncertainty or 'None recorded'}\n"
            f"- **Governed meeting note:** `{item['note_path']}`\n"
            f"- **Continuity run:** `{args.run_id}`\n"
        )
        descriptor, temporary = tempfile.mkstemp(prefix=f".{project_path.name}.", dir=project_path.parent)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(project_text.rstrip() + entry + "\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, project_path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    item["project_updates"].append(receipt)
    item["routing_disposition"] = "project_updated"
    item["continuity_state"] = "project_updated"
    item["last_reviewed_at"] = now_iso()
    item["last_run_id"] = args.run_id
    ledger["updated_at"] = now_iso()
    if args.write:
        atomic_json(ledger_path, ledger)
    return {"receipt": receipt, "project_record_written": args.write, "written": args.write}


def summary(ledger: dict[str, Any], start: str | None, end: str | None, run_id: str) -> dict[str, Any]:
    items = [item for item in ledger["occurrences"].values() if in_window(item["meeting_date"], start, end)]
    dispositions = Counter(item["routing_disposition"] for item in items)
    states = Counter(item["continuity_state"] for item in items)
    blocked = [item for item in items if item["blocked_reasons"] or item["routing_disposition"] == "source_blocked"]
    pending = [item for item in items if item["routing_disposition"] == "routing_pending"]
    reconciled = [item for item in items if item["continuity_state"] == "reconciliation_verified"]
    project_receipts = [receipt for item in items for receipt in item["project_updates"]]
    by_project: dict[str, dict[str, Any]] = {}
    for item in items:
        for project in item.get("projects", []):
            if not isinstance(project, str) or not project:
                continue
            project = normalized_project_name(project)
            if not project:
                continue
            bucket = by_project.setdefault(project, {"project": project, "meeting_count": 0, "pending": 0, "blocked": 0, "updated": 0})
            bucket["meeting_count"] += 1
            if item["routing_disposition"] == "routing_pending": bucket["pending"] += 1
            if item["blocked_reasons"] or item["routing_disposition"] == "source_blocked": bucket["blocked"] += 1
            if item["routing_disposition"] == "project_updated": bucket["updated"] += 1
    denominator = len(items)
    accounted = len(reconciled) + len(blocked) + len([item for item in pending if item not in blocked])
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": now_iso(),
        "run_id": run_id,
        "window": {"start": start, "end": end},
        "coverage": {
            "meetings_in_scope": denominator,
            "reconciled": len(reconciled),
            "blocked": len(blocked),
            "pending": len([item for item in pending if item not in blocked]),
            "accounted": accounted,
            "complete": denominator > 0 and accounted == denominator and not pending and not blocked,
        },
        "lifecycle_states": dict(sorted(states.items())),
        "routing_dispositions": dict(sorted(dispositions.items())),
        "project_update_receipts": project_receipts,
        "project_coverage": sorted(by_project.values(), key=lambda item: (-item["meeting_count"], item["project"])),
        "backlog": [
            {"meeting_key": item["stable_meeting_key"], "date": item["meeting_date"], "title": item["meeting_title"], "disposition": item["routing_disposition"], "blocked_reasons": item["blocked_reasons"], "note_path": item["note_path"]}
            for item in items if item["routing_disposition"] in {"routing_pending", "source_blocked"} or item["blocked_reasons"]
        ],
    }


def command_reconcile(args: argparse.Namespace) -> dict[str, Any]:
    vault = Path(args.vault).expanduser().resolve()
    ledger_path = resolved_ledger_path(args.ledger, vault)
    ledger = load_ledger(ledger_path, vault, Path(args.meeting_notes_root).expanduser().resolve())
    result = summary(ledger, args.start, args.end, args.run_id)
    if args.output:
        atomic_json(Path(args.output).expanduser().resolve(), result)
    return result


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument("--vault", required=True, help="Project Knowledge root")
    root.add_argument("--ledger", help="ledger JSON path")
    root.add_argument("--meeting-notes-root", default=str(DEFAULT_MEETING_NOTES_ROOT), help="Dedicated Meeting Notes vault, separate from Project Knowledge")
    commands = root.add_subparsers(dest="command", required=True)
    boot = commands.add_parser("bootstrap", help="discover existing governed meeting notes")
    boot.add_argument("--start"); boot.add_argument("--end"); boot.add_argument("--write", action="store_true")
    boot.set_defaults(function=bootstrap)
    classify_p = commands.add_parser("classify", help="record lifecycle and routing review")
    classify_p.add_argument("--meeting-key", required=True); classify_p.add_argument("--state", required=True); classify_p.add_argument("--disposition", required=True); classify_p.add_argument("--blocked-reason", action="append"); classify_p.add_argument("--run-id", required=True); classify_p.add_argument("--write", action="store_true")
    classify_p.set_defaults(function=classify)
    update = commands.add_parser("record-project-update", help="record an approved project-update receipt")
    update.add_argument("--meeting-key", required=True); update.add_argument("--project", required=True); update.add_argument("--summary", required=True); update.add_argument("--confidence", choices=["high", "medium", "low"], required=True); update.add_argument("--uncertainty", default=""); update.add_argument("--run-id", required=True); update.add_argument("--approved", action="store_true"); update.add_argument("--write", action="store_true")
    update.set_defaults(function=record_project_update)
    rec = commands.add_parser("reconcile", help="produce coverage and backlog summary")
    rec.add_argument("--start"); rec.add_argument("--end"); rec.add_argument("--run-id", required=True); rec.add_argument("--output")
    rec.set_defaults(function=command_reconcile)
    ingest = commands.add_parser("ingest-occurrences", help="ingest normalized collector output without advancing coverage")
    ingest.add_argument("--input", required=True); ingest.add_argument("--run-id", required=True); ingest.add_argument("--write", action="store_true")
    ingest.set_defaults(function=ingest_occurrences)
    revisit = commands.add_parser("revisit-plan", help="emit delayed-artifact and blocked-source review queue")
    revisit.add_argument("--start"); revisit.add_argument("--end"); revisit.add_argument("--as-of"); revisit.add_argument("--output")
    revisit.set_defaults(function=revisit_plan)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        result = args.function(args)
        print(json.dumps(result, indent=2, sort_keys=True))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser().error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
