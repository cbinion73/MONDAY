from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
PLUGIN_ROOT = SKILL_ROOT.parents[1]
SCRIPT = SKILL_ROOT / "scripts" / "monday_core.py"
REGISTRY = SKILL_ROOT / "references" / "capability-registry.json"

spec = importlib.util.spec_from_file_location("monday_core", SCRIPT)
assert spec and spec.loader
monday_core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monday_core)


class MondayCoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.registry = json.loads(REGISTRY.read_text(encoding="utf-8"))

    def base_request(self) -> dict:
        return {
            "schemaVersion": 1,
            "requestID": "request-1",
            "intent": "planning",
            "timeHorizon": "today",
            "domains": ["professional", "personal"],
            "capabilities": ["monday-planning-pipeline"],
            "sourceLanes": ["outlook-calendar", "teams"],
            "currentEvidenceRequired": True,
            "consequential": True,
            "publishToCommandCenter": True,
            "externalActions": [],
        }

    def base_synthesis(self) -> dict:
        return {
            "schemaVersion": 1,
            "requestID": "request-1",
            "status": "complete",
            "currentEvidenceRequired": True,
            "sourceHealth": [
                {
                    "sourceID": "outlook-calendar",
                    "status": "available",
                    "required": True,
                    "scope": "primary calendar, 2026-09-23 midnight to midnight America/New_York",
                    "attemptedAt": "2026-09-23T06:01:00-04:00",
                    "succeededAt": "2026-09-23T06:01:02-04:00",
                    "itemCount": 2,
                    "processedCount": 2,
                    "unresolvedCount": 0,
                }
            ],
            "claims": [
                {
                    "statement": "Two current-day events were collected.",
                    "evidenceClass": "observed",
                    "sourceIDs": ["outlook-calendar"],
                }
            ],
            "gaps": [],
            "qa": {"required": True, "verdict": "PASS"},
            "publication": {
                "requested": True,
                "state": "displayed",
                "planID": "plan-1",
                "displayedPlanID": "plan-1",
                "schemaVersion": 3,
            },
            "externalActions": [],
        }

    def test_registry_is_valid_and_covers_every_packaged_skill(self) -> None:
        result = monday_core.validate_registry(self.registry)
        self.assertTrue(result["valid"], result["errors"])
        registered = {item["id"] for item in self.registry["capabilities"]}
        packaged = {
            child.name
            for child in (PLUGIN_ROOT / "skills").iterdir()
            if child.is_dir() and (child / "SKILL.md").exists()
        }
        self.assertEqual(registered, packaged)

    def test_every_capability_has_an_actionable_route_rule(self) -> None:
        for capability in self.registry["capabilities"]:
            self.assertTrue(capability["family"].strip(), capability["id"])
            self.assertTrue(capability["routeWhen"].strip(), capability["id"])
            self.assertIsInstance(capability["requires"], list, capability["id"])

    def test_independent_products_are_not_absorbed_into_monday(self) -> None:
        registered = {item["id"] for item in self.registry["capabilities"]}
        self.assertTrue({"atlas", "nexus", "crg-notebook-reviewer"}.isdisjoint(registered))

    def test_cross_domain_current_plan_routes_core_health_domains_qa_and_publication(self) -> None:
        result = monday_core.preflight(self.base_request(), self.registry)
        self.assertEqual(result["status"], "ready")
        self.assertIn("monday-core", result["routing"])
        self.assertIn("monday-source-health", result["routing"])
        self.assertIn("monday-personal-projects", result["routing"])
        self.assertIn("monday-thermo-core", result["routing"])
        self.assertIn("monday-thermo-quality-assurance", result["routing"])
        self.assertIn("monday-planning-pipeline", result["routing"])
        self.assertIn("monday-command-center", result["routing"])
        self.assertEqual(result["publication"]["requiredState"], "displayed")
        routed_records = {item["id"] for item in result["recordRoutes"]}
        self.assertIn("project-knowledge", routed_records)
        self.assertIn("decision-ledger", routed_records)
        self.assertIn("meeting-continuity", routed_records)
        self.assertIn("personal-project-knowledge", routed_records)

    def test_external_action_stops_without_exact_confirmation(self) -> None:
        request = self.base_request()
        request["externalActions"] = [
            {"kind": "send-message", "target": "Tish Chauhan direct Teams chat", "confirmation": "missing"}
        ]
        result = monday_core.preflight(request, self.registry)
        self.assertEqual(result["status"], "confirmation_required")
        self.assertFalse(result["externalActions"][0]["allowedToAttempt"])
        self.assertTrue(result["externalActions"][0]["verificationRequired"])

    def test_confirmed_external_action_authorizes_attempt_but_still_requires_verification(self) -> None:
        request = self.base_request()
        request["externalActions"] = [
            {"kind": "calendar-write", "target": "primary work calendar", "confirmation": "confirmed"}
        ]
        result = monday_core.preflight(request, self.registry)
        self.assertEqual(result["status"], "ready")
        self.assertTrue(result["externalActions"][0]["allowedToAttempt"])
        self.assertTrue(result["externalActions"][0]["verificationRequired"])

    def test_complete_current_synthesis_rejects_partial_required_source(self) -> None:
        payload = self.base_synthesis()
        payload["sourceHealth"][0]["status"] = "partial"
        result = monday_core.validate_synthesis(payload, self.registry)
        self.assertFalse(result["valid"])
        self.assertTrue(any("incomplete required source" in error for error in result["errors"]))

    def test_successful_empty_source_is_distinct_and_valid(self) -> None:
        payload = self.base_synthesis()
        payload["sourceHealth"][0].update({"status": "empty", "itemCount": 0, "processedCount": 0})
        payload["claims"] = [
            {
                "statement": "The bounded calendar query returned zero events.",
                "evidenceClass": "observed",
                "sourceIDs": ["outlook-calendar"],
            }
        ]
        result = monday_core.validate_synthesis(payload, self.registry)
        self.assertTrue(result["valid"], result["errors"])

    def test_optional_incomplete_source_remains_visible_without_blocking_complete_status(self) -> None:
        payload = self.base_synthesis()
        payload["sourceHealth"].append(
            {
                "sourceID": "teams",
                "status": "partial",
                "required": False,
                "scope": "optional supplemental project chat sweep",
                "itemCount": 4,
                "processedCount": 3,
                "unresolvedCount": 1,
            }
        )
        result = monday_core.validate_synthesis(payload, self.registry)
        self.assertTrue(result["valid"], result["errors"])

    def test_available_source_requires_collection_timestamps_and_scope(self) -> None:
        payload = self.base_synthesis()
        payload["sourceHealth"][0].pop("succeededAt")
        payload["sourceHealth"][0].pop("scope")
        result = monday_core.validate_synthesis(payload, self.registry)
        self.assertFalse(result["valid"])
        self.assertTrue(any("requires timezone-aware succeededAt" in error for error in result["errors"]))
        self.assertTrue(any("explicit scope" in error for error in result["errors"]))

    def test_displayed_publication_requires_matching_plan_identifier(self) -> None:
        payload = self.base_synthesis()
        payload["publication"]["displayedPlanID"] = "different-plan"
        result = monday_core.validate_synthesis(payload, self.registry)
        self.assertFalse(result["valid"])
        self.assertTrue(any("matching planID" in error for error in result["errors"]))

    def test_verified_external_action_requires_readback(self) -> None:
        payload = self.base_synthesis()
        payload["externalActions"] = [{"kind": "send-message", "state": "verified"}]
        result = monday_core.validate_synthesis(payload, self.registry)
        self.assertFalse(result["valid"])
        self.assertTrue(any("readback" in error for error in result["errors"]))

    def test_evidence_claim_must_reference_known_source(self) -> None:
        payload = self.base_synthesis()
        payload["claims"][0]["sourceIDs"] = ["invented-source"]
        result = monday_core.validate_synthesis(payload, self.registry)
        self.assertFalse(result["valid"])
        self.assertTrue(any("unknown sources" in error for error in result["errors"]))

    def test_cli_rejects_invalid_json_without_traceback(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bad = Path(temporary) / "bad.json"
            bad.write_text("{", encoding="utf-8")
            with self.assertRaises(ValueError):
                monday_core.load_json(bad)


if __name__ == "__main__":
    unittest.main()
