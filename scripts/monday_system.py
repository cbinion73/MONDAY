#!/usr/bin/env python3
"""MONDAY's local source registry, planning pipeline, receipts, and Command Center contract."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
import uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo


SCHEMA_VERSION = 3
SOURCE_SCHEMA_VERSION = 1
TZ = ZoneInfo(os.environ.get("MONDAY_TIMEZONE", "America/New_York"))
HOME = Path.home()
MONDAY_KNOWLEDGE = Path(os.environ.get("MONDAY_KNOWLEDGE_ROOT", HOME / "Knowledge Vault/Monday Knowledge"))
PROJECT_KNOWLEDGE = Path(os.environ.get("MONDAY_PROJECT_KNOWLEDGE_VAULT", HOME / "Knowledge Vault/Project Knowledge"))
PERSONAL_PROJECTS = Path(os.environ.get("MONDAY_PERSONAL_PROJECTS_VAULT", HOME / "Knowledge Vault/Personal Project Knowledge"))
SOURCE_ROOT = Path(os.environ.get("MONDAY_SOURCE_ROOT", HOME / ".codex/monday-sources"))
PLANNER_ROOT = Path(os.environ.get("MONDAY_PLANNER_ROOT", HOME / ".codex/monday-planner"))
PLAN_PATH = PLANNER_ROOT / "daily-plan.json"
READBACK_PATH = PLANNER_ROOT / "readback.json"
ACTIVITY_ROOT = MONDAY_KNOWLEDGE / "100 Activity Ledger"
OPERATIONS_ROOT = MONDAY_KNOWLEDGE / "400 MONDAY Operations" / "Receipts"
MEETING_LEDGER = PROJECT_KNOWLEDGE / "04 Portfolio/Meeting Continuity/meeting-continuity-ledger.json"

VALID_SOURCE_STATES = {"available", "partial", "empty", "stale", "blocked", "unavailable", "unknown"}
USABLE_SOURCE_STATES = {"available", "empty"}
ACTIVE_PROJECT_STATES = {"active", "in-progress", "at-risk", "blocked", "watch"}
ATTENTION_PROJECT_STATES = {"at-risk", "blocked", "intervention"}
ACTIVE_DECISION_STATES = {"active", "pending", "blocked", "open"}
FRONT_MATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.DOTALL)


def now() -> datetime:
    return datetime.now(TZ)


def iso(value: datetime | None = None) -> str:
    return (value or now()).isoformat(timespec="seconds")


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=TZ)
    return parsed.astimezone(TZ)


def load_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
        temporary = Path(handle.name)
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, sort_keys=True) + "\n")
    os.chmod(path, 0o600)


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "source"


def parse_front_matter(path: Path) -> dict[str, str]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return {}
    match = FRONT_MATTER.match(text)
    if not match:
        return {}
    result: dict[str, str] = {}
    for raw in match.group(1).splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def record_title(path: Path, metadata: dict[str, str]) -> str:
    return metadata.get("title") or path.stem.replace("-", " ")


def scan_records(root: Path, states: set[str], types: set[str] | None = None) -> list[dict[str, str]]:
    if not root.is_dir():
        return []
    records: list[dict[str, str]] = []
    for path in sorted(root.rglob("*.md")):
        if path.name == "README.md" or any(part.startswith(".") for part in path.relative_to(root).parts):
            continue
        metadata = parse_front_matter(path)
        status = metadata.get("status", "unknown").lower()
        record_type = metadata.get("type", "").lower()
        if status not in states or (types and record_type not in types):
            continue
        records.append(
            {
                "id": metadata.get("id") or slug(str(path.relative_to(root).with_suffix(""))),
                "title": record_title(path, metadata),
                "status": status,
                "outcome": metadata.get("outcome", ""),
                "nextAction": metadata.get("next_action") or metadata.get("next-action") or "",
                "owner": metadata.get("owner", "unknown"),
                "updated": metadata.get("updated") or metadata.get("last_evidence_review") or "unknown",
                "reviewDate": metadata.get("review_date") or metadata.get("review-date") or "",
                "evidenceStatus": metadata.get("evidence_status", "unknown"),
                "path": str(path),
            }
        )
    return sorted(records, key=lambda item: (item["status"] not in ATTENTION_PROJECT_STATES, item["updated"], item["title"]))


def manifest_path(source_id: str) -> Path:
    return SOURCE_ROOT / f"{slug(source_id)}.manifest.json"


def effective_manifest(payload: dict[str, Any], current: datetime | None = None) -> dict[str, Any]:
    result = dict(payload)
    state = str(result.get("status", "unknown")).lower()
    if state not in VALID_SOURCE_STATES:
        state = "unknown"
    succeeded = parse_datetime(result.get("succeededAt"))
    freshness = max(1, int(result.get("freshnessHours", 24)))
    if state in USABLE_SOURCE_STATES:
        if succeeded is None:
            state = "unknown"
            result["detail"] = "A usable state requires a successful collection timestamp."
        elif (current or now()) - succeeded > timedelta(hours=freshness):
            state = "stale"
            result["detail"] = f"Last successful collection exceeded the {freshness}-hour freshness threshold."
    result["status"] = state
    result.setdefault("attemptedAt", None)
    result.setdefault("succeededAt", None)
    result.setdefault("itemCount", None)
    result.setdefault("processedCount", None)
    result.setdefault("unresolvedCount", None)
    result.setdefault("detail", "")
    result.setdefault("error", "")
    result.setdefault("artifact", "")
    return result


def source_manifests(current: datetime | None = None) -> list[dict[str, Any]]:
    if not SOURCE_ROOT.is_dir():
        return []
    manifests = []
    for path in sorted(SOURCE_ROOT.glob("*.manifest.json")):
        payload = load_json(path)
        if isinstance(payload, dict):
            manifests.append(effective_manifest(payload, current))
    return manifests


def local_source(source_id: str, name: str, kind: str, path: Path, item_count: int, detail: str) -> dict[str, Any]:
    stamp = iso(datetime.fromtimestamp(path.stat().st_mtime, TZ)) if path.exists() else None
    return {
        "schemaVersion": SOURCE_SCHEMA_VERSION,
        "sourceID": source_id,
        "name": name,
        "kind": kind,
        "status": "available" if path.exists() else "unavailable",
        "attemptedAt": iso(),
        "succeededAt": stamp,
        "windowStart": None,
        "windowEnd": None,
        "itemCount": item_count if path.exists() else None,
        "processedCount": item_count if path.exists() else None,
        "unresolvedCount": 0 if path.exists() else None,
        "watermark": None,
        "freshnessHours": 168,
        "detail": detail,
        "error": "" if path.exists() else f"Missing local path: {path}",
        "artifact": str(path),
    }


def calendar_schedule(plan_date: str, manifests: list[dict[str, Any]]) -> list[dict[str, str]]:
    calendar_manifest = next((item for item in manifests if item.get("kind") == "calendar"), None)
    if not calendar_manifest or calendar_manifest.get("status") not in USABLE_SOURCE_STATES:
        return []
    artifact = calendar_manifest.get("artifact")
    payload = load_json(Path(artifact)) if artifact else None
    if not isinstance(payload, dict) or payload.get("date") != plan_date:
        return []
    result = []
    for item in payload.get("items", payload.get("schedule", [])):
        if not isinstance(item, dict):
            continue
        start = item.get("time") or item.get("start")
        end = item.get("end")
        title = item.get("title")
        if all(isinstance(value, str) and value for value in (start, end, title)):
            result.append({"time": start, "end": end, "title": title})
    return sorted(result, key=lambda item: item["time"])


def meeting_summary() -> dict[str, Any]:
    payload = load_json(MEETING_LEDGER, {})
    occurrences = payload.get("occurrences", []) if isinstance(payload, dict) else []
    if isinstance(occurrences, dict):
        occurrences = list(occurrences.values())
    if not isinstance(occurrences, list):
        occurrences = []
    counts: dict[str, int] = {}
    unresolved = 0
    for item in occurrences:
        if not isinstance(item, dict):
            continue
        status = str(item.get("continuity_state") or item.get("status") or item.get("routing_disposition") or item.get("disposition") or "unknown")
        counts[status] = counts.get(status, 0) + 1
        if status != "reconciliation_verified":
            unresolved += 1
    return {"ledger": str(MEETING_LEDGER), "occurrenceCount": len(occurrences), "unresolvedCount": unresolved, "byStatus": counts}


def line_count(path: Path) -> int:
    try:
        return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
    except OSError:
        return 0


def build_snapshot(plan_date: str, current: datetime | None = None) -> dict[str, Any]:
    current = current or now()
    work = scan_records(PROJECT_KNOWLEDGE / "03 Projects", ACTIVE_PROJECT_STATES)
    personal = scan_records(PERSONAL_PROJECTS, ACTIVE_PROJECT_STATES, {"personal-project", "project"})
    decisions = scan_records(PROJECT_KNOWLEDGE / "05 Decisions", ACTIVE_DECISION_STATES)
    meeting = meeting_summary()
    manifests = source_manifests(current)
    local = [
        local_source("project-knowledge", "Project Knowledge", "work-portfolio", PROJECT_KNOWLEDGE / "03 Projects", len(work), f"{len(work)} active professional project records read recursively."),
        local_source("decision-ledger", "Decision Ledger", "decisions", PROJECT_KNOWLEDGE / "05 Decisions", len(decisions), f"{len(decisions)} active decision records read recursively."),
        local_source("personal-projects", "Personal Project Knowledge", "personal-portfolio", PERSONAL_PROJECTS, len(personal), f"{len(personal)} active private project records read recursively."),
        local_source("meeting-continuity", "Meeting Continuity", "meeting-continuity", MEETING_LEDGER, meeting["occurrenceCount"], f"{meeting['occurrenceCount']} meeting occurrences, {meeting['unresolvedCount']} unresolved."),
        local_source("activity-ledger", "Activity Ledger", "activity", ACTIVITY_ROOT, line_count(ACTIVITY_ROOT / f"{plan_date}.jsonl"), "Append-only local activity receipts."),
        local_source("monday-operations", "MONDAY Operations", "operations", OPERATIONS_ROOT, len(list(OPERATIONS_ROOT.glob("*.json"))) if OPERATIONS_ROOT.exists() else 0, "Inspectible pipeline receipts and open loops."),
    ]
    by_id = {item["sourceID"]: item for item in local}
    for item in manifests:
        by_id[item.get("sourceID", slug(item.get("name", "source")))] = item
    if not any(item.get("kind") == "calendar" for item in by_id.values()):
        by_id["outlook-calendar"] = {
            "schemaVersion": SOURCE_SCHEMA_VERSION,
            "sourceID": "outlook-calendar",
            "name": "Outlook Calendar plugin",
            "kind": "calendar",
            "status": "unknown",
            "attemptedAt": None,
            "succeededAt": None,
            "windowStart": plan_date,
            "windowEnd": plan_date,
            "itemCount": None,
            "processedCount": None,
            "unresolvedCount": None,
            "watermark": None,
            "freshnessHours": 12,
            "detail": "No Outlook Calendar plugin source manifest was published for this plan.",
            "error": "",
            "artifact": str(SOURCE_ROOT / "outlook-calendar.json"),
        }
    sources = list(by_id.values())
    schedule = calendar_schedule(plan_date, sources)
    severity = {"blocked": 7, "unavailable": 6, "unknown": 5, "stale": 4, "partial": 3, "empty": 1, "available": 0}
    overall = max((item.get("status", "unknown") for item in sources), key=lambda state: severity.get(state, 5), default="unknown")
    unresolved = [f"{item.get('name', item.get('sourceID'))}: {item.get('status')}" for item in sources if item.get("status") not in USABLE_SOURCE_STATES]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "date": plan_date,
        "generatedAt": iso(current),
        "timezone": str(TZ),
        "coverage": {"status": overall, "sources": sources, "unresolved": unresolved},
        "schedule": schedule,
        "workProjects": work,
        "personalProjects": personal,
        "decisions": decisions,
        "meetingContinuity": meeting,
        "activity": {"path": str(ACTIVITY_ROOT / f"{plan_date}.jsonl"), "recordCount": line_count(ACTIVITY_ROOT / f"{plan_date}.jsonl")},
        "operations": {"path": str(OPERATIONS_ROOT), "receiptCount": len(list(OPERATIONS_ROOT.glob("*.json"))) if OPERATIONS_ROOT.exists() else 0},
    }


def validated_analysis(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    payload = load_json(path)
    if not isinstance(payload, dict):
        raise SystemExit("Analysis input must be a JSON object.")
    allowed = {"primaryFocus", "priorities", "notes", "compass", "pullForwards", "risks"}
    return {key: payload[key] for key in allowed if key in payload}


def default_analysis(snapshot: dict[str, Any]) -> dict[str, Any]:
    work = snapshot["workProjects"]
    personal = snapshot["personalProjects"]
    decisions = snapshot["decisions"]
    attention = [item for item in work if item["status"] in ATTENTION_PROJECT_STATES]
    leading = (attention or work or personal)
    subject = leading[0]["title"] if leading else "the current operating picture"
    fixed = [f"Honor {item['time']}-{item['end']}: {item['title']}" for item in snapshot["schedule"][:2]]
    a = fixed[:2]
    if leading:
        next_action = leading[0]["nextAction"] or f"Clarify the next action and owner for {subject}"
        a.append(next_action)
    b = []
    for item in work[:4]:
        b.append(item["nextAction"] or f"Review current evidence and next move for {item['title']}")
    c = []
    for item in personal[:3]:
        c.append(item["nextAction"] or f"Clarify the next move for personal project {item['title']}")
    risks = list(snapshot["coverage"]["unresolved"])
    if snapshot["meetingContinuity"]["unresolvedCount"]:
        risks.append(f"Meeting Continuity has {snapshot['meetingContinuity']['unresolvedCount']} unresolved occurrences.")
    pulls = [item["nextAction"] or f"Clarify the next action and owner for {item['title']}" for item in work[:5]]
    pulls += [f"Review decision: {item['title']}" for item in decisions[:3]]
    return {
        "primaryFocus": f"Protect commitments and move {subject} forward with evidence",
        "priorities": {"a": a[:3], "b": b[:4], "c": c[:3]},
        "notes": ["Recommendations are evidence-labeled and require Chris's judgment."],
        "compass": [],
        "pullForwards": pulls,
        "risks": risks,
    }


def deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    result = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = {**result[key], **value}
        else:
            result[key] = value
    return result


def plan_payload(snapshot: dict[str, Any], analysis: dict[str, Any]) -> dict[str, Any]:
    recommendation = deep_merge(default_analysis(snapshot), analysis)
    current = parse_datetime(snapshot["generatedAt"]) or now()
    next_midnight = datetime.combine(current.date() + timedelta(days=1), time.min, TZ)
    plan_id = f"plan-{current.date().isoformat()}-{uuid.uuid4().hex[:12]}"
    compatible_sources = [
        {
            "kind": item.get("kind", "unknown"),
            "name": item.get("name", item.get("sourceID", "Unknown")),
            "status": item.get("status", "unknown"),
            "fetchedAt": item.get("succeededAt") or item.get("attemptedAt") or snapshot["generatedAt"],
            "attemptedAt": item.get("attemptedAt"),
            "succeededAt": item.get("succeededAt"),
            "itemCount": item.get("itemCount"),
            "processedCount": item.get("processedCount"),
            "unresolvedCount": item.get("unresolvedCount"),
            "detail": item.get("detail", ""),
            "error": item.get("error", ""),
        }
        for item in snapshot["coverage"]["sources"]
    ]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "planID": plan_id,
        "date": snapshot["date"],
        "generatedAt": snapshot["generatedAt"],
        "validUntil": iso(next_midnight),
        "timezone": snapshot["timezone"],
        "sources": compatible_sources,
        "coverage": {**snapshot["coverage"], "sources": compatible_sources},
        "primaryFocus": recommendation["primaryFocus"],
        "schedule": snapshot["schedule"],
        "priorities": recommendation["priorities"],
        "notes": recommendation["notes"] + (["Coverage limitations: " + "; ".join(recommendation["risks"])] if recommendation["risks"] else []),
        "compass": recommendation["compass"],
        "brief": {
            "mission": recommendation["primaryFocus"],
            "pullForwards": recommendation["pullForwards"],
            "risks": recommendation["risks"],
            "workPortfolio": snapshot["workProjects"],
            "personalPortfolio": snapshot["personalProjects"],
            "decisions": snapshot["decisions"],
            "meetingContinuity": snapshot["meetingContinuity"],
            "activityLedger": snapshot["activity"],
            "operations": snapshot["operations"],
            "sourceHealth": compatible_sources,
        },
        "publication": {"producer": "monday@personal", "contractVersion": SCHEMA_VERSION, "state": "published"},
    }


def activity_receipt(summary: str, source: str, evidence: str, artifacts: Iterable[str], limitations: Iterable[str], occurred_at: str | None = None, supersedes: str | None = None) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "id": f"activity-{uuid.uuid4().hex[:12]}",
        "occurredAt": occurred_at or iso(),
        "recordedAt": iso(),
        "classification": "authorized-monday-activity",
        "source": source,
        "summary": summary,
        "artifacts": list(artifacts),
        "evidenceClass": evidence,
        "limitations": list(limitations),
        "supersedes": supersedes,
        "coverageClaim": "observable-authorized-activity-only",
    }


def operation_receipt(operation: str, status: str, sources: list[dict[str, Any]], outputs: Iterable[str], limitations: Iterable[str], open_questions: Iterable[str]) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "id": f"operation-{uuid.uuid4().hex[:12]}",
        "operation": operation,
        "startedAt": iso(),
        "completedAt": iso(),
        "status": status,
        "sourceManifests": [{"name": item.get("name"), "status": item.get("status")} for item in sources],
        "outputs": list(outputs),
        "limitations": list(limitations),
        "decisions": [],
        "openQuestions": list(open_questions),
        "retryPath": "Refresh blocked, stale, partial, unavailable, or unknown sources, then rebuild and republish.",
    }


def command_stage_source(args: argparse.Namespace) -> None:
    if args.status not in VALID_SOURCE_STATES:
        raise SystemExit(f"Unsupported source status: {args.status}")
    succeeded = args.succeeded_at
    if args.status in USABLE_SOURCE_STATES and not succeeded:
        raise SystemExit("Available or empty sources require --succeeded-at.")
    if args.status == "empty" and args.item_count != 0:
        raise SystemExit("An empty source must have --item-count 0.")
    payload = {
        "schemaVersion": SOURCE_SCHEMA_VERSION,
        "sourceID": args.source_id,
        "name": args.name,
        "kind": args.kind,
        "status": args.status,
        "attemptedAt": args.attempted_at or iso(),
        "succeededAt": succeeded,
        "windowStart": args.window_start,
        "windowEnd": args.window_end,
        "itemCount": args.item_count,
        "processedCount": args.processed_count,
        "unresolvedCount": args.unresolved_count,
        "watermark": args.watermark,
        "freshnessHours": args.freshness_hours,
        "detail": args.detail,
        "error": args.error,
        "artifact": str(Path(args.artifact).expanduser().resolve()) if args.artifact else "",
    }
    if args.apply:
        atomic_json(manifest_path(args.source_id), payload)
    print(json.dumps(effective_manifest(payload), indent=2, sort_keys=True))


def command_source_status(_: argparse.Namespace) -> None:
    print(json.dumps({"generatedAt": iso(), "sources": source_manifests()}, indent=2, sort_keys=True))


def command_snapshot(args: argparse.Namespace) -> None:
    snapshot = build_snapshot(args.date or now().date().isoformat())
    if args.output:
        atomic_json(Path(args.output).expanduser(), snapshot)
    print(json.dumps(snapshot, indent=2, sort_keys=True))


def command_publish(args: argparse.Namespace) -> None:
    snapshot = build_snapshot(args.date or now().date().isoformat())
    plan = plan_payload(snapshot, validated_analysis(Path(args.analysis).expanduser() if args.analysis else None))
    if not args.apply:
        print(json.dumps(plan, indent=2, sort_keys=True))
        return
    atomic_json(PLAN_PATH, plan)
    activity = activity_receipt(
        args.activity_summary or f"Published MONDAY Command Brief {plan['planID']}.",
        "MONDAY Planning Pipeline",
        "verified",
        [str(PLAN_PATH)],
        plan["brief"]["risks"],
    )
    append_jsonl(ACTIVITY_ROOT / f"{plan['date']}.jsonl", activity)
    operation_status = "completed" if plan["coverage"]["status"] in USABLE_SOURCE_STATES else "partial"
    operation = operation_receipt(
        "planning-pipeline",
        operation_status,
        plan["sources"],
        [str(PLAN_PATH)],
        plan["brief"]["risks"],
        plan["coverage"]["unresolved"],
    )
    atomic_json(OPERATIONS_ROOT / f"{plan['date']}-{plan['planID']}.json", operation)
    print(json.dumps({"status": "published", "planID": plan["planID"], "path": str(PLAN_PATH), "coverage": plan["coverage"]["status"]}, indent=2))


def command_ack(args: argparse.Namespace) -> None:
    plan = load_json(PLAN_PATH, {})
    if plan.get("planID") != args.plan_id or plan.get("schemaVersion") != args.schema_version:
        raise SystemExit("Readback does not match the current plan identifier and schema version.")
    receipt = {
        "schemaVersion": 1,
        "planID": args.plan_id,
        "planSchemaVersion": args.schema_version,
        "consumer": args.consumer,
        "appVersion": args.app_version,
        "consumedAt": iso(),
        "state": "displayed",
    }
    if args.apply:
        atomic_json(READBACK_PATH, receipt)
    print(json.dumps(receipt, indent=2, sort_keys=True))


def command_status(_: argparse.Namespace) -> None:
    plan = load_json(PLAN_PATH, {})
    readback = load_json(READBACK_PATH, {})
    generated = parse_datetime(plan.get("generatedAt"))
    valid_until = parse_datetime(plan.get("validUntil"))
    current = now()
    current_date = current.date().isoformat()
    current_plan = bool(plan and plan.get("date") == current_date and valid_until and valid_until >= current)
    displayed = bool(current_plan and readback.get("planID") == plan.get("planID") and readback.get("planSchemaVersion") == plan.get("schemaVersion"))
    print(
        json.dumps(
            {
                "checkedAt": iso(current),
                "planExists": bool(plan),
                "planID": plan.get("planID"),
                "planDate": plan.get("date"),
                "generatedAt": iso(generated) if generated else None,
                "validUntil": iso(valid_until) if valid_until else None,
                "current": current_plan,
                "coverage": plan.get("coverage", {}).get("status"),
                "displayed": displayed,
                "readback": readback or None,
            },
            indent=2,
            sort_keys=True,
        )
    )


def command_record_activity(args: argparse.Namespace) -> None:
    receipt = activity_receipt(args.summary, args.source, args.evidence, args.artifact, args.limitation, args.occurred_at, args.supersedes)
    if args.apply:
        day = (parse_datetime(receipt["occurredAt"]) or now()).date().isoformat()
        append_jsonl(ACTIVITY_ROOT / f"{day}.jsonl", receipt)
    print(json.dumps(receipt, indent=2, sort_keys=True))


def command_record_operation(args: argparse.Namespace) -> None:
    receipt = operation_receipt(args.operation, args.status, source_manifests(), args.output, args.limitation, args.open_question)
    if args.apply:
        atomic_json(OPERATIONS_ROOT / f"{now().date().isoformat()}-{receipt['id']}.json", receipt)
    print(json.dumps(receipt, indent=2, sort_keys=True))


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)

    stage = commands.add_parser("stage-source", help="Validate and optionally persist a source manifest")
    stage.add_argument("--source-id", required=True)
    stage.add_argument("--name", required=True)
    stage.add_argument("--kind", required=True)
    stage.add_argument("--status", required=True)
    stage.add_argument("--attempted-at")
    stage.add_argument("--succeeded-at")
    stage.add_argument("--window-start")
    stage.add_argument("--window-end")
    stage.add_argument("--item-count", type=int)
    stage.add_argument("--processed-count", type=int)
    stage.add_argument("--unresolved-count", type=int)
    stage.add_argument("--watermark")
    stage.add_argument("--freshness-hours", type=int, default=24)
    stage.add_argument("--detail", default="")
    stage.add_argument("--error", default="")
    stage.add_argument("--artifact")
    stage.add_argument("--apply", action="store_true")
    stage.set_defaults(function=command_stage_source)

    source_status = commands.add_parser("source-status", help="Inspect staged source manifests")
    source_status.set_defaults(function=command_source_status)

    snapshot = commands.add_parser("snapshot", help="Build a read-only evidence snapshot")
    snapshot.add_argument("--date")
    snapshot.add_argument("--output")
    snapshot.set_defaults(function=command_snapshot)

    publish = commands.add_parser("publish", help="Build and optionally publish a Command Brief")
    publish.add_argument("--date")
    publish.add_argument("--analysis")
    publish.add_argument("--activity-summary", default="")
    publish.add_argument("--apply", action="store_true")
    publish.set_defaults(function=command_publish)

    ack = commands.add_parser("ack", help="Validate and optionally write native app readback")
    ack.add_argument("--plan-id", required=True)
    ack.add_argument("--schema-version", type=int, required=True)
    ack.add_argument("--consumer", required=True)
    ack.add_argument("--app-version", required=True)
    ack.add_argument("--apply", action="store_true")
    ack.set_defaults(function=command_ack)

    status = commands.add_parser("status", help="Inspect plan freshness and native readback")
    status.set_defaults(function=command_status)

    activity = commands.add_parser("record-activity", help="Append a bounded activity receipt")
    activity.add_argument("--summary", required=True)
    activity.add_argument("--source", required=True)
    activity.add_argument("--evidence", choices=["observed", "reported", "verified", "inferred", "unknown"], required=True)
    activity.add_argument("--artifact", action="append", default=[])
    activity.add_argument("--limitation", action="append", default=[])
    activity.add_argument("--occurred-at")
    activity.add_argument("--supersedes")
    activity.add_argument("--apply", action="store_true")
    activity.set_defaults(function=command_record_activity)

    operation = commands.add_parser("record-operation", help="Write an operations receipt")
    operation.add_argument("--operation", required=True)
    operation.add_argument("--status", choices=["proposed", "running", "completed", "partial", "blocked", "failed"], required=True)
    operation.add_argument("--output", action="append", default=[])
    operation.add_argument("--limitation", action="append", default=[])
    operation.add_argument("--open-question", action="append", default=[])
    operation.add_argument("--apply", action="store_true")
    operation.set_defaults(function=command_record_operation)
    return root


def main() -> None:
    args = parser().parse_args()
    args.function(args)


if __name__ == "__main__":
    main()
