#!/usr/bin/env python3
"""Deterministic controls for MONDAY Core routing and synthesis validation."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


SKILL_ROOT = Path(__file__).resolve().parents[1]
PLUGIN_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_PATH = SKILL_ROOT / "references" / "capability-registry.json"

ALLOWED_INTENTS = {
    "information",
    "exploration",
    "judgment",
    "decision",
    "planning",
    "execution",
    "review",
    "accountability",
    "conversation",
}
SOURCE_STATES = {"available", "empty", "partial", "stale", "unavailable", "blocked", "unknown"}
INCOMPLETE_SOURCE_STATES = {"partial", "stale", "unavailable", "blocked", "unknown"}
SYNTHESIS_STATES = {"draft", "partial", "blocked", "complete"}
CONFIRMATION_STATES = {"missing", "requested", "confirmed"}
ACTION_STATES = {"drafted", "confirmed", "attempted", "verified", "blocked", "failed"}
QA_VERDICTS = {"PASS", "PASS WITH CONDITIONS", "FAIL"}


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"File not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {path}: {exc}") from exc


def emit(payload: Any) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def parse_aware_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def skill_frontmatter_name(path: Path) -> str | None:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"(?m)^name:\s*['\"]?([^'\"\n]+)['\"]?\s*$", text)
    return match.group(1).strip() if match else None


def registry_maps(registry: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    capabilities = {item["id"]: item for item in registry.get("capabilities", []) if isinstance(item, dict) and "id" in item}
    sources = {item["id"]: item for item in registry.get("sourceLanes", []) if isinstance(item, dict) and "id" in item}
    records = {item["id"]: item for item in registry.get("records", []) if isinstance(item, dict) and "id" in item}
    return capabilities, sources, records


def duplicates(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    repeated: set[str] = set()
    for value in values:
        if value in seen:
            repeated.add(value)
        seen.add(value)
    return sorted(repeated)


def validate_registry(registry: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    if registry.get("schemaVersion") != 1:
        errors.append("Registry schemaVersion must be 1.")
    if registry.get("plugin") != "monday":
        errors.append("Registry plugin must be monday.")

    raw_capabilities = registry.get("capabilities", [])
    raw_sources = registry.get("sourceLanes", [])
    raw_records = registry.get("records", [])
    if not isinstance(raw_capabilities, list) or not raw_capabilities:
        errors.append("Registry requires a non-empty capabilities array.")
        raw_capabilities = []
    if not isinstance(raw_sources, list) or not raw_sources:
        errors.append("Registry requires a non-empty sourceLanes array.")
        raw_sources = []
    if not isinstance(raw_records, list) or not raw_records:
        errors.append("Registry requires a non-empty records array.")
        raw_records = []

    capability_ids = [item.get("id", "") for item in raw_capabilities if isinstance(item, dict)]
    source_ids = [item.get("id", "") for item in raw_sources if isinstance(item, dict)]
    record_ids = [item.get("id", "") for item in raw_records if isinstance(item, dict)]
    for label, values in (("capability", capability_ids), ("source", source_ids), ("record", record_ids)):
        repeated = duplicates(values)
        if repeated:
            errors.append(f"Duplicate {label} IDs: {', '.join(repeated)}")
        if any(not value for value in values):
            errors.append(f"Every {label} entry requires a non-empty id.")

    capabilities, sources, records = registry_maps(registry)
    orchestrator = registry.get("orchestrator")
    if orchestrator not in capabilities:
        errors.append("Registry orchestrator must name a registered capability.")

    domains = set(registry.get("domains", []))
    for capability_id, capability in capabilities.items():
        if not isinstance(capability.get("family"), str) or not capability.get("family", "").strip():
            errors.append(f"Capability {capability_id} requires a non-empty family.")
        if not isinstance(capability.get("routeWhen"), str) or not capability.get("routeWhen", "").strip():
            errors.append(f"Capability {capability_id} requires a non-empty routeWhen rule.")
        capability_domains = capability.get("domains", [])
        if not isinstance(capability_domains, list) or not capability_domains:
            errors.append(f"Capability {capability_id} requires at least one domain.")
        unknown_domains = sorted(set(capability_domains) - domains)
        if unknown_domains:
            errors.append(f"Capability {capability_id} uses unknown domains: {', '.join(unknown_domains)}")
        requirements = capability.get("requires", [])
        if not isinstance(requirements, list):
            errors.append(f"Capability {capability_id} requires must be an array.")
            requirements = []
        for requirement in requirements:
            if requirement not in capabilities:
                errors.append(f"Capability {capability_id} requires unknown capability {requirement}.")
            if requirement == capability_id:
                errors.append(f"Capability {capability_id} cannot require itself.")

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(capability_id: str, trail: list[str]) -> None:
        if capability_id in visiting:
            errors.append("Capability dependency cycle: " + " -> ".join(trail + [capability_id]))
            return
        if capability_id in visited or capability_id not in capabilities:
            return
        visiting.add(capability_id)
        for requirement in capabilities[capability_id].get("requires", []):
            visit(requirement, trail + [capability_id])
        visiting.remove(capability_id)
        visited.add(capability_id)

    for capability_id in capabilities:
        visit(capability_id, [])

    for record_id, record in records.items():
        if record.get("domain") not in domains:
            errors.append(f"Record {record_id} has an unknown domain.")
        if record.get("owner") not in capabilities:
            errors.append(f"Record {record_id} owner is not a registered capability.")
        if not isinstance(record.get("environment"), str) or not record.get("environment", "").strip():
            errors.append(f"Record {record_id} requires a non-empty environment route.")

    required_records = {
        "project-knowledge",
        "decision-ledger",
        "meeting-continuity",
        "personal-project-knowledge",
        "activity-ledger",
        "monday-operations",
        "captains-log",
        "research-chronicle",
    }
    missing_records = sorted(required_records - set(records))
    if missing_records:
        errors.append("Missing authoritative record routes: " + ", ".join(missing_records))

    required_sources = {"outlook-calendar", "outlook-email", "onedrive-files", "teams", "sharepoint-files"}
    missing_sources = sorted(required_sources - set(sources))
    if missing_sources:
        errors.append("Missing canonical source lanes: " + ", ".join(missing_sources))
    for source_id, source in sources.items():
        if not isinstance(source.get("route"), str) or not source.get("route", "").strip():
            errors.append(f"Source {source_id} requires a non-empty connector route.")
        if not isinstance(source.get("family"), str) or not source.get("family", "").strip():
            errors.append(f"Source {source_id} requires a non-empty family.")

    required_evidence = {"observed", "reported", "inferred", "supported", "validated", "proposed", "decided", "attempted", "verified", "unknown", "blocked", "unresolved"}
    missing_evidence = sorted(required_evidence - set(registry.get("evidenceClasses", [])))
    if missing_evidence:
        errors.append("Missing evidence classes: " + ", ".join(missing_evidence))

    skill_dirs = {
        child.name
        for child in (PLUGIN_ROOT / "skills").iterdir()
        if child.is_dir() and (child / "SKILL.md").exists()
    }
    unregistered = sorted(skill_dirs - set(capabilities))
    missing_skill_dirs = sorted(set(capabilities) - skill_dirs)
    if unregistered:
        errors.append("Plugin skills missing from registry: " + ", ".join(unregistered))
    if missing_skill_dirs:
        errors.append("Registry capabilities missing skill directories: " + ", ".join(missing_skill_dirs))
    for capability_id in sorted(skill_dirs & set(capabilities)):
        declared = skill_frontmatter_name(PLUGIN_ROOT / "skills" / capability_id / "SKILL.md")
        if declared != capability_id:
            errors.append(f"Skill {capability_id} declares frontmatter name {declared!r}.")

    independent = set(registry.get("independentPlugins", []))
    overlap = sorted(independent & set(capabilities))
    if overlap:
        errors.append("Independent plugins cannot be MONDAY capabilities: " + ", ".join(overlap))
    if not independent.issuperset({"atlas", "nexus", "crg-notebook-reviewer"}):
        warnings.append("Independent plugin registry should include Atlas, Nexus, and CRG Notebook Reviewer.")

    return {
        "valid": not errors,
        "schemaVersion": registry.get("schemaVersion"),
        "capabilityCount": len(capabilities),
        "sourceLaneCount": len(sources),
        "recordCount": len(records),
        "errors": errors,
        "warnings": warnings,
    }


def expand_capabilities(requested: Iterable[str], capabilities: dict[str, dict[str, Any]]) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()

    def add(capability_id: str) -> None:
        if capability_id in seen:
            return
        for requirement in capabilities[capability_id].get("requires", []):
            add(requirement)
        seen.add(capability_id)
        ordered.append(capability_id)

    for capability_id in requested:
        add(capability_id)
    return ordered


def preflight(request: dict[str, Any], registry: dict[str, Any]) -> dict[str, Any]:
    registry_check = validate_registry(registry)
    errors = list(registry_check["errors"])
    stops: list[dict[str, str]] = []
    warnings: list[str] = []
    capabilities, sources, records = registry_maps(registry)

    if request.get("schemaVersion") != 1:
        errors.append("Request schemaVersion must be 1.")
    request_id = request.get("requestID")
    if not isinstance(request_id, str) or not request_id.strip():
        errors.append("Request requires a non-empty requestID.")
    intent = request.get("intent")
    if intent not in ALLOWED_INTENTS:
        errors.append("Request intent is invalid.")
    if not isinstance(request.get("timeHorizon"), str) or not request.get("timeHorizon", "").strip():
        errors.append("Request requires a non-empty timeHorizon.")

    requested_domains = request.get("domains", [])
    if not isinstance(requested_domains, list) or not requested_domains:
        errors.append("Request requires at least one domain.")
        requested_domains = []
    unknown_domains = sorted(set(requested_domains) - set(registry.get("domains", [])))
    if unknown_domains:
        errors.append("Unknown domains: " + ", ".join(unknown_domains))

    requested_capabilities = request.get("capabilities", [])
    if not isinstance(requested_capabilities, list):
        errors.append("capabilities must be an array.")
        requested_capabilities = []
    unknown_capabilities = sorted(set(requested_capabilities) - set(capabilities))
    if unknown_capabilities:
        errors.append("Unknown capabilities: " + ", ".join(unknown_capabilities))

    requested_sources = request.get("sourceLanes", [])
    if not isinstance(requested_sources, list):
        errors.append("sourceLanes must be an array.")
        requested_sources = []
    unknown_sources = sorted(set(requested_sources) - set(sources))
    if unknown_sources:
        errors.append("Unknown source lanes: " + ", ".join(unknown_sources))

    route = [registry.get("orchestrator", "monday-core")]
    route.extend(requested_capabilities)
    if request.get("currentEvidenceRequired"):
        route.append("monday-source-health")
    if "personal" in requested_domains:
        route.append("monday-personal-projects")
    if "professional" in requested_domains:
        route.append("monday-thermo-core")
    if request.get("consequential") and "professional" in requested_domains:
        route.append(registry["quality"]["thermoConsequential"])
    if request.get("publishToCommandCenter"):
        route.extend(["monday-planning-pipeline", "monday-command-center"])

    if not errors:
        route = expand_capabilities(route, capabilities)
    else:
        route = list(dict.fromkeys(item for item in route if item in capabilities))

    external_actions = request.get("externalActions", [])
    if not isinstance(external_actions, list):
        errors.append("externalActions must be an array.")
        external_actions = []
    normalized_actions: list[dict[str, Any]] = []
    for index, action in enumerate(external_actions):
        if not isinstance(action, dict):
            errors.append(f"externalActions[{index}] must be an object.")
            continue
        kind = action.get("kind")
        target = action.get("target")
        confirmation = action.get("confirmation", "missing")
        if not isinstance(kind, str) or not kind.strip():
            errors.append(f"externalActions[{index}] requires a kind.")
        if not isinstance(target, str) or not target.strip():
            errors.append(f"externalActions[{index}] requires an exact target.")
        if confirmation not in CONFIRMATION_STATES:
            errors.append(f"externalActions[{index}] has invalid confirmation state.")
        allowed_to_attempt = confirmation == "confirmed"
        if not allowed_to_attempt:
            stops.append({
                "code": "confirmation-required",
                "message": f"Stop before {kind or 'external action'} for {target or 'unspecified target'} until confirmed.",
            })
        normalized_actions.append({
            "kind": kind,
            "target": target,
            "confirmation": confirmation,
            "allowedToAttempt": allowed_to_attempt,
            "verificationRequired": True,
        })

    if request.get("currentEvidenceRequired") and not requested_sources:
        warnings.append("Current evidence is required but no connected source lanes were named; source selection remains an explicit runtime step.")

    record_routes = [record for record in records.values() if record.get("domain") in requested_domains]
    quality_gates: list[str] = []
    if request.get("consequential") and "professional" in requested_domains:
        quality_gates.append("monday-thermo-quality-assurance")
    if request.get("consequential") and (set(requested_domains) - {"professional"}):
        quality_gates.append("independent cross-domain consistency review")
    if request.get("publishToCommandCenter"):
        quality_gates.append("matching planID and schema readback")

    status = "invalid" if errors else ("confirmation_required" if stops else "ready")
    return {
        "schemaVersion": 1,
        "requestID": request_id,
        "status": status,
        "routing": route,
        "sourceLanes": [sources[source_id] for source_id in requested_sources if source_id in sources],
        "recordRoutes": record_routes,
        "qualityGates": quality_gates,
        "publication": {
            "requested": bool(request.get("publishToCommandCenter")),
            "requiredState": "displayed" if request.get("publishToCommandCenter") else "not-requested",
        },
        "externalActions": normalized_actions,
        "stops": stops,
        "warnings": warnings,
        "errors": errors,
    }


def validate_synthesis(payload: dict[str, Any], registry: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    _, registered_sources, records = registry_maps(registry)
    evidence_classes = set(registry.get("evidenceClasses", []))

    if payload.get("schemaVersion") != 1:
        errors.append("Synthesis schemaVersion must be 1.")
    if not isinstance(payload.get("requestID"), str) or not payload.get("requestID", "").strip():
        errors.append("Synthesis requires a non-empty requestID.")
    status = payload.get("status")
    if status not in SYNTHESIS_STATES:
        errors.append("Synthesis status is invalid.")

    source_health = payload.get("sourceHealth", [])
    if not isinstance(source_health, list):
        errors.append("sourceHealth must be an array.")
        source_health = []
    known_source_ids: set[str] = set(records)
    required_source_states: list[str] = []
    seen_source_ids: set[str] = set()
    for index, source in enumerate(source_health):
        if not isinstance(source, dict):
            errors.append(f"sourceHealth[{index}] must be an object.")
            continue
        source_id = source.get("sourceID")
        source_state = source.get("status")
        if not isinstance(source_id, str) or not source_id:
            errors.append(f"sourceHealth[{index}] requires sourceID.")
        else:
            if source_id in seen_source_ids:
                errors.append(f"sourceHealth[{index}] duplicates sourceID {source_id}.")
            seen_source_ids.add(source_id)
            known_source_ids.add(source_id)
            if source_id not in registered_sources and source_id not in records:
                warnings.append(f"Source {source_id} is not in the core registry; preserve its explicit route and scope.")
        if source_state not in SOURCE_STATES:
            errors.append(f"sourceHealth[{index}] has invalid status.")
        required = source.get("required", True)
        if not isinstance(required, bool):
            errors.append(f"sourceHealth[{index}].required must be a boolean.")
            required = True
        if source_state in SOURCE_STATES and required:
            required_source_states.append(source_state)
        if not isinstance(source.get("scope"), str) or not source.get("scope", "").strip():
            errors.append(f"sourceHealth[{index}] requires an explicit scope.")
        if source_state in {"available", "empty"}:
            for field in ("attemptedAt", "succeededAt"):
                if parse_aware_timestamp(source.get(field)) is None:
                    errors.append(f"sourceHealth[{index}] with status {source_state} requires timezone-aware {field}.")
            attempted_at = parse_aware_timestamp(source.get("attemptedAt"))
            succeeded_at = parse_aware_timestamp(source.get("succeededAt"))
            if attempted_at and succeeded_at and succeeded_at < attempted_at:
                errors.append(f"sourceHealth[{index}] succeededAt precedes attemptedAt.")
        for field in ("itemCount", "processedCount", "unresolvedCount"):
            value = source.get(field)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                errors.append(f"sourceHealth[{index}].{field} must be a non-negative integer.")
        item_count = source.get("itemCount")
        processed_count = source.get("processedCount")
        if isinstance(item_count, int) and isinstance(processed_count, int) and processed_count > item_count:
            errors.append(f"sourceHealth[{index}] processedCount exceeds itemCount.")
        if source_state == "empty" and item_count != 0:
            errors.append(f"sourceHealth[{index}] with status empty must have itemCount 0.")

    if payload.get("currentEvidenceRequired") and not source_health:
        errors.append("Current synthesis requires explicit sourceHealth.")
    if payload.get("currentEvidenceRequired") and source_health and not required_source_states:
        errors.append("Current synthesis requires at least one required source.")
    if payload.get("currentEvidenceRequired") and status == "complete" and any(state in INCOMPLETE_SOURCE_STATES for state in required_source_states):
        errors.append("A complete current synthesis cannot hide incomplete required source state.")

    claims = payload.get("claims", [])
    if not isinstance(claims, list):
        errors.append("claims must be an array.")
        claims = []
    for index, claim in enumerate(claims):
        if not isinstance(claim, dict):
            errors.append(f"claims[{index}] must be an object.")
            continue
        if not isinstance(claim.get("statement"), str) or not claim.get("statement", "").strip():
            errors.append(f"claims[{index}] requires a statement.")
        evidence_class = claim.get("evidenceClass")
        if evidence_class not in evidence_classes:
            errors.append(f"claims[{index}] has invalid evidenceClass.")
        source_ids = claim.get("sourceIDs", [])
        if not isinstance(source_ids, list):
            errors.append(f"claims[{index}].sourceIDs must be an array.")
            source_ids = []
        if evidence_class not in {"proposed", "unknown", "blocked", "unresolved"} and not source_ids:
            errors.append(f"claims[{index}] requires at least one sourceID.")
        unknown_claim_sources = sorted(set(source_ids) - known_source_ids)
        if unknown_claim_sources:
            errors.append(f"claims[{index}] cites unknown sources: {', '.join(unknown_claim_sources)}")

    gaps = payload.get("gaps", [])
    if not isinstance(gaps, list):
        errors.append("gaps must be an array.")

    qa = payload.get("qa", {})
    if not isinstance(qa, dict):
        errors.append("qa must be an object.")
        qa = {}
    if qa.get("required"):
        verdict = qa.get("verdict")
        if verdict not in QA_VERDICTS:
            errors.append("Required QA needs a recognized verdict.")
        elif verdict == "FAIL" and status == "complete":
            errors.append("A synthesis with QA verdict FAIL cannot be complete.")

    publication = payload.get("publication", {})
    if not isinstance(publication, dict):
        errors.append("publication must be an object.")
        publication = {}
    if publication.get("requested"):
        publication_state = publication.get("state")
        if publication_state not in {"drafted", "published", "displayed", "blocked", "failed"}:
            errors.append("Requested publication requires a valid state.")
        if publication_state == "displayed":
            if not publication.get("planID") or publication.get("planID") != publication.get("displayedPlanID"):
                errors.append("Displayed publication requires matching planID and displayedPlanID.")
            if not isinstance(publication.get("schemaVersion"), int):
                errors.append("Displayed publication requires an integer schemaVersion.")

    actions = payload.get("externalActions", [])
    if not isinstance(actions, list):
        errors.append("externalActions must be an array.")
        actions = []
    for index, action in enumerate(actions):
        if not isinstance(action, dict):
            errors.append(f"externalActions[{index}] must be an object.")
            continue
        action_state = action.get("state")
        if action_state not in ACTION_STATES:
            errors.append(f"externalActions[{index}] has invalid state.")
        if action_state == "verified" and not isinstance(action.get("readback"), str):
            errors.append(f"externalActions[{index}] requires readback when verified.")
        if action_state == "verified" and not action.get("readback", "").strip():
            errors.append(f"externalActions[{index}] requires non-empty readback when verified.")

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def command_registry(args: argparse.Namespace, registry: dict[str, Any]) -> int:
    family = args.family
    capabilities = registry.get("capabilities", [])
    if family:
        capabilities = [item for item in capabilities if item.get("family") == family]
    emit({
        "schemaVersion": registry.get("schemaVersion"),
        "plugin": registry.get("plugin"),
        "orchestrator": registry.get("orchestrator"),
        "capabilities": capabilities,
        "sourceLanes": registry.get("sourceLanes", []),
        "records": registry.get("records", []),
        "independentPlugins": registry.get("independentPlugins", []),
    })
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="MONDAY Core deterministic orchestration controls")
    parser.add_argument("--registry", type=Path, default=REGISTRY_PATH)
    subparsers = parser.add_subparsers(dest="command", required=True)

    registry_parser = subparsers.add_parser("registry", help="inspect the capability registry")
    registry_parser.add_argument("--family")
    subparsers.add_parser("validate-registry", help="validate registry and packaged skill coverage")
    preflight_parser = subparsers.add_parser("preflight", help="build and validate an orchestration route")
    preflight_parser.add_argument("--request", type=Path, required=True)
    synthesis_parser = subparsers.add_parser("validate-synthesis", help="validate a final synthesis envelope")
    synthesis_parser.add_argument("--input", type=Path, required=True)

    args = parser.parse_args()
    try:
        registry = load_json(args.registry)
        if not isinstance(registry, dict):
            raise ValueError("Registry must be a JSON object.")
        if args.command == "registry":
            return command_registry(args, registry)
        if args.command == "validate-registry":
            result = validate_registry(registry)
        elif args.command == "preflight":
            request = load_json(args.request)
            if not isinstance(request, dict):
                raise ValueError("Request must be a JSON object.")
            result = preflight(request, registry)
        else:
            payload = load_json(args.input)
            if not isinstance(payload, dict):
                raise ValueError("Synthesis must be a JSON object.")
            result = validate_synthesis(payload, registry)
        emit(result)
        return 0 if result.get("valid", result.get("status") != "invalid") else 1
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
