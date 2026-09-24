#!/usr/bin/env python3
"""MONDAY's local source registry, planning pipeline, receipts, and Command Center contract."""

from __future__ import annotations

import argparse
import hashlib
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
SNAPSHOT_PATH = PLANNER_ROOT / "planning-snapshot.json"
RUN_MANIFEST_PATH = PLANNER_ROOT / "planning-run.json"
PLAN_SOURCE_MANIFEST_PATH = PLANNER_ROOT / "plan-source-manifest.json"
PLANNING_CONTEXT = Path(os.environ.get("MONDAY_PLANNING_CONTEXT", PLANNER_ROOT / "planning-context.json"))
ACTIVITY_ROOT = MONDAY_KNOWLEDGE / "100 Activity Ledger"
OPERATIONS_ROOT = MONDAY_KNOWLEDGE / "400 MONDAY Operations" / "Receipts"
MEETING_LEDGER = PROJECT_KNOWLEDGE / "04 Portfolio/Meeting Continuity/meeting-continuity-ledger.json"

VALID_SOURCE_STATES = {"available", "partial", "empty", "stale", "blocked", "unavailable", "unknown"}
USABLE_SOURCE_STATES = {"available", "empty"}
ACTIVE_PROJECT_STATES = {"active", "in-progress", "at-risk", "blocked", "watch"}
ATTENTION_PROJECT_STATES = {"at-risk", "blocked", "intervention"}
ACTIVE_DECISION_STATES = {"active", "pending", "blocked", "open"}
FRONT_MATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.DOTALL)
DATED_LINE = re.compile(r"(?m)^\s*(?:[-*]\s*)?(?:#{1,6}\s*)?(20\d{2}-\d{2}-\d{2})\b")
OPEN_TASK = re.compile(r"(?m)^\s*[-*]\s*\[ \]\s+(.+?)\s*$")
OPEN_TASK_LINE = re.compile(r"^\s*[-*]\s*\[ \]\s+(.+?)\s*$")
DUE_TAG = re.compile(r"\[due:\s*(20\d{2}-\d{2}-\d{2})\]", re.IGNORECASE)
REQUIRED_EXTERNAL_SOURCES = (
    ("outlook-calendar", "Outlook Calendar plugin", "calendar", 12),
    ("outlook-email", "Outlook Email plugin", "email", 24),
    ("onedrive-files", "Business OneDrive via SharePoint plugin", "onedrive-files", 24),
    ("teams", "Microsoft Teams plugin", "teams", 24),
    ("sharepoint-files", "SharePoint plugin", "sharepoint-files", 24),
)
SOURCE_SEVERITY = {"blocked": 7, "unavailable": 6, "unknown": 5, "stale": 4, "partial": 3, "empty": 1, "available": 0}


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


def parse_date(value: str | None) -> date | None:
    if not value or value == "unknown":
        return None
    try:
        return date.fromisoformat(value[:10])
    except (ValueError, TypeError):
        parsed = parse_datetime(value)
        return parsed.date() if parsed else None


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


def read_record_body(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    match = FRONT_MATTER.match(text)
    return text[match.end():] if match else text


def record_history(path: Path, metadata: dict[str, str], plan_day: date) -> dict[str, Any]:
    body = read_record_body(path)
    dated = [parse_date(value) for value in DATED_LINE.findall(body)]
    dated = [value for value in dated if value is not None and value <= plan_day]
    metadata_date = parse_date(metadata.get("last_evidence_review") or metadata.get("updated"))
    candidates = dated + ([metadata_date] if metadata_date and metadata_date <= plan_day else [])
    last_evidence = max(candidates) if candidates else None
    unique_dates = sorted(set(dated))
    gaps = [(right - left).days for left, right in zip(unique_dates, unique_dates[1:])]
    open_tasks: list[dict[str, Any]] = []
    current_section_date: date | None = None
    for line in body.splitlines():
        dated_line = DATED_LINE.search(line)
        if dated_line:
            parsed_line_date = parse_date(dated_line.group(1))
            if parsed_line_date and parsed_line_date <= plan_day:
                current_section_date = parsed_line_date
        task_match = OPEN_TASK_LINE.match(line)
        if not task_match:
            continue
        raw_summary = re.sub(r"\s+", " ", task_match.group(1)).strip()
        due_match = DUE_TAG.search(raw_summary)
        due = parse_date(due_match.group(1)) if due_match else None
        summary = DUE_TAG.sub("", raw_summary).strip()
        open_tasks.append({"summary": summary, "recordedAt": current_section_date.isoformat() if current_section_date else None, "dueDate": due.isoformat() if due else None})
    return {
        "historyEntryCount": len(dated),
        "historyLast14Days": sum(1 for value in dated if (plan_day - value).days <= 14),
        "historyLast30Days": sum(1 for value in dated if (plan_day - value).days <= 30),
        "historySpanDays": (unique_dates[-1] - unique_dates[0]).days if len(unique_dates) > 1 else 0,
        "averageEvidenceCadenceDays": round(sum(gaps) / len(gaps), 1) if gaps else None,
        "openCommitmentCount": len(open_tasks),
        "openCommitments": open_tasks[:20],
        "lastEvidenceAt": last_evidence.isoformat() if last_evidence else None,
        "daysSinceEvidence": (plan_day - last_evidence).days if last_evidence else None,
    }


def scan_records(root: Path, states: set[str], types: set[str] | None = None, plan_day: date | None = None, domain: str = "professional") -> list[dict[str, Any]]:
    if not root.is_dir():
        return []
    records: list[dict[str, Any]] = []
    plan_day = plan_day or now().date()
    for path in sorted(root.rglob("*.md")):
        if path.name == "README.md" or any(part.startswith(".") for part in path.relative_to(root).parts):
            continue
        metadata = parse_front_matter(path)
        status = metadata.get("status", "unknown").lower()
        record_type = metadata.get("type", "").lower()
        if status not in states or (types and record_type not in types):
            continue
        history = record_history(path, metadata, plan_day)
        records.append(
            {
                "id": metadata.get("id") or slug(str(path.relative_to(root).with_suffix(""))),
                "title": record_title(path, metadata),
                "status": status,
                "domain": domain,
                "outcome": metadata.get("outcome", ""),
                "nextAction": metadata.get("next_action") or metadata.get("next-action") or "",
                "owner": metadata.get("owner", "unknown"),
                "updated": metadata.get("updated") or metadata.get("last_evidence_review") or "unknown",
                "reviewDate": metadata.get("review_date") or metadata.get("review-date") or "",
                "dueDate": metadata.get("due_date") or metadata.get("due-date") or metadata.get("target_date") or "",
                "priority": metadata.get("priority", ""),
                "consequence": metadata.get("consequence") or metadata.get("consequence_of_delay") or "",
                "role": metadata.get("role", ""),
                "goal": metadata.get("goal", ""),
                "estimatedEffortHours": float(metadata["effort_hours"]) if metadata.get("effort_hours", "").replace(".", "", 1).isdigit() else None,
                "todayEffortHours": float(metadata["today_effort_hours"]) if metadata.get("today_effort_hours", "").replace(".", "", 1).isdigit() else None,
                "effortDate": metadata.get("effort_date") or "",
                "evidenceStatus": metadata.get("evidence_status", "unknown"),
                "path": str(path),
                **history,
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
    artifact = str(result.get("artifact") or "")
    item_count = result.get("itemCount")
    processed_count = result.get("processedCount")
    unresolved_count = result.get("unresolvedCount")
    denominator_valid = all(isinstance(value, int) and value >= 0 for value in (item_count, processed_count, unresolved_count))
    if denominator_valid and (processed_count > item_count or unresolved_count > item_count):
        denominator_valid = False
    if state == "available" and denominator_valid and (processed_count != item_count or unresolved_count != 0):
        state = "partial"
        result["detail"] = "The latest collection is partial because not every eligible item was processed or unresolvedCount is nonzero."
    if state == "empty" and denominator_valid and (item_count != 0 or processed_count != 0 or unresolved_count != 0):
        state = "unknown"
        result["detail"] = "An empty source requires all denominators to be zero."
    if state in USABLE_SOURCE_STATES:
        if succeeded is None:
            state = "unknown"
            result["detail"] = "A usable state requires a successful collection timestamp."
        elif not denominator_valid:
            state = "unknown"
            result["detail"] = "A usable state requires valid item, processed, and unresolved denominators."
        elif state == "empty" and item_count != 0:
            state = "unknown"
            result["detail"] = "An empty source must have an item count of zero."
        elif not artifact or not Path(artifact).exists():
            state = "unavailable"
            result["detail"] = "The normalized source artifact is missing."
            result["error"] = f"Missing normalized artifact: {artifact or '(not declared)'}"
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
    result["denominatorValid"] = denominator_valid
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


def local_source(
    source_id: str,
    name: str,
    kind: str,
    path: Path,
    item_count: int,
    processed_count: int,
    unresolved_count: int,
    detail: str,
    current: datetime,
    error: str = "",
) -> dict[str, Any]:
    if not path.exists():
        status = "unavailable"
    elif unresolved_count:
        status = "partial"
    elif item_count == 0:
        status = "empty"
    else:
        status = "available"
    return {
        "schemaVersion": SOURCE_SCHEMA_VERSION,
        "sourceID": source_id,
        "name": name,
        "kind": kind,
        "status": status,
        "attemptedAt": iso(current),
        "succeededAt": iso(current) if status in USABLE_SOURCE_STATES else None,
        "windowStart": None,
        "windowEnd": None,
        "itemCount": item_count if path.exists() else None,
        "processedCount": processed_count if path.exists() else None,
        "unresolvedCount": unresolved_count if path.exists() else None,
        "watermark": None,
        "freshnessHours": 168,
        "detail": detail,
        "error": error if path.exists() else f"Missing local path: {path}",
        "artifact": str(path),
    }


def markdown_inventory(root: Path) -> dict[str, int]:
    if not root.is_dir():
        return {"itemCount": 0, "processedCount": 0, "unresolvedCount": 0}
    paths = [path for path in root.rglob("*.md") if path.name != "README.md" and not any(part.startswith(".") for part in path.relative_to(root).parts)]
    processed = sum(1 for path in paths if parse_front_matter(path))
    return {"itemCount": len(paths), "processedCount": processed, "unresolvedCount": len(paths) - processed}


def json_directory_inventory(root: Path) -> dict[str, int]:
    if not root.is_dir():
        return {"itemCount": 0, "processedCount": 0, "unresolvedCount": 0}
    paths = list(root.glob("*.json"))
    processed = sum(1 for path in paths if isinstance(load_json(path), dict))
    return {"itemCount": len(paths), "processedCount": processed, "unresolvedCount": len(paths) - processed}


def jsonl_inventory(path: Path) -> dict[str, int]:
    if not path.exists():
        return {"itemCount": 0, "processedCount": 0, "unresolvedCount": 0}
    total = processed = 0
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return {"itemCount": 1, "processedCount": 0, "unresolvedCount": 1}
    for line in lines:
        if not line.strip():
            continue
        total += 1
        try:
            processed += isinstance(json.loads(line), dict)
        except json.JSONDecodeError:
            pass
    return {"itemCount": total, "processedCount": processed, "unresolvedCount": total - processed}


def unknown_source(source_id: str, name: str, kind: str, plan_date: str, freshness_hours: int) -> dict[str, Any]:
    return {
        "schemaVersion": SOURCE_SCHEMA_VERSION,
        "sourceID": source_id,
        "name": name,
        "kind": kind,
        "status": "unknown",
        "attemptedAt": None,
        "succeededAt": None,
        "windowStart": plan_date if kind == "calendar" else None,
        "windowEnd": plan_date if kind == "calendar" else None,
        "itemCount": None,
        "processedCount": None,
        "unresolvedCount": None,
        "watermark": None,
        "freshnessHours": freshness_hours,
        "detail": f"No bounded {name} source manifest was published for this planning run.",
        "error": "",
        "artifact": str(SOURCE_ROOT / f"{source_id}.json"),
        "denominatorValid": False,
    }


def calendar_schedule(plan_date: str, manifests: list[dict[str, Any]]) -> list[dict[str, str]]:
    calendar_manifest = next((item for item in manifests if item.get("sourceID") == "outlook-calendar"), None)
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
            result.append({"time": start, "end": end, "title": title, "isAllDay": bool(item.get("isAllDay", False))})
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
    project_updates = 0
    project_impacts = 0
    writeback_gaps = 0
    verified_writeback_gaps = 0
    readback_verified = 0
    readback_gaps = 0
    verified_readback_gaps = 0
    recovered_project_markers = 0
    eligible = 0
    for item in occurrences:
        if not isinstance(item, dict):
            continue
        status = str(item.get("continuity_state") or item.get("status") or item.get("routing_disposition") or item.get("disposition") or "unknown")
        counts[status] = counts.get(status, 0) + 1
        if item.get("excluded", False):
            continue
        eligible += 1
        if status != "reconciliation_verified":
            unresolved += 1
        disposition = str(item.get("routing_disposition") or "")
        receipts = item.get("project_updates") or item.get("project_update_receipts") or item.get("projectUpdateReceipts") or []
        if isinstance(receipts, list):
            project_updates += len(receipts)
        elif item.get("project_update_receipt") or item.get("projectUpdateReceipt"):
            project_updates += 1
        receipt_count = len(receipts) if isinstance(receipts, list) else int(bool(receipts))
        if receipt_count == 0 and disposition == "project_updated":
            marker_prefix = f"<!-- meeting-continuity:{item.get('stable_meeting_key')}:"
            marker = f"{marker_prefix}{item.get('last_run_id')} -->" if item.get("last_run_id") else None
            project_names = item.get("projects") if isinstance(item.get("projects"), list) else []
            for project_name in project_names:
                candidates = [PROJECT_KNOWLEDGE / "03 Projects" / f"{project_name}.md"]
                project_root = PROJECT_KNOWLEDGE / "03 Projects"
                if project_root.is_dir():
                    candidates.extend(path for path in project_root.glob("*.md") if path.stem.casefold() == str(project_name).casefold())
                for candidate in dict.fromkeys(candidates):
                    try:
                        project_text = candidate.read_text(encoding="utf-8")
                        if (marker and marker in project_text) or (not marker and marker_prefix in project_text):
                            receipt_count += 1
                            project_updates += 1
                            readback_verified += 1
                            recovered_project_markers += 1
                            break
                    except OSError:
                        continue
        if isinstance(receipts, list):
            for receipt in receipts:
                if not isinstance(receipt, dict):
                    readback_gaps += 1
                    continue
                verified = False
                project_path = receipt.get("project_path")
                run_id = receipt.get("continuity_run_id")
                meeting_key = item.get("stable_meeting_key")
                if not verified and project_path and run_id and meeting_key:
                    target = PROJECT_KNOWLEDGE / str(project_path)
                    try:
                        verified = f"<!-- meeting-continuity:{meeting_key}:{run_id} -->" in target.read_text(encoding="utf-8")
                    except OSError:
                        verified = False
                if verified:
                    readback_verified += 1
                else:
                    readback_gaps += 1
                    if status == "reconciliation_verified":
                        verified_readback_gaps += 1
        if disposition in {"project_updated", "project_update_required", "material_project_impact"}:
            project_impacts += 1
            if receipt_count == 0:
                writeback_gaps += 1
                if status == "reconciliation_verified":
                    verified_writeback_gaps += 1
    return {
        "ledger": str(MEETING_LEDGER),
        "occurrenceCount": len(occurrences),
        "eligibleCount": eligible,
        "unresolvedCount": unresolved,
        "projectUpdateReceiptCount": project_updates,
        "projectImpactCount": project_impacts,
        "writebackGapCount": writeback_gaps,
        "verifiedWritebackGapCount": verified_writeback_gaps,
        "projectUpdateReadbackVerifiedCount": readback_verified,
        "projectUpdateReadbackGapCount": readback_gaps,
        "verifiedReadbackGapCount": verified_readback_gaps,
        "recoveredProjectMarkerCount": recovered_project_markers,
        "byStatus": counts,
    }


def line_count(path: Path) -> int:
    try:
        return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
    except OSError:
        return 0


def planning_context(plan_date: str, current: datetime) -> tuple[dict[str, Any], dict[str, Any]]:
    payload = load_json(PLANNING_CONTEXT)
    valid = False
    validation_error = ""
    if isinstance(payload, dict):
        try:
            payload = validate_planning_context(payload)
            valid = True
        except SystemExit as error:
            validation_error = str(error)
    if valid:
        context = {
            "schemaVersion": int(payload.get("schemaVersion", 1)),
            "updatedAt": payload.get("updatedAt"),
            "roles": payload.get("roles", []),
            "goals": payload.get("goals", []),
            "constraints": payload.get("constraints", []),
            "capacity": payload.get("capacity") if isinstance(payload.get("capacity"), dict) else None,
        }
        status = "available" if any(context[key] for key in ("roles", "goals", "constraints")) or context["capacity"] else "empty"
        source = local_source(
            "planning-context",
            "Approved roles, goals, constraints, and capacity",
            "planning-context",
            PLANNING_CONTEXT,
            sum(len(context[key]) for key in ("roles", "goals", "constraints")) + (1 if context["capacity"] else 0),
            sum(len(context[key]) for key in ("roles", "goals", "constraints")) + (1 if context["capacity"] else 0),
            0,
            "Approved planning context was parsed from its dedicated local record.",
            current,
        )
        source["status"] = status
        source["succeededAt"] = iso(current)
        return context, source
    context = {"schemaVersion": 1, "updatedAt": None, "roles": [], "goals": [], "constraints": [], "capacity": None}
    source = local_source(
        "planning-context",
        "Approved roles, goals, constraints, and capacity",
        "planning-context",
        PLANNING_CONTEXT,
        1 if PLANNING_CONTEXT.exists() else 0,
        0,
        1 if PLANNING_CONTEXT.exists() else 0,
        "No valid approved planning context is available; roles, goals, constraints, and capacity remain unknown.",
        current,
        validation_error or ("Invalid planning context JSON." if PLANNING_CONTEXT.exists() else ""),
    )
    if not PLANNING_CONTEXT.exists():
        source["status"] = "unknown"
        source["attemptedAt"] = iso(current)
        source["error"] = "No approved planning context has been created."
    return context, source


def validate_planning_context(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise SystemExit("Planning context must be a schemaVersion 1 JSON object.")
    updated = parse_datetime(payload.get("updatedAt"))
    if updated is None:
        raise SystemExit("Planning context requires a timezone-aware updatedAt timestamp.")
    for key in ("roles", "goals", "constraints"):
        if not isinstance(payload.get(key), list):
            raise SystemExit(f"Planning context {key} must be an array.")
        for item in payload[key]:
            if not isinstance(item, dict) or not item.get("id") or not (item.get("title") or item.get("name")):
                raise SystemExit(f"Every planning context {key} entry requires id and title/name.")
    role_ids = {str(item["id"]) for item in payload["roles"]}
    goal_ids = {str(item["id"]) for item in payload["goals"]}
    if len(role_ids) != len(payload["roles"]) or len(goal_ids) != len(payload["goals"]):
        raise SystemExit("Planning context role and goal identifiers must be unique.")
    for goal in payload["goals"]:
        if goal.get("roleID") and str(goal["roleID"]) not in role_ids:
            raise SystemExit(f"Goal {goal['id']} references unknown roleID {goal['roleID']}.")
    capacity = payload.get("capacity")
    if capacity is not None and not isinstance(capacity, dict):
        raise SystemExit("Planning context capacity must be an object or null.")
    if isinstance(capacity, dict):
        numeric = [capacity.get(key) for key in ("availableHours", "dailyHours", "focusHours") if capacity.get(key) is not None]
        if any(not isinstance(value, (int, float)) or value < 0 for value in numeric):
            raise SystemExit("Capacity hour values must be non-negative numbers.")
        if not numeric and not (capacity.get("workdayStart") and capacity.get("workdayEnd")):
            raise SystemExit("Capacity requires availableHours, dailyHours, focusHours, or a workday window.")
        planned_work = capacity.get("plannedWork", [])
        if not isinstance(planned_work, list):
            raise SystemExit("capacity.plannedWork must be an array when provided.")
        for item in planned_work:
            if not isinstance(item, dict) or not item.get("projectID") or not isinstance(item.get("hours"), (int, float)) or item["hours"] < 0:
                raise SystemExit("Every capacity.plannedWork item requires projectID and non-negative hours.")
            if item.get("date") and not parse_date(str(item["date"])):
                raise SystemExit("capacity.plannedWork dates must use YYYY-MM-DD.")
    return {
        "schemaVersion": 1,
        "updatedAt": iso(updated),
        "roles": payload["roles"],
        "goals": payload["goals"],
        "constraints": payload["constraints"],
        "capacity": capacity,
    }


def activity_summary(path: Path, plan_day: date) -> dict[str, Any]:
    receipts: list[dict[str, Any]] = []
    by_source: dict[str, int] = {}
    by_evidence: dict[str, int] = {}
    limitation_count = 0
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        lines = []
    for line in lines:
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict):
            continue
        occurred = parse_datetime(payload.get("occurredAt"))
        if occurred and occurred.date() != plan_day:
            continue
        source = str(payload.get("source", "unknown"))
        evidence = str(payload.get("evidenceClass", "unknown"))
        by_source[source] = by_source.get(source, 0) + 1
        by_evidence[evidence] = by_evidence.get(evidence, 0) + 1
        limitations = payload.get("limitations", []) if isinstance(payload.get("limitations"), list) else []
        limitation_count += len(limitations)
        receipts.append({"id": payload.get("id"), "occurredAt": payload.get("occurredAt"), "source": source, "summary": payload.get("summary", ""), "evidenceClass": evidence, "limitationCount": len(limitations), "artifacts": payload.get("artifacts", []) if isinstance(payload.get("artifacts"), list) else []})
    return {"path": str(path), "recordCount": len(receipts), "bySource": by_source, "byEvidenceClass": by_evidence, "limitationCount": limitation_count, "recentReceipts": receipts[-20:]}


def external_evidence_summary(sources: list[dict[str, Any]]) -> dict[str, Any]:
    signals: list[dict[str, Any]] = []
    by_project: dict[str, list[dict[str, Any]]] = {}
    by_source: dict[str, int] = {}
    unassigned = 0
    for source in sources:
        source_id = source.get("sourceID")
        if source_id not in {"outlook-email", "onedrive-files", "teams", "sharepoint-files"} or source.get("status") not in USABLE_SOURCE_STATES:
            continue
        artifact = load_json(Path(source.get("artifact", ""))) if source.get("artifact") else None
        if not isinstance(artifact, dict):
            continue
        items = artifact.get("items")
        if not isinstance(items, list):
            items = artifact.get("signals") if isinstance(artifact.get("signals"), list) else artifact.get("files") if isinstance(artifact.get("files"), list) else []
        for item in items:
            if not isinstance(item, dict):
                continue
            projects = item.get("projectIDs") if isinstance(item.get("projectIDs"), list) else []
            signal = {
                "sourceID": source_id,
                "occurredAt": item.get("occurredAt") or item.get("observedAt") or item.get("modifiedAt"),
                "safeSummary": item.get("safeSummary") or item.get("safeName") or "Normalized evidence signal",
                "projectIDs": projects,
                "evidenceClass": item.get("evidenceClass", "unknown"),
                "signalType": item.get("signalType", "file-evidence" if source_id in {"onedrive-files", "sharepoint-files"} else "evidence"),
                "sourceLocator": item.get("sourceLocator"),
            }
            signals.append(signal)
            by_source[source_id] = by_source.get(source_id, 0) + 1
            if not projects:
                unassigned += 1
            for project_id in projects:
                by_project.setdefault(project_id, []).append(signal)
    return {"signalCount": len(signals), "bySource": by_source, "unassignedCount": unassigned, "byProject": by_project, "signals": signals[:100]}


def operations_summary(plan_day: date, lookback_days: int = 14) -> dict[str, Any]:
    inventory = json_directory_inventory(OPERATIONS_ROOT)
    statuses: dict[str, int] = {}
    open_questions = limitations = 0
    latest: list[dict[str, Any]] = []
    superseded: set[str] = set()
    candidates: list[tuple[Path, dict[str, Any], date]] = []
    if OPERATIONS_ROOT.is_dir():
        for path in sorted(OPERATIONS_ROOT.glob("*.json"), key=lambda value: value.stat().st_mtime, reverse=True):
            payload = load_json(path)
            if not isinstance(payload, dict):
                continue
            completed = parse_datetime(payload.get("completedAt"))
            receipt_day = completed.date() if completed else datetime.fromtimestamp(path.stat().st_mtime, TZ).date()
            if receipt_day > plan_day or (plan_day - receipt_day).days > lookback_days:
                continue
            candidates.append((path, payload, receipt_day))
            supersedes = payload.get("supersedes") or payload.get("supersedesReceiptID")
            if isinstance(supersedes, str) and supersedes:
                superseded.add(supersedes)
        for path, payload, receipt_day in candidates:
            receipt_id = str(payload.get("id") or path.stem)
            if receipt_id in superseded:
                continue
            status = str(payload.get("status", "unknown"))
            statuses[status] = statuses.get(status, 0) + 1
            open_questions += len(payload.get("openQuestions", [])) if isinstance(payload.get("openQuestions"), list) else 0
            limitations += len(payload.get("limitations", [])) if isinstance(payload.get("limitations"), list) else 0
            if len(latest) < 10:
                latest.append(
                    {
                        "id": payload.get("id") or path.stem,
                        "operation": payload.get("operation", "unknown"),
                        "status": status,
                        "completedAt": payload.get("completedAt"),
                        "openQuestionCount": len(payload.get("openQuestions", [])) if isinstance(payload.get("openQuestions"), list) else 0,
                        "limitationCount": len(payload.get("limitations", [])) if isinstance(payload.get("limitations"), list) else 0,
                        "path": str(path),
                        "receiptDate": receipt_day.isoformat(),
                    }
                )
    return {
        "path": str(OPERATIONS_ROOT),
        "receiptCount": inventory["itemCount"],
        "activeWindowReceiptCount": sum(statuses.values()),
        "lookbackDays": lookback_days,
        "supersededCount": len(superseded),
        "processedCount": inventory["processedCount"],
        "unresolvedCount": inventory["unresolvedCount"],
        "byStatus": statuses,
        "openQuestionCount": open_questions,
        "limitationCount": limitations,
        "recentReceipts": latest,
    }


def build_snapshot(plan_date: str, current: datetime | None = None) -> dict[str, Any]:
    current = current or now()
    plan_day = parse_date(plan_date)
    if plan_day is None:
        raise SystemExit(f"Invalid planning date: {plan_date}")
    project_root = PROJECT_KNOWLEDGE / "03 Projects"
    decision_root = PROJECT_KNOWLEDGE / "05 Decisions"
    work = scan_records(project_root, ACTIVE_PROJECT_STATES, {"project"}, plan_day, "professional")
    personal = scan_records(PERSONAL_PROJECTS, ACTIVE_PROJECT_STATES, {"personal-project", "project"}, plan_day, "personal")
    decisions = scan_records(decision_root, ACTIVE_DECISION_STATES, plan_day=plan_day, domain="professional")
    meeting = meeting_summary()
    context, context_source = planning_context(plan_date, current)
    operations = operations_summary(plan_day)
    activity_path = ACTIVITY_ROOT / f"{plan_date}.jsonl"
    project_inventory = markdown_inventory(project_root)
    decision_inventory = markdown_inventory(decision_root)
    personal_inventory = markdown_inventory(PERSONAL_PROJECTS)
    activity_inventory = jsonl_inventory(activity_path)
    operation_inventory = json_directory_inventory(OPERATIONS_ROOT)
    manifests = source_manifests(current)
    local = [
        local_source("project-knowledge", "Project Knowledge", "work-portfolio", project_root, project_inventory["itemCount"], project_inventory["processedCount"], project_inventory["unresolvedCount"], f"{project_inventory['itemCount']} professional records inspected; {len(work)} are in active planning states.", current),
        local_source("decision-ledger", "Decision Ledger", "decisions", decision_root, decision_inventory["itemCount"], decision_inventory["processedCount"], decision_inventory["unresolvedCount"], f"{decision_inventory['itemCount']} decision records inspected; {len(decisions)} remain active or unresolved.", current),
        local_source("personal-projects", "Personal Project Knowledge", "personal-portfolio", PERSONAL_PROJECTS, personal_inventory["itemCount"], personal_inventory["processedCount"], personal_inventory["unresolvedCount"], f"{personal_inventory['itemCount']} private project records inspected; {len(personal)} are in active planning states.", current),
        local_source("meeting-continuity", "Meeting Continuity", "meeting-continuity", MEETING_LEDGER, meeting["occurrenceCount"], meeting["occurrenceCount"] - meeting["unresolvedCount"], meeting["unresolvedCount"], f"{meeting['occurrenceCount']} governed occurrences; {meeting['unresolvedCount']} are not reconciliation-verified.", current),
        local_source("activity-ledger", "Activity Ledger", "activity", ACTIVITY_ROOT, activity_inventory["itemCount"], activity_inventory["processedCount"], activity_inventory["unresolvedCount"], f"{activity_inventory['itemCount']} activity receipts inspected for {plan_date}.", current),
        local_source("monday-operations", "MONDAY Operations", "operations", OPERATIONS_ROOT, operation_inventory["itemCount"], operation_inventory["processedCount"], operation_inventory["unresolvedCount"], f"{operation_inventory['itemCount']} operations receipts inspected; {operations['openQuestionCount']} open questions are recorded.", current),
        context_source,
    ]
    by_id = {item.get("sourceID", slug(item.get("name", "source"))): item for item in manifests}
    for item in manifests:
        by_id[item.get("sourceID", slug(item.get("name", "source")))] = item
    for source_id, name, kind, freshness in REQUIRED_EXTERNAL_SOURCES:
        by_id.setdefault(source_id, unknown_source(source_id, name, kind, plan_date, freshness))
    for item in local:
        by_id[item["sourceID"]] = effective_manifest(item, current) if item["status"] in USABLE_SOURCE_STATES else item
    calendar_source = by_id.get("outlook-calendar")
    if calendar_source and calendar_source.get("status") in USABLE_SOURCE_STATES:
        artifact = load_json(Path(calendar_source.get("artifact", ""))) if calendar_source.get("artifact") else None
        artifact_date = artifact.get("date") if isinstance(artifact, dict) else None
        if artifact_date != plan_date:
            calendar_source["status"] = "stale"
            calendar_source["coverageMismatch"] = "calendar-window-mismatch"
            calendar_source["detail"] = f"Calendar artifact covers {artifact_date!r}, not planning date {plan_date}; its schedule was excluded."
    sources = list(by_id.values())
    schedule = calendar_schedule(plan_date, sources)
    external_evidence = external_evidence_summary(sources)
    activity = activity_summary(activity_path, plan_day)
    overall = max((item.get("status", "unknown") for item in sources), key=lambda state: SOURCE_SEVERITY.get(state, 5), default="unknown")
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
        "activity": {**activity, "unresolvedCount": activity_inventory["unresolvedCount"]},
        "operations": operations,
        "planningContext": context,
        "externalEvidence": external_evidence,
    }


def validation_check(check_id: str, status: str, detail: str, evidence: Any = None) -> dict[str, Any]:
    return {"id": check_id, "status": status, "detail": detail, "evidence": evidence}


def validate_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    contradictions: list[dict[str, Any]] = []
    sources = snapshot["coverage"]["sources"]
    by_id = {item.get("sourceID"): item for item in sources}
    required_ids = [item[0] for item in REQUIRED_EXTERNAL_SOURCES]
    missing_ids = [source_id for source_id in required_ids if source_id not in by_id]
    usable_ids = [source_id for source_id in required_ids if by_id.get(source_id, {}).get("status") in USABLE_SOURCE_STATES]
    checks.append(validation_check("tier1-source-registry", "PASS" if not missing_ids else "FAIL", "Every Tier 1 lane must remain explicit.", {"required": required_ids, "missing": missing_ids}))

    invalid_denominators = []
    for item in sources:
        if item.get("status") in USABLE_SOURCE_STATES and not item.get("denominatorValid", True):
            invalid_denominators.append(item.get("sourceID"))
        count = item.get("itemCount")
        processed = item.get("processedCount")
        unresolved = item.get("unresolvedCount")
        if all(isinstance(value, int) for value in (count, processed, unresolved)) and (processed > count or unresolved > count):
            invalid_denominators.append(item.get("sourceID"))
    checks.append(validation_check("source-denominators", "PASS" if not invalid_denominators else "FAIL", "Usable sources require coherent denominators.", sorted(set(invalid_denominators))))

    calendar = by_id.get("outlook-calendar", {})
    artifact_payload = load_json(Path(calendar.get("artifact", ""))) if calendar.get("artifact") else None
    calendar_date = artifact_payload.get("date") if isinstance(artifact_payload, dict) else None
    calendar_mismatch = calendar.get("coverageMismatch") == "calendar-window-mismatch" or (calendar.get("status") in USABLE_SOURCE_STATES and calendar_date != snapshot["date"])
    if snapshot["schedule"] and calendar.get("status") not in USABLE_SOURCE_STATES:
        contradictions.append({"id": "schedule-without-calendar-evidence", "severity": "critical", "detail": "A schedule exists without a usable current-day Calendar source."})
    checks.append(validation_check("calendar-day-boundary", "CONDITION" if calendar_mismatch else "PASS", "Calendar evidence must match the exact local plan day; a mismatch is excluded rather than reused.", {"planDate": snapshot["date"], "artifactDate": calendar_date}))

    work_ids = [item["id"] for item in snapshot["workProjects"]]
    personal_ids = [item["id"] for item in snapshot["personalProjects"]]
    overlaps = sorted(set(work_ids).intersection(personal_ids))
    if overlaps:
        contradictions.append({"id": "domain-boundary-collision", "severity": "critical", "detail": f"Professional and personal project identifiers overlap: {', '.join(overlaps)}"})
    duplicates = sorted({item for item in work_ids if work_ids.count(item) > 1} | {item for item in personal_ids if personal_ids.count(item) > 1})
    if duplicates:
        contradictions.append({"id": "duplicate-project-identifier", "severity": "critical", "detail": f"Duplicate project identifiers: {', '.join(duplicates)}"})
    checks.append(validation_check("domain-boundaries", "PASS" if not overlaps else "FAIL", "Professional and personal project records must remain disjoint.", {"overlaps": overlaps}))

    meeting = snapshot["meetingContinuity"]
    if meeting.get("verifiedWritebackGapCount", 0):
        contradictions.append({"id": "meeting-project-writeback-gap", "code": "meeting-project-writeback-gap", "severity": "critical", "detail": f"{meeting['verifiedWritebackGapCount']} meetings claim reconciliation verification despite lacking a required project-update receipt."})
    if meeting.get("verifiedReadbackGapCount", 0):
        contradictions.append({"id": "meeting-project-readback-gap", "code": "meeting-project-readback-gap", "severity": "critical", "detail": f"{meeting['verifiedReadbackGapCount']} meetings claim reconciliation verification despite missing project-record readback."})
    checks.append(validation_check("meeting-project-writeback", "FAIL" if meeting.get("verifiedWritebackGapCount", 0) or meeting.get("verifiedReadbackGapCount", 0) else ("CONDITION" if meeting.get("unresolvedCount", 0) or meeting.get("writebackGapCount", 0) or meeting.get("projectUpdateReadbackGapCount", 0) else "PASS"), "Material meeting impacts require governed project writeback and verified project-record readback.", meeting))

    stale_projects = [item["id"] for item in snapshot["workProjects"] if item.get("daysSinceEvidence") is None or item.get("daysSinceEvidence", 0) > 30]
    checks.append(validation_check("project-evidence-freshness", "CONDITION" if stale_projects else "PASS", "Active professional projects need recent evidence or an explicit stale-evidence challenge.", stale_projects))
    future_evidence = []
    plan_day = parse_date(snapshot["date"]) or now().date()
    for item in snapshot["workProjects"] + snapshot["personalProjects"] + snapshot["decisions"]:
        updated = parse_date(item.get("updated"))
        if updated and updated > plan_day:
            future_evidence.append(item["id"])
            contradictions.append({"id": "future-evidence-date", "code": "future-evidence-date", "severity": "high", "detail": f"{item['title']} records future evidence date {updated.isoformat()}."})
    checks.append(validation_check("future-evidence-date", "CONDITION" if future_evidence else "PASS", "Evidence dates cannot establish current posture when they are later than the plan date.", future_evidence))
    missing_context = by_id.get("planning-context", {}).get("status") not in USABLE_SOURCE_STATES
    checks.append(validation_check("approved-planning-context", "CONDITION" if missing_context else "PASS", "Roles, goals, constraints, and capacity must come from an approved record.", by_id.get("planning-context", {}).get("status")))

    critical = [item for item in contradictions if item["severity"] == "critical"]
    conditions = [item for item in checks if item["status"] == "CONDITION"]
    nonusable = [item.get("sourceID") for item in sources if item.get("status") not in USABLE_SOURCE_STATES]
    status = "FAIL" if critical or any(item["status"] == "FAIL" for item in checks) else ("PASS WITH CONDITIONS" if conditions or nonusable else "PASS")
    issues = []
    if calendar_mismatch:
        issues.append({"code": "calendar-window-mismatch", "severity": "high", "detail": f"Calendar evidence is for {calendar_date!r}, not {snapshot['date']}."})
    issues.extend({"code": item.get("code") or item["id"], "severity": item["severity"], "detail": item["detail"]} for item in contradictions)
    issues.extend({"code": item["id"], "severity": "medium", "detail": item["detail"]} for item in conditions)
    return {
        "status": status,
        "checks": checks,
        "contradictions": contradictions,
        "issues": issues,
        "sourceCoverage": {
            "requiredTier1Count": len(required_ids),
            "usableTier1Count": len(usable_ids),
            "usableTier1Sources": usable_ids,
            "nonusableSources": nonusable,
        },
    }


def clock_minutes(value: str | None, plan_date: str) -> int | None:
    if not value:
        return None
    parsed = parse_datetime(value)
    if parsed:
        return parsed.hour * 60 + parsed.minute
    try:
        parsed_time = time.fromisoformat(value[:5])
        return parsed_time.hour * 60 + parsed_time.minute
    except ValueError:
        return None


def capacity_analysis(snapshot: dict[str, Any]) -> dict[str, Any]:
    capacity = snapshot["planningContext"].get("capacity")
    if not isinstance(capacity, dict):
        return {
            "status": "unknown",
            "availableHours": None,
            "scheduledHours": None,
            "plannedEffortHours": None,
            "overcommitted": None,
            "detail": "No approved capacity record is available; MONDAY will not infer sustainable capacity.",
        }
    start = clock_minutes(str(capacity.get("workdayStart") or ""), snapshot["date"])
    end = clock_minutes(str(capacity.get("workdayEnd") or ""), snapshot["date"])
    daily_hours = capacity.get("dailyHours")
    explicit_available = capacity.get("availableHours")
    if isinstance(explicit_available, (int, float)) and explicit_available >= 0:
        gross = float(explicit_available)
        available_is_net = True
    elif start is not None and end is not None and end > start:
        gross = (end - start) / 60
        available_is_net = False
    elif isinstance(daily_hours, (int, float)) and daily_hours >= 0:
        gross = float(daily_hours)
        available_is_net = False
    else:
        return {
            "status": "invalid",
            "availableHours": None,
            "scheduledHours": None,
            "plannedEffortHours": None,
            "overcommitted": None,
            "detail": "The approved capacity record lacks a valid workday window or dailyHours value.",
        }
    scheduled_minutes = 0
    for item in snapshot["schedule"]:
        item_start = clock_minutes(item.get("time"), snapshot["date"])
        item_end = clock_minutes(item.get("end"), snapshot["date"])
        if item_start is not None and item_end is not None and item_end > item_start:
            scheduled_minutes += item_end - item_start
    scheduled = scheduled_minutes / 60
    available = gross if available_is_net else max(0.0, gross - scheduled)
    focus_limit = capacity.get("focusHours")
    if isinstance(focus_limit, (int, float)) and focus_limit >= 0:
        available = min(available, float(focus_limit))
    planned_items: list[dict[str, Any]] = []
    context_items = capacity.get("plannedWork") if isinstance(capacity.get("plannedWork"), list) else []
    for item in context_items:
        if isinstance(item, dict) and (not item.get("date") or item.get("date") == snapshot["date"]):
            planned_items.append(item)
    for item in snapshot["workProjects"] + snapshot["personalProjects"]:
        if item.get("effortDate") == snapshot["date"]:
            planned_items.append({"projectID": item["id"], "hours": item.get("todayEffortHours"), "date": item.get("effortDate"), "source": item.get("path")})
    efforts = [item.get("hours") for item in planned_items]
    known_efforts = [float(value) for value in efforts if isinstance(value, (int, float)) and value >= 0]
    planned = sum(known_efforts) if known_efforts else None
    return {
        "status": "available",
        "workdayHours": round(gross, 2) if not available_is_net else None,
        "scheduledHours": round(scheduled, 2),
        "availableHours": round(available, 2),
        "plannedEffortHours": round(planned, 2) if planned is not None else None,
        "overcommitted": planned > available if planned is not None else None,
        "plannedItemCount": len(planned_items),
        "unestimatedPlannedItemCount": len(efforts) - len(known_efforts),
        "detail": "Capacity uses only the approved capacity record, explicitly dated daily work, and current-day normalized Calendar evidence; general project estimates are not treated as today's load.",
    }


def project_posture(item: dict[str, Any], plan_day: date) -> dict[str, Any]:
    score = {"blocked": 50, "at-risk": 45, "intervention": 45, "watch": 30, "active": 20, "in-progress": 20}.get(item["status"], 10)
    findings: list[str] = []
    days = item.get("daysSinceEvidence")
    if days is None:
        score += 20
        findings.append("No dated evidence review is recorded.")
    elif days > 30:
        score += min(25, days // 7)
        findings.append(f"Evidence is {days} days old.")
    if not item.get("nextAction"):
        score += 15
        findings.append("No next action is recorded.")
    if not item.get("owner") or item.get("owner") == "unknown":
        score += 15
        findings.append("No owner is recorded.")
    due = parse_date(item.get("dueDate"))
    if due and due < plan_day:
        score += 25
        findings.append(f"Recorded due date passed {(plan_day - due).days} days ago.")
    elif due and due == plan_day:
        score += 20
        findings.append("Recorded due date is today.")
    if item.get("openCommitmentCount", 0):
        score += min(15, item["openCommitmentCount"] * 3)
        findings.append(f"{item['openCommitmentCount']} open checklist commitments were found in project history.")
    return {
        "projectID": item["id"],
        "title": item["title"],
        "domain": item["domain"],
        "status": item["status"],
        "attentionScore": score,
        "owner": item.get("owner"),
        "nextAction": item.get("nextAction"),
        "outcome": item.get("outcome"),
        "roleID": item.get("role") or None,
        "goalID": item.get("goal") or None,
        "consequence": item.get("consequence") or "Consequence of delay is not recorded.",
        "dueDate": item.get("dueDate") or None,
        "lastEvidenceAt": item.get("lastEvidenceAt"),
        "daysSinceEvidence": days,
        "staleEvidence": days is None or days > 30,
        "historyEntryCount": item.get("historyEntryCount", 0),
        "historyLast14Days": item.get("historyLast14Days", 0),
        "historyLast30Days": item.get("historyLast30Days", 0),
        "historySpanDays": item.get("historySpanDays", 0),
        "averageEvidenceCadenceDays": item.get("averageEvidenceCadenceDays"),
        "openCommitmentCount": item.get("openCommitmentCount", 0),
        "evidenceClass": item.get("evidenceStatus", "unknown"),
        "findings": findings,
        "evidence": item.get("path"),
    }


def analyze_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    plan_day = parse_date(snapshot["date"]) or now().date()
    work_posture = sorted((project_posture(item, plan_day) for item in snapshot["workProjects"]), key=lambda item: (-item["attentionScore"], item["title"]))
    personal_posture = sorted((project_posture(item, plan_day) for item in snapshot["personalProjects"]), key=lambda item: (-item["attentionScore"], item["title"]))
    role_ids = {str(item.get("id")) for item in snapshot["planningContext"]["roles"] if isinstance(item, dict) and item.get("id")}
    goals = {str(item.get("id")): item for item in snapshot["planningContext"]["goals"] if isinstance(item, dict) and item.get("id")}
    signals_by_project = snapshot["externalEvidence"].get("byProject", {})
    constraints = snapshot["planningContext"]["constraints"]
    for posture in work_posture + personal_posture:
        role_id = posture.get("roleID")
        goal_id = posture.get("goalID")
        posture["roleLinked"] = bool(role_id and role_id in role_ids)
        posture["goalLinked"] = bool(goal_id and goal_id in goals)
        posture["alignment"] = "aligned" if posture["roleLinked"] and posture["goalLinked"] else "unlinked" if role_id or goal_id else "unknown"
        project_signals = signals_by_project.get(posture["projectID"], [])
        posture["externalSignalCount"] = len(project_signals)
        posture["externalSources"] = sorted({item.get("sourceID") for item in project_signals if item.get("sourceID")})
        dated_signals = [item.get("occurredAt") for item in project_signals if parse_datetime(item.get("occurredAt"))]
        posture["latestExternalSignalAt"] = max(dated_signals, key=lambda value: parse_datetime(value)) if dated_signals else None
        if project_signals:
            posture["attentionScore"] += min(10, len(project_signals) * 2)
            posture["findings"].append(f"{len(project_signals)} normalized connected-source signals require current planning attention.")
        effects = []
        for constraint in constraints:
            if not isinstance(constraint, dict) or posture["projectID"] not in (constraint.get("projectIDs") or []):
                continue
            effect = constraint.get("effect")
            if effect == "block": posture["attentionScore"] += 30
            elif effect == "protect": posture["attentionScore"] += 15
            elif effect == "defer": posture["attentionScore"] -= 20
            effects.append({"constraintID": constraint.get("id"), "effect": effect or "inform"})
        posture["constraintEffects"] = effects
        goal = goals.get(str(goal_id)) if goal_id else None
        if isinstance(goal, dict) and goal.get("priority") in {"critical", "high", 1}:
            posture["attentionScore"] += 10
    work_posture.sort(key=lambda item: (-item["attentionScore"], item["title"]))
    personal_posture.sort(key=lambda item: (-item["attentionScore"], item["title"]))
    commitments = []
    for item in snapshot["workProjects"] + snapshot["personalProjects"]:
        for commitment in item.get("openCommitments", []):
            if isinstance(commitment, dict):
                summary = commitment.get("summary", "")
                recorded = parse_date(commitment.get("recordedAt"))
                due = parse_date(commitment.get("dueDate"))
            else:
                summary = str(commitment)
                recorded = None
                due = None
            commitments.append(
                {
                    "projectID": item["id"],
                    "domain": item["domain"],
                    "summary": summary,
                    "owner": item.get("owner"),
                    "ageDays": (plan_day - recorded).days if recorded else None,
                    "dueDate": due.isoformat() if due else None,
                    "overdue": bool(due and due < plan_day),
                    "consequence": item.get("consequence") or "unknown",
                    "evidence": item.get("path"),
                    "evidenceClass": item.get("evidenceStatus", "unknown"),
                    "ageBasis": recorded.isoformat() if recorded else None,
                }
            )
    decisions = []
    for item in snapshot["decisions"]:
        review = parse_date(item.get("reviewDate"))
        decisions.append(
            {
                "decisionID": item["id"],
                "title": item["title"],
                "status": item["status"],
                "owner": item.get("owner"),
                "reviewDate": item.get("reviewDate") or None,
                "reviewOverdue": bool(review and review < plan_day),
                "ageDays": item.get("daysSinceEvidence"),
                "consequence": item.get("consequence") or "Consequence of delay is not recorded.",
                "evidence": item.get("path"),
                "evidenceClass": item.get("evidenceStatus", "unknown"),
            }
        )
    capacity = capacity_analysis(snapshot)
    leading = (work_posture or personal_posture)
    subject = leading[0] if leading else None
    pull_forwards = []
    for posture in work_posture + personal_posture:
        action = posture.get("nextAction") or f"Record the next action and owner for {posture['title']}"
        pull_forwards.append(
            {
                "projectID": posture["projectID"],
                "domain": posture["domain"],
                "action": action,
                "reason": "; ".join(posture["findings"][:2]) or f"Project is {posture['status']}.",
                "consequence": posture["consequence"],
                "attentionScore": posture["attentionScore"],
                "evidence": posture["evidence"],
                "evidenceClass": posture["evidenceClass"],
            }
        )
    for decision in sorted(decisions, key=lambda item: (not item["reviewOverdue"], -(item["ageDays"] or 0))):
        pull_forwards.append(
            {
                "decisionID": decision["decisionID"],
                "domain": "professional",
                "action": f"Review unresolved decision: {decision['title']}",
                "reason": "Review date is overdue." if decision["reviewOverdue"] else "Decision remains active or unresolved.",
                "consequence": decision["consequence"],
                "attentionScore": 40 if decision["reviewOverdue"] else 20,
                "evidence": decision["evidence"],
                "evidenceClass": decision["evidenceClass"],
            }
        )
    pull_forwards.sort(key=lambda item: (-item["attentionScore"], item["action"]))
    consequences = []
    for posture in work_posture + personal_posture:
        if posture["consequence"] != "Consequence of delay is not recorded.":
            consequences.append({"projectID": posture["projectID"], "domain": posture["domain"], "consequence": posture["consequence"], "evidence": posture["evidence"], "evidenceClass": posture["evidenceClass"]})
    for decision in decisions:
        if decision["consequence"] != "Consequence of delay is not recorded.":
            consequences.append({"decisionID": decision["decisionID"], "domain": "professional", "consequence": decision["consequence"], "evidence": decision["evidence"], "evidenceClass": decision["evidenceClass"]})
    return {
        "primaryFocus": f"Protect commitments and move {subject['title']} forward with evidence" if subject else "Establish a trustworthy operating picture before adding commitments",
        "projectPosture": work_posture + personal_posture,
        "projectPostureByDomain": {"professional": work_posture, "personal": personal_posture},
        "commitments": commitments,
        "decisions": decisions,
        "consequences": consequences,
        "capacity": capacity,
        "planningContext": snapshot["planningContext"],
        "roles": snapshot["planningContext"]["roles"],
        "goals": snapshot["planningContext"]["goals"],
        "constraints": snapshot["planningContext"]["constraints"],
        "operations": snapshot["operations"],
        "activityLedger": snapshot["activity"],
        "externalEvidence": snapshot["externalEvidence"],
        "meetingContinuity": snapshot["meetingContinuity"],
        "pullForwards": pull_forwards[:12],
    }


def challenge_analysis(snapshot: dict[str, Any], validation: dict[str, Any], analysis: dict[str, Any]) -> list[dict[str, Any]]:
    challenges: list[dict[str, Any]] = []
    for source in snapshot["coverage"]["sources"]:
        if source.get("status") not in USABLE_SOURCE_STATES:
            challenges.append({"type": "source-coverage", "severity": "high" if source.get("kind") == "calendar" else "medium", "title": f"{source.get('name')} is {source.get('status')}", "detail": source.get("detail") or source.get("error") or "Coverage is not usable.", "evidence": source.get("artifact")})
    for posture in analysis["projectPosture"]:
        if posture["daysSinceEvidence"] is None or posture["daysSinceEvidence"] > 30:
            challenges.append({"type": "stale-project-evidence", "severity": "high" if posture["domain"] == "professional" else "medium", "title": f"Refresh evidence for {posture['title']}", "detail": posture["findings"][0] if posture["findings"] else "Evidence freshness is unknown.", "evidence": posture["evidence"]})
        if not posture.get("owner") or posture.get("owner") == "unknown":
            challenges.append({"type": "missing-owner", "severity": "high", "title": f"Assign an owner for {posture['title']}", "detail": "A current project without an owner cannot support reliable commitment stewardship.", "evidence": posture["evidence"]})
        if not posture.get("nextAction"):
            challenges.append({"type": "missing-next-action", "severity": "high", "title": f"Define the next action for {posture['title']}", "detail": "The project has no concrete recorded next move.", "evidence": posture["evidence"]})
        if posture["consequence"] == "Consequence of delay is not recorded.":
            challenges.append({"type": "missing-consequence", "severity": "medium", "title": f"Record delay consequence for {posture['title']}", "detail": posture["consequence"], "evidence": posture["evidence"]})
        if posture.get("alignment") == "unlinked":
            challenges.append({"type": "unlinked-planning-context", "severity": "medium", "title": f"Repair role or goal linkage for {posture['title']}", "detail": f"Recorded role {posture.get('roleID')!r} or goal {posture.get('goalID')!r} is not present in the approved planning context.", "evidence": posture["evidence"]})
    for decision in analysis["decisions"]:
        if decision["reviewOverdue"]:
            challenges.append({"type": "unresolved-decision", "severity": "high", "title": f"Review overdue decision: {decision['title']}", "detail": f"Review date {decision['reviewDate']} has passed.", "evidence": decision["evidence"]})
    if snapshot["operations"].get("openQuestionCount") or snapshot["operations"].get("byStatus", {}).get("failed") or snapshot["operations"].get("byStatus", {}).get("blocked"):
        challenges.append({"type": "operations-open-loop", "severity": "high", "title": "Resolve MONDAY Operations open loops", "detail": f"{snapshot['operations'].get('openQuestionCount', 0)} open questions; {snapshot['operations'].get('byStatus', {}).get('failed', 0)} failed and {snapshot['operations'].get('byStatus', {}).get('blocked', 0)} blocked receipts.", "evidence": str(OPERATIONS_ROOT)})
    meeting = snapshot["meetingContinuity"]
    if meeting.get("unresolvedCount") or meeting.get("writebackGapCount"):
        challenges.append({"type": "meeting-continuity-unresolved", "severity": "high", "title": "Complete Meeting Continuity reconciliation", "detail": f"{meeting.get('unresolvedCount', 0)} occurrences remain unresolved and {meeting.get('writebackGapCount', 0)} material impacts lack writeback evidence.", "evidence": meeting.get("ledger")})
    known_projects = {item["projectID"] for item in analysis["projectPosture"]}
    signaled_projects = set(snapshot["externalEvidence"].get("byProject", {}))
    unmatched = sorted(signaled_projects - known_projects)
    if unmatched:
        challenges.append({"type": "unreconciled-external-evidence", "severity": "high", "title": "Route connected-source signals to authoritative projects", "detail": f"Normalized evidence references unknown project identifiers: {', '.join(unmatched)}.", "evidence": str(SOURCE_ROOT)})
    if snapshot["externalEvidence"].get("unassignedCount"):
        challenges.append({"type": "unassigned-external-evidence", "severity": "medium", "title": "Review unassigned connected-source signals", "detail": f"{snapshot['externalEvidence']['unassignedCount']} normalized signals do not yet identify a project.", "evidence": str(SOURCE_ROOT)})
    if snapshot["activity"].get("limitationCount"):
        challenges.append({"type": "activity-ledger-limitations", "severity": "medium", "title": "Review Activity Ledger limitations", "detail": f"Current-day activity receipts contain {snapshot['activity']['limitationCount']} recorded limitations.", "evidence": snapshot["activity"].get("path")})
    capacity = analysis["capacity"]
    if capacity.get("overcommitted") is True:
        challenges.append({"type": "overcommitment", "severity": "critical", "title": "Recorded work exceeds approved available capacity", "detail": f"{capacity['plannedEffortHours']} planned hours exceed {capacity['availableHours']} available hours.", "evidence": str(PLANNING_CONTEXT)})
    elif capacity.get("status") != "available":
        challenges.append({"type": "capacity-unknown", "severity": "high", "title": "Capacity cannot be reconciled", "detail": capacity["detail"], "evidence": str(PLANNING_CONTEXT)})
    elif capacity.get("plannedEffortHours") is None or capacity.get("unestimatedPlannedItemCount"):
        challenges.append({"type": "effort-unknown", "severity": "medium", "title": "Today's planned work lacks complete effort evidence", "detail": f"{capacity.get('unestimatedPlannedItemCount', 0)} explicitly planned items lack approved daily effort; general project estimates are not treated as today's load.", "evidence": str(PLANNING_CONTEXT)})
    for contradiction in validation["contradictions"]:
        challenges.append({"type": contradiction.get("code") or contradiction["id"], "category": "contradiction", "severity": contradiction["severity"], "title": contradiction["id"].replace("-", " ").title(), "detail": contradiction["detail"], "evidence": None})
    challenges.sort(key=lambda item: ({"critical": 0, "high": 1, "medium": 2, "low": 3}.get(item["severity"], 4), item["title"]))
    return challenges


def quality_gate(snapshot: dict[str, Any], validation: dict[str, Any], analysis: dict[str, Any], challenges: list[dict[str, Any]]) -> dict[str, Any]:
    checks = [
        {"id": "request-scope", "status": "PASS", "detail": "The run contains Collect, Validate, Analyze, Challenge, Quality, Publish, and Readback stages."},
        {"id": "source-authority", "status": "FAIL" if validation["status"] == "FAIL" else ("CONDITION" if validation["sourceCoverage"]["nonusableSources"] else "PASS"), "detail": "Every source retains status, scope, denominator, artifact, and error state."},
        {"id": "domain-boundaries", "status": "FAIL" if any(item["id"] == "domain-boundary-collision" for item in validation["contradictions"]) else "PASS", "detail": "Professional and personal records remain separate."},
        {"id": "meeting-writeback", "status": "FAIL" if snapshot["meetingContinuity"].get("verifiedWritebackGapCount") or snapshot["meetingContinuity"].get("verifiedReadbackGapCount") else ("CONDITION" if snapshot["meetingContinuity"].get("writebackGapCount") or snapshot["meetingContinuity"].get("projectUpdateReadbackGapCount") or snapshot["meetingContinuity"].get("unresolvedCount") else "PASS"), "detail": "Meeting Continuity remains conditional until every eligible occurrence is reconciled and every material impact has a verified project-update receipt and project-record readback."},
        {"id": "capacity-consequence", "status": "CONDITION" if analysis["capacity"].get("status") != "available" or any(item["type"] == "missing-consequence" for item in challenges) else "PASS", "detail": "Capacity and consequences are analyzed only from recorded evidence."},
        {"id": "journal-boundaries", "status": "PASS", "detail": "The pipeline write set excludes Captain's Log and Research Chronicle."},
        {"id": "publication-readback", "status": "CONDITION", "detail": "Publication may proceed after QA; display remains unverified until matching native-app readback."},
    ]
    if any(item["status"] == "FAIL" for item in checks):
        verdict = "FAIL"
    elif any(item["status"] == "CONDITION" for item in checks):
        verdict = "PASS WITH CONDITIONS"
    else:
        verdict = "PASS"
    return {
        "capability": "monday-thermo-quality-assurance",
        "verdict": verdict,
        "checkedAt": snapshot["generatedAt"],
        "checks": checks,
        "conditions": [item["detail"] for item in checks if item["status"] == "CONDITION"],
        "writeSet": [str(PLAN_PATH), str(SNAPSHOT_PATH), str(RUN_MANIFEST_PATH), str(PLAN_SOURCE_MANIFEST_PATH), str(ACTIVITY_ROOT), str(OPERATIONS_ROOT)],
    }


def validated_analysis(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    payload = load_json(path)
    if not isinstance(payload, dict):
        raise SystemExit("Analysis input must be a JSON object.")
    allowed = {"primaryFocus", "priorities", "notes", "compass", "pullForwards", "risks"}
    return {key: payload[key] for key in allowed if key in payload}


def default_analysis(snapshot: dict[str, Any], analysis: dict[str, Any], challenges: list[dict[str, Any]]) -> dict[str, Any]:
    professional = [item for item in analysis["pullForwards"] if item.get("domain") == "professional"]
    personal = [item for item in analysis["pullForwards"] if item.get("domain") == "personal"]
    compass: list[str] = []
    for role in analysis["roles"][:4]:
        if isinstance(role, dict):
            label = role.get("title") or role.get("name") or role.get("role")
            goal = role.get("goal")
            if label:
                compass.append(f"{label}: {goal}" if goal else str(label))
        elif isinstance(role, str):
            compass.append(role)
    risks = [item["title"] for item in challenges[:12]]
    return {
        "primaryFocus": analysis["primaryFocus"],
        "priorities": {
            "a": [item["action"] for item in professional[:3]],
            "b": [item["action"] for item in professional[3:7]],
            "c": [item["action"] for item in personal[:3]],
        },
        "notes": ["Recommendations are evidence-bound and require Chris's judgment; missing evidence remains visible."],
        "compass": compass,
        "pullForwards": [item["action"] for item in analysis["pullForwards"]],
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


def plan_payload(
    snapshot: dict[str, Any],
    analysis: dict[str, Any],
    validation: dict[str, Any],
    challenges: list[dict[str, Any]],
    quality: dict[str, Any],
    overlay: dict[str, Any] | None = None,
    publication_state: str = "proposed",
) -> dict[str, Any]:
    recommendation = deep_merge(default_analysis(snapshot, analysis, challenges), overlay or {})
    current = parse_datetime(snapshot["generatedAt"]) or now()
    plan_day = parse_date(snapshot["date"]) or current.date()
    next_midnight = datetime.combine(plan_day + timedelta(days=1), time.min, TZ)
    plan_id = f"plan-{plan_day.isoformat()}-{uuid.uuid4().hex[:12]}"
    compatible_sources = [
        {
            "sourceID": item.get("sourceID"),
            "kind": item.get("kind", "unknown"),
            "name": item.get("name", item.get("sourceID", "Unknown")),
            "status": item.get("status", "unknown"),
            "fetchedAt": item.get("succeededAt") or item.get("attemptedAt") or snapshot["generatedAt"],
            "attemptedAt": item.get("attemptedAt"),
            "succeededAt": item.get("succeededAt"),
            "itemCount": item.get("itemCount"),
            "processedCount": item.get("processedCount"),
            "unresolvedCount": item.get("unresolvedCount"),
            "denominatorComplete": item.get("denominatorComplete", item.get("denominatorValid")),
            "windowStart": item.get("windowStart"),
            "windowEnd": item.get("windowEnd"),
            "scope": item.get("scope"),
            "watermark": item.get("watermark"),
            "artifact": item.get("artifact", ""),
            "latestAttempt": item.get("latestAttempt"),
            "lastSuccess": item.get("lastSuccess"),
            "limitations": item.get("limitations", []),
            "manifestID": hashlib.sha256(json.dumps(item, sort_keys=True).encode("utf-8")).hexdigest()[:16],
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
            "analysis": analysis,
            "validation": validation,
            "challenges": challenges,
        },
        "qualityAssurance": quality,
        "planningRun": {"manifest": str(RUN_MANIFEST_PATH), "sourceManifest": str(PLAN_SOURCE_MANIFEST_PATH), "snapshot": str(SNAPSHOT_PATH)},
        "publication": {"producer": "monday@personal", "contractVersion": SCHEMA_VERSION, "state": publication_state},
    }


def stage_record(stage: str, status: str, started_at: str, completed_at: str, evidence: Iterable[str], detail: str = "") -> dict[str, Any]:
    return {"name": stage, "status": status, "startedAt": started_at, "completedAt": completed_at, "evidence": list(evidence), "detail": detail}


def pipeline_artifacts(plan: dict[str, Any], snapshot: dict[str, Any], validation: dict[str, Any], analysis: dict[str, Any], challenges: list[dict[str, Any]], quality: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    run_id = f"planning-run-{uuid.uuid4().hex[:12]}"
    generated = snapshot["generatedAt"]
    source_manifest = {
        "schemaVersion": 1,
        "manifestID": f"plan-sources-{uuid.uuid4().hex[:12]}",
        "runID": run_id,
        "planID": plan["planID"],
        "date": plan["date"],
        "generatedAt": generated,
        "sources": plan["sources"],
        "coverage": validation["sourceCoverage"],
    }
    stages = [
        stage_record("collect", "completed", generated, generated, [str(SNAPSHOT_PATH)], f"Collected {len(snapshot['coverage']['sources'])} explicit source lanes."),
        stage_record("validate", "failed" if validation["status"] == "FAIL" else "completed", generated, generated, [str(SNAPSHOT_PATH), str(PLAN_SOURCE_MANIFEST_PATH)], validation["status"]),
        stage_record("analyze", "completed", generated, generated, [str(SNAPSHOT_PATH)], f"Analyzed {len(analysis['projectPostureByDomain']['professional'])} professional and {len(analysis['projectPostureByDomain']['personal'])} personal projects."),
        stage_record("challenge", "completed", generated, generated, [str(SNAPSHOT_PATH)], f"Raised {len(challenges)} evidence-bound challenges."),
        stage_record("quality", "failed" if quality["verdict"] == "FAIL" else "completed", generated, generated, [str(SNAPSHOT_PATH)], quality["verdict"]),
        stage_record("publish", "blocked" if quality["verdict"] == "FAIL" else "pending", generated, generated, [str(PLAN_PATH)], "Publication occurs only after a non-FAIL quality verdict."),
        stage_record("readback", "pending", generated, generated, [str(READBACK_PATH)], "Matching plan identifier and schema are required."),
    ]
    run = {
        "schemaVersion": 1,
        "runID": run_id,
        "planID": plan["planID"],
        "planSchemaVersion": plan["schemaVersion"],
        "planDate": plan["date"],
        "startedAt": generated,
        "completedAt": generated,
        "status": "blocked" if quality["verdict"] == "FAIL" else "ready-to-publish",
        "qualityVerdict": quality["verdict"],
        "qualityAssurance": quality,
        "stages": stages,
        "artifacts": {"snapshot": str(SNAPSHOT_PATH), "sourceManifest": str(PLAN_SOURCE_MANIFEST_PATH), "plan": str(PLAN_PATH), "readback": str(READBACK_PATH)},
        "journalWrites": {"captainsLog": False, "researchChronicle": False},
    }
    return source_manifest, run


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


def file_digest(path: Path) -> str | None:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def successful_state(payload: dict[str, Any]) -> dict[str, Any] | None:
    if isinstance(payload.get("lastSuccess"), dict):
        return dict(payload["lastSuccess"])
    if payload.get("status") in USABLE_SOURCE_STATES and payload.get("succeededAt"):
        return {
            "succeededAt": payload.get("succeededAt"),
            "windowStart": payload.get("windowStart"),
            "windowEnd": payload.get("windowEnd"),
            "itemCount": payload.get("itemCount"),
            "processedCount": payload.get("processedCount"),
            "unresolvedCount": payload.get("unresolvedCount"),
            "watermark": payload.get("watermark"),
            "artifact": payload.get("artifact"),
            "artifactSHA256": payload.get("artifactSHA256") or (file_digest(Path(payload["artifact"])) if payload.get("artifact") else None),
            "collectionID": payload.get("collectionID"),
        }
    return None


def validate_counts(status: str, item_count: int | None, processed_count: int | None, unresolved_count: int | None) -> None:
    if not all(isinstance(value, int) and value >= 0 for value in (item_count, processed_count, unresolved_count)):
        raise SystemExit("Every collection requires non-negative item, processed, and unresolved counts.")
    if processed_count > item_count or unresolved_count > item_count:
        raise SystemExit("Processed and unresolved counts cannot exceed the item denominator.")
    if status == "available" and (processed_count != item_count or unresolved_count != 0):
        raise SystemExit("An available source requires every eligible item processed and zero unresolved items.")
    if status == "empty" and (item_count != 0 or processed_count != 0 or unresolved_count != 0):
        raise SystemExit("An empty source requires all counts to be zero.")
    if status == "partial" and unresolved_count == 0 and processed_count == item_count:
        raise SystemExit("A partial source requires unresolved work or an incomplete denominator.")


def merge_attempt(previous: dict[str, Any], attempt: dict[str, Any], success: bool) -> dict[str, Any]:
    last_success = successful_state(previous)
    result = dict(attempt)
    result["latestAttempt"] = {
        "collectionID": attempt.get("collectionID"),
        "status": attempt.get("status"),
        "attemptedAt": attempt.get("attemptedAt"),
        "completedAt": attempt.get("completedAt"),
        "windowStart": attempt.get("windowStart"),
        "windowEnd": attempt.get("windowEnd"),
        "scope": attempt.get("scope"),
        "route": attempt.get("route"),
        "itemCount": attempt.get("itemCount"),
        "processedCount": attempt.get("processedCount"),
        "unresolvedCount": attempt.get("unresolvedCount"),
        "denominatorComplete": attempt.get("denominatorComplete"),
        "watermarkBasis": attempt.get("watermarkBasis"),
        "limitations": attempt.get("limitations", []),
        "error": attempt.get("error"),
        "artifact": attempt.get("artifact"),
        "envelopeSHA256": attempt.get("envelopeSHA256"),
    }
    if success:
        last_success = {
            "collectionID": attempt.get("collectionID"),
            "succeededAt": attempt.get("succeededAt"),
            "windowStart": attempt.get("windowStart"),
            "windowEnd": attempt.get("windowEnd"),
            "scope": attempt.get("scope"),
            "route": attempt.get("route"),
            "itemCount": attempt.get("itemCount"),
            "processedCount": attempt.get("processedCount"),
            "unresolvedCount": attempt.get("unresolvedCount"),
            "denominatorComplete": attempt.get("denominatorComplete"),
            "watermark": attempt.get("watermark"),
            "watermarkBasis": attempt.get("watermarkBasis"),
            "limitations": attempt.get("limitations", []),
            "artifact": attempt.get("artifact"),
            "artifactSHA256": attempt.get("artifactSHA256"),
            "envelopeSHA256": attempt.get("envelopeSHA256"),
        }
    elif last_success:
        result["succeededAt"] = last_success.get("succeededAt")
        result["watermark"] = last_success.get("watermark")
        result["artifact"] = last_success.get("artifact")
        result["artifactSHA256"] = last_success.get("artifactSHA256")
    if last_success:
        result["lastSuccess"] = last_success
    history = list(previous.get("collectionHistory", [])) if isinstance(previous.get("collectionHistory"), list) else []
    history.append({"collectionID": attempt.get("collectionID"), "envelopeSHA256": attempt.get("envelopeSHA256"), "status": attempt.get("status"), "attemptedAt": attempt.get("attemptedAt"), "watermark": attempt.get("watermark") if success else None})
    deduplicated: dict[str, dict[str, Any]] = {}
    for item in history:
        if isinstance(item, dict) and item.get("collectionID"):
            deduplicated[str(item["collectionID"])] = item
    result["collectionHistory"] = list(deduplicated.values())[-1000:]
    result["manifestID"] = f"source-manifest-{uuid.uuid4().hex[:16]}"
    return result


COLLECTION_ROUTES = {
    "outlook-calendar": {"outlook-calendar", "Outlook Calendar plugin"},
    "outlook-email": {"outlook-email", "Outlook Email plugin"},
    "onedrive-files": {"sharepoint-business-onedrive", "SharePoint plugin: business OneDrive"},
    "teams": {"teams", "Teams plugin", "Microsoft Teams plugin"},
    "sharepoint-files": {"sharepoint", "SharePoint plugin"},
}
COLLECTION_ITEM_KEYS = {
    "outlook-calendar": {"title", "start", "end", "time", "isAllDay"},
    "outlook-email": {"occurredAt", "safeSummary", "projectIDs", "evidenceClass", "signalType", "sourceLocator"},
    "onedrive-files": {"observedAt", "modifiedAt", "safeName", "safeSummary", "projectIDs", "evidenceClass", "sourceLocator"},
    "teams": {"occurredAt", "safeSummary", "projectIDs", "meetingOccurrenceID", "evidenceClass", "signalType", "sourceLocator", "fileRoute"},
    "sharepoint-files": {"observedAt", "modifiedAt", "safeName", "safeSummary", "projectIDs", "evidenceClass", "sourceLocator"},
}
PROHIBITED_COLLECTION_KEYS = {"body", "html", "attendees", "organizer", "participants", "recipient", "recipients", "email", "location", "url", "link", "passcode", "password", "token", "secret", "transcript", "content"}
SAFE_EVIDENCE_CLASSES = {"observed", "reported", "inferred", "supported", "validated", "unknown"}
SAFE_TEXT_SECRET = re.compile(r"(?i)(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passcode|secret)\s*[:=]")
SAFE_TEXT_URL = re.compile(r"(?i)\b(?:https?|ftp)://")
SAFE_TEXT_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
SCOPE_KEYS = {
    "outlook-calendar": {"windowStart", "windowEnd", "timezone", "account"},
    "outlook-email": {"windowStart", "windowEnd", "timezone", "account", "mailbox", "query"},
    "onedrive-files": {"windowStart", "windowEnd", "timezone", "account", "drive", "businessOneDrive", "folder", "query"},
    "teams": {"windowStart", "windowEnd", "timezone", "account", "chat", "channel", "meeting", "query"},
    "sharepoint-files": {"windowStart", "windowEnd", "timezone", "account", "site", "library", "folder", "query"},
}
COLLECTION_ENVELOPE_KEYS = {"schemaVersion", "collectionID", "sourceID", "route", "status", "attemptedAt", "completedAt", "scope", "counts", "freshnessHours", "normalizedItems", "error", "limitations", "priorWatermark", "proposedWatermark", "watermarkBasis"}


def strict_datetime(value: Any, label: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise SystemExit(f"{label} requires a timezone-aware ISO timestamp.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise SystemExit(f"{label} requires a valid timezone-aware ISO timestamp.") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise SystemExit(f"{label} must include an explicit timezone offset.")
    return parsed.astimezone(TZ)


def safe_text(value: Any, label: str, maximum: int = 500, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or (not value and not allow_empty):
        raise SystemExit(f"{label} must be a{' non-empty' if not allow_empty else ''} string.")
    if len(value) > maximum:
        raise SystemExit(f"{label} exceeds the {maximum}-character privacy bound.")
    if SAFE_TEXT_URL.search(value) or SAFE_TEXT_EMAIL.search(value) or SAFE_TEXT_SECRET.search(value):
        raise SystemExit(f"{label} contains a URL, address, or secret-like value that is not allowed in normalized evidence.")
    return value


def validate_safe_tree(value: Any, label: str = "collection") -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            if not isinstance(key, str) or key.lower() in PROHIBITED_COLLECTION_KEYS:
                raise SystemExit(f"{label} contains prohibited field {key!r}.")
            validate_safe_tree(nested, f"{label}.{key}")
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            validate_safe_tree(nested, f"{label}[{index}]")
    elif isinstance(value, str):
        safe_text(value, label, 1000, allow_empty=True)
    elif value is not None and not isinstance(value, (bool, int, float)):
        raise SystemExit(f"{label} contains an unsupported value type.")


def validate_project_ids(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) or not item or len(item) > 120 for item in value):
        raise SystemExit(f"{label} must be an array of bounded project identifier strings.")
    for item in value:
        safe_text(item, label, 120)
    return value


def validate_locator(value: Any, label: str) -> str:
    text = safe_text(value, label, 256)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}", text):
        raise SystemExit(f"{label} must be an opaque non-secret locator, not a URL or structured object.")
    return text


def validate_collection_envelope(payload: dict[str, Any]) -> dict[str, Any]:
    validate_safe_tree(payload)
    unknown_envelope = set(payload) - COLLECTION_ENVELOPE_KEYS
    if unknown_envelope:
        raise SystemExit(f"Collection envelope contains unsupported fields: {sorted(unknown_envelope)}")
    if payload.get("schemaVersion") != 1:
        raise SystemExit("Collection envelope schemaVersion must be 1.")
    source_id = str(payload.get("sourceID") or "")
    if source_id not in COLLECTION_ROUTES:
        raise SystemExit(f"Unsupported canonical sourceID: {source_id}")
    if str(payload.get("route") or "") not in COLLECTION_ROUTES[source_id]:
        raise SystemExit(f"Collection route does not match canonical source {source_id}.")
    collection_id = str(payload.get("collectionID") or "")
    if not collection_id:
        raise SystemExit("Collection envelope requires collectionID.")
    status = str(payload.get("status") or "").lower()
    if status not in {"available", "empty", "partial", "blocked", "unavailable", "unknown"}:
        raise SystemExit(f"Unsupported collection status: {status}")
    scope = payload.get("scope")
    counts = payload.get("counts")
    items = payload.get("normalizedItems")
    if not isinstance(scope, dict) or not isinstance(counts, dict) or not isinstance(items, list):
        raise SystemExit("Collection envelope requires scope, counts, and normalizedItems.")
    unknown_scope = set(scope) - SCOPE_KEYS[source_id]
    if unknown_scope:
        raise SystemExit(f"Collection scope contains unsupported fields: {sorted(unknown_scope)}")
    for key, value in scope.items():
        if key == "businessOneDrive":
            if not isinstance(value, bool):
                raise SystemExit("scope.businessOneDrive must be boolean.")
            continue
        safe_text(value, f"scope.{key}", 500)
    limitations = payload.get("limitations")
    if not isinstance(limitations, list) or any(not isinstance(item, str) for item in limitations):
        raise SystemExit("Collection limitations must be an array of strings.")
    for index, limitation in enumerate(limitations):
        safe_text(limitation, f"limitations[{index}]", 500, allow_empty=False)
    error_value = payload.get("error")
    if error_value is not None:
        safe_text(error_value, "error", 500, allow_empty=False)
    for key in ("priorWatermark", "proposedWatermark", "watermarkBasis"):
        if payload.get(key) is not None:
            safe_text(payload[key], key, 500, allow_empty=False)
    timezone_name = scope.get("timezone")
    try:
        scope_zone = ZoneInfo(str(timezone_name))
    except Exception as error:
        raise SystemExit("Collection scope requires a valid IANA timezone.") from error
    window_start = scope.get("windowStart")
    window_end = scope.get("windowEnd")
    start = strict_datetime(window_start, "scope.windowStart")
    end = strict_datetime(window_end, "scope.windowEnd")
    if end <= start:
        raise SystemExit("Collection windowEnd must be later than windowStart.")
    attempted = strict_datetime(payload.get("attemptedAt"), "attemptedAt")
    completed = strict_datetime(payload.get("completedAt"), "completedAt") if payload.get("completedAt") else None
    if completed and completed < attempted:
        raise SystemExit("completedAt cannot be earlier than attemptedAt.")
    if attempted > now() + timedelta(minutes=5) or (completed and completed > now() + timedelta(minutes=5)):
        raise SystemExit("Collection timestamps cannot be materially in the future.")
    freshness = payload.get("freshnessHours", 24)
    if not isinstance(freshness, int) or not 1 <= freshness <= 720:
        raise SystemExit("freshnessHours must be an integer from 1 through 720.")
    item_count = counts.get("itemCount")
    processed_count = counts.get("processedCount")
    unresolved_count = counts.get("unresolvedCount")
    validate_counts(status, item_count, processed_count, unresolved_count)
    denominator_complete = counts.get("denominatorComplete", True)
    if not isinstance(denominator_complete, bool):
        raise SystemExit("counts.denominatorComplete must be boolean when provided.")
    if denominator_complete and item_count != processed_count + unresolved_count:
        raise SystemExit("A complete denominator requires itemCount = processedCount + unresolvedCount.")
    if not denominator_complete and status != "partial":
        raise SystemExit("An incomplete or unknown denominator must be partial.")
    if status in USABLE_SOURCE_STATES and len(items) != processed_count:
        raise SystemExit("Normalized item count must equal processedCount for a successful collection.")
    allowed = COLLECTION_ITEM_KEYS[source_id]
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise SystemExit(f"Normalized item {index} must be an object.")
        unknown = set(item) - allowed
        prohibited = {key for key in item if key.lower() in PROHIBITED_COLLECTION_KEYS}
        if unknown or prohibited:
            raise SystemExit(f"Normalized item {index} contains non-allowlisted fields: {sorted(unknown | prohibited)}")
        prefix = f"normalizedItems[{index}]"
        if source_id == "outlook-calendar":
            safe_text(item.get("title"), f"{prefix}.title", 300)
            event_start = strict_datetime(item.get("start") or item.get("time"), f"{prefix}.start")
            event_end = strict_datetime(item.get("end"), f"{prefix}.end")
            if event_end <= event_start:
                raise SystemExit(f"{prefix}.end must be later than its start.")
            if event_start < start or event_end > end:
                raise SystemExit(f"{prefix} must fall within the declared Calendar window.")
            if not isinstance(item.get("isAllDay"), bool):
                raise SystemExit(f"{prefix}.isAllDay must be boolean.")
        elif source_id == "outlook-email":
            strict_datetime(item.get("occurredAt"), f"{prefix}.occurredAt")
            safe_text(item.get("safeSummary"), f"{prefix}.safeSummary", 500)
            validate_project_ids(item.get("projectIDs"), f"{prefix}.projectIDs")
            if item.get("evidenceClass") not in SAFE_EVIDENCE_CLASSES:
                raise SystemExit(f"{prefix}.evidenceClass is unsupported.")
            safe_text(item.get("signalType"), f"{prefix}.signalType", 80)
            validate_locator(item.get("sourceLocator"), f"{prefix}.sourceLocator")
        elif source_id in {"onedrive-files", "sharepoint-files"}:
            strict_datetime(item.get("observedAt"), f"{prefix}.observedAt")
            if item.get("modifiedAt") is not None:
                strict_datetime(item.get("modifiedAt"), f"{prefix}.modifiedAt")
            if not item.get("safeName") and not item.get("safeSummary"):
                raise SystemExit(f"{prefix} requires safeName or safeSummary.")
            if item.get("safeName") is not None:
                safe_text(item.get("safeName"), f"{prefix}.safeName", 300)
            if item.get("safeSummary") is not None:
                safe_text(item.get("safeSummary"), f"{prefix}.safeSummary", 500)
            validate_project_ids(item.get("projectIDs"), f"{prefix}.projectIDs")
            if item.get("evidenceClass") not in SAFE_EVIDENCE_CLASSES:
                raise SystemExit(f"{prefix}.evidenceClass is unsupported.")
            validate_locator(item.get("sourceLocator"), f"{prefix}.sourceLocator")
        elif source_id == "teams":
            strict_datetime(item.get("occurredAt"), f"{prefix}.occurredAt")
            safe_text(item.get("safeSummary"), f"{prefix}.safeSummary", 500)
            validate_project_ids(item.get("projectIDs"), f"{prefix}.projectIDs")
            if item.get("evidenceClass") not in SAFE_EVIDENCE_CLASSES:
                raise SystemExit(f"{prefix}.evidenceClass is unsupported.")
            safe_text(item.get("signalType"), f"{prefix}.signalType", 80)
            validate_locator(item.get("sourceLocator"), f"{prefix}.sourceLocator")
            if item.get("meetingOccurrenceID") is not None:
                safe_text(item.get("meetingOccurrenceID"), f"{prefix}.meetingOccurrenceID", 160)
            if item.get("fileRoute") is not None and item.get("fileRoute") not in {"onedrive-files", "sharepoint-files"}:
                raise SystemExit(f"{prefix}.fileRoute must identify the owning OneDrive or SharePoint lane.")
    if source_id == "outlook-calendar":
        local_start = start.astimezone(scope_zone)
        local_end = end.astimezone(scope_zone)
        if local_start.time() != time.min or local_end.time() != time.min or local_end.date() != local_start.date() + timedelta(days=1):
            raise SystemExit("Calendar collection must use an exact local midnight-to-midnight window.")
    if source_id == "outlook-email" and not (scope.get("mailbox") and scope.get("query")):
        raise SystemExit("Outlook Email scope must identify the mailbox and bounded query.")
    if source_id == "onedrive-files" and not (scope.get("drive") and scope.get("businessOneDrive") is True and (scope.get("folder") or scope.get("query"))):
        raise SystemExit("OneDrive scope must select the signed-in business drive and a bounded folder or query.")
    if source_id == "teams" and not any(scope.get(key) for key in ("chat", "channel", "meeting", "query")):
        raise SystemExit("Teams scope must identify a chat, channel, meeting, or bounded query.")
    if source_id == "sharepoint-files" and not (scope.get("site") and scope.get("library") and (scope.get("folder") or scope.get("query"))):
        raise SystemExit("SharePoint scope must identify an explicit site, library, and bounded folder or query.")
    if status in USABLE_SOURCE_STATES and not payload.get("completedAt"):
        raise SystemExit("Successful collections require completedAt.")
    return payload


def command_stage_collection(args: argparse.Namespace) -> None:
    input_path = Path(args.input).expanduser()
    payload = load_json(input_path)
    if not isinstance(payload, dict):
        raise SystemExit("Collection input must be a JSON object.")
    payload = validate_collection_envelope(payload)
    source_id = payload["sourceID"]
    envelope_digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
    previous = load_json(manifest_path(source_id), {})
    previous = previous if isinstance(previous, dict) else {}
    known_attempts = list(previous.get("collectionHistory", [])) if isinstance(previous.get("collectionHistory"), list) else []
    if isinstance(previous.get("latestAttempt"), dict):
        known_attempts.append(previous["latestAttempt"])
    if isinstance(previous.get("lastSuccess"), dict):
        known_attempts.append(previous["lastSuccess"])
    prior_attempt = next((item for item in known_attempts if isinstance(item, dict) and item.get("collectionID") == payload["collectionID"]), None)
    if prior_attempt:
        known_digest = prior_attempt.get("envelopeSHA256")
        if known_digest and known_digest != envelope_digest:
            raise SystemExit("Conflicting replay for an existing collectionID.")
        if not known_digest:
            raise SystemExit("The collectionID already exists without a comparable digest; reuse is not safe.")
        last_success = successful_state(previous) or {}
        if payload.get("status") in USABLE_SOURCE_STATES:
            artifact = Path(str(last_success.get("artifact") or ""))
            expected_artifact_digest = last_success.get("artifactSHA256")
            if last_success.get("collectionID") != payload["collectionID"] or not expected_artifact_digest or file_digest(artifact) != expected_artifact_digest:
                raise SystemExit("Idempotent replay cannot be verified because its immutable successful artifact is missing or corrupt.")
        print(json.dumps({"committed": bool(args.apply), "idempotentReplay": True, "manifest": previous}, indent=2, sort_keys=True))
        return
    status = payload["status"]
    success = status in USABLE_SOURCE_STATES
    last_success = successful_state(previous) or {}
    if source_id == "outlook-calendar":
        if payload.get("priorWatermark") is not None or payload.get("proposedWatermark") is not None:
            raise SystemExit("Daily bounded Calendar collection does not use an incremental watermark.")
    else:
        expected_watermark = last_success.get("watermark")
        if payload.get("priorWatermark") != expected_watermark:
            raise SystemExit("priorWatermark does not match the last successful watermark; stale collection writer rejected.")
        if success and not payload.get("proposedWatermark"):
            raise SystemExit("A successful incremental collection requires proposedWatermark.")
        historical_watermarks = {
            item.get("watermark")
            for item in previous.get("collectionHistory", [])
            if isinstance(item, dict) and item.get("watermark")
        }
        if success and payload.get("proposedWatermark") != expected_watermark and payload.get("proposedWatermark") in historical_watermarks:
            raise SystemExit("proposedWatermark reuses an older successful watermark; known rollback rejected.")
    artifact_payload: dict[str, Any] = {
        "schemaVersion": 1,
        "sourceID": source_id,
        "collectionID": payload["collectionID"],
        "scope": payload["scope"],
        "items": payload["normalizedItems"],
    }
    if source_id == "outlook-calendar":
        scope_zone = ZoneInfo(payload["scope"]["timezone"])
        artifact_payload["date"] = strict_datetime(payload["scope"]["windowStart"], "scope.windowStart").astimezone(scope_zone).date().isoformat()
    artifact_bytes = (json.dumps(artifact_payload, indent=2, sort_keys=True) + "\n").encode("utf-8")
    artifact_sha = hashlib.sha256(artifact_bytes).hexdigest() if success else None
    artifact_path = SOURCE_ROOT / "artifacts" / source_id / f"{payload['collectionID']}-{artifact_sha[:16]}.json" if success and artifact_sha else SOURCE_ROOT / "artifacts" / source_id / f"{payload['collectionID']}-attempt.json"
    if success and args.apply:
        atomic_json(artifact_path, artifact_payload)
    attempt = {
        "schemaVersion": SOURCE_SCHEMA_VERSION,
        "sourceID": source_id,
        "name": next(item[1] for item in REQUIRED_EXTERNAL_SOURCES if item[0] == source_id),
        "kind": next(item[2] for item in REQUIRED_EXTERNAL_SOURCES if item[0] == source_id),
        "status": status,
        "collectionID": payload["collectionID"],
        "route": payload["route"],
        "attemptedAt": payload.get("attemptedAt") or iso(),
        "completedAt": payload.get("completedAt"),
        "succeededAt": payload.get("completedAt") if success else None,
        "windowStart": payload["scope"]["windowStart"],
        "windowEnd": payload["scope"]["windowEnd"],
        "scope": payload["scope"],
        "itemCount": payload["counts"]["itemCount"],
        "processedCount": payload["counts"]["processedCount"],
        "unresolvedCount": payload["counts"]["unresolvedCount"],
        "denominatorComplete": payload["counts"].get("denominatorComplete", True),
        "watermark": payload.get("proposedWatermark") if success else None,
        "watermarkBasis": payload.get("watermarkBasis"),
        "freshnessHours": int(payload.get("freshnessHours", 24)),
        "detail": "; ".join(payload.get("limitations", [])),
        "limitations": payload.get("limitations", []),
        "error": payload.get("error") or "",
        "artifact": str(artifact_path),
        "artifactSHA256": artifact_sha,
        "envelopeSHA256": envelope_digest,
    }
    manifest = merge_attempt(previous if isinstance(previous, dict) else {}, attempt, success)
    if args.apply:
        atomic_json(manifest_path(source_id), manifest)
        if success:
            atomic_json(SOURCE_ROOT / f"{source_id}.json", artifact_payload)
    print(json.dumps({"committed": bool(args.apply), "idempotentReplay": False, "watermarkChanged": success and manifest.get("watermark") != last_success.get("watermark"), "retainedPriorSuccess": not success and bool(last_success), "artifact": str(artifact_path) if success else last_success.get("artifact"), "manifest": manifest}, indent=2, sort_keys=True))


def command_stage_source(args: argparse.Namespace) -> None:
    if args.status not in VALID_SOURCE_STATES:
        raise SystemExit(f"Unsupported source status: {args.status}")
    if args.apply and args.source_id in COLLECTION_ROUTES:
        raise SystemExit(f"Canonical connector source {args.source_id} must use stage-collection; stage-source cannot bypass route, scope, privacy, idempotency, and watermark validation.")
    succeeded = args.succeeded_at
    if args.status in USABLE_SOURCE_STATES and not succeeded:
        raise SystemExit("Available or empty sources require --succeeded-at.")
    validate_counts(args.status, args.item_count, args.processed_count, args.unresolved_count)
    if args.status in USABLE_SOURCE_STATES and (not args.artifact or not Path(args.artifact).expanduser().exists()):
        raise SystemExit("Available or empty sources require an existing normalized --artifact.")
    previous = load_json(manifest_path(args.source_id), {})
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
        "artifactSHA256": file_digest(Path(args.artifact).expanduser()) if args.artifact else None,
        "collectionID": args.collection_id or f"legacy-{uuid.uuid4().hex[:12]}",
        "completedAt": succeeded,
    }
    payload = merge_attempt(previous if isinstance(previous, dict) else {}, payload, args.status in USABLE_SOURCE_STATES)
    if args.apply:
        atomic_json(manifest_path(args.source_id), payload)
    print(json.dumps(effective_manifest(payload), indent=2, sort_keys=True))


def command_source_status(_: argparse.Namespace) -> None:
    current = now()
    by_id = {item.get("sourceID"): item for item in source_manifests(current)}
    for source_id, name, kind, freshness in REQUIRED_EXTERNAL_SOURCES:
        by_id.setdefault(source_id, unknown_source(source_id, name, kind, current.date().isoformat(), freshness))
    print(json.dumps({"generatedAt": iso(current), "sources": list(by_id.values())}, indent=2, sort_keys=True))


def command_snapshot(args: argparse.Namespace) -> None:
    snapshot = build_snapshot(args.date or now().date().isoformat())
    if args.output:
        atomic_json(Path(args.output).expanduser(), snapshot)
    print(json.dumps(snapshot, indent=2, sort_keys=True))


def command_stage_context(args: argparse.Namespace) -> None:
    payload = validate_planning_context(load_json(Path(args.input).expanduser()))
    if args.apply:
        atomic_json(PLANNING_CONTEXT, payload)
    print(json.dumps({"status": "staged" if args.apply else "validated", "path": str(PLANNING_CONTEXT), "context": payload}, indent=2, sort_keys=True))


def command_publish(args: argparse.Namespace) -> None:
    snapshot = build_snapshot(args.date or now().date().isoformat())
    validation = validate_snapshot(snapshot)
    analysis = analyze_snapshot(snapshot)
    challenges = challenge_analysis(snapshot, validation, analysis)
    quality = quality_gate(snapshot, validation, analysis, challenges)
    overlay = validated_analysis(Path(args.analysis).expanduser() if args.analysis else None)
    plan = plan_payload(snapshot, analysis, validation, challenges, quality, overlay)
    source_manifest, run = pipeline_artifacts(plan, snapshot, validation, analysis, challenges, quality)
    plan["planningRun"] = {**plan["planningRun"], "runID": run["runID"], "sourceManifestID": source_manifest["manifestID"]}
    if not args.apply:
        print(json.dumps(plan, indent=2, sort_keys=True))
        return
    atomic_json(SNAPSHOT_PATH, snapshot)
    atomic_json(PLAN_SOURCE_MANIFEST_PATH, source_manifest)
    atomic_json(RUN_MANIFEST_PATH, run)
    if quality["verdict"] == "FAIL":
        raise SystemExit(f"Planning quality gate returned FAIL; publication was blocked. Run manifest: {RUN_MANIFEST_PATH}")
    plan["publication"]["state"] = "published"
    atomic_json(PLAN_PATH, plan)
    publish_stage = next(item for item in run["stages"] if item["name"] == "publish")
    publish_stage["status"] = "completed"
    publish_stage["completedAt"] = iso()
    publish_stage["planID"] = plan["planID"]
    run["status"] = "published-awaiting-readback"
    run["completedAt"] = iso()
    atomic_json(RUN_MANIFEST_PATH, run)
    activity = activity_receipt(
        args.activity_summary or f"Published MONDAY Command Brief {plan['planID']}.",
        "MONDAY Planning Pipeline",
        "verified",
        [str(PLAN_PATH)],
        [item["title"] for item in challenges],
    )
    append_jsonl(ACTIVITY_ROOT / f"{plan['date']}.jsonl", activity)
    operation_status = "completed" if quality["verdict"] == "PASS" else "partial"
    operation = operation_receipt(
        "planning-pipeline",
        operation_status,
        plan["sources"],
        [str(PLAN_PATH), str(SNAPSHOT_PATH), str(PLAN_SOURCE_MANIFEST_PATH), str(RUN_MANIFEST_PATH)],
        quality["conditions"],
        plan["coverage"]["unresolved"],
    )
    atomic_json(OPERATIONS_ROOT / f"{plan['date']}-{plan['planID']}.json", operation)
    print(json.dumps({"status": "published", "planID": plan["planID"], "runID": run["runID"], "path": str(PLAN_PATH), "coverage": plan["coverage"]["status"], "qualityVerdict": quality["verdict"], "readback": "pending"}, indent=2))


def reconcile_readback(receipt: dict[str, Any], apply: bool) -> dict[str, Any]:
    plan = load_json(PLAN_PATH, {})
    if not isinstance(receipt, dict):
        raise SystemExit("Readback receipt must be a JSON object.")
    consumed_at = parse_datetime(receipt.get("consumedAt"))
    if (
        receipt.get("schemaVersion") != 1
        or receipt.get("state") != "displayed"
        or not isinstance(receipt.get("planID"), str)
        or not isinstance(receipt.get("planSchemaVersion"), int)
        or not isinstance(receipt.get("consumer"), str)
        or not receipt.get("consumer", "").strip()
        or not isinstance(receipt.get("appVersion"), str)
        or not receipt.get("appVersion", "").strip()
        or consumed_at is None
        or consumed_at.tzinfo is None
    ):
        raise SystemExit("Readback receipt is malformed or does not prove a displayed plan.")
    if plan.get("planID") != receipt["planID"] or plan.get("schemaVersion") != receipt["planSchemaVersion"]:
        raise SystemExit("Readback does not match the current plan identifier and schema version.")
    run = load_json(RUN_MANIFEST_PATH, {})
    if not isinstance(run, dict) or run.get("planID") != receipt["planID"] or run.get("planSchemaVersion") != receipt["planSchemaVersion"]:
        raise SystemExit("Readback does not match the current planning run.")
    publish_stage = next((stage for stage in run.get("stages", []) if isinstance(stage, dict) and stage.get("name") == "publish"), {})
    published_at = parse_datetime(publish_stage.get("completedAt")) or parse_datetime(plan.get("generatedAt"))
    if published_at and consumed_at < published_at:
        raise SystemExit("Readback consumedAt cannot be earlier than publication.")
    if consumed_at > now() + timedelta(minutes=5):
        raise SystemExit("Readback consumedAt cannot be materially in the future.")
    normalized = {
        **receipt,
        "consumedAt": iso(consumed_at),
    }
    if apply:
        for stage in run.get("stages", []):
            if stage.get("name") == "readback":
                stage.update({
                    "status": "completed",
                    "completedAt": normalized["consumedAt"],
                    "planID": normalized["planID"],
                    "schemaVersion": normalized["planSchemaVersion"],
                    "consumer": normalized["consumer"],
                    "appVersion": normalized["appVersion"],
                })
        run["status"] = "completed"
        run["completedAt"] = normalized["consumedAt"]
        atomic_json(RUN_MANIFEST_PATH, run)
    return normalized


def command_ack(args: argparse.Namespace) -> None:
    receipt = {
        "schemaVersion": 1,
        "planID": args.plan_id,
        "planSchemaVersion": args.schema_version,
        "consumer": args.consumer,
        "appVersion": args.app_version,
        "consumedAt": iso(),
        "state": "displayed",
    }
    receipt = reconcile_readback(receipt, False)
    if args.apply:
        atomic_json(READBACK_PATH, receipt)
        receipt = reconcile_readback(receipt, True)
    print(json.dumps(receipt, indent=2, sort_keys=True))


def command_reconcile_readback(args: argparse.Namespace) -> None:
    receipt = reconcile_readback(load_json(READBACK_PATH, {}), args.apply)
    print(json.dumps({"status": "reconciled" if args.apply else "validated", "readback": receipt}, indent=2, sort_keys=True))


def command_status(_: argparse.Namespace) -> None:
    plan = load_json(PLAN_PATH, {})
    readback = load_json(READBACK_PATH, {})
    run = load_json(RUN_MANIFEST_PATH, {})
    generated = parse_datetime(plan.get("generatedAt"))
    valid_until = parse_datetime(plan.get("validUntil"))
    current = now()
    current_date = current.date().isoformat()
    current_plan = bool(plan and plan.get("date") == current_date and valid_until and valid_until >= current)
    readback_stage = next((stage for stage in run.get("stages", []) if isinstance(stage, dict) and stage.get("name") == "readback"), {}) if isinstance(run, dict) else {}
    displayed = bool(
        current_plan
        and readback.get("schemaVersion") == 1
        and readback.get("state") == "displayed"
        and readback.get("planID") == plan.get("planID")
        and readback.get("planSchemaVersion") == plan.get("schemaVersion")
        and run.get("planID") == plan.get("planID")
        and run.get("planSchemaVersion") == plan.get("schemaVersion")
        and run.get("status") == "completed"
        and readback_stage.get("status") == "completed"
        and readback_stage.get("planID") == plan.get("planID")
        and readback_stage.get("schemaVersion") == plan.get("schemaVersion")
    )
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
                "runID": run.get("runID"),
                "runStatus": run.get("status"),
                "qualityVerdict": run.get("qualityVerdict"),
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

    collection = commands.add_parser("stage-collection", help="Validate and transactionally commit a bounded canonical connector collection")
    collection.add_argument("--input", required=True)
    collection.add_argument("--apply", action="store_true")
    collection.set_defaults(function=command_stage_collection)

    stage = commands.add_parser("stage-source", help="Compatibility interface for validating and persisting a source manifest")
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
    stage.add_argument("--collection-id")
    stage.add_argument("--apply", action="store_true")
    stage.set_defaults(function=command_stage_source)

    source_status = commands.add_parser("source-status", help="Inspect staged source manifests")
    source_status.set_defaults(function=command_source_status)

    context = commands.add_parser("stage-context", help="Validate and optionally persist approved roles, goals, constraints, and capacity")
    context.add_argument("--input", required=True)
    context.add_argument("--apply", action="store_true")
    context.set_defaults(function=command_stage_context)

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

    reconcile = commands.add_parser("reconcile-readback", help="Validate an app-written display receipt and complete the matching planning run")
    reconcile.add_argument("--apply", action="store_true")
    reconcile.set_defaults(function=command_reconcile_readback)

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
