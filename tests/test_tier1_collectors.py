from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "monday_system.py"


class TierOneCollectorContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.sources = self.root / "sources"
        self.sources.mkdir()
        self.env = {**os.environ, "HOME": str(self.root / "home"), "MONDAY_TIMEZONE": "UTC", "MONDAY_SOURCE_ROOT": str(self.sources)}
        self.start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def invoke(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run([sys.executable, str(SCRIPT), *arguments], env=self.env, text=True, capture_output=True, check=check)

    def envelope(self, source_id: str, route: str, items: list[dict], status: str = "available", **extra) -> dict:
        scope = {"windowStart": self.start.isoformat(), "windowEnd": (self.start + timedelta(days=1)).isoformat(), "timezone": "UTC"}
        if source_id == "outlook-email":
            scope.update({"mailbox": "primary", "query": "bounded-day"})
        elif source_id == "onedrive-files":
            scope.update({"drive": "business-drive", "businessOneDrive": True, "query": "bounded-folder"})
        elif source_id == "teams":
            scope.update({"query": "bounded-meeting-window"})
        elif source_id == "sharepoint-files":
            scope.update({"site": "site-a", "library": "documents", "query": "bounded-folder"})
        payload = {
            "schemaVersion": 1,
            "collectionID": extra.pop("collectionID", f"collection-{source_id}-1"),
            "sourceID": source_id,
            "route": route,
            "status": status,
            "attemptedAt": self.start.isoformat(),
            "completedAt": (self.start + timedelta(minutes=1)).isoformat() if status in {"available", "empty"} else None,
            "scope": scope,
            "counts": {"itemCount": len(items), "processedCount": len(items), "unresolvedCount": 0},
            "freshnessHours": 24,
            "normalizedItems": items,
            "error": None,
            "limitations": [],
            "priorWatermark": None,
            "proposedWatermark": None if source_id == "outlook-calendar" else f"{source_id}:1",
            "watermarkBasis": "bounded-source-cutoff",
        }
        payload.update(extra)
        return payload

    def stage(self, payload: dict, check: bool = True) -> subprocess.CompletedProcess[str]:
        path = self.root / f"{payload.get('collectionID', 'invalid')}.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return self.invoke("stage-collection", "--input", str(path), "--apply", check=check)

    def test_calendar_success_writes_sanitized_artifact_and_manifest(self) -> None:
        payload = self.envelope("outlook-calendar", "outlook-calendar", [{"title": "Planning", "start": self.start.replace(hour=9).isoformat(), "end": self.start.replace(hour=10).isoformat(), "isAllDay": False}])
        result = json.loads(self.stage(payload).stdout)
        self.assertTrue(result["committed"])
        artifact = json.loads((self.sources / "outlook-calendar.json").read_text())
        manifest = json.loads((self.sources / "outlook-calendar.manifest.json").read_text())
        self.assertEqual(artifact["date"], self.start.date().isoformat())
        self.assertEqual(artifact["items"][0]["title"], "Planning")
        self.assertEqual(manifest["status"], "available")
        self.assertIsNone(manifest["watermark"])
        self.assertTrue(manifest["artifactSHA256"])

    def test_privacy_fields_are_rejected_without_persistence(self) -> None:
        payload = self.envelope("outlook-calendar", "outlook-calendar", [{"title": "Secret", "start": self.start.replace(hour=9).isoformat(), "end": self.start.replace(hour=10).isoformat(), "isAllDay": False, "attendees": ["person@example.com"]}])
        result = self.stage(payload, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.sources / "outlook-calendar.json").exists())
        self.assertFalse((self.sources / "outlook-calendar.manifest.json").exists())

    def test_nested_private_content_and_secret_locators_are_rejected(self) -> None:
        payload = self.envelope(
            "outlook-email",
            "outlook-email",
            [{"occurredAt": self.start.isoformat(), "safeSummary": "Bounded signal", "projectIDs": [{"body": "RAW SECRET"}], "evidenceClass": "observed", "signalType": "risk", "sourceLocator": {"url": "https://example.test/?token=abc"}}],
        )
        result = self.stage(payload, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.sources / "outlook-email.manifest.json").exists())
        self.assertFalse((self.sources / "outlook-email.json").exists())

    def test_available_with_unresolved_items_is_rejected(self) -> None:
        payload = self.envelope("outlook-email", "outlook-email", [{"occurredAt": self.start.isoformat(), "safeSummary": "Project signal", "projectIDs": ["p"], "evidenceClass": "observed", "signalType": "commitment", "sourceLocator": "mail:1"}])
        payload["counts"] = {"itemCount": 2, "processedCount": 1, "unresolvedCount": 1}
        result = self.stage(payload, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("available source requires", result.stderr)

    def test_partial_attempt_preserves_prior_artifact_and_watermark_then_recovers(self) -> None:
        first = self.envelope("outlook-email", "outlook-email", [{"occurredAt": self.start.isoformat(), "safeSummary": "Signal", "projectIDs": [], "evidenceClass": "observed", "signalType": "risk", "sourceLocator": "mail:1"}])
        self.stage(first)
        artifact_before = (self.sources / "outlook-email.json").read_bytes()
        partial = self.envelope("outlook-email", "outlook-email", [], status="partial", collectionID="collection-outlook-email-2")
        partial["counts"] = {"itemCount": 2, "processedCount": 1, "unresolvedCount": 1}
        partial["error"] = "page two blocked"
        partial["proposedWatermark"] = "outlook-email:2"
        partial["priorWatermark"] = "outlook-email:1"
        self.stage(partial)
        manifest = json.loads((self.sources / "outlook-email.manifest.json").read_text())
        self.assertEqual(manifest["status"], "partial")
        self.assertEqual(manifest["watermark"], "outlook-email:1")
        self.assertEqual((self.sources / "outlook-email.json").read_bytes(), artifact_before)
        recovered = self.envelope("outlook-email", "outlook-email", [], status="empty", collectionID="collection-outlook-email-3")
        recovered["counts"] = {"itemCount": 0, "processedCount": 0, "unresolvedCount": 0}
        recovered["proposedWatermark"] = "outlook-email:3"
        recovered["priorWatermark"] = "outlook-email:1"
        self.stage(recovered)
        manifest = json.loads((self.sources / "outlook-email.manifest.json").read_text())
        self.assertEqual(manifest["status"], "empty")
        self.assertEqual(manifest["watermark"], "outlook-email:3")

    def test_collection_id_replay_is_idempotent_and_conflict_fails(self) -> None:
        payload = self.envelope("teams", "teams", [])
        payload["status"] = "empty"
        first = json.loads(self.stage(payload).stdout)
        second = json.loads(self.stage(payload).stdout)
        self.assertFalse(first["idempotentReplay"])
        self.assertTrue(second["idempotentReplay"])
        payload["limitations"] = ["changed replay"]
        conflict = self.stage(payload, check=False)
        self.assertNotEqual(conflict.returncode, 0)
        self.assertIn("Conflicting replay", conflict.stderr)

    def test_idempotent_success_replay_requires_intact_immutable_artifact(self) -> None:
        payload = self.envelope("teams", "teams", [], status="empty")
        first = json.loads(self.stage(payload).stdout)
        artifact = Path(first["manifest"]["artifact"])
        artifact.unlink()
        missing = self.stage(payload, check=False)
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("missing or corrupt", missing.stderr)

        # A fresh collection proves corruption is detected independently of deletion.
        payload["collectionID"] = "collection-teams-corrupt"
        payload["priorWatermark"] = "teams:1"
        payload["proposedWatermark"] = "teams:2"
        second = json.loads(self.stage(payload).stdout)
        artifact = Path(second["manifest"]["artifact"])
        artifact.write_text("corrupt\n", encoding="utf-8")
        corrupt = self.stage(payload, check=False)
        self.assertNotEqual(corrupt.returncode, 0)
        self.assertIn("missing or corrupt", corrupt.stderr)

    def test_historical_collection_id_reuse_after_intervening_attempt_fails(self) -> None:
        first = self.envelope("teams", "teams", [], status="empty", collectionID="historical-id")
        self.stage(first)
        second = self.envelope("teams", "teams", [], status="empty", collectionID="later-id")
        second["priorWatermark"] = "teams:1"
        second["proposedWatermark"] = "teams:2"
        self.stage(second)
        first["limitations"] = ["changed historical replay"]
        result = self.stage(first, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Conflicting replay", result.stderr)

    def test_wrong_prior_watermark_and_watermark_deletion_fail_closed(self) -> None:
        first = self.envelope("outlook-email", "outlook-email", [], status="empty")
        self.stage(first)
        stale = self.envelope("outlook-email", "outlook-email", [], status="empty", collectionID="stale-writer")
        stale["priorWatermark"] = "wrong"
        stale["proposedWatermark"] = "outlook-email:2"
        result = self.stage(stale, check=False)
        self.assertNotEqual(result.returncode, 0)
        manifest = json.loads((self.sources / "outlook-email.manifest.json").read_text())
        self.assertEqual(manifest["watermark"], "outlook-email:1")
        deletion = self.envelope("outlook-email", "outlook-email", [], status="empty", collectionID="delete-watermark")
        deletion["priorWatermark"] = "outlook-email:1"
        deletion["proposedWatermark"] = None
        self.assertNotEqual(self.stage(deletion, check=False).returncode, 0)

        forward = self.envelope("outlook-email", "outlook-email", [], status="empty", collectionID="forward-watermark")
        forward["priorWatermark"] = "outlook-email:1"
        forward["proposedWatermark"] = "outlook-email:2"
        self.stage(forward)
        rollback = self.envelope("outlook-email", "outlook-email", [], status="empty", collectionID="rollback-watermark")
        rollback["priorWatermark"] = "outlook-email:2"
        rollback["proposedWatermark"] = "outlook-email:1"
        result = self.stage(rollback, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("known rollback", result.stderr)

    def test_invalid_naive_out_of_order_and_invalid_timezone_fail_closed(self) -> None:
        for index, mutation in enumerate((
            {"attemptedAt": "not-a-time"},
            {"attemptedAt": "2026-09-24T00:00:00", "completedAt": "2026-09-24T00:01:00"},
            {"attemptedAt": self.start.isoformat(), "completedAt": (self.start - timedelta(minutes=1)).isoformat()},
        )):
            payload = self.envelope("teams", "teams", [], status="empty", collectionID=f"bad-time-{index}")
            payload.update(mutation)
            self.assertNotEqual(self.stage(payload, check=False).returncode, 0)
        timezone_payload = self.envelope("teams", "teams", [], status="empty", collectionID="bad-zone")
        timezone_payload["scope"]["timezone"] = "Not/AZone"
        self.assertNotEqual(self.stage(timezone_payload, check=False).returncode, 0)

    def test_calendar_events_must_be_ordered_and_inside_declared_window(self) -> None:
        reversed_event = self.envelope("outlook-calendar", "outlook-calendar", [{"title": "Bad", "start": self.start.replace(hour=10).isoformat(), "end": self.start.replace(hour=9).isoformat(), "isAllDay": False}], collectionID="calendar-reversed")
        self.assertNotEqual(self.stage(reversed_event, check=False).returncode, 0)
        outside_event = self.envelope("outlook-calendar", "outlook-calendar", [{"title": "Outside", "start": (self.start + timedelta(days=2, hours=9)).isoformat(), "end": (self.start + timedelta(days=2, hours=10)).isoformat(), "isAllDay": False}], collectionID="calendar-outside")
        self.assertNotEqual(self.stage(outside_event, check=False).returncode, 0)

    def test_scope_and_error_metadata_require_safe_string_types(self) -> None:
        bad_scope = self.envelope("outlook-email", "outlook-email", [], status="empty", collectionID="bad-scope-types")
        bad_scope["scope"]["mailbox"] = 123
        bad_scope["scope"]["query"] = ["x"]
        self.assertNotEqual(self.stage(bad_scope, check=False).returncode, 0)
        bad_limitations = self.envelope("teams", "teams", [], status="empty", collectionID="bad-limitations")
        bad_limitations["limitations"] = [{"note": "x"}]
        result = self.stage(bad_limitations, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Traceback", result.stderr)
        bad_error = self.envelope("teams", "teams", [], status="blocked", collectionID="bad-error")
        bad_error["error"] = ["blocked"]
        self.assertNotEqual(self.stage(bad_error, check=False).returncode, 0)

    def test_success_uses_immutable_versioned_artifact_and_retains_exact_scope(self) -> None:
        payload = self.envelope("sharepoint-files", "sharepoint", [], status="empty")
        self.stage(payload)
        first = json.loads((self.sources / "sharepoint-files.manifest.json").read_text())
        first_artifact = Path(first["artifact"])
        self.assertIn("artifacts/sharepoint-files", str(first_artifact))
        self.assertEqual(first["lastSuccess"]["scope"]["site"], "site-a")
        partial = self.envelope("sharepoint-files", "sharepoint", [], status="partial", collectionID="site-b-partial")
        partial["scope"].update({"site": "site-b", "library": "other", "query": "bounded-other"})
        partial["counts"] = {"itemCount": 1, "processedCount": 0, "unresolvedCount": 1}
        partial["priorWatermark"] = "sharepoint-files:1"
        partial["proposedWatermark"] = "sharepoint-files:2"
        self.stage(partial)
        current = json.loads((self.sources / "sharepoint-files.manifest.json").read_text())
        self.assertEqual(current["lastSuccess"]["scope"]["site"], "site-a")
        self.assertEqual(current["latestAttempt"]["scope"]["site"], "site-b")
        self.assertEqual(current["artifact"], str(first_artifact))
        self.assertEqual(first_artifact.read_bytes(), Path(current["artifact"]).read_bytes())

    def test_stage_source_cannot_bypass_canonical_collection_controls(self) -> None:
        unsafe = self.root / "unsafe.json"
        unsafe.write_text(json.dumps({"items": [{"body": "private", "attendees": ["person@example.com"]}]}), encoding="utf-8")
        result = self.invoke(
            "stage-source", "--source-id", "outlook-email", "--name", "Email", "--kind", "email", "--status", "available",
            "--succeeded-at", self.start.isoformat(), "--item-count", "1", "--processed-count", "1", "--unresolved-count", "0",
            "--artifact", str(unsafe), "--apply", check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must use stage-collection", result.stderr)

    def test_onedrive_and_sharepoint_routes_require_explicit_scopes(self) -> None:
        onedrive = self.envelope("onedrive-files", "sharepoint-business-onedrive", [], status="empty")
        onedrive["scope"].pop("drive")
        self.assertNotEqual(self.stage(onedrive, check=False).returncode, 0)
        onedrive["scope"].update({"drive": "business-drive", "businessOneDrive": True, "query": "bounded"})
        self.stage(onedrive)
        sharepoint = self.envelope("sharepoint-files", "sharepoint", [], status="empty")
        sharepoint["scope"].pop("site")
        self.assertNotEqual(self.stage(sharepoint, check=False).returncode, 0)
        sharepoint["scope"].update({"site": "site-a", "library": "documents", "query": "bounded"})
        self.stage(sharepoint)


if __name__ == "__main__":
    unittest.main()
