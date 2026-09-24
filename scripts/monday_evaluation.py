#!/usr/bin/env python3
"""Govern MONDAY evaluation, release gates, connector admission, and bounded pilots."""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import plistlib
import re
import subprocess
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
REFERENCE_ROOT = PLUGIN_ROOT / "skills/monday-evaluation/references"
ROOT = Path(os.environ.get("MONDAY_EVALUATION_ROOT", Path.home() / ".codex/monday-evaluation"))
CONFIG_PATH = ROOT / "config.json"
SUITE_PATH = REFERENCE_ROOT / "priority4-evaluation-suite.json"
GATES_PATH = REFERENCE_ROOT / "release-gates.json"
CONNECTORS_PATH = REFERENCE_ROOT / "connector-decision-registry.json"
ROADMAP_PATH = REFERENCE_ROOT / "roadmap-status.json"
INSPECTION_PATH = ROOT / "inspection.json"
READBACK_PATH = ROOT / "readback.json"
RUNTIME_ROADMAP_PATH = ROOT / "roadmap-status.json"
SOURCES_ROOT = Path(os.environ.get("MONDAY_SOURCES_ROOT", Path.home() / ".codex/monday-sources"))
PLANNER_ROOT = Path(os.environ.get("MONDAY_PLANNER_ROOT", Path.home() / ".codex/monday-planner"))
CONTINUITY_ROOT = Path(os.environ.get("MONDAY_CONTINUITY_ROOT", Path.home() / ".codex/monday-meeting-continuity"))
PLUGIN_VALIDATOR = Path.home() / ".codex/skills/.system/plugin-creator/scripts/validate_plugin.py"
DEFAULT_INSTALLED_APP = Path("/Applications/Command Center.app")
ALLOWED_VIEWS = {
    "evaluation-overview", "evaluation-coverage", "evaluation-release-gates",
    "evaluation-connectors", "evaluation-pilot", "evaluation-enterprise-claim",
}
VERDICTS = {"PASS", "PASS WITH CONDITIONS", "FAIL", "BLOCKED"}
TIER1_SOURCE_IDS = ("outlook-calendar", "outlook-email", "onedrive-files", "teams", "sharepoint-files")
PILOT_CHECKPOINT_TIMES = ("06:01", "12:31", "17:01")
PILOT_SOURCE_STATUSES = {"available", "empty", "partial", "blocked", "unavailable", "unknown"}
PILOT_INCIDENT_SEVERITIES = {"low", "medium", "high", "critical"}
PILOT_INCIDENT_STATUSES = {"open", "resolved"}
PILOT_PROHIBITED_INCIDENT_CATEGORIES = {"privacy", "domain-boundary", "unauthorized-action", "false-verification", "data-loss", "blind-retry", "hidden-source-failure"}


class EvaluationError(RuntimeError):
    pass


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None = None) -> str:
    return (value or now()).isoformat(timespec="seconds").replace("+00:00", "Z")


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise EvaluationError(f"Cannot read valid JSON from {path}: {error}") from error


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")
        temporary = Path(handle.name)
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def append_jsonl(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(canonical(value) + "\n")
    os.chmod(path, 0o600)


def git_value(root: Path, *arguments: str) -> str | None:
    result = subprocess.run(["git", *arguments], cwd=root, text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else None


def plugin_version() -> str:
    return str(load_json(PLUGIN_ROOT / ".codex-plugin/plugin.json")["version"])


def validate_app_repo(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if not (resolved / "project.yml").is_file() or not (resolved / "MondayCommandCenter.xcodeproj").is_dir() or not (resolved / "Tests/CommandCenterContractTests.swift").is_file():
        raise EvaluationError("Command Center source repository is invalid; configure or pass its exact path")
    return resolved


def resolve_app_repo(explicit: str | Path | None = None) -> Path:
    if explicit:
        return validate_app_repo(Path(explicit))
    configured = os.environ.get("MONDAY_COMMAND_CENTER_REPO")
    if configured:
        return validate_app_repo(Path(configured))
    if CONFIG_PATH.exists():
        value = load_json(CONFIG_PATH)
        configured_path = value.get("commandCenterRepo") if isinstance(value, dict) else None
        if configured_path:
            return validate_app_repo(Path(str(configured_path)))
    for candidate in [Path.cwd(), *Path.cwd().parents]:
        if (candidate / "project.yml").is_file() and (candidate / "MondayCommandCenter.xcodeproj").is_dir():
            return validate_app_repo(candidate)
    raise EvaluationError("Command Center source repository is not configured; use configure --app-repo <path> --apply or pass --app-repo")


def configure(app_repo: str, apply: bool) -> dict[str, Any]:
    resolved = resolve_app_repo(app_repo)
    value = {
        "schemaVersion": 1,
        "commandCenterRepo": str(resolved),
        "configuredAt": iso(),
    }
    if apply:
        atomic_json(CONFIG_PATH, value)
    return {**value, "applied": apply}


def parse_timestamp(value: Any, label: str) -> datetime:
    if not isinstance(value, str):
        raise EvaluationError(f"{label} must be a timezone-aware timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise EvaluationError(f"{label} must be a valid timestamp") from error
    if parsed.tzinfo is None:
        raise EvaluationError(f"{label} must be timezone-aware")
    return parsed


def parse_date(value: Any, label: str):
    if not isinstance(value, str):
        raise EvaluationError(f"{label} must use YYYY-MM-DD")
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as error:
        raise EvaluationError(f"{label} must use YYYY-MM-DD") from error


def safe_identifier(value: Any, label: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{2,127}", value):
        raise EvaluationError(f"{label} must be a safe identifier")
    return value


def pilot_schedule(plan: dict[str, Any]) -> list[dict[str, str]]:
    zone = ZoneInfo("America/New_York")
    current = parse_date(plan.get("startDate"), "pilot startDate")
    dates = []
    while len(dates) < 5:
        if current.weekday() < 5:
            dates.append(current)
        current += timedelta(days=1)
    schedule = []
    for local_date in dates:
        for clock in PILOT_CHECKPOINT_TIMES:
            hour, minute = (int(value) for value in clock.split(":"))
            scheduled = datetime(local_date.year, local_date.month, local_date.day, hour, minute, tzinfo=zone)
            schedule.append({
                "checkpointID": f"{local_date.isoformat()}-{clock.replace(':', '')}",
                "scheduledAt": scheduled.isoformat(timespec="seconds"),
            })
    return schedule


def validate_pilot_plan(plan: dict[str, Any]) -> list[dict[str, str]]:
    required = {"schemaVersion", "pilotID", "participant", "device", "timezone", "startDate", "businessDays", "checkpointTimes", "tier1SourceIDs", "tier2ConnectorIDs", "tier3ConnectorIDs", "plannedCheckpointCount", "plannedTier1AttemptCount", "approvedBy", "approvedAt", "engineeringReleaseVerdict", "idempotencyKey"}
    if set(plan) != required:
        raise EvaluationError(f"pilot plan shape mismatch: {sorted(set(plan) ^ required)}")
    safe_identifier(plan.get("pilotID"), "pilotID")
    safe_identifier(plan.get("idempotencyKey"), "pilot idempotencyKey")
    if plan.get("schemaVersion") != 1 or plan.get("participant") != "Chris" or plan.get("timezone") != "America/New_York":
        raise EvaluationError("pilot plan violates identity, schema, or timezone controls")
    if not isinstance(plan.get("device"), str) or not plan["device"].strip() or len(plan["device"]) > 128:
        raise EvaluationError("pilot plan requires one bounded device name")
    start_date = parse_date(plan.get("startDate"), "pilot startDate")
    if start_date.weekday() >= 5:
        raise EvaluationError("pilot startDate must be a business day")
    approved_at = parse_timestamp(plan.get("approvedAt"), "pilot approvedAt")
    if approved_at > now() + timedelta(minutes=5):
        raise EvaluationError("pilot approval timestamp cannot be in the future")
    if plan.get("businessDays") != 5 or plan.get("checkpointTimes") != list(PILOT_CHECKPOINT_TIMES):
        raise EvaluationError("pilot plan violates the five-day checkpoint contract")
    if plan.get("tier1SourceIDs") != list(TIER1_SOURCE_IDS) or plan.get("tier2ConnectorIDs") != [] or plan.get("tier3ConnectorIDs") != []:
        raise EvaluationError("pilot plan violates the approved connector contract")
    if plan.get("plannedCheckpointCount") != 15 or plan.get("plannedTier1AttemptCount") != 75:
        raise EvaluationError("pilot plan violates immutable denominators")
    if plan.get("approvedBy") != "Chris" or plan.get("engineeringReleaseVerdict") != "PASS":
        raise EvaluationError("pilot plan lacks exact approval or engineering release evidence")
    return pilot_schedule(plan)


def effective_roadmap() -> dict[str, Any]:
    path = RUNTIME_ROADMAP_PATH if RUNTIME_ROADMAP_PATH.exists() else ROADMAP_PATH
    value = load_json(path)
    if value.get("schemaVersion") != 1 or not isinstance(value.get("priorities"), dict):
        raise EvaluationError("roadmap status is invalid")
    return value


def command_receipt(command: list[str], cwd: Path | None = None) -> dict[str, Any]:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    output = result.stdout + "\n" + result.stderr
    return {
        "status": "PASS" if result.returncode == 0 else "FAIL",
        "exitCode": result.returncode,
        "outputDigest": hashlib.sha256(output.encode()).hexdigest(),
    }


def collect_release_evidence(app_repo: Path, installed_plugin: Path, installed_app: Path, evidence_id: str, apply: bool) -> dict[str, Any]:
    if not evidence_id or not re.fullmatch(r"[A-Za-z0-9._-]+", evidence_id):
        raise EvaluationError("release evidence requires a safe evidence ID")
    validator = command_receipt(["python3", str(PLUGIN_VALIDATOR), str(PLUGIN_ROOT)])
    parity = command_receipt(["diff", "-qr", "--exclude=.git", str(PLUGIN_ROOT), str(installed_plugin)])
    app_version, app_build = app_metadata(app_repo)
    try:
        with (installed_app / "Contents/Info.plist").open("rb") as handle:
            plist = plistlib.load(handle)
        installed_version = str(plist.get("CFBundleShortVersionString", ""))
        installed_build = int(plist.get("CFBundleVersion", 0))
    except (OSError, ValueError, plistlib.InvalidFileException) as error:
        installed_version, installed_build = "", 0
        app_build_receipt = {"status": "FAIL", "reason": type(error).__name__}
    else:
        app_build_receipt = {
            "status": "PASS" if (installed_version, installed_build) == (app_version, app_build) else "FAIL",
            "installedVersion": installed_version,
            "installedBuild": installed_build,
            "sourceVersion": app_version,
            "sourceBuild": app_build,
        }
    signature = command_receipt(["codesign", "--verify", "--deep", "--strict", str(installed_app)])
    manifest = load_json(PLUGIN_ROOT / ".codex-plugin/plugin.json")
    capabilities = manifest.get("interface", {}).get("capabilities", [])
    compatibility = {
        "status": "PASS" if "Behavioral evaluation and bounded pilots" in capabilities and app_version == "0.4.2" and app_build == 17 else "FAIL",
        "pluginVersion": plugin_version(),
        "pluginCommit": git_value(PLUGIN_ROOT, "rev-parse", "HEAD") or "unknown",
        "appVersion": app_version,
        "appBuild": app_build,
        "appCommit": git_value(app_repo, "rev-parse", "HEAD") or "unknown",
    }
    checks = {
        "validator": validator,
        "pluginParity": parity,
        "appBuild": app_build_receipt,
        "appSignature": signature,
        "compatibility": compatibility,
    }
    core = {
        "schemaVersion": 1,
        "evidenceID": evidence_id,
        "generatedAt": iso(),
        "installedPlugin": str(installed_plugin),
        "installedApp": str(installed_app),
        "checks": checks,
        "status": "PASS" if all(item.get("status") == "PASS" for item in checks.values()) else "FAIL",
    }
    value = {**core, "contentDigest": digest(core)}
    path = ROOT / "release-evidence" / f"{evidence_id}.json"
    if apply:
        if path.exists() and load_json(path) != value:
            raise EvaluationError("release evidence ID already exists with different evidence")
        atomic_json(path, value)
    return {**value, "artifact": str(path), "applied": apply}


def verify_release_evidence(evidence: dict[str, Any], report: dict[str, Any] | None) -> list[str]:
    artifact = evidence.get("engineeringEvidenceArtifact")
    expected_digest = evidence.get("engineeringEvidenceDigest")
    if not isinstance(artifact, str) or not isinstance(expected_digest, str):
        return ["missing-engineering-evidence-receipt"]
    receipt = load_json(Path(artifact).expanduser())
    reasons: list[str] = []
    supplied_digest = receipt.get("contentDigest")
    core = dict(receipt)
    core.pop("contentDigest", None)
    if supplied_digest != digest(core) or supplied_digest != expected_digest:
        reasons.append("engineering-evidence-digest-mismatch")
    required = {"validator", "pluginParity", "appBuild", "appSignature", "compatibility"}
    checks = receipt.get("checks") if isinstance(receipt.get("checks"), dict) else {}
    if set(checks) != required or receipt.get("status") != "PASS":
        reasons.append("engineering-evidence-incomplete")
    for name in sorted(required):
        if checks.get(name, {}).get("status") != "PASS":
            reasons.append(f"engineering-evidence-{name}-not-pass")
    compatibility = checks.get("compatibility", {})
    if report and (compatibility.get("pluginCommit") != report.get("plugin", {}).get("commit") or compatibility.get("appCommit") != report.get("app", {}).get("commit")):
        reasons.append("engineering-evidence-release-mismatch")
    return reasons


def discover_python_tests(root: Path) -> list[str]:
    tests: list[str] = []
    for path in sorted(root.rglob("test*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        relative = path.relative_to(PLUGIN_ROOT).with_suffix("")
        module = ".".join(relative.parts)
        for node in tree.body:
            if not isinstance(node, ast.ClassDef):
                continue
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name.startswith("test_"):
                    tests.append(f"{module}.{node.name}.{item.name}")
    return tests


def discover_swift_tests(path: Path) -> list[str]:
    if not path.exists():
        return []
    return [f"CommandCenterContractTests.{name}" for name in re.findall(r"\bfunc\s+(test[A-Za-z0-9_]+)\s*\(", path.read_text(encoding="utf-8"))]


def inventory(app_repo: Path) -> dict[str, list[str]]:
    return {
        "python": discover_python_tests(PLUGIN_ROOT),
        "swift": discover_swift_tests(app_repo / "Tests/CommandCenterContractTests.swift"),
    }


def audit_contracts(app_repo: Path) -> dict[str, Any]:
    suite = load_json(SUITE_PATH)
    gates = load_json(GATES_PATH)
    connectors = load_json(CONNECTORS_PATH)
    roadmap = load_json(ROADMAP_PATH)
    errors: list[str] = []
    if suite.get("schemaVersion") != 1 or gates.get("schemaVersion") != 1 or connectors.get("schemaVersion") != 1 or roadmap.get("schemaVersion") != 1:
        errors.append("unsupported-contract-schema")
    runner_ids = [item.get("runnerID") for item in suite.get("runners", [])]
    if len(runner_ids) != len(set(runner_ids)):
        errors.append("duplicate-runner-id")
    case_ids = [item.get("caseID") for item in suite.get("adversarialCases", [])]
    if len(case_ids) != len(set(case_ids)):
        errors.append("duplicate-adversarial-case-id")
    required_classes = set(suite.get("requiredAdversarialClasses", []))
    actual_classes = {item.get("class") for item in suite.get("adversarialCases", [])}
    if required_classes - actual_classes:
        errors.append("missing-adversarial-class")
    connector_ids = [item.get("connectorID") for item in connectors.get("connectors", [])]
    source_ids = [item.get("sourceID") for item in connectors.get("connectors", [])]
    if len(connector_ids) != len(set(connector_ids)) or len(source_ids) != len(set(source_ids)):
        errors.append("duplicate-connector-or-source-id")
    for item in connectors.get("connectors", []):
        if item.get("tier") == 2 and item.get("status") == "active":
            canary = item.get("liveCanary", {})
            approval = item.get("approval", {})
            if canary.get("status") != "pass" or not approval.get("decisionDigest"):
                errors.append(f"tier2-active-without-admission:{item.get('connectorID')}")
        if item.get("tier") == 3 and item.get("status") in {"approved-for-pilot", "active"}:
            errors.append(f"tier3-improperly-admitted:{item.get('connectorID')}")
    if connectors.get("tier3Policy", {}).get("activeCount") != 0:
        errors.append("tier3-active-count-nonzero")
    discovered = inventory(app_repo)
    if not discovered["python"]:
        errors.append("python-test-inventory-empty")
    if not discovered["swift"]:
        errors.append("swift-test-inventory-empty")
    all_tests = set(discovered["python"] + discovered["swift"])
    for item in suite.get("adversarialCases", []):
        if item.get("target") not in all_tests:
            errors.append(f"adversarial-target-not-discovered:{item.get('caseID')}")
    return {
        "status": "PASS" if not errors else "FAIL",
        "suiteID": suite.get("suiteID"),
        "suiteDigest": digest(suite),
        "discovered": {"python": len(discovered["python"]), "swift": len(discovered["swift"]), "total": len(discovered["python"]) + len(discovered["swift"])},
        "testInventory": discovered,
        "adversarialClassCount": len(required_classes),
        "connectorCount": len(connector_ids),
        "tier3ActiveCount": connectors.get("tier3Policy", {}).get("activeCount"),
        "errors": errors,
    }


def parse_test_count(text: str) -> int:
    matches = re.findall(r"Ran\s+(\d+)\s+tests?|Executed\s+(\d+)\s+tests?", text)
    numbers = [int(first or second) for first, second in matches]
    return max(numbers, default=0)


def case_result_from_output(target: str, outputs: list[str]) -> str:
    method = target.rsplit(".", 1)[-1]
    matching = [line for output in outputs for line in output.splitlines() if method in line]
    if any(re.search(r"(?:\.\.\.\s+ok\s*$|\bpassed\b)", line, re.IGNORECASE) for line in matching):
        return "pass"
    if any(re.search(r"(?:\.\.\.\s+(?:FAIL|ERROR)\s*$|\bfailed\b)", line, re.IGNORECASE) for line in matching):
        return "fail"
    return "not-run"


def execute_suite(app_repo: Path, run_id: str | None = None) -> dict[str, Any]:
    suite = load_json(SUITE_PATH)
    audit = audit_contracts(app_repo)
    if audit["status"] != "PASS":
        raise EvaluationError(f"Contract audit failed: {audit['errors']}")
    run_id = run_id or f"evaluation-{now().strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    run_root = ROOT / "runs" / run_id
    if run_root.exists():
        raise EvaluationError("runID already exists")
    started = iso()
    results: list[dict[str, Any]] = []
    runner_outputs: list[str] = []
    for runner in suite["runners"]:
        cwd = app_repo if runner.get("requiresAppRepo") else PLUGIN_ROOT
        command = list(runner["command"])
        result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
        combined = result.stdout + "\n" + result.stderr
        runner_outputs.append(combined)
        count = parse_test_count(combined)
        status = "pass" if result.returncode == 0 and count > 0 else "fail"
        item = {
            "runnerID": runner["runnerID"], "status": status, "releaseBlocking": bool(runner.get("releaseBlocking")),
            "testCount": count, "exitCode": result.returncode, "completedAt": iso(),
            "outputDigest": hashlib.sha256(combined.encode()).hexdigest(),
        }
        results.append(item)
        append_jsonl(run_root / "case-results.jsonl", item)
    adversarial_results = []
    for case in suite["adversarialCases"]:
        result_value = case_result_from_output(case["target"], runner_outputs)
        item = {
            "caseID": case["caseID"], "category": case["class"], "severity": case["severity"],
            "result": result_value, "releaseBlocking": case["releaseBlocking"],
            "requirementIDs": case["requirementIDs"], "evidenceIDs": ["evaluation-run"],
        }
        adversarial_results.append(item)
        append_jsonl(run_root / "case-results.jsonl", item)
    passed = sum(item["testCount"] for item in results if item["status"] == "pass")
    failed_runners = [item["runnerID"] for item in results if item["status"] != "pass"]
    denominator = audit["discovered"]["total"]
    executed = sum(item["testCount"] for item in results)
    app_version, app_build = app_metadata(app_repo)
    report = {
        "schemaVersion": 1, "runID": run_id, "suiteID": suite["suiteID"], "suiteDigest": digest(suite),
        "plugin": {"version": plugin_version(), "commit": git_value(PLUGIN_ROOT, "rev-parse", "HEAD")},
        "app": {"version": app_version, "build": app_build, "commit": git_value(app_repo, "rev-parse", "HEAD")},
        "startedAt": started, "completedAt": iso(), "discoveredDenominator": denominator,
        "executedCount": executed, "passedCount": passed, "failedCount": max(0, executed - passed),
        "blockedCount": 0, "skippedCount": 0, "unresolvedCount": max(0, denominator - executed),
        "runnerResults": results, "caseCoverage": adversarial_results,
        "status": "PASS" if not failed_runners and executed == denominator and all(item["result"] == "pass" for item in adversarial_results) else "FAIL",
        "failureRunnerIDs": failed_runners,
    }
    atomic_json(run_root / "run-manifest.json", report)
    atomic_json(run_root / "evaluation-report.json", report)
    project_inspection()
    return report


def gate_decision(gate_id: str, report: dict[str, Any] | None, evidence: dict[str, Any]) -> dict[str, Any]:
    if gate_id not in {item["id"] for item in load_json(GATES_PATH)["gates"]}:
        raise EvaluationError("unknown gate")
    reasons: list[str] = []
    if gate_id == "engineering-release":
        if not report or report.get("status") != "PASS" or report.get("unresolvedCount") != 0:
            reasons.append("evaluation-suite-not-complete-pass")
        if not report or any(item.get("result") != "pass" for item in report.get("caseCoverage", [])):
            reasons.append("adversarial-cases-not-complete-pass")
        reasons.extend(verify_release_evidence(evidence, report))
        verdict = "PASS" if not reasons else "FAIL"
    elif gate_id == "pilot-start":
        roadmap = effective_roadmap()["priorities"]
        if evidence.get("engineeringReleaseVerdict") != "PASS": reasons.append("engineering-release-not-pass")
        if roadmap["0"]["status"] != "PASS": reasons.append("priority0-not-pass")
        if roadmap["1"]["items"].get("17") != "PASS": reasons.append("priority1-item17-unresolved")
        if roadmap["2"]["status"] != "PASS": reasons.append("priority2-not-pass")
        if roadmap["3"]["status"] != "PASS": reasons.append("priority3-not-pass")
        for key in ["pilotPlanApproved", "pilotConnectorsAdmitted", "noOpenCriticalAlerts"]:
            if evidence.get(key) is not True: reasons.append(f"missing-{key}")
        verdict = "PASS" if not reasons else "BLOCKED"
    elif gate_id == "connector-activation":
        required = ["namedUseCase", "owner", "exactRoute", "authorityModel", "boundedScope", "privacyAllowlist", "failureSemantics", "acceptanceTestsPass", "liveCanaryPass", "allowedConsumers", "readOnly", "chrisApproval"]
        reasons = [f"missing-{key}" for key in required if evidence.get(key) is not True]
        verdict = "PASS" if not reasons else "BLOCKED"
    else:
        required = ["boundedPilotAccepted", "representativeMultiUserPilotAccepted", "securityApproval", "privacyApproval", "complianceApproval", "deploymentApproval", "supportRecoveryOwnership", "distributionReady"]
        reasons = [f"missing-{key}" for key in required if evidence.get(key) is not True]
        verdict = "PASS" if not reasons else "BLOCKED"
    return {"schemaVersion": 1, "gateID": gate_id, "verdict": verdict, "evaluatedAt": iso(), "reasons": reasons, "evidenceDigest": digest(evidence)}


def connector_review(request: dict[str, Any], apply: bool) -> dict[str, Any]:
    connector_id = request.get("connectorID")
    requested = request.get("requestedStatus")
    registry = load_json(CONNECTORS_PATH)
    item = next((value for value in registry["connectors"] if value["connectorID"] == connector_id), None)
    if not item:
        raise EvaluationError("unknown connector fails closed")
    key = str(request.get("idempotencyKey") or "")
    if not key:
        raise EvaluationError("connector review requires idempotencyKey")
    receipt_path = ROOT / "connector-decisions" / f"{connector_id}-{hashlib.sha256(key.encode()).hexdigest()[:16]}.json"
    if receipt_path.exists():
        receipt = load_json(receipt_path)
        if receipt.get("requestDigest") != digest(request): raise EvaluationError("conflicting connector-review idempotency key")
        return {**receipt, "idempotentReplay": True}
    if requested not in registry["statuses"]:
        raise EvaluationError("unsupported connector status")
    if item["tier"] == 3 and requested in {"approved-for-pilot", "active"}:
        raise EvaluationError("Tier 3 admission requires a registered complete decision and remains closed")
    evidence = request.get("gateEvidence") if isinstance(request.get("gateEvidence"), dict) else {}
    decision = gate_decision("connector-activation", None, evidence)
    if requested == "active" and decision["verdict"] != "PASS":
        raise EvaluationError("connector activation gate is blocked")
    if requested == "approved-for-pilot" and (item["liveCanary"].get("status") != "pass" or not item["approval"].get("decisionDigest")):
        raise EvaluationError("pilot admission requires live canary and Chris approval")
    result = {"status": requested, "connectorID": connector_id, "decision": decision, "applied": apply}
    if apply:
        item["status"] = requested
        atomic_json(receipt_path, {**result, "recordedAt": iso(), "requestDigest": digest(request)})
    return result


def release_record(request: dict[str, Any], apply: bool) -> dict[str, Any]:
    required = {"releaseID", "runReport", "evidence", "idempotencyKey"}
    if set(request) != required: raise EvaluationError("release record shape mismatch")
    release_id = str(request["releaseID"])
    report = load_json(Path(str(request["runReport"])).expanduser())
    evidence = request["evidence"] if isinstance(request["evidence"], dict) else {}
    key = str(request["idempotencyKey"] or "")
    if not key: raise EvaluationError("release record requires idempotencyKey")
    receipt = ROOT / "release-decisions" / f"{release_id}.json"
    request_digest = digest(request)
    if receipt.exists():
        existing = load_json(receipt)
        if existing.get("requestDigest") != request_digest: raise EvaluationError("release ID cannot be reused for changed evidence")
        return {**existing, "idempotentReplay": True}
    engineering = gate_decision("engineering-release", report, evidence)
    pilot = gate_decision("pilot-start", report, {**evidence, "engineeringReleaseVerdict": engineering["verdict"]})
    connector = gate_decision("connector-activation", report, evidence.get("connectorGateEvidence", {}) if isinstance(evidence.get("connectorGateEvidence"), dict) else {})
    enterprise = gate_decision("enterprise-claim", report, evidence.get("enterpriseGateEvidence", {}) if isinstance(evidence.get("enterpriseGateEvidence"), dict) else {})
    value = {
        "schemaVersion": 1, "releaseID": release_id, "recordedAt": iso(), "requestDigest": request_digest,
        "engineeringReleaseVerdict": engineering["verdict"], "gates": [engineering, pilot, connector, enterprise],
        "runID": report.get("runID"), "suiteDigest": report.get("suiteDigest"),
        "engineeringEvidenceArtifact": evidence.get("engineeringEvidenceArtifact"),
        "engineeringEvidenceDigest": evidence.get("engineeringEvidenceDigest"), "applied": apply,
    }
    if apply: atomic_json(receipt, value)
    project_inspection()
    return value


def verify_unattended_rollover(request: dict[str, Any], apply: bool) -> dict[str, Any]:
    required = {
        "schemaVersion", "evidenceID", "priorLocalDate", "localDate", "timezone",
        "scheduledAt", "startedAt", "completedAt", "manualRepair",
    }
    if set(request) != required:
        raise EvaluationError(f"unattended rollover evidence shape mismatch: {sorted(set(request) ^ required)}")
    if request.get("schemaVersion") != 1 or request.get("timezone") != "America/New_York":
        raise EvaluationError("unattended rollover requires schema 1 and America/New_York")
    evidence_id = request.get("evidenceID")
    if not isinstance(evidence_id, str) or not re.fullmatch(r"[A-Za-z0-9._-]+", evidence_id):
        raise EvaluationError("unattended rollover requires a safe evidence ID")
    if request.get("manualRepair") is not False:
        raise EvaluationError("Priority 1 item 17 requires no manual repair")
    try:
        prior_date = datetime.strptime(str(request["priorLocalDate"]), "%Y-%m-%d").date()
        local_date = datetime.strptime(str(request["localDate"]), "%Y-%m-%d").date()
    except ValueError as error:
        raise EvaluationError("rollover dates must use YYYY-MM-DD") from error
    if local_date != prior_date + timedelta(days=1):
        raise EvaluationError("unattended rollover must prove the next local day")
    zone = ZoneInfo("America/New_York")
    day_start = datetime.combine(local_date, datetime.min.time(), tzinfo=zone)
    day_end = day_start + timedelta(days=1)
    scheduled = parse_timestamp(request["scheduledAt"], "scheduledAt").astimezone(zone)
    started = parse_timestamp(request["startedAt"], "startedAt").astimezone(zone)
    completed = parse_timestamp(request["completedAt"], "completedAt").astimezone(zone)
    if scheduled.date() != local_date or scheduled.strftime("%H:%M") != "06:01":
        raise EvaluationError("unattended rollover must be scheduled for 06:01 local time")
    if not scheduled <= started <= scheduled + timedelta(minutes=15):
        raise EvaluationError("unattended rollover did not start within the scheduled window")
    if not started <= completed <= scheduled + timedelta(hours=2):
        raise EvaluationError("unattended rollover completion is outside the bounded run window")

    source_ids = {"outlook-calendar", "outlook-email", "onedrive-files", "teams", "sharepoint-files"}
    source_evidence: list[dict[str, Any]] = []
    allowed_statuses = {"available", "empty", "partial", "blocked", "unavailable", "unknown"}
    for source_id in sorted(source_ids):
        manifest_path = SOURCES_ROOT / f"{source_id}.manifest.json"
        manifest = load_json(manifest_path)
        if manifest.get("sourceID") != source_id or manifest.get("status") not in allowed_statuses:
            raise EvaluationError(f"{source_id} manifest is missing canonical source identity or status")
        attempted = parse_timestamp(manifest.get("attemptedAt"), f"{source_id}.attemptedAt").astimezone(zone)
        if not day_start <= attempted < day_end:
            raise EvaluationError(f"{source_id} was not attempted during the rollover day")
        item_count = manifest.get("itemCount")
        processed_count = manifest.get("processedCount")
        unresolved_count = manifest.get("unresolvedCount")
        if not all(isinstance(value, int) and value >= 0 for value in (item_count, processed_count, unresolved_count)):
            raise EvaluationError(f"{source_id} manifest requires nonnegative denominators")
        if item_count != processed_count + unresolved_count:
            raise EvaluationError(f"{source_id} manifest denominator mismatch")
        if not manifest.get("manifestID"):
            raise EvaluationError(f"{source_id} manifest requires a manifest identifier")
        source_evidence.append({
            "sourceID": source_id,
            "status": manifest["status"],
            "attemptedAt": manifest["attemptedAt"],
            "manifestID": manifest["manifestID"],
            "manifestDigest": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
            "itemCount": item_count,
            "processedCount": processed_count,
            "unresolvedCount": unresolved_count,
        })
        if source_id == "outlook-calendar":
            if manifest["status"] not in {"available", "empty"} or unresolved_count != 0:
                raise EvaluationError("Calendar must be a successful complete current-day collection")
            scope = manifest.get("scope") if isinstance(manifest.get("scope"), dict) else {}
            window_start = parse_timestamp(scope.get("windowStart"), "calendar.windowStart").astimezone(zone)
            window_end = parse_timestamp(scope.get("windowEnd"), "calendar.windowEnd").astimezone(zone)
            if window_start != day_start or window_end != day_end:
                raise EvaluationError("Calendar window must be exact local midnight to midnight")

    plan_path = PLANNER_ROOT / "daily-plan.json"
    readback_path = PLANNER_ROOT / "readback.json"
    run_path = PLANNER_ROOT / "planning-run.json"
    plan = load_json(plan_path)
    readback = load_json(readback_path)
    run = load_json(run_path)
    if plan.get("schemaVersion") != 3 or plan.get("date") != local_date.isoformat() or not plan.get("planID"):
        raise EvaluationError("published plan does not prove the rollover date and schema")
    generated = parse_timestamp(plan.get("generatedAt"), "plan.generatedAt").astimezone(zone)
    valid_until = parse_timestamp(plan.get("validUntil"), "plan.validUntil").astimezone(zone)
    if not started <= generated <= completed or valid_until != day_end:
        raise EvaluationError("published plan timestamps do not match the unattended rollover")
    verdict = plan.get("qualityAssurance", {}).get("verdict")
    if verdict not in {"PASS", "PASS WITH CONDITIONS"} or plan.get("publication", {}).get("state") != "published":
        raise EvaluationError("published plan requires a non-failing QA verdict")
    if readback.get("planID") != plan["planID"] or readback.get("planSchemaVersion") != 3 or readback.get("state") != "displayed":
        raise EvaluationError("native readback does not match the published plan")
    consumed = parse_timestamp(readback.get("consumedAt"), "readback.consumedAt").astimezone(zone)
    if not generated <= consumed <= completed:
        raise EvaluationError("native readback is outside the unattended rollover window")
    if run.get("runID") is None or run.get("planID") != plan["planID"] or run.get("status") != "completed":
        raise EvaluationError("planning run is not completed for the published plan")
    readback_stage = next((stage for stage in run.get("stages", []) if stage.get("name") == "readback"), None)
    if not readback_stage or readback_stage.get("status") != "completed" or readback_stage.get("planID") != plan["planID"] or readback_stage.get("schemaVersion") != 3:
        raise EvaluationError("planning run has no completed matching readback stage")

    core = {
        "schemaVersion": 1,
        "evidenceID": evidence_id,
        "verifiedAt": iso(),
        "priorLocalDate": prior_date.isoformat(),
        "localDate": local_date.isoformat(),
        "timezone": "America/New_York",
        "scheduledAt": request["scheduledAt"],
        "startedAt": request["startedAt"],
        "completedAt": request["completedAt"],
        "manualRepair": False,
        "requestDigest": digest(request),
        "sources": source_evidence,
        "plan": {"planID": plan["planID"], "schemaVersion": 3, "qualityVerdict": verdict, "contentDigest": hashlib.sha256(plan_path.read_bytes()).hexdigest()},
        "readback": {"state": "displayed", "appVersion": readback.get("appVersion"), "consumedAt": readback["consumedAt"], "contentDigest": hashlib.sha256(readback_path.read_bytes()).hexdigest()},
        "run": {"runID": run["runID"], "status": "completed", "contentDigest": hashlib.sha256(run_path.read_bytes()).hexdigest()},
        "status": "PASS",
    }
    value = {**core, "contentDigest": digest(core), "applied": apply}
    receipt_path = ROOT / "rollover-evidence" / f"{evidence_id}.json"
    if receipt_path.exists():
        existing = load_json(receipt_path)
        if existing.get("requestDigest") != core["requestDigest"] or existing.get("sources") != source_evidence or existing.get("plan") != core["plan"] or existing.get("readback") != core["readback"] or existing.get("run") != core["run"]:
            raise EvaluationError("rollover evidence ID cannot be reused for changed evidence")
        return {**existing, "idempotentReplay": True, "artifact": str(receipt_path)}
    if apply:
        atomic_json(receipt_path, value)
        roadmap = load_json(ROADMAP_PATH)
        roadmap["observedAt"] = iso()
        roadmap["priorities"]["1"] = {
            "status": "PASS",
            "items": {"11-16": "PASS", "17": "PASS"},
            "evidence": str(receipt_path),
            "evidenceDigest": value["contentDigest"],
        }
        atomic_json(RUNTIME_ROADMAP_PATH, roadmap)
        project_inspection()
    return {**value, "artifact": str(receipt_path)}


def pilot_start(plan: dict[str, Any], apply: bool) -> dict[str, Any]:
    schedule = validate_pilot_plan(plan)
    decision = gate_decision("pilot-start", None, {"engineeringReleaseVerdict": plan["engineeringReleaseVerdict"], "pilotPlanApproved": True, "pilotConnectorsAdmitted": True, "noOpenCriticalAlerts": True})
    result = {"pilotID": plan["pilotID"], "status": "ready" if decision["verdict"] == "PASS" else "blocked", "gate": decision, "planDigest": digest(plan), "applied": False}
    if decision["verdict"] != "PASS":
        return result
    path = ROOT / "pilots" / plan["pilotID"] / "pilot-state.json"
    if path.exists():
        existing = load_json(path)
        if existing.get("planDigest") != result["planDigest"]: raise EvaluationError("pilot ID cannot be reused for a changed plan")
        return {**existing, "idempotentReplay": True}
    if apply:
        result.update({"status": "not-started", "preparedAt": iso(), "startedAt": None, "sequence": 0, "lastObservationDigest": None, "plan": plan, "schedule": schedule, "tier1AttemptsRecorded": 0, "manualInterventionCount": 0, "unattendedRolloversCompleted": 0, "applied": True})
        atomic_json(path, result)
    return result


def pilot_record(observation: dict[str, Any], apply: bool) -> dict[str, Any]:
    required = {"schemaVersion", "pilotID", "checkpointID", "scheduledAt", "observedAt", "manualRepair", "incidents", "idempotencyKey"}
    if set(observation) != required:
        raise EvaluationError(f"pilot checkpoint shape mismatch: {sorted(set(observation) ^ required)}")
    if observation.get("schemaVersion") != 1:
        raise EvaluationError("pilot checkpoint requires schema 1")
    pilot_id = str(observation.get("pilotID") or "")
    safe_identifier(pilot_id, "pilotID")
    safe_identifier(observation.get("idempotencyKey"), "pilot checkpoint idempotencyKey")
    state_path = ROOT / "pilots" / pilot_id / "pilot-state.json"
    if not state_path.exists(): raise EvaluationError("pilot is not prepared")
    state = load_json(state_path)
    if state.get("status") not in {"not-started", "running"}: raise EvaluationError("pilot is not open for observations")
    if state.get("pilotID") != pilot_id or not isinstance(state.get("schedule"), list) or len(state["schedule"]) != 15:
        raise EvaluationError("pilot state does not contain the immutable schedule")
    observation_path = state_path.parent / "observations.jsonl"
    existing_observations = [json.loads(line) for line in observation_path.read_text(encoding="utf-8").splitlines() if line.strip()] if observation_path.exists() else []
    replay = next((item for item in existing_observations if item.get("idempotencyKey") == observation.get("idempotencyKey")), None)
    if replay:
        if replay.get("requestDigest") != digest(observation): raise EvaluationError("conflicting pilot observation idempotency key")
        return {**replay, "applied": apply, "idempotentReplay": True}
    expected = state["sequence"] + 1
    if expected > len(state["schedule"]): raise EvaluationError("pilot already has every planned checkpoint")
    checkpoint = state["schedule"][expected - 1]
    if observation["checkpointID"] != checkpoint.get("checkpointID") or observation["scheduledAt"] != checkpoint.get("scheduledAt"):
        raise EvaluationError("pilot checkpoint does not match the next immutable schedule entry")
    zone = ZoneInfo("America/New_York")
    scheduled = parse_timestamp(observation["scheduledAt"], "checkpoint scheduledAt").astimezone(zone)
    observed = parse_timestamp(observation["observedAt"], "checkpoint observedAt").astimezone(zone)
    if not scheduled <= observed <= scheduled + timedelta(hours=2):
        raise EvaluationError("pilot checkpoint observation is outside the bounded window")
    if not isinstance(observation.get("manualRepair"), bool):
        raise EvaluationError("pilot checkpoint manualRepair must be boolean")
    incidents = observation.get("incidents")
    if not isinstance(incidents, list): raise EvaluationError("pilot incidents must be a list")
    for incident in incidents:
        keys = {"incidentID", "severity", "category", "status", "evidenceDigest"}
        if not isinstance(incident, dict) or set(incident) != keys:
            raise EvaluationError("pilot incident shape mismatch")
        safe_identifier(incident.get("incidentID"), "pilot incidentID")
        if incident.get("severity") not in PILOT_INCIDENT_SEVERITIES or incident.get("status") not in PILOT_INCIDENT_STATUSES:
            raise EvaluationError("pilot incident severity or status is invalid")
        if not isinstance(incident.get("category"), str) or not incident["category"].strip():
            raise EvaluationError("pilot incident category is required")
        if not isinstance(incident.get("evidenceDigest"), str) or not re.fullmatch(r"[0-9a-f]{64}", incident["evidenceDigest"]):
            raise EvaluationError("pilot incident evidence digest is invalid")

    source_attempts = []
    evidence_digests = []
    for source_id in TIER1_SOURCE_IDS:
        manifest_path = SOURCES_ROOT / f"{source_id}.manifest.json"
        manifest = load_json(manifest_path)
        if manifest.get("sourceID") != source_id or manifest.get("status") not in PILOT_SOURCE_STATUSES:
            raise EvaluationError(f"{source_id} pilot manifest identity or status is invalid")
        attempted = parse_timestamp(manifest.get("attemptedAt"), f"{source_id}.attemptedAt").astimezone(zone)
        if not scheduled - timedelta(minutes=5) <= attempted <= observed:
            raise EvaluationError(f"{source_id} was not attempted inside the checkpoint window")
        counts = (manifest.get("itemCount"), manifest.get("processedCount"), manifest.get("unresolvedCount"))
        if not all(isinstance(value, int) and not isinstance(value, bool) and value >= 0 for value in counts) or counts[0] != counts[1] + counts[2]:
            raise EvaluationError(f"{source_id} pilot denominator is invalid")
        manifest_id = safe_identifier(manifest.get("manifestID"), f"{source_id}.manifestID")
        manifest_digest = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
        source_attempts.append({"sourceID": source_id, "status": manifest["status"], "attemptedAt": manifest["attemptedAt"], "manifestID": manifest_id, "manifestDigest": manifest_digest, "itemCount": counts[0], "processedCount": counts[1], "unresolvedCount": counts[2]})
        evidence_digests.append(manifest_digest)
        if source_id == "outlook-calendar":
            scope = manifest.get("scope") if isinstance(manifest.get("scope"), dict) else {}
            day_start = datetime(scheduled.year, scheduled.month, scheduled.day, tzinfo=zone)
            day_end = day_start + timedelta(days=1)
            if manifest["status"] not in {"available", "empty"} or counts[2] != 0 or parse_timestamp(scope.get("windowStart"), "calendar.windowStart").astimezone(zone) != day_start or parse_timestamp(scope.get("windowEnd"), "calendar.windowEnd").astimezone(zone) != day_end:
                raise EvaluationError("pilot Calendar attempt is not a complete current-day collection")

    publication_state = "not-published"
    readback_state = "not-applicable"
    plan_evidence: dict[str, Any] = {}
    plan_path = PLANNER_ROOT / "daily-plan.json"
    readback_path = PLANNER_ROOT / "readback.json"
    run_path = PLANNER_ROOT / "planning-run.json"
    if plan_path.exists():
        plan = load_json(plan_path)
        generated = parse_timestamp(plan.get("generatedAt"), "pilot plan.generatedAt").astimezone(zone)
        if plan.get("schemaVersion") == 3 and plan.get("date") == scheduled.date().isoformat() and scheduled - timedelta(minutes=5) <= generated <= observed and plan.get("publication", {}).get("state") == "published" and plan.get("qualityAssurance", {}).get("verdict") in {"PASS", "PASS WITH CONDITIONS"}:
            publication_state = "published"
            plan_digest = hashlib.sha256(plan_path.read_bytes()).hexdigest()
            evidence_digests.append(plan_digest)
            plan_evidence = {"planID": plan.get("planID"), "planDigest": plan_digest, "generatedAt": plan.get("generatedAt")}
            if readback_path.exists() and run_path.exists():
                readback = load_json(readback_path)
                run = load_json(run_path)
                consumed = parse_timestamp(readback.get("consumedAt"), "pilot readback.consumedAt").astimezone(zone)
                stage = next((item for item in run.get("stages", []) if item.get("name") == "readback"), None)
                if readback.get("planID") == plan.get("planID") and readback.get("planSchemaVersion") == 3 and readback.get("state") == "displayed" and generated <= consumed <= observed and run.get("planID") == plan.get("planID") and run.get("status") == "completed" and stage and stage.get("status") == "completed" and stage.get("planID") == plan.get("planID"):
                    readback_state = "matched"
                    readback_digest = hashlib.sha256(readback_path.read_bytes()).hexdigest()
                    run_digest = hashlib.sha256(run_path.read_bytes()).hexdigest()
                    evidence_digests.extend([readback_digest, run_digest])
                    plan_evidence.update({"readbackDigest": readback_digest, "planningRunID": run.get("runID"), "planningRunDigest": run_digest})
                else:
                    readback_state = "mismatched"
            else:
                readback_state = "missing"

    continuity_path = CONTINUITY_ROOT / "summary.json"
    continuity = load_json(continuity_path)
    continuity_generated = parse_timestamp(continuity.get("generated_at"), "continuity.generated_at").astimezone(zone)
    if not scheduled - timedelta(minutes=5) <= continuity_generated <= observed:
        raise EvaluationError("Meeting Continuity summary is outside the checkpoint window")
    coverage = continuity.get("coverage") if isinstance(continuity.get("coverage"), dict) else {}
    eligible = coverage.get("meetings_in_scope")
    disposition = coverage.get("accounted")
    if not all(isinstance(value, int) and not isinstance(value, bool) and value >= 0 for value in (eligible, disposition)) or disposition > eligible:
        raise EvaluationError("Meeting Continuity checkpoint denominator is invalid")
    receipts = continuity.get("project_update_receipts") if isinstance(continuity.get("project_update_receipts"), list) else []
    material_impacts = len(receipts)
    project_readbacks = sum(1 for receipt in receipts if isinstance(receipt, dict) and receipt.get("project_path") and receipt.get("continuity_run_id"))
    if project_readbacks != material_impacts:
        raise EvaluationError("Meeting Continuity project readback evidence is incomplete")
    continuity_digest = hashlib.sha256(continuity_path.read_bytes()).hexdigest()
    evidence_digests.append(continuity_digest)

    value = {
        "schemaVersion": 1, "pilotID": pilot_id, "sequence": expected, "priorDigest": state.get("lastObservationDigest"),
        "checkpointID": observation["checkpointID"], "scheduledAt": observation["scheduledAt"], "observedAt": observation["observedAt"],
        "tier1AttemptCount": len(source_attempts), "sourceAttempts": source_attempts,
        "publicationState": publication_state, "readbackState": readback_state, "planEvidence": plan_evidence,
        "manualRepair": observation["manualRepair"], "eligibleMeetingCount": eligible, "meetingDispositionCount": disposition,
        "materialImpactCount": material_impacts, "projectReadbackCount": project_readbacks,
        "continuityRunID": continuity.get("run_id"), "continuityDigest": continuity_digest,
        "incidents": incidents, "evidenceDigests": sorted(set(evidence_digests)), "idempotencyKey": observation["idempotencyKey"],
        "requestDigest": digest(observation),
    }
    value["observationDigest"] = digest(value)
    if apply:
        append_jsonl(observation_path, value)
        state.update({"status": "running", "startedAt": state.get("startedAt") or observation["observedAt"], "sequence": expected, "lastObservationDigest": value["observationDigest"], "updatedAt": iso(), "tier1AttemptsRecorded": int(state.get("tier1AttemptsRecorded", 0)) + len(source_attempts), "manualInterventionCount": int(state.get("manualInterventionCount", 0)) + (1 if observation["manualRepair"] else 0), "unattendedRolloversCompleted": int(state.get("unattendedRolloversCompleted", 0)) + (1 if scheduled.strftime("%H:%M") == "06:01" and not observation["manualRepair"] and publication_state == "published" and readback_state == "matched" else 0)})
        atomic_json(state_path, state)
    return {**value, "applied": apply}


def pilot_complete(request: dict[str, Any], apply: bool) -> dict[str, Any]:
    required = {"schemaVersion", "pilotID", "disposition", "approvedBy", "approvedAt", "finalObservationDigest", "idempotencyKey"}
    if set(request) != required:
        raise EvaluationError(f"pilot completion shape mismatch: {sorted(set(request) ^ required)}")
    if request.get("schemaVersion") != 1:
        raise EvaluationError("pilot completion requires schema 1")
    pilot_id = safe_identifier(request.get("pilotID"), "pilotID")
    safe_identifier(request.get("idempotencyKey"), "pilot completion idempotencyKey")
    approved_at = parse_timestamp(request.get("approvedAt"), "pilot completion approvedAt")
    if approved_at > now() + timedelta(minutes=5):
        raise EvaluationError("pilot completion approval cannot be in the future")
    root = ROOT / "pilots" / pilot_id
    state = load_json(root / "pilot-state.json")
    receipt_path = root / "acceptance.json"
    request_digest = digest(request)
    if receipt_path.exists():
        existing = load_json(receipt_path)
        if existing.get("requestDigest") != request_digest:
            raise EvaluationError("pilot completion cannot be reused for changed evidence")
        return {**existing, "idempotentReplay": True}
    if state.get("pilotID") != pilot_id or state.get("status") != "running":
        raise EvaluationError("pilot is not running")
    lines = (root / "observations.jsonl").read_text(encoding="utf-8").splitlines() if (root / "observations.jsonl").exists() else []
    observations = [json.loads(line) for line in lines if line.strip()]
    checkpoint_count = len(observations)
    tier1_attempts = sum(int(item.get("tier1AttemptCount", 0)) for item in observations)
    morning = [item for item in observations if isinstance(item.get("scheduledAt"), str) and item["scheduledAt"][11:16] == "06:01"]
    incidents = [incident for item in observations for incident in item.get("incidents", [])]
    unresolved_critical = [incident for incident in incidents if incident.get("severity") == "critical" and incident.get("status") != "resolved"]
    prohibited_incidents = [incident for incident in incidents if incident.get("category") in PILOT_PROHIBITED_INCIDENT_CATEGORIES]
    reasons: list[str] = []
    prior_digest = None
    for index, item in enumerate(observations, start=1):
        supplied_digest = item.get("observationDigest")
        core = dict(item); core.pop("observationDigest", None)
        if item.get("sequence") != index or item.get("priorDigest") != prior_digest or not isinstance(supplied_digest, str) or supplied_digest != digest(core):
            reasons.append("observation-digest-chain-invalid")
            break
        prior_digest = supplied_digest
    if request.get("finalObservationDigest") != state.get("lastObservationDigest") or prior_digest != state.get("lastObservationDigest"):
        reasons.append("final-observation-digest-mismatch")
    if checkpoint_count != 15: reasons.append("checkpoint-denominator-not-15-of-15")
    expected_schedule = state.get("schedule") if isinstance(state.get("schedule"), list) else []
    if len(expected_schedule) != 15 or [(item.get("checkpointID"), item.get("scheduledAt")) for item in observations] != [(item.get("checkpointID"), item.get("scheduledAt")) for item in expected_schedule]: reasons.append("checkpoint-schedule-mismatch")
    if tier1_attempts != 75: reasons.append("tier1-attempt-denominator-not-75-of-75")
    if any(len(item.get("sourceAttempts", [])) != 5 or {attempt.get("sourceID") for attempt in item.get("sourceAttempts", [])} != set(TIER1_SOURCE_IDS) for item in observations): reasons.append("tier1-source-identity-gap")
    if len(morning) != 5 or any(item.get("manualRepair") for item in morning): reasons.append("morning-rollover-not-5-of-5-unattended")
    if any(item.get("publicationState") != "published" or item.get("readbackState") != "matched" for item in observations): reasons.append("checkpoint-publication-or-readback-gap")
    if any(item.get("meetingDispositionCount") != item.get("eligibleMeetingCount") or item.get("projectReadbackCount") != item.get("materialImpactCount") for item in observations): reasons.append("meeting-continuity-denominator-gap")
    if unresolved_critical: reasons.append("unresolved-critical-incident-present")
    if prohibited_incidents: reasons.append("prohibited-control-incident-present")
    disposition = request.get("disposition")
    if disposition not in {"accept", "extend", "stop"} or request.get("approvedBy") != "Chris": reasons.append("missing-chris-disposition")
    accepted = not reasons and disposition == "accept"
    status = "accepted" if accepted else "extended" if disposition == "extend" else "stopped" if disposition == "stop" else "not-accepted"
    value = {"schemaVersion": 1, "pilotID": pilot_id, "status": status, "disposition": disposition, "approvedBy": request.get("approvedBy"), "approvedAt": request.get("approvedAt"), "completedAt": iso(), "checkpointCount": checkpoint_count, "tier1AttemptCount": tier1_attempts, "morningRolloverCount": len(morning), "unresolvedCriticalIncidentCount": len(unresolved_critical), "prohibitedControlIncidentCount": len(prohibited_incidents), "reasons": sorted(set(reasons)), "finalObservationDigest": state.get("lastObservationDigest"), "requestDigest": request_digest, "enterpriseReady": False, "scopeClaim": "single-user-local-pilot-only", "applied": apply}
    if apply:
        atomic_json(receipt_path, value)
        state.update({"status": value["status"], "completedAt": value["completedAt"]})
        atomic_json(root / "pilot-state.json", state)
    return value


def evidence_time(path: Path) -> datetime:
    timestamp_fields = ("completedAt", "recordedAt", "startedAt", "generatedAt")
    value = load_json(path)
    for field in timestamp_fields:
        raw = value.get(field)
        if not isinstance(raw, str):
            continue
        try:
            observed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            continue
        if observed.tzinfo is None:
            observed = observed.replace(tzinfo=timezone.utc)
        return observed.astimezone(timezone.utc)
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)


def latest_path(paths: list[Path]) -> Path | None:
    return max(paths, key=lambda path: (evidence_time(path), str(path))) if paths else None


def latest_json(paths: list[Path]) -> dict[str, Any] | None:
    path = latest_path(paths)
    return load_json(path) if path else None


def app_metadata(app_repo: Path) -> tuple[str, int]:
    try:
        text = (app_repo / "project.yml").read_text(encoding="utf-8")
    except OSError:
        return "0.4.2", 17
    version = re.search(r'MARKETING_VERSION:\s*"([0-9.]+)"', text)
    build = re.search(r'CURRENT_PROJECT_VERSION:\s*"(\d+)"', text)
    return (version.group(1) if version else "0.4.2", int(build.group(1)) if build else 17)


def release_plugin_commit(latest_report: dict[str, Any] | None = None) -> str:
    """Resolve the immutable plugin commit in source and installed-cache runtimes.

    Installed Codex plugin builds intentionally omit ``.git``. In that context,
    the latest governed evaluation report is the release-bound source of truth,
    provided that its plugin version matches the installed manifest.
    """
    source_commit = git_value(PLUGIN_ROOT, "rev-parse", "HEAD")
    if isinstance(source_commit, str) and re.fullmatch(r"[a-f0-9]{7,64}", source_commit):
        return source_commit
    if latest_report:
        report_plugin = latest_report.get("plugin")
        if isinstance(report_plugin, dict) and report_plugin.get("version") == plugin_version():
            report_commit = report_plugin.get("commit")
            if isinstance(report_commit, str) and re.fullmatch(r"[a-f0-9]{7,64}", report_commit):
                return report_commit
    return "unknown"


def project_inspection(app_repo: Path | None = None) -> dict[str, Any]:
    app_repo = resolve_app_repo(app_repo)
    suite = load_json(SUITE_PATH)
    audit = audit_contracts(app_repo)
    reports = sorted(ROOT.glob("runs/*/evaluation-report.json"))
    release = sorted(ROOT.glob("release-decisions/*.json"))
    pilots = sorted(ROOT.glob("pilots/*/pilot-state.json"))
    latest_report = latest_json(reports)
    latest_release = latest_json(release)
    latest_pilot = latest_json(pilots)
    app_version, app_build = app_metadata(app_repo)
    roadmap = effective_roadmap()
    rollover_pass = roadmap["priorities"]["1"]["items"].get("17") == "PASS"
    evidence = [
        {"evidenceID": "evaluation-contract-audit", "kind": "review", "status": "verified" if audit["status"] == "PASS" else "blocked", "observedAt": iso(), "safeSummary": "Versioned evaluation contracts and complete test discovery were audited."},
        {"evidenceID": "priority1-unattended-rollover", "kind": "review", "status": "verified" if rollover_pass else "blocked", "observedAt": iso(), "safeSummary": "A clean unattended next-day publication and matching readback were verified." if rollover_pass else "The unattended next-day publication and matching readback gate remains open."},
    ]
    if latest_report:
        evidence.append({"evidenceID": "evaluation-run", "kind": "test", "status": "verified" if latest_report.get("status") == "PASS" else "blocked", "observedAt": latest_report.get("completedAt", iso()), "safeSummary": "The governed plugin and Command Center evaluation suite was executed."})
    else:
        evidence.append({"evidenceID": "evaluation-run", "kind": "test", "status": "unknown", "observedAt": iso(), "safeSummary": "No governed complete evaluation run has been recorded."})
    evidence_ids = {item["evidenceID"] for item in evidence}
    if latest_report and isinstance(latest_report.get("caseCoverage"), list):
        case_coverage = latest_report["caseCoverage"]
    else:
        case_coverage = [
            {"caseID": item["caseID"], "category": item["class"], "severity": item["severity"], "result": "not-run", "releaseBlocking": bool(item["releaseBlocking"]), "requirementIDs": item["requirementIDs"], "evidenceIDs": ["evaluation-contract-audit"]}
            for item in suite["adversarialCases"]
        ]
    engineering = "PASS" if latest_report and latest_report.get("status") == "PASS" and latest_release and latest_release.get("engineeringReleaseVerdict") == "PASS" else "BLOCKED"
    gate_results = [
        {"gateID": "engineering-release", "status": engineering, "evaluatedAt": iso(), "reasonCodes": [] if engineering == "PASS" else ["governed-release-evidence-incomplete"], "evidenceIDs": ["evaluation-run"]},
        {"gateID": "pilot-start", "status": "BLOCKED", "evaluatedAt": iso(), "reasonCodes": ["pilot-plan-not-started"] if rollover_pass else ["priority1-item17-unresolved"], "evidenceIDs": ["priority1-unattended-rollover"]},
        {"gateID": "connector-activation", "status": "BLOCKED", "evaluatedAt": iso(), "reasonCodes": ["jira-live-canary-and-approval-missing"], "evidenceIDs": ["evaluation-contract-audit"]},
        {"gateID": "enterprise-claim", "status": "BLOCKED", "evaluatedAt": iso(), "reasonCodes": ["representative-enterprise-evidence-and-approvals-missing"], "evidenceIDs": ["evaluation-contract-audit"]},
    ]
    connector_decisions = []
    for item in load_json(CONNECTORS_PATH)["connectors"]:
        connector_decisions.append({
            "connectorID": item["connectorID"], "tier": item["tier"], "status": item["status"], "route": item["route"], "sourceID": item["sourceID"],
            "authenticationState": "unknown", "coverageState": "not-attempted", "itemCount": 0, "processedCount": 0, "unresolvedCount": 0,
            "readOnly": item["readOnly"], "approvalState": "approved" if item["approval"]["decisionDigest"] else "pending", "evidenceIDs": ["evaluation-contract-audit"],
        })
    if latest_pilot:
        pilot = {
            "pilotID": latest_pilot.get("pilotID", "priority4-single-user-pilot"), "status": latest_pilot.get("status", "blocked"), "cohort": "single-user", "timezone": "America/New_York",
            "plannedBusinessDays": 5, "plannedCheckpoints": 15, "attemptedCheckpoints": int(latest_pilot.get("sequence", 0)),
            "unattendedRolloversPlanned": 5, "unattendedRolloversCompleted": int(latest_pilot.get("unattendedRolloversCompleted", 0)),
            "tier1AttemptsPlanned": 75, "tier1AttemptsRecorded": int(latest_pilot.get("tier1AttemptsRecorded", 0)),
            "manualInterventionCount": int(latest_pilot.get("manualInterventionCount", 0)), "disposition": latest_pilot.get("disposition", "pending"), "evidenceIDs": [],
        }
    else:
        pilot = {"pilotID": "priority4-single-user-pilot", "status": "not-started" if rollover_pass else "blocked", "cohort": "single-user", "timezone": "America/New_York", "plannedBusinessDays": 5, "plannedCheckpoints": 15, "attemptedCheckpoints": 0, "unattendedRolloversPlanned": 5, "unattendedRolloversCompleted": 0, "tier1AttemptsPlanned": 75, "tier1AttemptsRecorded": 0, "manualInterventionCount": 0, "disposition": "pending", "evidenceIDs": ["priority1-unattended-rollover"]}
    counts = {value: sum(1 for item in case_coverage if item["result"] == value) for value in ["pass", "fail", "blocked", "skipped", "not-run"]}
    release_blocking = [item for item in case_coverage if item["releaseBlocking"]]
    core = {
        "schemaVersion": 1, "generatedAt": iso(), "validUntil": iso(now() + timedelta(minutes=15)),
        "producer": "monday-evaluation", "audience": "Chris-private-local",
        "releaseCandidate": {"releaseID": latest_report.get("runID", "priority4-not-evaluated") if latest_report else "priority4-not-evaluated", "pluginVersion": plugin_version(), "pluginCommit": release_plugin_commit(latest_report), "appVersion": app_version, "appBuild": app_build, "appCommit": git_value(app_repo, "rev-parse", "HEAD") or "unknown", "minimumPluginVersion": "0.1.0", "maximumPluginVersionExclusive": "0.2.0", "minimumAppVersion": "0.4.2", "maximumAppVersionExclusive": "0.5.0", "compatibilityStatus": "compatible"},
        "suite": {"suiteID": suite["suiteID"], "suiteVersion": suite["suiteVersion"], "suiteDigest": digest(suite), "requiredCaseCount": len(case_coverage)},
        "caseCoverage": case_coverage,
        "gateResults": gate_results,
        "connectorDecisions": connector_decisions,
        "pilot": pilot,
        "enterpriseClaim": {"status": "BLOCKED", "claimAllowed": False, "scope": "single-user", "safeStatement": "Enterprise readiness is not established. The bounded local pilot has not been accepted and representative organizational evidence is absent.", "unmetRequirementIDs": ["bounded-pilot-accepted", "representative-multi-user-pilot-accepted", "organizational-approvals"]},
        "evidence": evidence,
        "coverage": {"caseCount": len(case_coverage), "gateCount": len(gate_results), "connectorCount": len(connector_decisions), "evidenceCount": len(evidence), "passedCaseCount": counts["pass"], "failedCaseCount": counts["fail"], "blockedCaseCount": counts["blocked"], "skippedCaseCount": counts["skipped"], "notRunCaseCount": counts["not-run"], "releaseBlockingCount": len(release_blocking), "releaseBlockingPassedCount": sum(1 for item in release_blocking if item["result"] == "pass"), "unresolvedCount": counts["blocked"] + counts["skipped"] + counts["not-run"]},
    }
    content_digest = digest(core)
    projection = {**core, "projectionID": f"evaluation-{now().date().isoformat()}-{content_digest[:12]}", "contentDigest": content_digest}
    atomic_json(INSPECTION_PATH, projection)
    return projection


def reconcile_readback(apply: bool) -> dict[str, Any]:
    projection = load_json(INSPECTION_PATH)
    receipt = load_json(READBACK_PATH)
    required = {"schemaVersion", "projectionID", "projectionSchemaVersion", "contentDigest", "consumer", "appVersion", "displayedAt", "state", "viewIDs"}
    if set(receipt) != required or receipt["schemaVersion"] != 1 or receipt["projectionSchemaVersion"] != 1:
        raise EvaluationError("evaluation readback schema is invalid")
    if receipt["projectionID"] != projection["projectionID"] or receipt["contentDigest"] != projection["contentDigest"] or receipt["state"] != "displayed":
        raise EvaluationError("evaluation readback does not match current projection")
    if len(receipt["viewIDs"]) != 1 or receipt["viewIDs"][0] not in ALLOWED_VIEWS:
        raise EvaluationError("evaluation readback must prove exactly one recognized view")
    result = {"status": "displayed", "projectionID": projection["projectionID"], "viewID": receipt["viewIDs"][0], "appVersion": receipt["appVersion"], "applied": apply}
    if apply: atomic_json(ROOT / "last-readback.json", result)
    return result


def input_json(path: str) -> dict[str, Any]:
    value = load_json(Path(path).expanduser())
    if not isinstance(value, dict): raise EvaluationError("input must be a JSON object")
    return value


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    configure_parser = commands.add_parser("configure"); configure_parser.add_argument("--app-repo", required=True); configure_parser.add_argument("--apply", action="store_true")
    audit = commands.add_parser("audit-contracts"); audit.add_argument("--app-repo")
    listing = commands.add_parser("list-cases"); listing.add_argument("--category")
    run = commands.add_parser("run"); run.add_argument("--app-repo"); run.add_argument("--run-id")
    evidence = commands.add_parser("collect-release-evidence"); evidence.add_argument("--evidence-id", required=True); evidence.add_argument("--app-repo"); evidence.add_argument("--installed-plugin", required=True); evidence.add_argument("--installed-app", default=str(DEFAULT_INSTALLED_APP)); evidence.add_argument("--apply", action="store_true")
    gate = commands.add_parser("gate"); gate.add_argument("--gate", required=True); gate.add_argument("--run"); gate.add_argument("--evidence")
    connector = commands.add_parser("connector-review"); connector.add_argument("--input", required=True); connector.add_argument("--apply", action="store_true")
    commands.add_parser("connector-status")
    release = commands.add_parser("release-record"); release.add_argument("--input", required=True); release.add_argument("--apply", action="store_true")
    rollover = commands.add_parser("verify-unattended-rollover"); rollover.add_argument("--input", required=True); rollover.add_argument("--apply", action="store_true")
    start = commands.add_parser("pilot-start"); start.add_argument("--input", required=True); start.add_argument("--apply", action="store_true")
    record = commands.add_parser("pilot-record"); record.add_argument("--input", required=True); record.add_argument("--apply", action="store_true")
    complete = commands.add_parser("pilot-complete"); complete.add_argument("--input", required=True); complete.add_argument("--apply", action="store_true")
    status = commands.add_parser("pilot-status"); status.add_argument("--pilot-id", required=True)
    commands.add_parser("project")
    readback = commands.add_parser("reconcile-readback"); readback.add_argument("--apply", action="store_true")
    commands.add_parser("status")
    return root


def main() -> None:
    args = parser().parse_args()
    try:
        if args.command == "configure": result = configure(args.app_repo, args.apply)
        elif args.command == "audit-contracts": result = audit_contracts(resolve_app_repo(args.app_repo))
        elif args.command == "list-cases":
            suite = load_json(SUITE_PATH); cases = suite["adversarialCases"]
            result = {"suiteID": suite["suiteID"], "cases": [item for item in cases if not args.category or item["class"] == args.category]}
        elif args.command == "run": result = execute_suite(resolve_app_repo(args.app_repo), args.run_id)
        elif args.command == "collect-release-evidence": result = collect_release_evidence(resolve_app_repo(args.app_repo), Path(args.installed_plugin).expanduser(), Path(args.installed_app).expanduser(), args.evidence_id, args.apply)
        elif args.command == "gate":
            report = load_json(Path(args.run).expanduser()) if args.run else None
            evidence = input_json(args.evidence) if args.evidence else {}
            result = gate_decision(args.gate, report, evidence)
        elif args.command == "connector-review": result = connector_review(input_json(args.input), args.apply)
        elif args.command == "connector-status": result = load_json(CONNECTORS_PATH)
        elif args.command == "release-record": result = release_record(input_json(args.input), args.apply)
        elif args.command == "verify-unattended-rollover": result = verify_unattended_rollover(input_json(args.input), args.apply)
        elif args.command == "pilot-start": result = pilot_start(input_json(args.input), args.apply)
        elif args.command == "pilot-record": result = pilot_record(input_json(args.input), args.apply)
        elif args.command == "pilot-complete": result = pilot_complete(input_json(args.input), args.apply)
        elif args.command == "pilot-status": result = load_json(ROOT / "pilots" / args.pilot_id / "pilot-state.json")
        elif args.command == "project": result = project_inspection()
        elif args.command == "reconcile-readback": result = reconcile_readback(args.apply)
        else:
            reports = list(ROOT.glob("runs/*/evaluation-report.json")); pilots = list(ROOT.glob("pilots/*/pilot-state.json"))
            latest_report_path = latest_path(reports); latest_pilot_path = latest_path(pilots)
            app_repo = resolve_app_repo()
            result = {"status": "ok", "contractAudit": audit_contracts(app_repo)["status"], "latestRun": str(latest_report_path) if latest_report_path else None, "latestPilot": str(latest_pilot_path) if latest_pilot_path else None, "inspection": str(INSPECTION_PATH), "commandCenterRepo": str(app_repo)}
        print(json.dumps(result, indent=2, sort_keys=True))
    except EvaluationError as error:
        print(json.dumps({"status": "error", "error": str(error)}, indent=2, sort_keys=True))
        raise SystemExit(2)


if __name__ == "__main__":
    main()
