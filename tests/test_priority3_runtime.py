from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/monday_runtime.py"
UTC = timezone.utc


def iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


class Priority3RuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.runtime = Path(self.temp.name) / "runtime"
        self.inputs = Path(self.temp.name) / "inputs"
        self.inputs.mkdir()
        self.environment = {**os.environ, "MONDAY_RUNTIME_ROOT": str(self.runtime)}
        self.invoke("init", apply=True)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def invoke(self, command: str, payload: dict | None = None, *, apply: bool = False, check: bool = True, extra: list[str] | None = None):
        arguments = ["python3", str(SCRIPT), command]
        if payload is not None:
            path = self.inputs / f"{command}-{len(list(self.inputs.iterdir()))}.json"
            path.write_text(json.dumps(payload))
            arguments.extend(["--input", str(path)])
        if extra:
            arguments.extend(extra)
        if apply:
            arguments.append("--apply")
        result = subprocess.run(arguments, cwd=ROOT, env=self.environment, text=True, capture_output=True)
        if check and result.returncode != 0:
            self.fail(f"{arguments} failed\nstdout={result.stdout}\nstderr={result.stderr}")
        value = json.loads(result.stdout) if result.stdout.strip() else json.loads(result.stderr)
        return result, value

    def workflow(self, workflow_id: str = "workflow-1", *, attempts: int = 2, consequential: bool = False, key: str = "start-1") -> dict:
        return {
            "workflowID": workflow_id,
            "workflowType": "planning-pipeline",
            "summary": "Run the bounded planning pipeline",
            "maxAttempts": attempts,
            "replaySafe": True,
            "consequential": consequential,
            "idempotencyKey": key,
        }

    def action(self, action_id: str = "action-1", target: str = "bounded-destination") -> dict:
        return {
            "actionID": action_id,
            "actionType": "send-report",
            "destinationSystem": "teams",
            "destinationClass": "personal-chat",
            "boundedTarget": target,
            "payloadDigest": hashlib.sha256(b"exact outbound report").hexdigest(),
            "payloadClass": "daily-report",
            "summary": "Send the reviewed daily report",
            "maxAttempts": 2,
            "authorizationMode": "user-confirmation",
            "idempotencyKey": f"propose-{action_id}",
        }

    def transition(self, entity_id: str, version: int, event: str, key: str, **values) -> dict:
        return {"workflowID": entity_id, "expectedVersion": version, "event": event, "idempotencyKey": key, **values}

    def action_transition(self, action_id: str, version: int, action_digest: str, event: str, key: str, **values) -> dict:
        return {"actionID": action_id, "expectedVersion": version, "actionDigest": action_digest, "event": event, "idempotencyKey": key, **values}

    def assert_app_contract_shape(self, value: dict) -> None:
        allowed_required = {
            "workflows": ({"workflowID", "kind", "state", "attemptCount", "maxAttempts", "idempotencyKey", "updatedAt", "startedAt", "nextAttemptAt", "checkpoint", "errorCode"}, {"workflowID", "kind", "state", "attemptCount", "maxAttempts", "idempotencyKey", "updatedAt"}),
            "retries": ({"retryID", "workflowID", "attemptNumber", "state", "reasonCode", "scheduledAt", "backoffSeconds"},) * 2,
            "deadLetters": ({"deadLetterID", "workflowID", "createdAt", "reasonCode", "attemptCount", "replayEligibility", "recoveryInstructionID"},) * 2,
            "externalActions": ({"actionID", "kind", "targetLabel", "state", "confirmationRequired", "confirmedAt", "attemptedAt", "verifiedAt", "readbackStatus", "retrySafe"}, {"actionID", "kind", "targetLabel", "state", "confirmationRequired", "readbackStatus", "retrySafe"}),
            "commitments": ({"commitmentID", "title", "state", "ownerLabel", "dueAt", "consequence", "evidenceStatus", "decisionIDs"}, {"commitmentID", "title", "state", "ownerLabel", "consequence", "evidenceStatus", "decisionIDs"}),
            "decisions": ({"decisionID", "title", "state", "ownerLabel", "decidedAt", "evidenceStatus", "commitmentIDs"}, {"decisionID", "title", "state", "ownerLabel", "evidenceStatus", "commitmentIDs"}),
            "sources": ({"sourceID", "status", "scopeLabel", "attemptedAt", "succeededAt", "itemCount", "processedCount", "unresolvedCount", "freshness", "errorCode"}, {"sourceID", "status", "scopeLabel", "itemCount", "processedCount", "unresolvedCount", "freshness"}),
            "connections": ({"connectionID", "sourceID", "status", "authenticationState", "coverageState", "lastCheckedAt", "diagnosticCodes"},) * 2,
            "migrations": ({"migrationID", "fromVersion", "toVersion", "state", "reversible", "appliedAt", "safeSummary"}, {"migrationID", "fromVersion", "toVersion", "state", "reversible", "safeSummary"}),
            "alerts": ({"alertID", "severity", "category", "state", "status", "title", "safeSummary", "raisedAt", "firstSeen", "lastSeen", "count", "acknowledgedAt", "suppressedUntil", "resolvedAt", "sourceKind", "evidenceIDs", "recoveryInstructionIDs"}, {"alertID", "severity", "category", "state", "status", "title", "safeSummary", "raisedAt", "firstSeen", "lastSeen", "count", "suppressedUntil", "sourceKind", "evidenceIDs", "recoveryInstructionIDs"}),
            "recoveryInstructions": ({"instructionID", "title", "steps", "verificationSteps", "rollbackSteps", "evidenceIDs", "actionBoundary", "relatedIDs"},) * 2,
        }
        for collection, (allowed, required) in allowed_required.items():
            for item in value[collection]:
                self.assertTrue(set(item).issubset(allowed), (collection, set(item) - allowed))
                self.assertTrue(required.issubset(item), (collection, required - set(item)))
        self.assertEqual(set(value["compatibility"]), {"projectionSchemaVersion", "readbackSchemaVersion", "databaseSchemaVersion", "pluginVersion", "capabilityVersion", "minimumAppVersion", "maximumAppVersion", "status", "issueCodes", "upgradePolicy", "downgradePolicy", "rollbackPolicy"})
        self.assertEqual(set(value["coverage"]), {"workflowCount", "retryCount", "deadLetterCount", "externalActionCount", "commitmentCount", "decisionCount", "sourceCount", "connectionCount", "migrationCount", "alertCount", "recoveryInstructionCount", "unresolvedCount"})
        for field, collection in [("workflowCount", "workflows"), ("retryCount", "retries"), ("deadLetterCount", "deadLetters"), ("externalActionCount", "externalActions"), ("commitmentCount", "commitments"), ("decisionCount", "decisions"), ("sourceCount", "sources"), ("connectionCount", "connections"), ("migrationCount", "migrations"), ("alertCount", "alerts"), ("recoveryInstructionCount", "recoveryInstructions")]:
            self.assertEqual(value["coverage"][field], len(value[collection]))

    def test_projection_exact_contract_digest_and_old_app_upgrade(self) -> None:
        projection = json.loads((self.runtime / "operations.json").read_text())
        self.assertEqual(
            set(projection),
            {"schemaVersion", "projectionID", "contentDigest", "generatedAt", "validUntil", "producer", "audience", "runtimeVersion", "workflows", "retries", "deadLetters", "externalActions", "commitments", "decisions", "sources", "connections", "compatibility", "migrations", "alerts", "recoveryInstructions", "coverage"},
        )
        core = dict(projection)
        projection_id = core.pop("projectionID")
        supplied = core.pop("contentDigest")
        expected = hashlib.sha256(json.dumps(core, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        self.assertEqual(supplied, expected)
        self.assertTrue(projection_id.endswith(expected[:12]))
        self.assertEqual(projection["producer"], "monday-runtime")
        self.assertEqual(projection["audience"], "Chris-private-local")
        self.assertEqual(projection["alerts"], [], "unchanged healthy runtime must stay quiet")
        self.assert_app_contract_shape(projection)
        self.assertEqual(projection["schemaVersion"], 2)
        _, old = self.invoke("compatibility-check", extra=["--app-version", "0.4.0", "--projection-schema", "2"])
        _, current = self.invoke("compatibility-check", extra=["--app-version", "0.4.1", "--projection-schema", "2", "--plugin-version", projection["runtimeVersion"], "--capability-version", "2.0.0", "--database-schema", "2", "--readback-schema", "1"])
        self.assertEqual(old["status"], "upgrade-required")
        self.assertEqual(current["status"], "compatible")
        _, downgrade = self.invoke("compatibility-check", extra=["--app-version", "0.4.1", "--projection-schema", "1"])
        self.assertEqual(downgrade["status"], "incompatible")
        self.assertEqual(current["downgradePolicy"], "automatic-downgrade-forbidden")

    def test_idempotency_conflict_optimistic_versions_retry_dead_letter_replay_and_rebuild(self) -> None:
        request = self.workflow()
        _, first = self.invoke("workflow-start", request, apply=True)
        _, repeated = self.invoke("workflow-start", request, apply=True)
        self.assertEqual(first["workflowID"], "workflow-1")
        self.assertTrue(repeated["idempotentReplay"])
        conflicting = {**request, "summary": "Different content"}
        result, error = self.invoke("workflow-start", conflicting, apply=True, check=False)
        self.assertEqual(result.returncode, 2)
        self.assertIn("different request content", error["error"])

        self.invoke("workflow-transition", self.transition("workflow-1", 1, "start", "wf-start"), apply=True)
        stale, _ = self.invoke("workflow-transition", self.transition("workflow-1", 1, "complete", "stale"), apply=True, check=False)
        self.assertEqual(stale.returncode, 2)
        t0 = datetime.now(UTC) - timedelta(minutes=2)
        _, waiting = self.invoke("workflow-transition", self.transition("workflow-1", 2, "fail", "fail-1", occurredAt=iso(t0), retryAfter=iso(t0 + timedelta(seconds=30)), error={"code": "connector-timeout", "summary": "The connector timed out", "classification": "transient"}), apply=True)
        self.assertEqual(waiting["status"], "retry-wait")
        _, running = self.invoke("workflow-transition", self.transition("workflow-1", 3, "retry", "retry-1", occurredAt=iso(t0 + timedelta(minutes=1))), apply=True)
        self.assertEqual(running["attempts"], 2)
        _, letter = self.invoke("workflow-transition", self.transition("workflow-1", 4, "fail", "fail-2", error={"code": "schema-invalid", "summary": "The schema is invalid", "classification": "permanent"}), apply=True)
        self.assertEqual(letter["status"], "dead-letter")

        replay = {"workflowID": "workflow-1", "newWorkflowID": "workflow-2", "expectedVersion": 5, "deadLetterDigest": letter["deadLetterDigest"], "reason": "Cause corrected and replay reviewed", "idempotencyKey": "replay-1"}
        _, preview = self.invoke("workflow-replay", replay)
        self.assertFalse(preview["applied"])
        self.assertEqual(preview["workflowID"], "workflow-2")
        status_before = self.invoke("status")[1]
        self.assertEqual(status_before["counts"]["workflows"], 1)
        _, applied = self.invoke("workflow-replay", replay, apply=True)
        self.assertEqual(applied["replayOf"], "workflow-1")
        output = Path(self.temp.name) / "rebuilt.json"
        _, rebuilt = self.invoke("rebuild", apply=True, extra=["--output", str(output)])
        self.assertEqual(rebuilt["status"], "verified")
        self.assertEqual(rebuilt["lastSequence"], 7)
        self.assertEqual(rebuilt["entities"]["workflow"]["workflow-2"]["replayOf"], "workflow-1")
        database = sqlite3.connect(self.runtime / "runtime.sqlite3")
        with self.assertRaises(sqlite3.DatabaseError):
            database.execute("UPDATE runtime_events SET event_type='tampered' WHERE sequence=1")
        database.close()

    def test_user_confirmation_is_exact_one_time_and_native_readback_is_required(self) -> None:
        _, proposed = self.invoke("action-propose", self.action(), apply=True)
        action_digest = proposed["actionDigest"]
        issued = datetime.now(UTC) - timedelta(seconds=1)
        confirmation = self.action_transition("action-1", 1, action_digest, "confirm", "confirm-1", confirmationID="confirmation-1", actor="Chris", issuedAt=iso(issued), confirmationExpiresAt=iso(issued + timedelta(minutes=10)))
        _, confirmed = self.invoke("action-transition", confirmation, apply=True)
        self.assertEqual(confirmed["status"], "confirmed")
        _, begun = self.invoke("action-transition", self.action_transition("action-1", 2, action_digest, "begin", "begin-1"), apply=True)
        attempt_id = begun["attemptID"]
        _, attempted = self.invoke("action-transition", self.action_transition("action-1", 3, action_digest, "record-attempt", "attempt-1", attemptID=attempt_id, attemptedAt=iso(datetime.now(UTC)), nativeRequestHash="a" * 64), apply=True)
        self.assertEqual(attempted["status"], "attempted")
        bad_readback = {"system": "email", "observedAt": iso(datetime.now(UTC)), "outcome": "verified", "receiptHash": "b" * 64, "actionDigest": action_digest, "attemptID": attempt_id, "confirmationID": "confirmation-1"}
        rejected, _ = self.invoke("action-transition", self.action_transition("action-1", 4, action_digest, "verify", "verify-bad", attemptID=attempt_id, readback=bad_readback), apply=True, check=False)
        self.assertEqual(rejected.returncode, 2)
        readback = {**bad_readback, "system": "teams"}
        _, verified = self.invoke("action-transition", self.action_transition("action-1", 4, action_digest, "verify", "verify-good", attemptID=attempt_id, readback=readback), apply=True)
        self.assertEqual(verified["status"], "verified")
        terminal, _ = self.invoke("action-transition", self.action_transition("action-1", 5, action_digest, "begin", "begin-twice"), apply=True, check=False)
        self.assertEqual(terminal.returncode, 2)

    def test_post_dispatch_uncertainty_forbids_blind_retry_until_native_no_effect(self) -> None:
        _, proposed = self.invoke("action-propose", self.action("action-uncertain"), apply=True)
        action_digest = proposed["actionDigest"]
        issued = datetime.now(UTC) - timedelta(seconds=1)
        self.invoke("action-transition", self.action_transition("action-uncertain", 1, action_digest, "confirm", "confirm-u", confirmationID="confirmation-u", actor="Chris", issuedAt=iso(issued), confirmationExpiresAt=iso(issued + timedelta(minutes=10))), apply=True)
        _, begun = self.invoke("action-transition", self.action_transition("action-uncertain", 2, action_digest, "begin", "begin-u"), apply=True)
        attempt_id = begun["attemptID"]
        _, uncertain = self.invoke("action-transition", self.action_transition("action-uncertain", 3, action_digest, "fail", "fail-u", attemptID=attempt_id, error={"code": "connection-lost", "summary": "Connection ended during dispatch", "classification": "uncertain", "dispatchState": "unknown"}), apply=True)
        self.assertEqual(uncertain["status"], "indeterminate")
        projected = {item["actionID"]: item for item in json.loads((self.runtime / "operations.json").read_text())["externalActions"]}
        self.assertEqual(projected["action-uncertain"]["state"], "indeterminate")
        retry, _ = self.invoke("action-transition", self.action_transition("action-uncertain", 4, action_digest, "confirm", "blind-retry", confirmationID="confirmation-u2", actor="Chris", issuedAt=iso(issued), confirmationExpiresAt=iso(issued + timedelta(minutes=10))), apply=True, check=False)
        self.assertEqual(retry.returncode, 2)
        absence = {"system": "teams", "observedAt": iso(datetime.now(UTC)), "outcome": "verified-no-effect", "receiptHash": "c" * 64, "actionDigest": action_digest, "attemptID": attempt_id, "confirmationID": "confirmation-u"}
        _, resolved = self.invoke("action-transition", self.action_transition("action-uncertain", 4, action_digest, "resolve-no-effect", "resolve-u", attemptID=attempt_id, readback=absence), apply=True)
        self.assertEqual(resolved["status"], "failed-before-dispatch")

    def test_verified_pre_dispatch_failure_is_distinct_and_needs_fresh_confirmation(self) -> None:
        _, proposed = self.invoke("action-propose", self.action("action-pre-dispatch"), apply=True)
        action_digest = proposed["actionDigest"]
        issued = datetime.now(UTC) - timedelta(seconds=1)
        self.invoke("action-transition", self.action_transition("action-pre-dispatch", 1, action_digest, "confirm", "confirm-p", confirmationID="confirmation-p", actor="Chris", issuedAt=iso(issued), confirmationExpiresAt=iso(issued + timedelta(minutes=10))), apply=True)
        _, begun = self.invoke("action-transition", self.action_transition("action-pre-dispatch", 2, action_digest, "begin", "begin-p"), apply=True)
        _, failed = self.invoke("action-transition", self.action_transition("action-pre-dispatch", 3, action_digest, "fail", "fail-p", attemptID=begun["attemptID"], error={"code": "local-validation", "summary": "Local validation stopped dispatch", "classification": "permanent", "dispatchState": "not-dispatched"}), apply=True)
        self.assertEqual(failed["status"], "failed-before-dispatch")
        projected = {item["actionID"]: item for item in json.loads((self.runtime / "operations.json").read_text())["externalActions"]}["action-pre-dispatch"]
        self.assertEqual(projected["state"], "failed-before-dispatch")
        self.assertTrue(projected["confirmationRequired"])
        self.assertEqual(projected["readbackStatus"], "missing")
        fresh = datetime.now(UTC) - timedelta(seconds=1)
        _, reconfirmed = self.invoke("action-transition", self.action_transition("action-pre-dispatch", 4, action_digest, "confirm", "confirm-p2", confirmationID="confirmation-p2", actor="Chris", issuedAt=iso(fresh), confirmationExpiresAt=iso(fresh + timedelta(minutes=10))), apply=True)
        self.assertEqual(reconfirmed["status"], "confirmed")

    def test_standing_authorization_is_exact_and_rejects_other_target(self) -> None:
        local_now = datetime.now(ZoneInfo("America/New_York"))
        scheduled = local_now.replace(hour=17, minute=1, second=0, microsecond=0) + timedelta(days=1)
        while scheduled.isoweekday() > 5:
            scheduled += timedelta(days=1)
        policy = {
            "policyID": "foundry-to-tish-weekday",
            "event": "register",
            "actionKind": "send-foundry-report",
            "destinationSystem": "teams",
            "boundedTarget": "tish-personal-chat",
            "payloadClass": "foundry-daily-report",
            "timezone": "America/New_York",
            "allowedWeekdays": [1, 2, 3, 4, 5],
            "windowStart": "16:55",
            "windowEnd": "17:10",
            "expiresAt": iso(scheduled.astimezone(UTC) + timedelta(days=30)),
            "authorityEvidenceDigest": "d" * 64,
            "idempotencyKey": "register-standing",
        }
        self.invoke("standing-authorization", policy, apply=True)
        base = {
            "actionID": "foundry-report-1", "actionType": "send-foundry-report", "destinationSystem": "teams", "destinationClass": "personal-chat",
            "boundedTarget": "tish-personal-chat", "payloadDigest": "e" * 64, "payloadClass": "foundry-daily-report", "summary": "Send the reviewed Foundry report",
            "maxAttempts": 1, "authorizationMode": "standing-authorization", "standingAuthorizationID": "foundry-to-tish-weekday", "scheduledFor": iso(scheduled.astimezone(UTC)), "idempotencyKey": "standing-action-good",
        }
        _, accepted = self.invoke("action-propose", base, apply=True)
        self.assertEqual(accepted["status"], "confirmed")
        other = {**base, "actionID": "foundry-report-other", "boundedTarget": "different-person-chat", "idempotencyKey": "standing-action-other"}
        rejected, error = self.invoke("action-propose", other, apply=True, check=False)
        self.assertEqual(rejected.returncode, 2)
        self.assertIn("outside the exact standing authorization scope", error["error"])
        self.invoke("standing-authorization", {"policyID": "foundry-to-tish-weekday", "event": "revoke", "expectedVersion": 1, "idempotencyKey": "revoke-standing"}, apply=True)
        blocked, error = self.invoke("action-transition", self.action_transition("foundry-report-1", 1, accepted["actionDigest"], "begin", "begin-revoked", occurredAt=iso(scheduled.astimezone(UTC))), apply=True, check=False)
        self.assertEqual(blocked.returncode, 2)
        self.assertIn("revoked", error["error"])

    def test_real_diagnostics_drive_thresholded_deduplicated_alerts_and_recovery(self) -> None:
        checked = iso(datetime.now(UTC))
        self.invoke("stage-diagnostic", {"category": "commitments", "itemID": "commitment-1", "state": "active", "detail": {"title": "Complete the bounded runtime", "ownerLabel": "Chris", "consequence": "Priority 3 remains open", "evidenceStatus": "supported", "decisionIDs": []}, "idempotencyKey": "diag-c"}, apply=True)
        self.invoke("stage-diagnostic", {"category": "decisions", "itemID": "decision-1", "state": "pending", "detail": {"title": "Approve the runtime release", "ownerLabel": "Chris", "evidenceStatus": "supported", "commitmentIDs": []}, "idempotencyKey": "diag-d"}, apply=True)
        self.invoke("stage-diagnostic", {"category": "sources", "itemID": "outlook-calendar", "state": "stale", "detail": {"scopeLabel": "current-day", "itemCount": 3, "processedCount": 3, "unresolvedCount": 0, "freshness": "stale"}, "idempotencyKey": "diag-s"}, apply=True)
        self.invoke("stage-diagnostic", {"category": "connections", "itemID": "runtime-integrity", "state": "digest-mismatch", "detail": {"sourceID": "outlook-calendar", "authenticationState": "authenticated", "coverageState": "partial", "lastCheckedAt": checked, "diagnosticCodes": ["digest-mismatch"], "signalClass": "integrity", "failureCount60m": 3}, "idempotencyKey": "diag-x"}, apply=True)
        projection = json.loads((self.runtime / "operations.json").read_text())
        self.assert_app_contract_shape(projection)
        self.assertEqual(projection["commitments"][0]["commitmentID"], "commitment-1")
        self.assertEqual(projection["decisions"][0]["decisionID"], "decision-1")
        self.assertEqual(projection["sources"][0]["sourceID"], "outlook-calendar")
        alerts = {item["category"]: item for item in projection["alerts"]}
        self.assertEqual(alerts["source-coverage-gap"]["severity"], "warning")
        self.assertEqual(alerts["runtime-integrity-failure"]["severity"], "critical")
        self.assertTrue(any(item["instructionID"] == "recovery-runtime-integrity-failure" for item in projection["recoveryInstructions"]))
        self.assertNotIn("Different content", json.dumps(projection))

    def test_alert_lifecycle_is_durable_acknowledged_verified_resolved_and_reopened(self) -> None:
        detail = {"scopeLabel": "current-day", "itemCount": 2, "processedCount": 1, "unresolvedCount": 1, "freshness": "stale"}
        self.invoke("stage-diagnostic", {"category": "sources", "itemID": "calendar", "state": "stale", "detail": detail, "idempotencyKey": "alert-source-1"}, apply=True)
        projection = json.loads((self.runtime / "operations.json").read_text())
        item = next(value for value in projection["alerts"] if value["category"] == "source-coverage-gap")
        self.assertEqual(item["sourceKind"], "external-monitor")
        self.invoke("alert-transition", {"alertID": item["alertID"], "event": "acknowledge", "expectedVersion": 1, "idempotencyKey": "ack-1"}, apply=True)
        projection = json.loads((self.runtime / "operations.json").read_text())
        self.assertEqual(next(value for value in projection["alerts"] if value["alertID"] == item["alertID"])["status"], "acknowledged")
        healthy = {"scopeLabel": "current-day", "itemCount": 2, "processedCount": 2, "unresolvedCount": 0, "freshness": "fresh"}
        self.invoke("stage-diagnostic", {"category": "sources", "itemID": "calendar", "state": "available", "detail": healthy, "expectedVersion": 1, "idempotencyKey": "alert-source-2"}, apply=True)
        self.invoke("alert-transition", {"alertID": item["alertID"], "event": "resolve", "expectedVersion": 2, "verificationEvidenceDigest": "a" * 64, "idempotencyKey": "resolve-1"}, apply=True)
        projection = json.loads((self.runtime / "operations.json").read_text())
        resolved = next(value for value in projection["alerts"] if value["alertID"] == item["alertID"])
        self.assertEqual(resolved["status"], "resolved")
        self.assertNotIn(item["alertID"], {value for instruction in projection["recoveryInstructions"] for value in instruction["relatedIDs"]})
        stale_again = {**detail, "itemCount": 3, "processedCount": 2}
        self.invoke("stage-diagnostic", {"category": "sources", "itemID": "calendar", "state": "stale", "detail": stale_again, "expectedVersion": 2, "idempotencyKey": "alert-source-3"}, apply=True)
        projection = json.loads((self.runtime / "operations.json").read_text())
        reopened = next(value for value in projection["alerts"] if value["alertID"] == item["alertID"])
        self.assertEqual(reopened["status"], "open")
        self.assertGreaterEqual(reopened["count"], 2)

    def test_full_alert_thresholds_and_dead_letter_severity_are_machine_enforced(self) -> None:
        deadline = iso(datetime.now(UTC) - timedelta(minutes=1))
        signals = [
            {"itemID": "three-failures", "state": "failed", "detail": {"signalClass": "worker", "failureCount60m": 3}},
            {"itemID": "morning-run", "state": "missing", "detail": {"signalClass": "morning-pipeline", "deadlineAt": deadline}},
            {"itemID": "app-runtime", "state": "missing", "detail": {"signalClass": "app-readback", "appKnownRunning": True, "readbackAgeMinutes": 6}},
            {"itemID": "blocked-runtime", "state": "blocked", "detail": {"blockedMinutes": 30}},
            {"itemID": "lease-runtime", "state": "stalled-lease", "detail": {"leaseAgeMinutes": 15}},
        ]
        checked = iso(datetime.now(UTC))
        self.invoke("stage-diagnostic", {"category": "sources", "itemID": "runtime-source", "state": "available", "detail": {"scopeLabel": "local-runtime", "attemptedAt": checked, "succeededAt": checked, "itemCount": 1, "processedCount": 1, "unresolvedCount": 0, "freshness": "fresh"}, "idempotencyKey": "runtime-source"}, apply=True)
        for index, signal in enumerate(signals):
            signal["detail"] = {"sourceID": "runtime-source", "authenticationState": "authenticated", "coverageState": "partial", "lastCheckedAt": checked, "diagnosticCodes": ["runtime-signal"], **signal["detail"]}
            self.invoke("stage-diagnostic", {"category": "connections", **signal, "idempotencyKey": f"signal-{index}"}, apply=True)
        for workflow_id, consequential in [("consequential-dlq", True), ("ordinary-dlq", False)]:
            self.invoke("workflow-start", self.workflow(workflow_id, attempts=1, consequential=consequential, key=f"create-{workflow_id}"), apply=True)
            self.invoke("workflow-transition", self.transition(workflow_id, 1, "start", f"start-{workflow_id}"), apply=True)
            self.invoke("workflow-transition", self.transition(workflow_id, 2, "fail", f"fail-{workflow_id}", error={"code": "permanent-failure", "summary": "A permanent failure occurred", "classification": "permanent"}), apply=True)
        projection = json.loads((self.runtime / "operations.json").read_text())
        self.assert_app_contract_shape(projection)
        by_category_and_title = {(item["category"], item["safeSummary"]): item for item in projection["alerts"]}
        severities = {item["category"]: item["severity"] for item in projection["alerts"] if item["category"] != "dead-letter-open"}
        self.assertEqual(severities["repeated-runtime-failure"], "error")
        self.assertEqual(severities["morning-pipeline-missing"], "error")
        self.assertEqual(severities["app-readback-overdue"], "error")
        self.assertEqual(severities["runtime-blocked"], "warning")
        self.assertEqual(severities["runtime-lease-stalled"], "warning")
        dead_alerts = [item for item in projection["alerts"] if item["category"] == "dead-letter-open"]
        self.assertEqual(sorted(item["severity"] for item in dead_alerts), ["error", "warning"])
        policy = json.loads((ROOT / "skills/monday-runtime/references/compatibility-matrix.json").read_text())["alertPolicy"]
        self.assertEqual(policy["failureCountThreshold"], 3)
        self.assertEqual(policy["knownRunningAppReadbackMinutes"], 5)

    def test_projection_migration_future_database_rejection_and_tamper_detection(self) -> None:
        legacy = self.inputs / "legacy.json"
        legacy_value = json.loads((self.runtime / "operations.json").read_text())
        legacy_value["schemaVersion"] = 1
        legacy_value["compatibility"] = {"projectionSchemaVersion": 1, "minimumAppVersion": "0.4.0", "maximumAppVersion": "0.4.999", "status": "compatible", "issueCodes": []}
        core = dict(legacy_value)
        core.pop("projectionID")
        core.pop("contentDigest")
        old_digest = hashlib.sha256(json.dumps(core, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        legacy_value["contentDigest"] = old_digest
        legacy_value["projectionID"] = f"runtime-legacy-{old_digest[:12]}"
        legacy.write_text(json.dumps(legacy_value))
        _, preview = self.invoke("migrate-projection", extra=["--input", str(legacy)])
        self.assertEqual(preview["status"], "ready")
        self.environment["MONDAY_RUNTIME_FAIL_MIGRATION_WRITE"] = "1"
        failed, failure = self.invoke("migrate-projection", apply=True, check=False, extra=["--input", str(legacy)])
        self.environment.pop("MONDAY_RUNTIME_FAIL_MIGRATION_WRITE")
        self.assertEqual(failed.returncode, 2)
        self.assertIn("receipt rolled back", failure["error"])
        self.assertEqual(json.loads(legacy.read_text())["schemaVersion"], 1)
        database = sqlite3.connect(self.runtime / "runtime.sqlite3")
        self.assertEqual(database.execute("SELECT COUNT(*) FROM migration_receipts WHERE migration_id='operations-projection-1-to-2'").fetchone()[0], 0)
        database.close()
        _, migrated = self.invoke("migrate-projection", apply=True, extra=["--input", str(legacy)])
        self.assertEqual(migrated["status"], "migrated")
        migrated_value = json.loads(legacy.read_text())
        self.assertEqual(migrated_value["schemaVersion"], 2)
        backup = Path(migrated["backupPath"])
        self.assertTrue(backup.exists())
        self.assertEqual(hashlib.sha256(backup.read_bytes()).hexdigest(), migrated["backupDigest"])
        _, restored = self.invoke("restore-projection", apply=True, extra=["--backup", str(backup), "--expected-digest", migrated["backupDigest"]])
        self.assertEqual(restored["status"], "restored")
        self.assertEqual(json.loads((self.runtime / "operations.json").read_text())["schemaVersion"], 1)
        rejected, error = self.invoke("restore-projection", apply=True, check=False, extra=["--backup", str(backup), "--expected-digest", "0" * 64])
        self.assertEqual(rejected.returncode, 2)
        self.assertIn("digest mismatch", error["error"])
        self.invoke("project", apply=True)
        projection = json.loads((self.runtime / "operations.json").read_text())
        projection["coverage"]["workflowCount"] = 999
        (self.runtime / "operations.json").write_text(json.dumps(projection))
        result, error = self.invoke("reconcile-readback", check=False)
        self.assertEqual(result.returncode, 2)
        self.assertIn("content digest mismatch", error["error"])
        database = sqlite3.connect(self.runtime / "runtime.sqlite3")
        database.execute("PRAGMA user_version=3")
        database.commit()
        database.close()
        future, error = self.invoke("status", check=False)
        self.assertEqual(future.returncode, 2)
        self.assertIn("unsupported", error["error"])

    def test_runtime_readback_requires_exact_digest_schema_view_and_compatible_app(self) -> None:
        projection = json.loads((self.runtime / "operations.json").read_text())
        receipt = {
            "schemaVersion": 1,
            "projectionID": projection["projectionID"],
            "projectionSchemaVersion": 2,
            "contentDigest": projection["contentDigest"],
            "consumer": "Command Center",
            "appVersion": "0.4.1",
            "displayedAt": projection["generatedAt"],
            "state": "displayed",
            "viewIDs": ["operations-overview"],
        }
        (self.runtime / "readback.json").write_text(json.dumps(receipt))
        _, reconciled = self.invoke("reconcile-readback", apply=True)
        self.assertEqual(reconciled["status"], "displayed")
        self.assertEqual(reconciled["viewID"], "operations-overview")
        receipt["viewIDs"] = ["operations-overview", "operations-source-health"]
        (self.runtime / "readback.json").write_text(json.dumps(receipt))
        multiple, _ = self.invoke("reconcile-readback", check=False)
        self.assertEqual(multiple.returncode, 2)
        receipt["viewIDs"] = ["operations-runtime"]
        (self.runtime / "readback.json").write_text(json.dumps(receipt))
        unknown, _ = self.invoke("reconcile-readback", check=False)
        self.assertEqual(unknown.returncode, 2)
        receipt["viewIDs"] = ["operations-overview"]
        receipt["appVersion"] = "0.2.0"
        (self.runtime / "readback.json").write_text(json.dumps(receipt))
        rejected, _ = self.invoke("reconcile-readback", check=False)
        self.assertEqual(rejected.returncode, 2)


if __name__ == "__main__":
    unittest.main()
