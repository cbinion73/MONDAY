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


class MondaySystemTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.home = root / "home"
        self.monday = root / "Monday Knowledge"
        self.projects = root / "Project Knowledge"
        self.personal = root / "Personal Project Knowledge"
        self.sources = root / "sources"
        self.planner = root / "planner"
        for path in (self.home, self.monday, self.projects / "03 Projects", self.projects / "05 Decisions", self.personal):
            path.mkdir(parents=True, exist_ok=True)
        self.env = {
            **os.environ,
            "HOME": str(self.home),
            "MONDAY_TIMEZONE": "UTC",
            "MONDAY_KNOWLEDGE_ROOT": str(self.monday),
            "MONDAY_PROJECT_KNOWLEDGE_VAULT": str(self.projects),
            "MONDAY_PERSONAL_PROJECTS_VAULT": str(self.personal),
            "MONDAY_SOURCE_ROOT": str(self.sources),
            "MONDAY_PLANNER_ROOT": str(self.planner),
        }

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def invoke(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *arguments],
            env=self.env,
            text=True,
            capture_output=True,
            check=check,
        )

    def test_available_source_requires_success_timestamp(self) -> None:
        result = self.invoke(
            "stage-source", "--source-id", "calendar", "--name", "Calendar", "--kind", "calendar", "--status", "available",
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("require --succeeded-at", result.stderr)

    def test_calendar_input_is_separate_from_previous_plan_output(self) -> None:
        self.planner.mkdir(parents=True)
        (self.planner / "daily-plan.json").write_text(
            json.dumps({"date": datetime.now(timezone.utc).date().isoformat(), "schedule": [{"time": "09:00", "end": "10:00", "title": "Old event"}]}),
            encoding="utf-8",
        )
        result = self.invoke("publish")
        plan = json.loads(result.stdout)
        self.assertEqual(plan["schedule"], [])
        calendar = next((item for item in plan["sources"] if item["kind"] == "calendar"), None)
        self.assertIsNotNone(calendar)
        self.assertEqual(calendar["status"], "unknown")
        self.assertEqual(calendar["name"], "Outlook Calendar plugin")
        self.assertIn("Outlook Calendar plugin source manifest", calendar["detail"])
        self.assertNotIn(plan["coverage"]["status"], {"available", "empty"})

    def test_staged_calendar_populates_schedule_and_manifest(self) -> None:
        today = datetime.now(timezone.utc).date().isoformat()
        artifact = Path(self.temporary.name) / "calendar.json"
        artifact.write_text(json.dumps({"date": today, "items": [{"time": "09:00", "end": "10:00", "title": "Real event"}]}), encoding="utf-8")
        succeeded = datetime.now(timezone.utc).isoformat()
        self.invoke(
            "stage-source", "--source-id", "outlook-calendar", "--name", "Outlook Calendar", "--kind", "calendar",
            "--status", "available", "--succeeded-at", succeeded, "--item-count", "1", "--processed-count", "1",
            "--unresolved-count", "0", "--artifact", str(artifact), "--apply",
        )
        plan = json.loads(self.invoke("publish").stdout)
        self.assertEqual(plan["schedule"][0]["title"], "Real event")
        self.assertEqual(next(item for item in plan["sources"] if item["kind"] == "calendar")["status"], "available")

    def test_stale_source_is_not_usable(self) -> None:
        artifact = Path(self.temporary.name) / "calendar.json"
        artifact.write_text(json.dumps({"date": datetime.now(timezone.utc).date().isoformat(), "items": [{"time": "09:00", "end": "10:00", "title": "Stale event"}]}), encoding="utf-8")
        old = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        self.invoke(
            "stage-source", "--source-id", "calendar", "--name", "Calendar", "--kind", "calendar", "--status", "available",
            "--succeeded-at", old, "--item-count", "1", "--processed-count", "1", "--unresolved-count", "0",
            "--freshness-hours", "12", "--artifact", str(artifact), "--apply",
        )
        plan = json.loads(self.invoke("publish").stdout)
        self.assertEqual(plan["schedule"], [])
        self.assertEqual(next(item for item in plan["sources"] if item["kind"] == "calendar")["status"], "stale")

    def test_publish_and_readback_require_matching_plan(self) -> None:
        result = json.loads(self.invoke("publish", "--apply").stdout)
        mismatch = self.invoke(
            "ack", "--plan-id", "wrong", "--schema-version", "3", "--consumer", "test", "--app-version", "1",
            "--apply", check=False,
        )
        self.assertNotEqual(mismatch.returncode, 0)
        valid = self.invoke(
            "ack", "--plan-id", result["planID"], "--schema-version", "3", "--consumer", "test", "--app-version", "1",
            "--apply",
        )
        self.assertEqual(json.loads(valid.stdout)["state"], "displayed")
        status = json.loads(self.invoke("status").stdout)
        self.assertTrue(status["displayed"])

    def test_activity_dry_run_does_not_persist(self) -> None:
        self.invoke("record-activity", "--summary", "Observed work", "--source", "test", "--evidence", "observed")
        activity_root = self.monday / "100 Activity Ledger"
        self.assertFalse(activity_root.exists())

    def test_meeting_continuity_uses_governed_continuity_state(self) -> None:
        ledger = self.projects / "04 Portfolio/Meeting Continuity/meeting-continuity-ledger.json"
        ledger.parent.mkdir(parents=True)
        ledger.write_text(
            json.dumps(
                {
                    "occurrences": {
                        "verified": {"continuity_state": "reconciliation_verified", "routing_disposition": "reviewed_no_change"},
                        "pending": {"continuity_state": "routing_pending", "routing_disposition": "pending"},
                    }
                }
            ),
            encoding="utf-8",
        )
        plan = json.loads(self.invoke("publish").stdout)
        meeting = plan["brief"]["meetingContinuity"]
        self.assertEqual(meeting["occurrenceCount"], 2)
        self.assertEqual(meeting["unresolvedCount"], 1)
        self.assertEqual(meeting["byStatus"]["reconciliation_verified"], 1)


if __name__ == "__main__":
    unittest.main()
