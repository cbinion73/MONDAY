from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "monday_system.py"
EXTERNAL_SOURCE_IDS = {
    "outlook-calendar",
    "outlook-email",
    "onedrive-files",
    "teams",
    "sharepoint-files",
}
PIPELINE_STAGES = ["collect", "validate", "analyze", "challenge", "quality", "publish", "readback"]


class PriorityOnePlanningPipelineAcceptanceTests(unittest.TestCase):
    """Black-box acceptance tests for the dependable daily MONDAY system.

    These tests intentionally exercise the public CLI and persisted contracts rather
    than private implementation helpers. A passing suite therefore proves that the
    same artifacts available to Command Center carry the required evidence.
    """

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.home = self.root / "home"
        self.monday = self.root / "Monday Knowledge"
        self.projects = self.root / "Project Knowledge"
        self.personal = self.root / "Personal Project Knowledge"
        self.sources = self.root / "sources"
        self.planner = self.root / "planner"
        self.project_root = self.projects / "03 Projects"
        self.decision_root = self.projects / "05 Decisions"
        self.meeting_ledger = self.projects / "04 Portfolio/Meeting Continuity/meeting-continuity-ledger.json"
        self.activity_root = self.monday / "100 Activity Ledger"
        self.operations_root = self.monday / "400 MONDAY Operations/Receipts"
        self.captains_log = self.root / "Chris Knowledge/500 Personal Journal"
        self.research_chronicle = self.monday / "500 Research Journal"
        for path in (
            self.home,
            self.project_root,
            self.decision_root,
            self.personal,
            self.sources,
            self.planner,
            self.activity_root,
            self.operations_root,
            self.captains_log,
            self.research_chronicle,
        ):
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
            "MONDAY_PLANNING_CONTEXT": str(self.planner / "planning-context.json"),
            "MONDAY_CHRIS_KNOWLEDGE_ROOT": str(self.root / "Chris Knowledge"),
        }
        self.today = datetime.now(timezone.utc).date()
        self.now = datetime.now(timezone.utc).replace(microsecond=0)

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

    def write_json(self, path: Path, payload: Any) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        return path

    def write_record(
        self,
        root: Path,
        filename: str,
        metadata: dict[str, Any],
        body: str = "",
    ) -> Path:
        path = root / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        front_matter = "\n".join(f"{key}: {value}" for key, value in metadata.items())
        path.write_text(f"---\n{front_matter}\n---\n\n{body}", encoding="utf-8")
        return path

    def stage_source(
        self,
        source_id: str,
        kind: str,
        status: str,
        artifact: Path,
        *,
        item_count: int,
        processed_count: int,
        unresolved_count: int,
        succeeded_at: datetime | None = None,
        attempted_at: datetime | None = None,
        window_start: str | None = None,
        window_end: str | None = None,
        watermark: str | None = None,
        freshness_hours: int = 24,
        error: str = "",
    ) -> subprocess.CompletedProcess[str]:
        attempted = attempted_at or succeeded_at or self.now
        start = window_start or (attempted - timedelta(days=1)).isoformat()
        end = window_end or attempted.isoformat()
        if len(start) == 10:
            start += "T00:00:00+00:00"
        if len(end) == 10:
            end += "T00:00:00+00:00"
        raw = json.loads(artifact.read_text(encoding="utf-8")) if artifact.exists() else {}
        items = raw.get("items", []) if isinstance(raw, dict) else []
        if source_id == "outlook-calendar":
            day = raw.get("date", start[:10])
            normalized = []
            for item in items:
                item_start = item.get("start") or item.get("time")
                item_end = item.get("end")
                if isinstance(item_start, str) and len(item_start) == 5:
                    item_start = f"{day}T{item_start}:00+00:00"
                if isinstance(item_end, str) and len(item_end) == 5:
                    item_end = f"{day}T{item_end}:00+00:00"
                normalized.append({"title": item["title"], "start": item_start, "end": item_end, "isAllDay": bool(item.get("isAllDay", False))})
            route = "outlook-calendar"
            scope = {"windowStart": start, "windowEnd": end, "timezone": "UTC"}
            prior = proposed = None
        else:
            normalized = items
            routes = {"outlook-email": "outlook-email", "onedrive-files": "sharepoint-business-onedrive", "teams": "teams", "sharepoint-files": "sharepoint"}
            route = routes[source_id]
            scope = {"windowStart": start, "windowEnd": end, "timezone": "UTC"}
            if source_id == "outlook-email": scope.update({"mailbox": "primary", "query": "bounded-test"})
            if source_id == "onedrive-files": scope.update({"drive": "business", "businessOneDrive": True, "query": "bounded-test"})
            if source_id == "teams": scope.update({"query": "bounded-test"})
            if source_id == "sharepoint-files": scope.update({"site": "site", "library": "documents", "query": "bounded-test"})
            manifest_path = self.sources / f"{source_id}.manifest.json"
            prior_manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
            prior = (prior_manifest.get("lastSuccess") or prior_manifest).get("watermark")
            proposed = watermark if status in {"available", "empty"} else None
        envelope = {
            "schemaVersion": 1,
            "collectionID": f"{source_id}-{status}-{attempted.timestamp()}-{item_count}-{unresolved_count}",
            "sourceID": source_id,
            "route": route,
            "status": status,
            "attemptedAt": attempted.isoformat(),
            "completedAt": succeeded_at.isoformat() if succeeded_at and status in {"available", "empty"} else None,
            "scope": scope,
            "counts": {"itemCount": item_count, "processedCount": processed_count, "unresolvedCount": unresolved_count},
            "freshnessHours": freshness_hours,
            "normalizedItems": normalized,
            "error": error or None,
            "limitations": [],
            "priorWatermark": prior,
            "proposedWatermark": proposed,
            "watermarkBasis": "bounded-test",
        }
        envelope_path = self.root / f"{envelope['collectionID']}.json"
        envelope_path.write_text(json.dumps(envelope), encoding="utf-8")
        return self.invoke("stage-collection", "--input", str(envelope_path), "--apply")

    def stage_calendar(
        self,
        day: date,
        items: list[dict[str, Any]],
        *,
        status: str | None = None,
        succeeded_at: datetime | None = None,
        unresolved_count: int = 0,
    ) -> Path:
        artifact = self.write_json(self.sources / "outlook-calendar.json", {"date": day.isoformat(), "items": items})
        effective_status = status or ("available" if items else "empty")
        succeeded = succeeded_at if succeeded_at is not None else self.now
        self.stage_source(
            "outlook-calendar",
            "calendar",
            effective_status,
            artifact,
            item_count=len(items),
            processed_count=max(0, len(items) - unresolved_count),
            unresolved_count=unresolved_count,
            succeeded_at=succeeded if effective_status in {"available", "empty"} else None,
            window_start=f"{day.isoformat()}T00:00:00+00:00",
            window_end=f"{(day + timedelta(days=1)).isoformat()}T00:00:00+00:00",
            watermark=None,
            error="partial calendar collection" if effective_status == "partial" else "",
        )
        return artifact

    def stage_all_external_sources(self, day: date | None = None) -> None:
        day = day or self.today
        self.stage_calendar(day, [])
        for source_id, kind in (
            ("outlook-email", "email"),
            ("onedrive-files", "onedrive-files"),
            ("teams", "teams"),
            ("sharepoint-files", "sharepoint-files"),
        ):
            artifact = self.write_json(self.sources / f"{source_id}.json", {"items": []})
            self.stage_source(
                source_id,
                kind,
                "empty",
                artifact,
                item_count=0,
                processed_count=0,
                unresolved_count=0,
                succeeded_at=self.now,
                window_start=(day - timedelta(days=1)).isoformat(),
                window_end=day.isoformat(),
                watermark=f"{source_id}:{day.isoformat()}",
            )

    def publish(self, day: date | None = None, *, apply: bool = True, check: bool = True) -> tuple[subprocess.CompletedProcess[str], dict[str, Any] | None]:
        arguments = ["publish", "--date", (day or self.today).isoformat()]
        if apply:
            arguments.append("--apply")
        result = self.invoke(*arguments, check=check)
        plan_path = self.planner / "daily-plan.json"
        plan = json.loads(plan_path.read_text(encoding="utf-8")) if plan_path.exists() else None
        return result, plan

    @staticmethod
    def challenge_codes(plan: dict[str, Any]) -> set[str]:
        return {
            str(item.get("code") or item.get("type"))
            for item in plan["brief"]["challenges"]
            if isinstance(item, dict)
        }

    def test_tomorrow_rollover_never_reuses_todays_calendar(self) -> None:
        self.stage_calendar(
            self.today,
            [{"time": "09:00", "end": "10:00", "title": "Today only"}],
        )
        tomorrow = self.today + timedelta(days=1)
        _, plan = self.publish(tomorrow)
        self.assertIsNotNone(plan)
        self.assertEqual(plan["date"], tomorrow.isoformat())
        self.assertEqual(plan["schedule"], [])
        self.assertNotIn("Today only", json.dumps(plan))
        validation_codes = {item["code"] for item in plan["brief"]["validation"]["issues"]}
        self.assertIn("calendar-window-mismatch", validation_codes)

    def test_empty_calendar_is_successful_and_distinct_from_unavailable(self) -> None:
        self.stage_calendar(self.today, [])
        _, empty_plan = self.publish()
        empty_calendar = next(item for item in empty_plan["sources"] if item["kind"] == "calendar")
        self.assertEqual(empty_calendar["status"], "empty")
        self.assertEqual(empty_calendar["itemCount"], 0)
        self.assertEqual(empty_plan["schedule"], [])

        (self.sources / "outlook-calendar.manifest.json").unlink()
        _, unavailable_plan = self.publish()
        unavailable_calendar = next(item for item in unavailable_plan["sources"] if item["kind"] == "calendar")
        self.assertIn(unavailable_calendar["status"], {"unknown", "unavailable"})
        self.assertNotEqual(unavailable_calendar["status"], "empty")
        self.assertIsNone(unavailable_calendar["itemCount"])

    def test_stale_partial_and_recovered_sources_remain_truthful(self) -> None:
        stale_time = self.now - timedelta(days=3)
        self.stage_calendar(
            self.today,
            [{"time": "08:00", "end": "09:00", "title": "Stale"}],
            succeeded_at=stale_time,
        )
        _, stale_plan = self.publish()
        stale = next(item for item in stale_plan["sources"] if item["kind"] == "calendar")
        self.assertEqual(stale["status"], "stale")
        self.assertEqual(stale_plan["schedule"], [])

        self.stage_calendar(
            self.today,
            [
                {"time": "08:00", "end": "09:00", "title": "Processed"},
                {"time": "10:00", "end": "11:00", "title": "Unresolved"},
            ],
            status="partial",
            unresolved_count=1,
        )
        _, partial_plan = self.publish()
        partial = next(item for item in partial_plan["sources"] if item["kind"] == "calendar")
        self.assertEqual(partial["status"], "partial")
        self.assertEqual(partial["itemCount"], 2)
        self.assertEqual(partial["processedCount"], 1)
        self.assertEqual(partial["unresolvedCount"], 1)
        self.assertEqual(partial_plan["schedule"], [])

        self.stage_calendar(
            self.today,
            [{"time": "08:00", "end": "09:00", "title": "Recovered"}],
        )
        _, recovered_plan = self.publish()
        recovered = next(item for item in recovered_plan["sources"] if item["kind"] == "calendar")
        self.assertEqual(recovered["status"], "available")
        self.assertEqual(recovered["unresolvedCount"], 0)
        self.assertEqual(recovered_plan["schedule"][0]["title"], "Recovered")

    def test_failed_refresh_preserves_last_success_and_watermark(self) -> None:
        artifact = self.write_json(self.sources / "outlook-email-input.json", {"items": [{"occurredAt": self.now.isoformat(), "safeSummary": "Normalized project signal", "projectIDs": ["project-1"], "evidenceClass": "observed", "signalType": "commitment", "sourceLocator": "mail:normalized-1"}]})
        first_success = self.now - timedelta(hours=1)
        self.stage_source(
            "outlook-email", "email", "available", artifact,
            item_count=1, processed_count=1, unresolved_count=0,
            succeeded_at=first_success, watermark="mail:41",
        )
        successful = json.loads((self.sources / "outlook-email.manifest.json").read_text(encoding="utf-8"))
        successful_artifact = successful["artifact"]
        failed_artifact = self.sources / "failed-email-attempt.json"
        self.stage_source(
            "outlook-email", "email", "blocked", failed_artifact,
            item_count=1, processed_count=0, unresolved_count=1,
            attempted_at=self.now, watermark="mail:42", error="connector blocked",
        )
        raw = json.loads((self.sources / "outlook-email.manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(raw["status"], "blocked")
        self.assertEqual(raw["attemptedAt"], self.now.isoformat())
        self.assertEqual(raw["succeededAt"], first_success.isoformat())
        self.assertEqual(raw["watermark"], "mail:41")
        self.assertEqual(raw["artifact"], successful_artifact)

    def test_all_five_external_lanes_have_bounded_manifests(self) -> None:
        self.stage_all_external_sources()
        _, plan = self.publish()
        source_manifest = json.loads((self.planner / "plan-source-manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(source_manifest["schemaVersion"], 1)
        self.assertEqual(source_manifest["planID"], plan["planID"])
        by_id = {item["sourceID"]: item for item in source_manifest["sources"]}
        self.assertTrue(EXTERNAL_SOURCE_IDS.issubset(by_id))
        for source_id in EXTERNAL_SOURCE_IDS:
            source = by_id[source_id]
            self.assertIn(source["status"], {"available", "empty"})
            self.assertIsNotNone(source["attemptedAt"])
            self.assertIsNotNone(source["succeededAt"])
            self.assertIsNotNone(source["windowStart"])
            self.assertIsNotNone(source["windowEnd"])
            self.assertIsInstance(source["itemCount"], int)
            self.assertIsInstance(source["processedCount"], int)
            self.assertIsInstance(source["unresolvedCount"], int)
            self.assertTrue(source["artifact"])
            if source["sourceID"] == "outlook-calendar":
                self.assertIsNone(source["watermark"])
            else:
                self.assertTrue(source["watermark"])

    def test_normalized_connected_evidence_changes_project_posture(self) -> None:
        self.write_record(
            self.project_root,
            "foundry.md",
            {"id": "foundry", "type": "project", "title": "Foundry", "status": "active", "owner": "Chris", "updated": self.today.isoformat(), "next_action": "Review the release gate"},
        )
        artifact = self.write_json(
            self.sources / "outlook-email-input.json",
            {"items": [{"occurredAt": self.now.isoformat(), "safeSummary": "Release evidence changed", "projectIDs": ["foundry"], "evidenceClass": "observed", "signalType": "commitment", "sourceLocator": "mail:normalized-42"}]},
        )
        self.stage_source("outlook-email", "email", "available", artifact, item_count=1, processed_count=1, unresolved_count=0, succeeded_at=self.now, watermark="mail:42")
        _, plan = self.publish()
        posture = next(item for item in plan["brief"]["analysis"]["projectPosture"] if item["projectID"] == "foundry")
        self.assertEqual(posture["externalSignalCount"], 1)
        self.assertEqual(posture["externalSources"], ["outlook-email"])
        self.assertTrue(any("connected-source signals" in finding for finding in posture["findings"]))
        self.assertEqual(plan["brief"]["analysis"]["externalEvidence"]["signalCount"], 1)

    def test_renamed_project_preserves_stable_identity_and_evidence_route(self) -> None:
        original = self.write_record(
            self.project_root,
            "old-project-name.md",
            {
                "id": "stable-project-001",
                "type": "project",
                "title": "Old Project Name",
                "status": "active",
                "owner": "Chris",
                "updated": self.today.isoformat(),
                "next_action": "Review the routed evidence",
            },
        )
        artifact = self.write_json(
            self.sources / "outlook-email-renamed-project.json",
            {
                "items": [{
                    "occurredAt": self.now.isoformat(),
                    "safeSummary": "A material signal belongs to the stable project identity",
                    "projectIDs": ["stable-project-001"],
                    "evidenceClass": "observed",
                    "signalType": "commitment",
                    "sourceLocator": "mail:stable-project-001",
                }]
            },
        )
        self.stage_source(
            "outlook-email", "email", "available", artifact,
            item_count=1, processed_count=1, unresolved_count=0,
            succeeded_at=self.now, watermark="mail:stable-project-001",
        )
        _, before = self.publish()
        before_posture = next(item for item in before["brief"]["analysis"]["projectPosture"] if item["projectID"] == "stable-project-001")
        self.assertEqual(before_posture["title"], "Old Project Name")
        self.assertEqual(before_posture["externalSignalCount"], 1)

        original.unlink()
        self.write_record(
            self.project_root,
            "new-project-name.md",
            {
                "id": "stable-project-001",
                "type": "project",
                "title": "New Project Name",
                "status": "active",
                "owner": "Chris",
                "updated": self.today.isoformat(),
                "next_action": "Review the routed evidence",
            },
        )
        _, after = self.publish()
        matching = [item for item in after["brief"]["analysis"]["projectPosture"] if item["projectID"] == "stable-project-001"]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]["title"], "New Project Name")
        self.assertEqual(matching[0]["externalSignalCount"], 1)
        self.assertNotIn("stable-project-001", after["brief"]["analysis"]["externalEvidence"].get("unmatchedProjectIDs", []))

    def test_activity_ledger_content_is_analyzed_with_limitations_visible(self) -> None:
        receipt = {
            "schemaVersion": 1,
            "id": "activity-1",
            "occurredAt": self.now.isoformat(),
            "source": "Codex",
            "summary": "Implemented bounded source collection",
            "evidenceClass": "verified",
            "limitations": ["Native rollover still pending"],
            "artifacts": ["tests/test_tier1_collectors.py"],
        }
        (self.activity_root / f"{self.today.isoformat()}.jsonl").write_text(json.dumps(receipt) + "\n", encoding="utf-8")
        _, plan = self.publish()
        activity = plan["brief"]["analysis"]["activityLedger"]
        self.assertEqual(activity["recordCount"], 1)
        self.assertEqual(activity["byEvidenceClass"]["verified"], 1)
        self.assertEqual(activity["recentReceipts"][0]["summary"], "Implemented bounded source collection")
        self.assertIn("activity-ledger-limitations", self.challenge_codes(plan))

    def test_project_history_posture_commitment_age_and_consequence(self) -> None:
        old_date = self.today - timedelta(days=45)
        due_date = self.today - timedelta(days=5)
        self.write_record(
            self.project_root,
            "foundry.md",
            {
                "id": "foundry",
                "type": "project",
                "title": "Foundry",
                "status": "at-risk",
                "owner": "Chris",
                "updated": old_date.isoformat(),
                "due_date": due_date.isoformat(),
                "next_action": "Resolve the release gate",
                "consequence_of_delay": "Customer validation slips",
                "effort_hours": "6",
            },
            f"## {old_date.isoformat()}\n- [ ] Obtain release decision [due: {due_date.isoformat()}]\n",
        )
        self.write_record(
            self.decision_root,
            "release.md",
            {
                "id": "release-decision",
                "type": "decision",
                "title": "Foundry release decision",
                "status": "pending",
                "owner": "Chris",
                "updated": old_date.isoformat(),
                "review_date": due_date.isoformat(),
                "consequence": "Release remains blocked",
                "next_action": "Adjudicate evidence",
            },
        )
        _, plan = self.publish()
        analysis = plan["brief"]["analysis"]
        posture = next(item for item in analysis["projectPosture"] if item["projectID"] == "foundry")
        self.assertEqual(posture["status"], "at-risk")
        self.assertEqual(posture["historyEntryCount"], 1)
        self.assertGreaterEqual(posture["daysSinceEvidence"], 45)
        self.assertTrue(posture["staleEvidence"])
        commitments = [item for item in analysis["commitments"] if item.get("projectID") == "foundry"]
        self.assertTrue(any(item["summary"] == "Obtain release decision" for item in commitments))
        self.assertTrue(any(item["overdue"] for item in commitments))
        self.assertIn("Customer validation slips", {item["consequence"] for item in analysis["consequences"]})
        decision = next(item for item in analysis["decisions"] if item["decisionID"] == "release-decision")
        self.assertTrue(decision["reviewOverdue"])
        self.assertGreaterEqual(decision["ageDays"], 45)

    def test_roles_goals_constraints_and_capacity_drive_overcommitment_challenge(self) -> None:
        self.write_json(
            self.planner / "planning-context.json",
            {
                "schemaVersion": 1,
                "updatedAt": self.now.isoformat(),
                "roles": [{"id": "leader", "title": "Program leader"}],
                "goals": [{"id": "ship", "title": "Ship evidence-backed Foundry release", "roleID": "leader"}],
                "constraints": [{"id": "hard-stop", "title": "Hard stop at 17:00", "kind": "time"}],
                "capacity": {"availableHours": 4, "protectedHours": 1},
            },
        )
        context = json.loads((self.planner / "planning-context.json").read_text(encoding="utf-8"))
        context["capacity"]["plannedWork"] = [{"projectID": "one", "hours": 4, "date": self.today.isoformat()}, {"projectID": "two", "hours": 3, "date": self.today.isoformat()}]
        self.write_json(self.planner / "planning-context.json", context)
        for project_id, effort in (("one", "4"), ("two", "3")):
            self.write_record(
                self.project_root,
                f"{project_id}.md",
                {
                    "id": project_id,
                    "type": "project",
                    "title": project_id.title(),
                    "status": "active",
                    "owner": "Chris",
                    "updated": self.today.isoformat(),
                    "next_action": f"Advance {project_id}",
                    "effort_hours": effort,
                    "role": "leader",
                    "goal": "ship",
                },
            )
        self.stage_calendar(
            self.today,
            [{"time": "13:00", "end": "15:00", "title": "Fixed commitment"}],
        )
        _, plan = self.publish()
        analysis = plan["brief"]["analysis"]
        context = analysis["planningContext"]
        self.assertEqual(context["roles"][0]["id"], "leader")
        self.assertEqual(context["goals"][0]["id"], "ship")
        self.assertEqual(context["constraints"][0]["id"], "hard-stop")
        capacity = analysis["capacity"]
        self.assertEqual(capacity["availableHours"], 4)
        self.assertEqual(capacity["plannedEffortHours"], 7)
        self.assertEqual(capacity["scheduledHours"], 2)
        self.assertTrue(capacity["overcommitted"])
        self.assertIn("overcommitment", self.challenge_codes(plan))

    def test_general_project_effort_is_not_silently_treated_as_todays_load(self) -> None:
        self.write_json(
            self.planner / "planning-context.json",
            {"schemaVersion": 1, "updatedAt": self.now.isoformat(), "roles": [], "goals": [], "constraints": [], "capacity": {"availableHours": 4}},
        )
        self.write_record(
            self.project_root,
            "large.md",
            {"id": "large", "type": "project", "title": "Large Project", "status": "active", "owner": "Chris", "updated": self.today.isoformat(), "next_action": "Choose today's slice", "effort_hours": "40"},
        )
        _, plan = self.publish()
        capacity = plan["brief"]["analysis"]["capacity"]
        self.assertIsNone(capacity["plannedEffortHours"])
        self.assertIsNone(capacity["overcommitted"])
        self.assertNotIn("overcommitment", self.challenge_codes(plan))
        self.assertIn("effort-unknown", self.challenge_codes(plan))

    def test_challenge_detects_contradictions_missing_owners_and_next_actions(self) -> None:
        future = self.today + timedelta(days=10)
        self.write_record(
            self.project_root,
            "unowned.md",
            {
                "id": "unowned",
                "type": "project",
                "title": "Unowned",
                "status": "active",
                "updated": future.isoformat(),
            },
        )
        _, plan = self.publish()
        codes = self.challenge_codes(plan)
        self.assertIn("missing-owner", codes)
        self.assertIn("missing-next-action", codes)
        self.assertIn("future-evidence-date", codes)
        contradictions = plan["brief"]["validation"]["contradictions"]
        self.assertTrue(any(item.get("code") == "future-evidence-date" for item in contradictions))

    def test_operations_receipts_are_reconciled_into_analysis_and_challenges(self) -> None:
        self.write_json(
            self.operations_root / "failed-run.json",
            {
                "schemaVersion": 1,
                "id": "operation-failed",
                "operation": "source-collection",
                "completedAt": self.now.isoformat(),
                "status": "failed",
                "limitations": ["Teams was blocked"],
                "openQuestions": ["When can Teams be retried?"],
            },
        )
        _, plan = self.publish()
        operations = plan["brief"]["analysis"]["operations"]
        self.assertEqual(operations["receiptCount"], 1)
        self.assertEqual(operations["byStatus"]["failed"], 1)
        self.assertEqual(operations["openQuestionCount"], 1)
        self.assertEqual(operations["limitationCount"], 1)
        self.assertIn("operations-open-loop", self.challenge_codes(plan))

    def test_operations_excludes_stale_and_superseded_failures(self) -> None:
        recent = self.now - timedelta(days=2)
        stale = self.now - timedelta(days=20)
        self.write_json(self.operations_root / "old.json", {"schemaVersion": 1, "id": "old-failure", "operation": "collection", "completedAt": recent.isoformat(), "status": "failed", "limitations": ["transient"], "openQuestions": ["retry?"]})
        self.write_json(self.operations_root / "recovery.json", {"schemaVersion": 1, "id": "recovery", "operation": "collection", "completedAt": self.now.isoformat(), "status": "completed", "supersedes": "old-failure", "limitations": [], "openQuestions": []})
        self.write_json(self.operations_root / "stale.json", {"schemaVersion": 1, "id": "stale-failure", "operation": "collection", "completedAt": stale.isoformat(), "status": "failed", "limitations": ["obsolete"], "openQuestions": ["obsolete?"]})
        _, plan = self.publish()
        operations = plan["brief"]["analysis"]["operations"]
        self.assertEqual(operations["activeWindowReceiptCount"], 1)
        self.assertEqual(operations["supersededCount"], 1)
        self.assertEqual(operations["byStatus"], {"completed": 1})
        self.assertEqual(operations["openQuestionCount"], 0)
        self.assertNotIn("operations-open-loop", self.challenge_codes(plan))

    def test_domain_collision_fails_qa_and_blocks_publication(self) -> None:
        common = {
            "id": "shared-id",
            "type": "project",
            "title": "Conflicting record",
            "status": "active",
            "owner": "Chris",
            "updated": self.today.isoformat(),
            "next_action": "Resolve identity",
        }
        self.write_record(self.project_root, "work.md", common)
        personal = dict(common)
        personal["type"] = "personal-project"
        self.write_record(self.personal, "personal.md", personal)
        previous_plan = {"schemaVersion": 3, "planID": "known-good", "date": self.today.isoformat()}
        self.write_json(self.planner / "daily-plan.json", previous_plan)

        result, plan = self.publish(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("FAIL", result.stderr + result.stdout)
        self.assertEqual(plan, previous_plan, "A failing run must not replace the last known-good published plan")
        run = json.loads((self.planner / "planning-run.json").read_text(encoding="utf-8"))
        self.assertEqual(run["qualityAssurance"]["verdict"], "FAIL")
        self.assertEqual(next(stage for stage in run["stages"] if stage["name"] == "publish")["status"], "blocked")

    def test_professional_and_personal_projects_remain_separate(self) -> None:
        self.write_record(
            self.project_root,
            "work.md",
            {"id": "work", "type": "project", "title": "Work", "status": "active", "owner": "Chris", "updated": self.today.isoformat(), "next_action": "Work action"},
        )
        self.write_record(
            self.personal,
            "home.md",
            {"id": "home", "type": "personal-project", "title": "Home", "status": "active", "owner": "Chris", "updated": self.today.isoformat(), "next_action": "Home action"},
        )
        _, plan = self.publish()
        work = plan["brief"]["workPortfolio"]
        personal = plan["brief"]["personalPortfolio"]
        self.assertEqual({item["id"] for item in work}, {"work"})
        self.assertEqual({item["id"] for item in personal}, {"home"})
        self.assertTrue(all(item["domain"] == "professional" for item in work))
        self.assertTrue(all(item["domain"] == "personal" for item in personal))
        self.assertNotIn("Home action", plan["priorities"]["a"] + plan["priorities"]["b"])

    def test_planning_never_writes_captains_log_or_research_chronicle(self) -> None:
        captain_sentinel = self.captains_log / "existing.md"
        research_sentinel = self.research_chronicle / "existing.md"
        captain_sentinel.write_text("human journal\n", encoding="utf-8")
        research_sentinel.write_text("reviewed research\n", encoding="utf-8")
        before_captain = {path.relative_to(self.captains_log): path.read_bytes() for path in self.captains_log.rglob("*") if path.is_file()}
        before_research = {path.relative_to(self.research_chronicle): path.read_bytes() for path in self.research_chronicle.rglob("*") if path.is_file()}
        self.publish()
        after_captain = {path.relative_to(self.captains_log): path.read_bytes() for path in self.captains_log.rglob("*") if path.is_file()}
        after_research = {path.relative_to(self.research_chronicle): path.read_bytes() for path in self.research_chronicle.rglob("*") if path.is_file()}
        self.assertEqual(after_captain, before_captain)
        self.assertEqual(after_research, before_research)

    def test_meeting_continuity_enforces_reconciliation_and_project_writeback_evidence(self) -> None:
        project = self.write_record(
            self.project_root,
            "foundry.md",
            {"id": "foundry", "type": "project", "title": "Foundry", "status": "active", "owner": "Chris", "updated": self.today.isoformat(), "next_action": "Advance Foundry"},
        )
        project.write_text(project.read_text(encoding="utf-8") + "\n<!-- meeting-continuity:verified:run-verified -->\n", encoding="utf-8")
        self.write_json(
            self.meeting_ledger,
            {
                "occurrences": {
                    "verified": {
                        "stable_meeting_key": "verified",
                        "last_run_id": "run-verified",
                        "continuity_state": "reconciliation_verified",
                        "routing_disposition": "project_updated",
                        "project_update_receipts": [{"project_path": "03 Projects/foundry.md", "continuity_run_id": "run-verified"}],
                    },
                    "missing-writeback": {
                        "continuity_state": "routing_pending",
                        "routing_disposition": "material_project_impact",
                        "project_update_receipts": [],
                    },
                }
            },
        )
        _, plan = self.publish()
        meeting = plan["brief"]["meetingContinuity"]
        self.assertEqual(meeting["eligibleCount"], 2)
        self.assertEqual(meeting["unresolvedCount"], 1)
        self.assertEqual(meeting["projectUpdateReceiptCount"], 1)
        self.assertIn("meeting-continuity-unresolved", self.challenge_codes(plan))
        self.assertEqual(plan["qualityAssurance"]["verdict"], "PASS WITH CONDITIONS")
        self.assertTrue(any("Meeting Continuity" in condition for condition in plan["qualityAssurance"]["conditions"]))

    def test_excluded_meetings_do_not_create_continuity_backlog(self) -> None:
        self.write_json(
            self.meeting_ledger,
            {"occurrences": {"routine": {"stable_meeting_key": "routine", "continuity_state": "routing_pending", "excluded": True}}},
        )
        _, plan = self.publish()
        meeting = plan["brief"]["analysis"]["meetingContinuity"]
        self.assertEqual(meeting["eligibleCount"], 0)
        self.assertEqual(meeting["unresolvedCount"], 0)
        self.assertNotIn("meeting-continuity-unresolved", self.challenge_codes(plan))

    def test_false_meeting_reconciliation_without_project_readback_blocks_publication(self) -> None:
        self.write_json(
            self.meeting_ledger,
            {
                "occurrences": {
                    "false-verified": {
                        "stable_meeting_key": "false-verified",
                        "last_run_id": "run-1",
                        "continuity_state": "reconciliation_verified",
                        "routing_disposition": "project_updated",
                        "projects": ["Missing Project"],
                        "project_updates": [{"readback": "verified", "receiptID": "forged"}],
                    }
                }
            },
        )
        previous = {"schemaVersion": 3, "planID": "known-good", "date": self.today.isoformat()}
        self.write_json(self.planner / "daily-plan.json", previous)
        result, plan = self.publish(check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(plan, previous)
        run = json.loads((self.planner / "planning-run.json").read_text(encoding="utf-8"))
        self.assertEqual(run["qualityAssurance"]["verdict"], "FAIL")
        self.assertTrue(any(item["id"] == "meeting-writeback" and item["status"] == "FAIL" for item in run["qualityAssurance"]["checks"]))

    def test_legacy_meeting_marker_is_valid_project_readback_evidence(self) -> None:
        project = self.write_record(
            self.project_root,
            "foundry.md",
            {"id": "foundry", "type": "project", "title": "Foundry", "status": "active", "owner": "Chris", "updated": self.today.isoformat(), "next_action": "Advance Foundry"},
        )
        project.write_text(project.read_text(encoding="utf-8") + "\n<!-- meeting-continuity:meeting-1:run-1 -->\n", encoding="utf-8")
        self.write_json(
            self.meeting_ledger,
            {
                "occurrences": {
                    "meeting-1": {
                        "stable_meeting_key": "meeting-1",
                        "last_run_id": "run-1",
                        "continuity_state": "reconciliation_verified",
                        "routing_disposition": "project_updated",
                        "projects": ["Foundry"],
                        "project_updates": [],
                    }
                }
            },
        )
        _, plan = self.publish()
        meeting = plan["brief"]["meetingContinuity"]
        self.assertEqual(meeting["verifiedWritebackGapCount"], 0)
        self.assertEqual(meeting["verifiedReadbackGapCount"], 0)
        self.assertEqual(meeting["recoveredProjectMarkerCount"], 1)
        self.assertNotEqual(plan["qualityAssurance"]["verdict"], "FAIL")

    def test_versioned_run_source_manifest_and_matching_readback(self) -> None:
        self.stage_all_external_sources()
        _, plan = self.publish()
        run_path = self.planner / "planning-run.json"
        source_path = self.planner / "plan-source-manifest.json"
        snapshot_path = self.planner / "planning-snapshot.json"
        self.assertTrue(run_path.exists())
        self.assertTrue(source_path.exists())
        self.assertTrue(snapshot_path.exists())
        run = json.loads(run_path.read_text(encoding="utf-8"))
        source_manifest = json.loads(source_path.read_text(encoding="utf-8"))
        self.assertEqual(run["schemaVersion"], 1)
        self.assertEqual(run["planID"], plan["planID"])
        self.assertEqual(source_manifest["planID"], plan["planID"])
        self.assertEqual(plan["planningRun"]["runID"], run["runID"])
        self.assertEqual([stage["name"] for stage in run["stages"]], PIPELINE_STAGES)
        self.assertEqual(next(stage for stage in run["stages"] if stage["name"] == "readback")["status"], "pending")

        app_receipt = {
            "schemaVersion": 1,
            "planID": plan["planID"],
            "planSchemaVersion": plan["schemaVersion"],
            "consumer": "MONDAY Command Center",
            "appVersion": "0.2.0 (8)",
            "consumedAt": datetime.now(timezone.utc).isoformat(),
            "state": "displayed",
        }
        (self.planner / "readback.json").write_text(json.dumps(app_receipt), encoding="utf-8")
        pre_reconcile_status = json.loads(self.invoke("status").stdout)
        self.assertFalse(pre_reconcile_status["displayed"], "A receipt file alone must not establish displayed state")
        self.assertEqual(pre_reconcile_status["runStatus"], "published-awaiting-readback")
        reconciled = json.loads(self.invoke("reconcile-readback", "--apply").stdout)
        self.assertEqual(reconciled["status"], "reconciled")
        self.assertTrue(json.loads(self.invoke("status").stdout)["displayed"])
        app_updated_run = json.loads(run_path.read_text(encoding="utf-8"))
        self.assertEqual(app_updated_run["status"], "completed")
        self.assertEqual(next(stage for stage in app_updated_run["stages"] if stage["name"] == "readback")["consumer"], "MONDAY Command Center")

        early_receipt = dict(app_receipt)
        early_receipt["consumedAt"] = (self.now - timedelta(days=1)).isoformat()
        (self.planner / "readback.json").write_text(json.dumps(early_receipt), encoding="utf-8")
        self.assertNotEqual(self.invoke("reconcile-readback", check=False).returncode, 0)

        # Republish so the explicit acknowledgement path is independently exercised.
        _, plan = self.publish()
        (self.planner / "readback.json").unlink(missing_ok=True)

        mismatch = self.invoke(
            "ack", "--plan-id", "wrong-plan", "--schema-version", str(plan["schemaVersion"]),
            "--consumer", "Command Center", "--app-version", "0.2.0", "--apply", check=False,
        )
        self.assertNotEqual(mismatch.returncode, 0)
        self.assertFalse((self.planner / "readback.json").exists())

        receipt = json.loads(
            self.invoke(
                "ack", "--plan-id", plan["planID"], "--schema-version", str(plan["schemaVersion"]),
                "--consumer", "Command Center", "--app-version", "0.2.0", "--apply",
            ).stdout
        )
        self.assertEqual(receipt["state"], "displayed")
        status = json.loads(self.invoke("status").stdout)
        self.assertTrue(status["displayed"])
        updated_run = json.loads(run_path.read_text(encoding="utf-8"))
        readback_stage = next(stage for stage in updated_run["stages"] if stage["name"] == "readback")
        self.assertEqual(readback_stage["status"], "completed")
        self.assertEqual(readback_stage["planID"], plan["planID"])
        self.assertEqual(readback_stage["schemaVersion"], plan["schemaVersion"])


if __name__ == "__main__":
    unittest.main()
