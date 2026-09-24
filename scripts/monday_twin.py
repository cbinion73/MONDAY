#!/usr/bin/env python3
"""Governed MONDAY Digital Twin records, projections, and redacted playbooks."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
REFERENCE_ROOT = PLUGIN_ROOT / "skills/monday-digital-twin/references"
PROMISE_MATRIX = REFERENCE_ROOT / "promise-traceability-matrix.json"
AUTHORITY_MATRIX = REFERENCE_ROOT / "source-authority-domain-boundary-matrix.json"
SCHEMAS = {
    "professional": REFERENCE_ROOT / "professional-twin.schema.json",
    "personal": REFERENCE_ROOT / "personal-twin.schema.json",
}
TZ = ZoneInfo(os.environ.get("MONDAY_TIMEZONE", "America/New_York"))
TWIN_ROOT = Path(os.environ.get("MONDAY_TWIN_ROOT", Path.home() / ".codex/monday-twin"))
RECORD_ROOT = TWIN_ROOT / "records"
HISTORY_ROOT = TWIN_ROOT / "history"
TOMBSTONE_ROOT = TWIN_ROOT / "tombstones"
EVENTS_PATH = TWIN_ROOT / "governance-events.jsonl"
OPT_OUT_PATH = TWIN_ROOT / "opt-outs.json"
PROJECTION_PATH = TWIN_ROOT / "inspection.json"
READBACK_PATH = TWIN_ROOT / "readback.json"
PLAYBOOK_ROOT = TWIN_ROOT / "playbooks"
SCHEMA_VERSION = 1
PROJECTION_SCHEMA_VERSION = 1

DOMAINS = {"professional", "personal"}
EVIDENCE_CLASSES = {"observed", "reported", "inferred", "supported", "validated", "proposed", "decided", "unknown", "blocked", "unresolved"}
PROFESSIONAL_TYPES = {"working-preference", "capability", "responsibility", "relationship-context", "recurring-pattern", "constraint", "development-goal"}
PERSONAL_TYPES = {"preference", "routine", "capacity-signal", "relationship-context", "value", "goal", "recurring-pattern", "biographical-fact"}
STATUSES = {"active", "superseded", "expired"}
PROFESSIONAL_SENSITIVITY = {"private", "internal", "shareable", "restricted"}
PERSONAL_SENSITIVITY = {"private", "restricted"}
CONSENT = {"professional": {"explicit", "user-supplied", "governed-record"}, "personal": {"explicit", "user-supplied"}}
RECORD_KEYS = {
    "schemaVersion", "recordID", "domain", "recordType", "statement", "purpose", "evidenceClass", "confidence",
    "sensitivity", "status", "version", "createdAt", "updatedAt", "reviewAt", "learningAllowed", "consentBasis",
    "sourceRefs", "contradictions", "supersedes", "inferenceBasis", "projection",
}
REQUIRED_RECORD_KEYS = RECORD_KEYS - {"contradictions", "supersedes", "inferenceBasis"}
SOURCE_REF_KEYS = {"sourceID", "evidenceID", "sourceDate", "capturedAt", "locator"}
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{2,127}$")
OPAQUE_LOCATOR = re.compile(r"^[a-zA-Z0-9._:-]{3,300}$")
EMAIL = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
URL = re.compile(r"(?i)\b(?:https?|file)://\S+")
ABSOLUTE_PATH = re.compile(r"(?<![A-Za-z0-9])/(?:Users|Volumes|private|var|tmp|home|etc)/[^\s\]\[)}`'\"]+")
WINDOWS_PATH = re.compile(r"(?i)\b[A-Z]:\\[^\s\]\[)}`'\"]+")
SECRET = re.compile(r"(?i)\b(?:api[_-]?key|password|passwd|secret|token)\s*[:=]\s*[^\s,;]+")
BEARER = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{8,}")
PROHIBITED_RAW_KEYS = {"body", "raw", "transcript", "attendees", "organizer", "passcode", "credential", "password", "token", "secret"}


def now() -> datetime:
    return datetime.now(TZ)


def iso(value: datetime | None = None) -> str:
    return (value or now()).isoformat(timespec="seconds")


def load_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def canonical_bytes(payload: Any) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(payload: Any) -> str:
    return hashlib.sha256(canonical_bytes(payload)).hexdigest()


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, indent=2, sort_keys=True, ensure_ascii=False)
        handle.write("\n")
        temporary = Path(handle.name)
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def atomic_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(text)
        temporary = Path(handle.name)
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def append_event(payload: dict[str, Any]) -> None:
    EVENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with EVENTS_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, sort_keys=True, ensure_ascii=False) + "\n")
    os.chmod(EVENTS_PATH, 0o600)


def read_events() -> list[dict[str, Any]]:
    if not EVENTS_PATH.exists():
        return []
    events: list[dict[str, Any]] = []
    for line in EVENTS_PATH.read_text(encoding="utf-8").splitlines():
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            events.append(payload)
    return events


def strict_datetime(value: Any, label: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a timezone-aware ISO timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{label} must be a timezone-aware ISO timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a timezone")
    return parsed.astimezone(TZ)


def validate_identifier(value: Any, label: str = "recordID") -> str:
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        raise ValueError(f"{label} must be a stable lowercase identifier")
    return value


def forbidden_patterns(value: str) -> list[str]:
    findings: list[str] = []
    for name, pattern in (("email", EMAIL), ("url", URL), ("absolute-path", ABSOLUTE_PATH), ("windows-path", WINDOWS_PATH), ("secret", SECRET), ("bearer-token", BEARER)):
        if pattern.search(value):
            findings.append(name)
    return findings


def validate_no_raw_tree(value: Any, label: str = "record") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() in PROHIBITED_RAW_KEYS:
                raise ValueError(f"{label} contains prohibited raw field {key}")
            validate_no_raw_tree(item, f"{label}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            validate_no_raw_tree(item, f"{label}[{index}]")
    elif isinstance(value, str):
        findings = forbidden_patterns(value)
        if findings:
            raise ValueError(f"{label} contains prohibited material: {', '.join(findings)}")


def authority_sources(domain: str) -> set[str]:
    matrix = load_json(AUTHORITY_MATRIX, {})
    sources = matrix.get("sources", []) if isinstance(matrix, dict) else []
    return {str(item.get("id")) for item in sources if isinstance(item, dict) and domain in item.get("allowedTwinDomains", [])}


def validate_source_ref(value: Any, domain: str, index: int) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"sourceRefs[{index}] must be an object")
    unknown = set(value) - SOURCE_REF_KEYS
    if unknown:
        raise ValueError(f"sourceRefs[{index}] has unknown fields: {', '.join(sorted(unknown))}")
    required = {"sourceID", "evidenceID", "sourceDate", "capturedAt"}
    missing = required - set(value)
    if missing:
        raise ValueError(f"sourceRefs[{index}] is missing: {', '.join(sorted(missing))}")
    source_id = str(value["sourceID"])
    if source_id not in authority_sources(domain):
        raise ValueError(f"source {source_id} is not authorized for the {domain} Twin")
    evidence_id = value["evidenceID"]
    if not isinstance(evidence_id, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{3,160}", evidence_id):
        raise ValueError(f"sourceRefs[{index}].evidenceID must be opaque")
    strict_datetime(value["sourceDate"], f"sourceRefs[{index}].sourceDate")
    strict_datetime(value["capturedAt"], f"sourceRefs[{index}].capturedAt")
    locator = value.get("locator")
    if locator is not None and (not isinstance(locator, str) or not OPAQUE_LOCATOR.fullmatch(locator)):
        raise ValueError(f"sourceRefs[{index}].locator must be an opaque non-secret locator")
    return dict(value)


def validate_record(payload: Any, expected_domain: str | None = None) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Twin record must be an object")
    unknown = set(payload) - RECORD_KEYS
    if unknown:
        raise ValueError(f"Twin record has unknown fields: {', '.join(sorted(unknown))}")
    missing = REQUIRED_RECORD_KEYS - set(payload)
    if missing:
        raise ValueError(f"Twin record is missing: {', '.join(sorted(missing))}")
    if payload.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"Unsupported Twin record schema {payload.get('schemaVersion')}")
    domain = payload.get("domain")
    if domain not in DOMAINS or (expected_domain and domain != expected_domain):
        raise ValueError("Twin record domain is invalid or does not match the requested store")
    record_id = validate_identifier(payload.get("recordID"))
    record_type = payload.get("recordType")
    allowed_types = PROFESSIONAL_TYPES if domain == "professional" else PERSONAL_TYPES
    if record_type not in allowed_types:
        raise ValueError(f"recordType {record_type} is not allowed for {domain}")
    statement = payload.get("statement")
    purpose = payload.get("purpose")
    if not isinstance(statement, str) or not 1 <= len(statement.strip()) <= 2000:
        raise ValueError("statement must contain 1 to 2000 characters")
    if not isinstance(purpose, str) or not 1 <= len(purpose.strip()) <= 500:
        raise ValueError("purpose must contain 1 to 500 characters")
    evidence_class = payload.get("evidenceClass")
    if evidence_class not in EVIDENCE_CLASSES:
        raise ValueError("evidenceClass is invalid")
    inference_basis = payload.get("inferenceBasis")
    if evidence_class == "inferred":
        if not isinstance(inference_basis, str) or not 10 <= len(inference_basis.strip()) <= 1000:
            raise ValueError("inferenceBasis is required for inferred Twin claims and must contain 10 to 1000 characters")
    elif inference_basis is not None:
        raise ValueError("inferenceBasis is allowed only for inferred Twin claims")
    confidence = payload.get("confidence")
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
        raise ValueError("confidence must be between 0 and 1")
    sensitivity = payload.get("sensitivity")
    allowed_sensitivity = PROFESSIONAL_SENSITIVITY if domain == "professional" else PERSONAL_SENSITIVITY
    if sensitivity not in allowed_sensitivity:
        raise ValueError(f"sensitivity {sensitivity} is not allowed for {domain}")
    if payload.get("status") not in STATUSES:
        raise ValueError("status is invalid")
    version = payload.get("version")
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        raise ValueError("version must be a positive integer")
    created = strict_datetime(payload.get("createdAt"), "createdAt")
    updated = strict_datetime(payload.get("updatedAt"), "updatedAt")
    review = strict_datetime(payload.get("reviewAt"), "reviewAt")
    if updated < created:
        raise ValueError("updatedAt cannot precede createdAt")
    if review < updated:
        raise ValueError("reviewAt cannot precede updatedAt")
    if payload.get("learningAllowed") is not True:
        raise ValueError("learningAllowed must be true for durable capture")
    if payload.get("consentBasis") not in CONSENT[domain]:
        raise ValueError(f"consentBasis is not allowed for {domain}")
    refs = payload.get("sourceRefs")
    if not isinstance(refs, list) or not 1 <= len(refs) <= 20:
        raise ValueError("sourceRefs must contain 1 to 20 references")
    normalized_refs = [validate_source_ref(item, domain, index) for index, item in enumerate(refs)]
    if len({item["evidenceID"] for item in normalized_refs}) != len(normalized_refs):
        raise ValueError("sourceRefs contains duplicate evidence IDs")
    contradictions = payload.get("contradictions", [])
    if not isinstance(contradictions, list) or any(not isinstance(item, str) or not ID_PATTERN.fullmatch(item) for item in contradictions):
        raise ValueError("contradictions must contain stable record IDs")
    if record_id in contradictions:
        raise ValueError("a record cannot contradict itself")
    projection = payload.get("projection")
    if not isinstance(projection, dict) or set(projection) != {"includeInCommandCenter", "includeStatement"} or any(not isinstance(projection[key], bool) for key in projection):
        raise ValueError("projection must contain only boolean includeInCommandCenter and includeStatement")
    if domain == "personal" and projection["includeStatement"]:
        raise ValueError("personal statements cannot be projected to Command Center")
    supersedes = payload.get("supersedes")
    if supersedes is not None:
        if not isinstance(supersedes, str) or not re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,127}@[1-9][0-9]*", supersedes):
            raise ValueError("supersedes must identify an exact record version as record-id@version")
        if supersedes.split("@", 1)[0] != record_id:
            raise ValueError("a correction can only supersede the same record ID")
        if supersedes == f"{record_id}@{version}":
            raise ValueError("a record cannot supersede itself")
    validate_no_raw_tree(payload)
    result = dict(payload)
    result["statement"] = statement.strip()
    result["purpose"] = purpose.strip()
    result["sourceRefs"] = normalized_refs
    result["confidence"] = float(confidence)
    if evidence_class == "inferred":
        result["inferenceBasis"] = inference_basis.strip()
    return result


def record_path(domain: str, record_id: str) -> Path:
    if domain not in DOMAINS:
        raise ValueError("domain must be professional or personal")
    validate_identifier(record_id)
    return RECORD_ROOT / domain / f"{record_id}.json"


def history_path(domain: str, record_id: str, version: int) -> Path:
    return HISTORY_ROOT / domain / record_id / f"v{version}.json"


def event(action: str, domain: str, record_id: str, reason: str, before_version: int | None, after_version: int | None) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "eventID": f"twin-event-{uuid.uuid4().hex}",
        "occurredAt": iso(),
        "actor": "Chris Binion via MONDAY",
        "action": action,
        "domain": domain,
        "recordID": record_id,
        "reason": reason,
        "beforeVersion": before_version,
        "afterVersion": after_version,
        "result": "applied",
    }


def opt_outs() -> dict[str, Any]:
    return load_json(OPT_OUT_PATH, {"schemaVersion": 1, "global": False, "domains": [], "sources": [], "recordTypes": [], "updatedAt": None})


def capture_block(payload: dict[str, Any]) -> str | None:
    policy = opt_outs()
    if policy.get("global"):
        return "global learning opt-out is active"
    if payload["domain"] in policy.get("domains", []):
        return f"{payload['domain']} learning opt-out is active"
    if payload["recordType"] in policy.get("recordTypes", []):
        return f"record type {payload['recordType']} is opted out"
    opted_sources = set(policy.get("sources", []))
    used_sources = {item["sourceID"] for item in payload["sourceRefs"]}
    blocked = sorted(opted_sources & used_sources)
    if blocked:
        return f"source opt-out is active for {', '.join(blocked)}"
    return None


def capture_record(payload: dict[str, Any], apply: bool) -> dict[str, Any]:
    normalized = validate_record(payload)
    if normalized["status"] != "active" or normalized["version"] != 1 or normalized.get("supersedes"):
        raise ValueError("new capture requires active version 1 with no supersedes link")
    block = capture_block(normalized)
    if block:
        raise ValueError(block)
    path = record_path(normalized["domain"], normalized["recordID"])
    if path.exists():
        existing = load_json(path, {})
        if digest(existing) == digest(normalized):
            return {"status": "unchanged", "record": normalized, "applied": False}
        raise ValueError("record already exists; use correct with the current version guard")
    if (TOMBSTONE_ROOT / normalized["domain"] / f"{normalized['recordID']}.json").exists():
        raise ValueError("record ID has been forgotten and cannot be silently reused")
    receipt = event("captured", normalized["domain"], normalized["recordID"], normalized["purpose"], None, 1)
    if apply:
        atomic_json(history_path(normalized["domain"], normalized["recordID"], 1), normalized)
        atomic_json(path, normalized)
        append_event(receipt)
        invalidate_derived("Twin record captured")
    return {"status": "captured", "record": normalized, "event": receipt, "applied": apply}


def correct_record(domain: str, record_id: str, replacement: dict[str, Any], expected_version: int, reason: str, apply: bool) -> dict[str, Any]:
    path = record_path(domain, record_id)
    current = load_json(path)
    if not isinstance(current, dict):
        raise ValueError("current Twin record does not exist")
    current = validate_record(current, domain)
    if current["version"] != expected_version:
        raise ValueError(f"current version is {current['version']}; expected {expected_version}")
    normalized = validate_record(replacement, domain)
    if normalized["recordID"] != record_id:
        raise ValueError("replacement record ID must match the exact target")
    if normalized["version"] != expected_version + 1:
        raise ValueError("replacement version must increment by exactly one")
    if normalized.get("supersedes") != f"{record_id}@{expected_version}":
        raise ValueError("replacement supersedes must identify the exact prior record version")
    if normalized["createdAt"] != current["createdAt"]:
        raise ValueError("correction must preserve createdAt")
    if strict_datetime(normalized["updatedAt"], "updatedAt") <= strict_datetime(current["updatedAt"], "current.updatedAt"):
        raise ValueError("correction updatedAt must be later than the current record")
    block = capture_block(normalized)
    if block:
        raise ValueError(block)
    prior = dict(current)
    prior["status"] = "superseded"
    receipt = event("corrected", domain, record_id, reason, expected_version, normalized["version"])
    if apply:
        atomic_json(history_path(domain, record_id, expected_version), prior)
        atomic_json(history_path(domain, record_id, normalized["version"]), normalized)
        atomic_json(path, normalized)
        append_event(receipt)
        invalidate_derived("Twin record corrected")
    return {"status": "corrected", "record": normalized, "prior": prior, "event": receipt, "applied": apply}


def invalidation_path() -> Path:
    return TWIN_ROOT / "invalidation.json"


def invalidate_derived(reason: str) -> None:
    atomic_json(invalidation_path(), {"schemaVersion": 1, "invalidatedAt": iso(), "reason": reason, "projection": True, "playbooks": True})


def forget_plan(domain: str, record_id: str) -> dict[str, Any]:
    current = record_path(domain, record_id)
    history = HISTORY_ROOT / domain / record_id
    files = ([str(current)] if current.exists() else []) + ([str(path) for path in sorted(history.glob("*.json"))] if history.is_dir() else [])
    current_payload = load_json(current, {})
    forgotten_statement = current_payload.get("statement") if isinstance(current_payload, dict) else None
    needles = [record_id] + ([forgotten_statement] if isinstance(forgotten_statement, str) and forgotten_statement else [])
    derived: list[str] = []
    candidates = [PROJECTION_PATH, READBACK_PATH]
    if PLAYBOOK_ROOT.is_dir():
        candidates.extend(path for path in PLAYBOOK_ROOT.rglob("*") if path.is_file() and "state" not in path.parts)
    for candidate in candidates:
        try:
            content = candidate.read_text(encoding="utf-8")
        except OSError:
            continue
        if any(needle in content for needle in needles):
            derived.append(str(candidate))
    impacted_playbooks: list[str] = []
    state_root = PLAYBOOK_ROOT / "state"
    if state_root.is_dir():
        for state_path in sorted(state_root.glob("*.json")):
            state = load_json(state_path, {})
            if any(item.get("recordID") == record_id for item in state.get("sourceVersions", []) if isinstance(item, dict)):
                impacted_playbooks.append(str(state.get("playbookID") or state_path.stem))
    return {
        "schemaVersion": 1,
        "action": "forget",
        "domain": domain,
        "recordID": record_id,
        "exactTargets": files,
        "targetCount": len(files),
        "derivedTargets": sorted(set(derived)),
        "impactedPlaybookIDs": impacted_playbooks,
        "downstreamInvalidation": [str(PROJECTION_PATH), str(invalidation_path()), str(PLAYBOOK_ROOT)],
        "upstreamLimitation": "This operation removes Twin-held content only. Source-system and authoritative-record deletion require their owning routes.",
    }


def forget_record(domain: str, record_id: str, confirmation: str, reason: str, apply: bool) -> dict[str, Any]:
    validate_identifier(record_id)
    if confirmation != record_id:
        raise ValueError("forgetting requires exact --confirm-record-id matching the target")
    plan = forget_plan(domain, record_id)
    if plan["targetCount"] == 0:
        tombstone = TOMBSTONE_ROOT / domain / f"{record_id}.json"
        return {"status": "already-forgotten" if tombstone.exists() else "not-found", "plan": plan, "applied": False}
    current = load_json(record_path(domain, record_id), {})
    prior_version = current.get("version") if isinstance(current, dict) else None
    receipt = event("forgotten", domain, record_id, reason, prior_version if isinstance(prior_version, int) else None, None)
    tombstone = {
        "schemaVersion": 1,
        "recordID": record_id,
        "domain": domain,
        "status": "forgotten",
        "forgottenAt": receipt["occurredAt"],
        "reason": reason,
        "governanceEventID": receipt["eventID"],
    }
    if apply:
        quarantine = Path(tempfile.mkdtemp(prefix="monday-twin-forget-", dir=TWIN_ROOT if TWIN_ROOT.exists() else None))
        moved: list[tuple[Path, Path]] = []
        try:
            for source_text in plan["exactTargets"] + plan["derivedTargets"]:
                source = Path(source_text)
                if not source.exists():
                    continue
                relative = source.relative_to(TWIN_ROOT)
                destination = quarantine / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                source.replace(destination)
                moved.append((destination, source))
            for playbook_id in plan["impactedPlaybookIDs"]:
                state_path = playbook_state_path(playbook_id)
                state = load_json(state_path, {})
                retracted = {
                    "schemaVersion": 1,
                    "playbookID": playbook_id,
                    "title": state.get("title", "Redacted playbook"),
                    "audience": state.get("audience", "unknown"),
                    "state": "retracted",
                    "updatedAt": iso(),
                    "invalidationReason": "A source Twin record was forgotten.",
                    "qaVerdict": "FAIL",
                }
                atomic_json(state_path, retracted)
            atomic_json(TOMBSTONE_ROOT / domain / f"{record_id}.json", tombstone)
            append_event(receipt)
            invalidate_derived("Twin record forgotten")
            shutil.rmtree(quarantine)
        except Exception:
            for staged, original in reversed(moved):
                if staged.exists():
                    original.parent.mkdir(parents=True, exist_ok=True)
                    staged.replace(original)
            shutil.rmtree(quarantine, ignore_errors=True)
            raise
    return {"status": "forgotten", "plan": plan, "tombstone": tombstone, "event": receipt, "applied": apply}


def set_opt_out(scope: str, key: str | None, enabled: bool, reason: str, apply: bool) -> dict[str, Any]:
    policy = opt_outs()
    allowed = {"global", "domain", "source", "record-type"}
    if scope not in allowed:
        raise ValueError("opt-out scope must be global, domain, source, or record-type")
    if scope == "global":
        if key not in (None, "all"):
            raise ValueError("global opt-out does not accept a specific key")
        policy["global"] = enabled
        target = "all-learning"
    else:
        if not isinstance(key, str) or not key or "*" in key:
            raise ValueError("scoped opt-out requires one exact non-wildcard key")
        if scope == "domain" and key not in DOMAINS:
            raise ValueError("domain opt-out key must be professional or personal")
        collection_name = {"domain": "domains", "source": "sources", "record-type": "recordTypes"}[scope]
        values = set(policy.get(collection_name, []))
        if enabled:
            values.add(key)
        else:
            values.discard(key)
        policy[collection_name] = sorted(values)
        target = f"{scope}:{key}"
    policy["schemaVersion"] = 1
    policy["updatedAt"] = iso()
    receipt = {
        "schemaVersion": 1,
        "eventID": f"twin-event-{uuid.uuid4().hex}",
        "occurredAt": policy["updatedAt"],
        "actor": "Chris Binion via MONDAY",
        "action": "opted-out" if enabled else "opted-in",
        "domain": "governance",
        "recordID": target,
        "reason": reason,
        "beforeVersion": None,
        "afterVersion": None,
        "result": "applied",
    }
    if apply:
        atomic_json(OPT_OUT_PATH, policy)
        append_event(receipt)
        invalidate_derived("Twin learning preference changed")
    return {"status": receipt["action"], "scope": scope, "key": key, "policy": policy, "event": receipt, "applied": apply}


def redact_text(value: str) -> tuple[str, list[str]]:
    result = value
    actions: list[str] = []
    for name, pattern, replacement in (
        ("email", EMAIL, "[REDACTED EMAIL]"),
        ("url", URL, "[REDACTED LINK]"),
        ("absolute-path", ABSOLUTE_PATH, "[REDACTED PATH]"),
        ("windows-path", WINDOWS_PATH, "[REDACTED PATH]"),
        ("credential", SECRET, "[REDACTED CREDENTIAL]"),
        ("bearer-token", BEARER, "[REDACTED CREDENTIAL]"),
    ):
        result, count = pattern.subn(replacement, result)
        if count:
            actions.extend([name] * count)
    return result, actions


def redact_tree(value: Any) -> tuple[Any, list[str]]:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        actions: list[str] = []
        for key, item in value.items():
            if str(key).lower() in PROHIBITED_RAW_KEYS or str(key).lower() in {"locator", "sourcepath", "sourceurl"}:
                redacted[key] = "[REDACTED FIELD]"
                actions.append(f"field:{key}")
                continue
            normalized, nested = redact_tree(item)
            redacted[key] = normalized
            actions.extend(nested)
        return redacted, actions
    if isinstance(value, list):
        items: list[Any] = []
        actions: list[str] = []
        for item in value:
            normalized, nested = redact_tree(item)
            items.append(normalized)
            actions.extend(nested)
        return items, actions
    if isinstance(value, str):
        return redact_text(value)
    return value, []


def redact_payload(payload: Any) -> dict[str, Any]:
    redacted, actions = redact_tree(payload)
    residual = forbidden_patterns(json.dumps(redacted, ensure_ascii=False))
    if residual:
        raise ValueError(f"redaction failed closed; residual prohibited classes: {', '.join(sorted(set(residual)))}")
    return {
        "schemaVersion": 1,
        "redacted": redacted,
        "manifest": {
            "policy": "monday-shareable-v1",
            "actionCount": len(actions),
            "actionsByClass": {name: actions.count(name) for name in sorted(set(actions))},
            "verifiedNoResidual": True,
        },
    }


def all_records() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for domain in sorted(DOMAINS):
        root = RECORD_ROOT / domain
        if not root.is_dir():
            continue
        for path in sorted(root.glob("*.json")):
            payload = load_json(path)
            if isinstance(payload, dict):
                try:
                    records.append(validate_record(payload, domain))
                except ValueError:
                    continue
    return records


def audit_contracts() -> dict[str, Any]:
    errors: list[str] = []
    promises = load_json(PROMISE_MATRIX)
    authority = load_json(AUTHORITY_MATRIX)
    schemas = {domain: load_json(path) for domain, path in SCHEMAS.items()}
    rows = promises.get("promises", []) if isinstance(promises, dict) else []
    required_promise_fields = {"id", "roadmapItem", "origin", "acceptanceCriteria", "evidenceType", "residualGap", "promise", "owner", "control", "artifacts", "verification", "status"}
    if not rows:
        errors.append("promise matrix has no rows")
    identifiers: list[str] = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(f"promise row {index} is not an object")
            continue
        missing = required_promise_fields - set(row)
        if missing:
            errors.append(f"promise row {index} is missing {', '.join(sorted(missing))}")
        identifier = row.get("id")
        if isinstance(identifier, str):
            identifiers.append(identifier)
        if row.get("status") not in {"implemented", "partial", "planned", "blocked"}:
            errors.append(f"promise {identifier} has invalid status")
        if row.get("status") == "implemented":
            for artifact in row.get("artifacts", []):
                if not isinstance(artifact, str) or artifact.startswith("/") or not (PLUGIN_ROOT / artifact).exists():
                    errors.append(f"promise {identifier} references missing or nonportable artifact {artifact}")
            if not row.get("verification"):
                errors.append(f"promise {identifier} has no verification")
            if not isinstance(row.get("acceptanceCriteria"), list) or not row.get("acceptanceCriteria"):
                errors.append(f"promise {identifier} has no acceptance criteria")
            for verification in row.get("verification", []):
                if isinstance(verification, str) and "::" in verification and verification.startswith("tests/"):
                    test_path_text, test_name = verification.split("::", 1)
                    test_path = PLUGIN_ROOT / test_path_text
                    if not test_path.exists() or test_name not in test_path.read_text(encoding="utf-8"):
                        errors.append(f"promise {identifier} references missing verification {verification}")
    duplicates = sorted({identifier for identifier in identifiers if identifiers.count(identifier) > 1})
    if duplicates:
        errors.append(f"duplicate promise IDs: {', '.join(duplicates)}")
    required_priority2 = {"P2-18", "P2-19", "P2-20A", "P2-20B", "P2-21A", "P2-21B", "P2-21C", "P2-21D", "P2-22", "P2-23"}
    missing_promises = sorted(required_priority2 - set(identifiers))
    if missing_promises:
        errors.append(f"missing Priority 2 promises: {', '.join(missing_promises)}")

    sources = authority.get("sources", []) if isinstance(authority, dict) else []
    records = authority.get("records", []) if isinstance(authority, dict) else []
    source_ids = [item.get("id") for item in sources if isinstance(item, dict)]
    record_ids = [item.get("id") for item in records if isinstance(item, dict)]
    if len(source_ids) != len(set(source_ids)):
        errors.append("authority matrix has duplicate source IDs")
    if len(record_ids) != len(set(record_ids)):
        errors.append("authority matrix has duplicate record IDs")
    required_sources = {"outlook-calendar", "outlook-email", "onedrive-files", "teams", "sharepoint-files", "user-supplied", "project-knowledge", "decision-ledger", "meeting-continuity", "personal-project-knowledge", "activity-ledger", "monday-operations", "captains-log", "research-chronicle", "conversation-memory"}
    missing_sources = sorted(required_sources - set(source_ids))
    if missing_sources:
        errors.append(f"authority matrix misses sources: {', '.join(missing_sources)}")
    required_records = {"professional-twin", "personal-twin", "twin-governance", "command-center-projection", "redacted-professional-playbook"}
    missing_records = sorted(required_records - set(record_ids))
    if missing_records:
        errors.append(f"authority matrix misses records: {', '.join(missing_records)}")
    registry = load_json(PLUGIN_ROOT / "skills/monday-core/references/capability-registry.json", {})
    registry_lanes = {item.get("id") for item in registry.get("sourceLanes", []) if isinstance(item, dict)}
    registry_records = {item.get("id") for item in registry.get("records", []) if isinstance(item, dict)}
    uncovered_lanes = sorted(registry_lanes - set(source_ids))
    uncovered_records = sorted(registry_records - (set(source_ids) | set(record_ids)))
    if uncovered_lanes:
        errors.append(f"registry source lanes lack authority rows: {', '.join(uncovered_lanes)}")
    if uncovered_records:
        errors.append(f"registry records lack authority rows: {', '.join(uncovered_records)}")
    for domain, schema in schemas.items():
        if not isinstance(schema, dict) or schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            errors.append(f"{domain} schema is missing or invalid")
        if schema.get("properties", {}).get("domain", {}).get("const") != domain:
            errors.append(f"{domain} schema does not enforce its domain")
        if schema.get("additionalProperties") is not False:
            errors.append(f"{domain} schema must fail closed on unknown fields")
    return {
        "schemaVersion": 1,
        "status": "PASS" if not errors else "FAIL",
        "promiseCount": len(rows),
        "implementedPromiseCount": sum(1 for row in rows if isinstance(row, dict) and row.get("status") == "implemented"),
        "sourceCount": len(sources),
        "recordCount": len(records),
        "errors": errors,
        "auditedAt": iso(),
    }


def privacy_reduced_record(record: dict[str, Any]) -> dict[str, Any] | None:
    projection = record["projection"]
    if not projection["includeInCommandCenter"]:
        return None
    item = {
        "recordID": record["recordID"],
        "domain": record["domain"],
        "recordType": record["recordType"],
        "status": record["status"],
        "version": record["version"],
        "evidenceClass": record["evidenceClass"],
        "confidence": record["confidence"],
        "sensitivity": record["sensitivity"],
        "purpose": record["purpose"],
        "updatedAt": record["updatedAt"],
        "reviewAt": record["reviewAt"],
        "sourceIDs": sorted({item["sourceID"] for item in record["sourceRefs"]}),
        "evidenceCount": len(record["sourceRefs"]),
        "contradictionCount": len(record.get("contradictions", [])),
        "supersedes": record.get("supersedes"),
    }
    if record["domain"] == "professional" and projection["includeStatement"]:
        item["statement"] = record["statement"]
    return item


def build_projection() -> dict[str, Any]:
    records = [item for item in (privacy_reduced_record(record) for record in all_records()) if item is not None]
    events = read_events()[-100:]
    reduced_events = []
    for item in events:
        reduced = {key: item.get(key) for key in ("eventID", "occurredAt", "action", "domain", "recordID", "reason", "beforeVersion", "afterVersion", "result")}
        reduced["reason"] = "Withheld from privacy-reduced projection."
        reduced_events.append(reduced)
    policy = opt_outs()
    audit = audit_contracts()
    promise_matrix = load_json(PROMISE_MATRIX, {})
    authority_matrix = load_json(AUTHORITY_MATRIX, {})
    promises = [
        {key: item.get(key) for key in ("id", "promise", "owner", "control", "status")}
        for item in promise_matrix.get("promises", []) if isinstance(item, dict)
    ]
    authority_sources = [
        {key: item.get(key) for key in ("id", "domain", "role", "suitableFor", "notProofOf", "authoritativeRecord", "owner", "allowedTwinDomains", "retention", "conflictRule")}
        for item in authority_matrix.get("sources", []) if isinstance(item, dict)
    ]
    authority_records = [
        {key: item.get(key) for key in ("id", "domain", "owner", "allowedIngress", "allowedEgress", "prohibitedEgress", "audience", "retention")}
        for item in authority_matrix.get("records", []) if isinstance(item, dict)
    ]
    playbooks: list[dict[str, Any]] = []
    state_root = PLAYBOOK_ROOT / "state"
    if state_root.is_dir():
        for path in sorted(state_root.glob("*.json")):
            state = load_json(path)
            if isinstance(state, dict):
                reduced = {key: state.get(key) for key in ("playbookID", "title", "state", "updatedAt", "audience", "qaVerdict", "packageDigest")}
                for key in ("title", "audience"):
                    if isinstance(reduced.get(key), str):
                        reduced[key], _ = redact_text(reduced[key])
                playbooks.append(reduced)
    generated = now()
    core = {
        "schemaVersion": PROJECTION_SCHEMA_VERSION,
        "generatedAt": iso(generated),
        "validUntil": iso(generated + timedelta(hours=24)),
        "producer": "monday-digital-twin@personal",
        "audience": "Chris-private-local",
        "contractAudit": audit,
        "promises": promises,
        "authoritySources": authority_sources,
        "authorityRecords": authority_records,
        "records": records,
        "governanceEvents": reduced_events,
        "optOuts": policy,
        "playbooks": playbooks,
        "coverage": {
            "professionalCount": sum(1 for item in records if item["domain"] == "professional"),
            "personalCount": sum(1 for item in records if item["domain"] == "personal"),
            "governanceEventCount": len(events),
            "promiseCount": audit["promiseCount"],
            "implementedPromiseCount": audit["implementedPromiseCount"],
            "unresolvedCount": len(audit["errors"]),
        },
    }
    core["contentDigest"] = digest(core)
    core["projectionID"] = f"twin-{generated.date().isoformat()}-{core['contentDigest'][:12]}"
    residual = forbidden_patterns(json.dumps(core, ensure_ascii=False))
    if residual:
        raise ValueError(f"Twin projection failed privacy scan: {', '.join(sorted(set(residual)))}")
    return core


def validate_projection(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("schemaVersion") != PROJECTION_SCHEMA_VERSION:
        raise ValueError("unsupported Twin inspection schema")
    required = {"projectionID", "contentDigest", "generatedAt", "validUntil", "producer", "audience", "contractAudit", "promises", "authoritySources", "authorityRecords", "records", "governanceEvents", "optOuts", "playbooks", "coverage"}
    missing = required - set(payload)
    if missing:
        raise ValueError(f"Twin projection is missing {', '.join(sorted(missing))}")
    if not isinstance(payload["projectionID"], str) or not payload["projectionID"]:
        raise ValueError("Twin projection ID is missing")
    generated = strict_datetime(payload["generatedAt"], "generatedAt")
    valid_until = strict_datetime(payload["validUntil"], "validUntil")
    if valid_until <= generated:
        raise ValueError("Twin projection freshness window is invalid")
    if valid_until < now():
        raise ValueError("Twin projection is expired")
    core = dict(payload)
    claimed_digest = core.pop("contentDigest")
    core.pop("projectionID")
    if digest(core) != claimed_digest:
        raise ValueError("Twin projection content digest does not match")
    residual = forbidden_patterns(json.dumps(payload, ensure_ascii=False))
    if residual:
        raise ValueError(f"Twin projection contains prohibited material: {', '.join(sorted(set(residual)))}")
    if not isinstance(payload["records"], list):
        raise ValueError("Twin projection records must be a list")
    if not isinstance(payload["promises"], list) or not isinstance(payload["authoritySources"], list) or not isinstance(payload["authorityRecords"], list):
        raise ValueError("Twin projection matrices must be lists")
    if len({item.get("id") for item in payload["promises"] if isinstance(item, dict)}) != len(payload["promises"]):
        raise ValueError("Twin projection contains duplicate promise IDs")
    if len({item.get("id") for item in payload["authoritySources"] if isinstance(item, dict)}) != len(payload["authoritySources"]):
        raise ValueError("Twin projection contains duplicate authority source IDs")
    seen: set[str] = set()
    for item in payload["records"]:
        if not isinstance(item, dict) or item.get("domain") not in DOMAINS:
            raise ValueError("Twin projection contains an invalid record")
        record_id = validate_identifier(item.get("recordID"))
        if record_id in seen:
            raise ValueError("Twin projection contains duplicate record IDs")
        seen.add(record_id)
        if item["domain"] == "personal" and "statement" in item:
            raise ValueError("Twin projection exposes a personal statement")
        validate_no_raw_tree(item, f"projection record {record_id}")
    coverage = payload["coverage"]
    if coverage.get("professionalCount") != sum(1 for item in payload["records"] if item["domain"] == "professional") or coverage.get("personalCount") != sum(1 for item in payload["records"] if item["domain"] == "personal"):
        raise ValueError("Twin projection denominators do not reconcile")
    return dict(payload)


def playbook_state_path(playbook_id: str) -> Path:
    validate_identifier(playbook_id, "playbookID")
    return PLAYBOOK_ROOT / "state" / f"{playbook_id}.json"


def prepare_playbook(spec: dict[str, Any], apply: bool) -> dict[str, Any]:
    required = {"schemaVersion", "playbookID", "title", "purpose", "audience", "recordIDs"}
    if not isinstance(spec, dict) or set(spec) != required or spec.get("schemaVersion") != 1:
        raise ValueError("playbook specification must contain only the versioned required fields")
    playbook_id = validate_identifier(spec.get("playbookID"), "playbookID")
    for key in ("title", "purpose", "audience"):
        if not isinstance(spec.get(key), str) or not spec[key].strip() or len(spec[key]) > 500:
            raise ValueError(f"playbook {key} is invalid")
    record_ids = spec.get("recordIDs")
    if not isinstance(record_ids, list) or not record_ids or any(not isinstance(item, str) for item in record_ids):
        raise ValueError("playbook recordIDs must be a non-empty list")
    if len(record_ids) != len(set(record_ids)):
        raise ValueError("playbook recordIDs contains duplicates")
    claims: list[dict[str, Any]] = []
    for record_id in record_ids:
        validate_identifier(record_id)
        record = load_json(record_path("professional", record_id))
        if not isinstance(record, dict):
            if record_path("personal", record_id).exists():
                raise ValueError("personal Twin records can never enter a playbook")
            raise ValueError(f"professional Twin record {record_id} does not exist")
        record = validate_record(record, "professional")
        if record["status"] != "active" or record["sensitivity"] != "shareable":
            raise ValueError(f"record {record_id} is not active and shareable")
        if record["evidenceClass"] not in {"supported", "validated", "decided"}:
            raise ValueError(f"record {record_id} does not have an approved evidence class")
        block = capture_block(record)
        if block:
            raise ValueError(f"record {record_id} is now opted out: {block}")
        statement, actions = redact_text(record["statement"])
        if forbidden_patterns(statement):
            raise ValueError(f"record {record_id} cannot be safely redacted")
        claims.append({
            "recordID": record_id,
            "version": record["version"],
            "statement": statement,
            "evidenceClass": record["evidenceClass"],
            "confidence": record["confidence"],
            "redactionCount": len(actions),
        })
    draft = {
        "schemaVersion": 1,
        "playbookID": playbook_id,
        "title": spec["title"].strip(),
        "purpose": spec["purpose"].strip(),
        "audience": spec["audience"].strip(),
        "state": "drafted",
        "createdAt": iso(),
        "claims": claims,
        "redactionPolicy": "monday-shareable-v1",
        "qaVerdict": "PASS",
        "qaConditions": [],
    }
    draft["draftDigest"] = digest(draft)
    state = {
        "schemaVersion": 1,
        "playbookID": playbook_id,
        "title": draft["title"],
        "audience": draft["audience"],
        "state": "drafted",
        "updatedAt": draft["createdAt"],
        "draftDigest": draft["draftDigest"],
        "qaVerdict": draft["qaVerdict"],
        "sourceVersions": [{"recordID": item["recordID"], "version": item["version"]} for item in claims],
    }
    if apply:
        atomic_json(PLAYBOOK_ROOT / "drafts" / f"{playbook_id}.json", draft)
        atomic_json(playbook_state_path(playbook_id), state)
    return {"status": "drafted", "draft": draft, "state": state, "applied": apply}


def review_playbook(playbook_id: str, decision: str, reviewer: str, reason: str, expected_digest: str, apply: bool) -> dict[str, Any]:
    draft_path = PLAYBOOK_ROOT / "drafts" / f"{playbook_id}.json"
    draft = load_json(draft_path)
    state = load_json(playbook_state_path(playbook_id))
    if not isinstance(draft, dict) or not isinstance(state, dict):
        raise ValueError("playbook draft does not exist")
    if decision not in {"approve", "reject"}:
        raise ValueError("review decision must be approve or reject")
    if expected_digest != draft.get("draftDigest") or expected_digest != state.get("draftDigest"):
        raise ValueError("playbook approval must bind to the exact current draft digest")
    if not isinstance(reviewer, str) or not reviewer.strip() or not isinstance(reason, str) or not reason.strip():
        raise ValueError("reviewer and reason are required")
    reviewed = dict(state)
    reviewed.update({
        "state": "approved" if decision == "approve" else "rejected",
        "updatedAt": iso(),
        "reviewer": reviewer.strip(),
        "reviewReason": reason.strip(),
        "approvedDigest": expected_digest if decision == "approve" else None,
    })
    if apply:
        atomic_json(playbook_state_path(playbook_id), reviewed)
    return {"status": reviewed["state"], "state": reviewed, "applied": apply}


def assert_playbook_sources_current(state: dict[str, Any]) -> None:
    sources = state.get("sourceVersions")
    if not isinstance(sources, list) or not sources:
        raise ValueError("playbook source-version binding is missing")
    for source in sources:
        if not isinstance(source, dict):
            raise ValueError("playbook source-version binding is invalid")
        current = load_json(record_path("professional", source.get("recordID", "")))
        if not isinstance(current, dict) or current.get("version") != source.get("version") or current.get("status") != "active":
            raise ValueError("a source record changed after playbook drafting; rebuild and reapprove")
        block = capture_block(validate_record(current, "professional"))
        if block:
            raise ValueError(f"a source record is now opted out; rebuild is required: {block}")


def prepare_publication(playbook_id: str, destination: str, confirmation_id: str, apply: bool) -> dict[str, Any]:
    draft = load_json(PLAYBOOK_ROOT / "drafts" / f"{playbook_id}.json")
    state = load_json(playbook_state_path(playbook_id))
    if not isinstance(draft, dict) or not isinstance(state, dict) or state.get("state") != "approved":
        raise ValueError("playbook must have an exact-digest approval before publication preparation")
    if state.get("approvedDigest") != draft.get("draftDigest"):
        raise ValueError("playbook changed after approval")
    if not isinstance(destination, str) or not destination.strip() or not isinstance(confirmation_id, str) or len(confirmation_id.strip()) < 8:
        raise ValueError("exact destination and current confirmation ID are required")
    assert_playbook_sources_current(state)
    markdown_lines = [f"# {draft['title']}", "", draft["purpose"], ""]
    for claim in draft["claims"]:
        markdown_lines.append(f"- {claim['statement']} ({claim['evidenceClass']}, confidence {claim['confidence']:.2f})")
    markdown = "\n".join(markdown_lines) + "\n"
    residual = forbidden_patterns(markdown)
    if residual:
        raise ValueError(f"playbook failed leak scan: {', '.join(sorted(set(residual)))}")
    package = {
        "schemaVersion": 1,
        "playbookID": playbook_id,
        "draftDigest": draft["draftDigest"],
        "title": draft["title"],
        "audience": draft["audience"],
        "destination": destination.strip(),
        "confirmationID": confirmation_id.strip(),
        "preparedAt": iso(),
        "state": "prepared",
        "content": markdown,
        "sourceVersions": state["sourceVersions"],
        "redactionPolicy": draft["redactionPolicy"],
        "qaVerdict": draft["qaVerdict"],
        "externalAction": "not-attempted",
    }
    package["packageDigest"] = digest(package)
    prepared_state = dict(state)
    prepared_state.update({"state": "prepared", "updatedAt": package["preparedAt"], "destination": package["destination"], "confirmationID": package["confirmationID"], "packageDigest": package["packageDigest"]})
    if apply:
        atomic_json(PLAYBOOK_ROOT / "packages" / f"{playbook_id}-{package['packageDigest'][:12]}.json", package)
        atomic_text(PLAYBOOK_ROOT / "packages" / f"{playbook_id}-{package['packageDigest'][:12]}.md", markdown)
        atomic_json(playbook_state_path(playbook_id), prepared_state)
    return {"status": "prepared", "package": package, "state": prepared_state, "applied": apply}


def record_publication_attempt(playbook_id: str, package_digest: str, confirmation_id: str, apply: bool) -> dict[str, Any]:
    state = load_json(playbook_state_path(playbook_id))
    if not isinstance(state, dict) or state.get("state") != "prepared":
        raise ValueError("only a prepared playbook can record an external attempt")
    if state.get("packageDigest") != package_digest or state.get("confirmationID") != confirmation_id:
        raise ValueError("publication attempt must match the exact approved package and confirmation")
    assert_playbook_sources_current(state)
    attempted = dict(state)
    attempted.update({"state": "attempted", "updatedAt": iso(), "attemptedAt": iso()})
    if apply:
        atomic_json(playbook_state_path(playbook_id), attempted)
    return {"status": "attempted", "state": attempted, "applied": apply}


def verify_publication(playbook_id: str, readback: dict[str, Any], apply: bool) -> dict[str, Any]:
    state = load_json(playbook_state_path(playbook_id))
    if not isinstance(state, dict) or state.get("state") != "attempted":
        raise ValueError("publication must be attempted before it can be verified")
    required = {"schemaVersion", "playbookID", "packageDigest", "destination", "confirmationID", "publishedAt", "readbackLocator"}
    if not isinstance(readback, dict) or set(readback) != required or readback.get("schemaVersion") != 1:
        raise ValueError("publication readback has an invalid schema")
    for key in ("playbookID", "packageDigest", "destination", "confirmationID"):
        if readback.get(key) != state.get(key):
            raise ValueError(f"publication readback {key} does not match the attempted package")
    strict_datetime(readback.get("publishedAt"), "publishedAt")
    locator = readback.get("readbackLocator")
    if not isinstance(locator, str) or not OPAQUE_LOCATOR.fullmatch(locator):
        raise ValueError("publication readback locator must be opaque and non-secret")
    verified = dict(state)
    verified.update({"state": "verified", "updatedAt": iso(), "verifiedAt": iso(), "readbackLocator": locator})
    if apply:
        atomic_json(playbook_state_path(playbook_id), verified)
        atomic_json(PLAYBOOK_ROOT / "readbacks" / f"{playbook_id}-{state['packageDigest'][:12]}.json", readback)
    return {"status": "verified", "state": verified, "applied": apply}


def reconcile_projection_readback(receipt: dict[str, Any], apply: bool) -> dict[str, Any]:
    projection = validate_projection(load_json(PROJECTION_PATH))
    required = {"schemaVersion", "projectionID", "projectionSchemaVersion", "contentDigest", "consumer", "appVersion", "displayedAt", "state", "viewIDs"}
    if not isinstance(receipt, dict) or set(receipt) != required or receipt.get("schemaVersion") != 1:
        raise ValueError("Twin readback has an invalid schema")
    if receipt.get("projectionID") != projection["projectionID"] or receipt.get("projectionSchemaVersion") != projection["schemaVersion"] or receipt.get("contentDigest") != projection["contentDigest"]:
        raise ValueError("Twin readback does not match the current projection")
    if receipt.get("state") != "displayed" or "digital-twin" not in receipt.get("viewIDs", []):
        raise ValueError("Twin readback must prove the Digital Twin view rendered")
    displayed = strict_datetime(receipt.get("displayedAt"), "displayedAt")
    generated = strict_datetime(projection["generatedAt"], "generatedAt")
    if displayed < generated or displayed > now() + timedelta(minutes=5):
        raise ValueError("Twin readback timestamp is outside the valid display window")
    if not isinstance(receipt.get("consumer"), str) or not receipt["consumer"] or not isinstance(receipt.get("appVersion"), str) or not receipt["appVersion"]:
        raise ValueError("Twin readback requires consumer and app version")
    if apply:
        atomic_json(READBACK_PATH, receipt)
    return {"status": "displayed", "projectionID": projection["projectionID"], "contentDigest": projection["contentDigest"], "applied": apply}


def command_audit(_: argparse.Namespace) -> None:
    result = audit_contracts()
    print(json.dumps(result, indent=2, sort_keys=True))
    if result["status"] != "PASS":
        raise SystemExit(1)


def command_validate(args: argparse.Namespace) -> None:
    print(json.dumps(validate_record(load_json(Path(args.input)), args.domain), indent=2, sort_keys=True))


def command_capture(args: argparse.Namespace) -> None:
    print(json.dumps(capture_record(load_json(Path(args.input)), args.apply), indent=2, sort_keys=True))


def command_correct(args: argparse.Namespace) -> None:
    print(json.dumps(correct_record(args.domain, args.record_id, load_json(Path(args.input)), args.expected_version, args.reason, args.apply), indent=2, sort_keys=True))


def command_forget_plan(args: argparse.Namespace) -> None:
    print(json.dumps(forget_plan(args.domain, args.record_id), indent=2, sort_keys=True))


def command_forget(args: argparse.Namespace) -> None:
    print(json.dumps(forget_record(args.domain, args.record_id, args.confirm_record_id, args.reason, args.apply), indent=2, sort_keys=True))


def command_opt_out(args: argparse.Namespace) -> None:
    print(json.dumps(set_opt_out(args.scope, args.key, args.enabled == "yes", args.reason, args.apply), indent=2, sort_keys=True))


def command_redact(args: argparse.Namespace) -> None:
    print(json.dumps(redact_payload(load_json(Path(args.input))), indent=2, sort_keys=True))


def command_project(args: argparse.Namespace) -> None:
    projection = build_projection()
    validate_projection(projection)
    if args.apply:
        atomic_json(PROJECTION_PATH, projection)
        if invalidation_path().exists():
            invalidation_path().unlink()
    print(json.dumps(projection, indent=2, sort_keys=True))


def command_reconcile(args: argparse.Namespace) -> None:
    print(json.dumps(reconcile_projection_readback(load_json(Path(args.input)), args.apply), indent=2, sort_keys=True))


def command_prepare_playbook(args: argparse.Namespace) -> None:
    print(json.dumps(prepare_playbook(load_json(Path(args.input)), args.apply), indent=2, sort_keys=True))


def command_review_playbook(args: argparse.Namespace) -> None:
    print(json.dumps(review_playbook(args.playbook_id, args.decision, args.reviewer, args.reason, args.expected_digest, args.apply), indent=2, sort_keys=True))


def command_prepare_publication(args: argparse.Namespace) -> None:
    print(json.dumps(prepare_publication(args.playbook_id, args.destination, args.confirmation_id, args.apply), indent=2, sort_keys=True))


def command_attempt_publication(args: argparse.Namespace) -> None:
    print(json.dumps(record_publication_attempt(args.playbook_id, args.package_digest, args.confirmation_id, args.apply), indent=2, sort_keys=True))


def command_verify_publication(args: argparse.Namespace) -> None:
    print(json.dumps(verify_publication(args.playbook_id, load_json(Path(args.readback)), args.apply), indent=2, sort_keys=True))


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)

    audit = commands.add_parser("audit-contracts")
    audit.set_defaults(handler=command_audit)

    validate = commands.add_parser("validate-record")
    validate.add_argument("--input", required=True)
    validate.add_argument("--domain", choices=sorted(DOMAINS))
    validate.set_defaults(handler=command_validate)

    capture = commands.add_parser("capture")
    capture.add_argument("--input", required=True)
    capture.add_argument("--apply", action="store_true")
    capture.set_defaults(handler=command_capture)

    correct = commands.add_parser("correct")
    correct.add_argument("--domain", choices=sorted(DOMAINS), required=True)
    correct.add_argument("--record-id", required=True)
    correct.add_argument("--input", required=True)
    correct.add_argument("--expected-version", type=int, required=True)
    correct.add_argument("--reason", required=True)
    correct.add_argument("--apply", action="store_true")
    correct.set_defaults(handler=command_correct)

    forget_plan_parser = commands.add_parser("forget-plan")
    forget_plan_parser.add_argument("--domain", choices=sorted(DOMAINS), required=True)
    forget_plan_parser.add_argument("--record-id", required=True)
    forget_plan_parser.set_defaults(handler=command_forget_plan)

    forget = commands.add_parser("forget")
    forget.add_argument("--domain", choices=sorted(DOMAINS), required=True)
    forget.add_argument("--record-id", required=True)
    forget.add_argument("--confirm-record-id", required=True)
    forget.add_argument("--reason", required=True)
    forget.add_argument("--apply", action="store_true")
    forget.set_defaults(handler=command_forget)

    opt_out = commands.add_parser("opt-out")
    opt_out.add_argument("--scope", choices=["global", "domain", "source", "record-type"], required=True)
    opt_out.add_argument("--key")
    opt_out.add_argument("--enabled", choices=["yes", "no"], required=True)
    opt_out.add_argument("--reason", required=True)
    opt_out.add_argument("--apply", action="store_true")
    opt_out.set_defaults(handler=command_opt_out)

    redact = commands.add_parser("redact")
    redact.add_argument("--input", required=True)
    redact.set_defaults(handler=command_redact)

    project = commands.add_parser("project")
    project.add_argument("--apply", action="store_true")
    project.set_defaults(handler=command_project)

    reconcile = commands.add_parser("reconcile-readback")
    reconcile.add_argument("--input", default=str(READBACK_PATH))
    reconcile.add_argument("--apply", action="store_true")
    reconcile.set_defaults(handler=command_reconcile)

    prepare_pb = commands.add_parser("prepare-playbook")
    prepare_pb.add_argument("--input", required=True)
    prepare_pb.add_argument("--apply", action="store_true")
    prepare_pb.set_defaults(handler=command_prepare_playbook)

    review_pb = commands.add_parser("review-playbook")
    review_pb.add_argument("--playbook-id", required=True)
    review_pb.add_argument("--decision", choices=["approve", "reject"], required=True)
    review_pb.add_argument("--reviewer", required=True)
    review_pb.add_argument("--reason", required=True)
    review_pb.add_argument("--expected-digest", required=True)
    review_pb.add_argument("--apply", action="store_true")
    review_pb.set_defaults(handler=command_review_playbook)

    prepare_pub = commands.add_parser("prepare-publication")
    prepare_pub.add_argument("--playbook-id", required=True)
    prepare_pub.add_argument("--destination", required=True)
    prepare_pub.add_argument("--confirmation-id", required=True)
    prepare_pub.add_argument("--apply", action="store_true")
    prepare_pub.set_defaults(handler=command_prepare_publication)

    attempt = commands.add_parser("record-publication-attempt")
    attempt.add_argument("--playbook-id", required=True)
    attempt.add_argument("--package-digest", required=True)
    attempt.add_argument("--confirmation-id", required=True)
    attempt.add_argument("--apply", action="store_true")
    attempt.set_defaults(handler=command_attempt_publication)

    verify = commands.add_parser("verify-publication")
    verify.add_argument("--playbook-id", required=True)
    verify.add_argument("--readback", required=True)
    verify.add_argument("--apply", action="store_true")
    verify.set_defaults(handler=command_verify_publication)
    return root


def main() -> None:
    args = parser().parse_args()
    try:
        args.handler(args)
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main()
