from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = PLUGIN_ROOT / "scripts/monday_twin.py"


class Priority2TwinTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.twin = self.root / "twin"
        self.env = {**os.environ, "MONDAY_TWIN_ROOT": str(self.twin), "MONDAY_TIMEZONE": "UTC"}
        self.created = datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def invoke(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run([sys.executable, str(SCRIPT), *arguments], env=self.env, text=True, capture_output=True, check=check)

    def write(self, name: str, payload: object) -> Path:
        path = self.root / name
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def record(
        self,
        record_id: str = "work-style",
        domain: str = "professional",
        version: int = 1,
        statement: str = "Chris prefers concise evidence-backed decision briefs.",
        sensitivity: str | None = None,
        evidence_class: str = "validated",
        source_id: str | None = None,
        include_statement: bool | None = None,
        updated_offset: int = 0,
        supersedes: str | None = None,
    ) -> dict[str, object]:
        personal = domain == "personal"
        updated = self.created + timedelta(hours=updated_offset)
        payload: dict[str, object] = {
            "schemaVersion": 1,
            "recordID": record_id,
            "domain": domain,
            "recordType": "preference" if personal else "working-preference",
            "statement": statement,
            "purpose": "Improve future planning and communication.",
            "evidenceClass": evidence_class,
            "confidence": 0.9,
            "sensitivity": sensitivity or ("private" if personal else "shareable"),
            "status": "active",
            "version": version,
            "createdAt": self.created.isoformat(),
            "updatedAt": updated.isoformat(),
            "reviewAt": (updated + timedelta(days=90)).isoformat(),
            "learningAllowed": True,
            "consentBasis": "explicit" if personal else "governed-record",
            "sourceRefs": [{
                "sourceID": source_id or ("personal-project-knowledge" if personal else "project-knowledge"),
                "evidenceID": f"evidence:{record_id}:{version}",
                "sourceDate": updated.isoformat(),
                "capturedAt": updated.isoformat(),
                "locator": f"record:{record_id}",
            }],
            "projection": {"includeInCommandCenter": True, "includeStatement": include_statement if include_statement is not None else not personal},
        }
        if supersedes is not None:
            payload["supersedes"] = supersedes
        return payload

    def capture(self, payload: dict[str, object]) -> dict[str, object]:
        result = self.invoke("capture", "--input", str(self.write(f"{payload['recordID']}-{payload['version']}.json", payload)), "--apply")
        return json.loads(result.stdout)

    def test_contract_audit_passes(self) -> None:
        result = json.loads(self.invoke("audit-contracts").stdout)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["promiseCount"], result["implementedPromiseCount"])
        self.assertGreaterEqual(result["sourceCount"], 15)

    def test_professional_record_round_trip(self) -> None:
        payload = self.record()
        self.capture(payload)
        stored = json.loads((self.twin / "records/professional/work-style.json").read_text())
        self.assertEqual(stored, payload)
        self.assertTrue((self.twin / "history/professional/work-style/v1.json").exists())

    def test_cross_domain_capture_is_rejected(self) -> None:
        payload = self.record(source_id="personal-project-knowledge")
        result = self.invoke("capture", "--input", str(self.write("cross-domain.json", payload)), "--apply", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not authorized", result.stderr)
        self.assertFalse((self.twin / "records/professional/work-style.json").exists())

    def test_journal_source_capture_is_rejected(self) -> None:
        payload = self.record(source_id="captains-log")
        result = self.invoke("capture", "--input", str(self.write("journal.json", payload)), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not authorized", result.stderr)

    def test_personal_record_requires_explicit_or_user_supplied_consent(self) -> None:
        payload = self.record(record_id="private-pref", domain="personal")
        payload["consentBasis"] = "governed-record"
        result = self.invoke("capture", "--input", str(self.write("personal.json", payload)), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("consentBasis", result.stderr)

    def test_personal_statement_cannot_be_projected(self) -> None:
        payload = self.record(record_id="private-pref", domain="personal", include_statement=True)
        result = self.invoke("capture", "--input", str(self.write("personal-project.json", payload)), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("personal statements", result.stderr)

    def test_raw_source_material_is_rejected(self) -> None:
        payload = self.record(statement="See https://secret.example/path and user@example.com")
        result = self.invoke("capture", "--input", str(self.write("raw.json", payload)), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("prohibited material", result.stderr)

    def test_capture_is_idempotent_but_changed_duplicate_fails(self) -> None:
        payload = self.record()
        first = self.capture(payload)
        second = self.capture(payload)
        self.assertEqual(first["status"], "captured")
        self.assertEqual(second["status"], "unchanged")
        changed = dict(payload)
        changed["statement"] = "A changed statement."
        result = self.invoke("capture", "--input", str(self.write("changed.json", changed)), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("use correct", result.stderr)

    def test_correction_is_version_guarded_and_supersedes(self) -> None:
        self.capture(self.record())
        replacement = self.record(version=2, updated_offset=1, statement="Chris prefers concise, evidence-backed briefs with visible uncertainty.", supersedes="work-style@1")
        result = self.invoke("correct", "--domain", "professional", "--record-id", "work-style", "--input", str(self.write("replacement.json", replacement)), "--expected-version", "1", "--reason", "Chris clarified the preference", "--apply")
        corrected = json.loads(result.stdout)
        self.assertEqual(corrected["record"]["version"], 2)
        old = json.loads((self.twin / "history/professional/work-style/v1.json").read_text())
        self.assertEqual(old["status"], "superseded")
        stale = self.invoke("correct", "--domain", "professional", "--record-id", "work-style", "--input", str(self.write("replacement-again.json", replacement)), "--expected-version", "1", "--reason", "retry", check=False)
        self.assertNotEqual(stale.returncode, 0)
        self.assertIn("current version is 2", stale.stderr)

    def test_forget_requires_exact_confirmation_and_purges_content(self) -> None:
        canary = "UNIQUE_FORGET_CANARY"
        self.capture(self.record(statement=canary))
        denied = self.invoke("forget", "--domain", "professional", "--record-id", "work-style", "--confirm-record-id", "wrong", "--reason", "Requested", "--apply", check=False)
        self.assertNotEqual(denied.returncode, 0)
        self.assertTrue((self.twin / "records/professional/work-style.json").exists())
        result = json.loads(self.invoke("forget", "--domain", "professional", "--record-id", "work-style", "--confirm-record-id", "work-style", "--reason", "Requested", "--apply").stdout)
        self.assertEqual(result["status"], "forgotten")
        self.assertFalse((self.twin / "records/professional/work-style.json").exists())
        tombstone = json.loads((self.twin / "tombstones/professional/work-style.json").read_text())
        self.assertNotIn("statement", tombstone)
        product_text = "\n".join(path.read_text(errors="ignore") for path in self.twin.rglob("*") if path.is_file())
        self.assertNotIn(canary, product_text)

    def test_forget_is_idempotent(self) -> None:
        self.capture(self.record())
        arguments = ("forget", "--domain", "professional", "--record-id", "work-style", "--confirm-record-id", "work-style", "--reason", "Requested", "--apply")
        self.invoke(*arguments)
        result = json.loads(self.invoke(*arguments).stdout)
        self.assertEqual(result["status"], "already-forgotten")

    def test_forget_purges_derived_projection_and_playbook_content(self) -> None:
        canary = "FORGET_DERIVED_CANARY"
        self.capture(self.record(statement=canary))
        self.invoke("project", "--apply")
        spec = {"schemaVersion": 1, "playbookID": "derived-playbook", "title": "Derived", "purpose": "Test forgetting", "audience": "Approved collaborator", "recordIDs": ["work-style"]}
        drafted = json.loads(self.invoke("prepare-playbook", "--input", str(self.write("derived.json", spec)), "--apply").stdout)
        self.invoke("review-playbook", "--playbook-id", "derived-playbook", "--decision", "approve", "--reviewer", "Chris Binion", "--reason", "Approved", "--expected-digest", drafted["draft"]["draftDigest"], "--apply")
        self.invoke("prepare-publication", "--playbook-id", "derived-playbook", "--destination", "approved-repository", "--confirmation-id", "confirm-123456", "--apply")
        self.invoke("forget", "--domain", "professional", "--record-id", "work-style", "--confirm-record-id", "work-style", "--reason", "Requested", "--apply")
        product_text = "\n".join(path.read_text(errors="ignore") for path in self.twin.rglob("*") if path.is_file())
        self.assertNotIn(canary, product_text)
        state = json.loads((self.twin / "playbooks/state/derived-playbook.json").read_text())
        self.assertEqual(state["state"], "retracted")
        self.assertFalse((self.twin / "inspection.json").exists())

    def test_opt_out_blocks_future_capture_only(self) -> None:
        self.capture(self.record(record_id="existing"))
        self.invoke("opt-out", "--scope", "source", "--key", "project-knowledge", "--enabled", "yes", "--reason", "Chris opted out", "--apply")
        blocked = self.invoke("capture", "--input", str(self.write("blocked.json", self.record(record_id="future"))), "--apply", check=False)
        self.assertNotEqual(blocked.returncode, 0)
        self.assertIn("opt-out", blocked.stderr)
        self.assertTrue((self.twin / "records/professional/existing.json").exists())
        self.assertFalse((self.twin / "records/professional/future.json").exists())
        self.invoke("opt-out", "--scope", "source", "--key", "project-knowledge", "--enabled", "no", "--reason", "Chris opted back in", "--apply")
        self.capture(self.record(record_id="future"))

    def test_shareable_redaction_removes_sensitive_material(self) -> None:
        raw = {"body": "Email user@example.com at https://secret.example", "path": "/Users/chris/private/file.txt", "nested": {"token": "abc123secret"}}
        result = json.loads(self.invoke("redact", "--input", str(self.write("redact.json", raw))).stdout)
        rendered = json.dumps(result)
        self.assertNotIn("user@example.com", rendered)
        self.assertNotIn("secret.example", rendered)
        self.assertNotIn("/Users/chris", rendered)
        self.assertNotIn("abc123secret", rendered)
        self.assertTrue(result["manifest"]["verifiedNoResidual"])

    def test_projection_is_privacy_reduced_and_readback_bound(self) -> None:
        self.capture(self.record())
        self.capture(self.record(record_id="private-pref", domain="personal", statement="A private personal preference."))
        projection = json.loads(self.invoke("project", "--apply").stdout)
        personal = next(item for item in projection["records"] if item["domain"] == "personal")
        self.assertNotIn("statement", personal)
        projected_records = json.dumps(projection["records"])
        self.assertNotIn('"locator"', projected_records)
        self.assertNotIn('"sourceRefs"', projected_records)
        receipt = {
            "schemaVersion": 1,
            "projectionID": projection["projectionID"],
            "projectionSchemaVersion": 1,
            "contentDigest": projection["contentDigest"],
            "consumer": "Command Center",
            "appVersion": "0.3.0",
            "displayedAt": datetime.now(timezone.utc).isoformat(),
            "state": "displayed",
            "viewIDs": ["digital-twin"],
        }
        reconciled = json.loads(self.invoke("reconcile-readback", "--input", str(self.write("readback.json", receipt)), "--apply").stdout)
        self.assertEqual(reconciled["status"], "displayed")
        mismatch = dict(receipt)
        mismatch["projectionID"] = "wrong"
        denied = self.invoke("reconcile-readback", "--input", str(self.write("bad-readback.json", mismatch)), check=False)
        self.assertNotEqual(denied.returncode, 0)

    def test_corrupt_projection_does_not_replace_last_valid(self) -> None:
        self.capture(self.record())
        projection = json.loads(self.invoke("project", "--apply").stdout)
        path = self.twin / "inspection.json"
        before = path.read_bytes()
        projection["coverage"]["professionalCount"] = 99
        self.write("bad-projection.json", projection)
        result = self.invoke("reconcile-readback", "--input", str(self.write("irrelevant.json", {})), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(path.read_bytes(), before)

    def test_personal_record_never_enters_playbook(self) -> None:
        self.capture(self.record(record_id="private-pref", domain="personal"))
        spec = {"schemaVersion": 1, "playbookID": "private-playbook", "title": "Private", "purpose": "Test", "audience": "External", "recordIDs": ["private-pref"]}
        result = self.invoke("prepare-playbook", "--input", str(self.write("private-pb.json", spec)), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("personal Twin", result.stderr)

    def test_playbook_requires_approval_confirmation_and_readback(self) -> None:
        self.capture(self.record())
        spec = {"schemaVersion": 1, "playbookID": "working-playbook", "title": "Working with Chris", "purpose": "Portable collaboration guidance", "audience": "Approved collaborator", "recordIDs": ["work-style"]}
        drafted = json.loads(self.invoke("prepare-playbook", "--input", str(self.write("playbook.json", spec)), "--apply").stdout)
        denied = self.invoke("prepare-publication", "--playbook-id", "working-playbook", "--destination", "approved-repository", "--confirmation-id", "confirm-123456", check=False)
        self.assertNotEqual(denied.returncode, 0)
        draft_digest = drafted["draft"]["draftDigest"]
        self.invoke("review-playbook", "--playbook-id", "working-playbook", "--decision", "approve", "--reviewer", "Chris Binion", "--reason", "Reviewed exact draft", "--expected-digest", draft_digest, "--apply")
        prepared = json.loads(self.invoke("prepare-publication", "--playbook-id", "working-playbook", "--destination", "approved-repository", "--confirmation-id", "confirm-123456", "--apply").stdout)
        self.assertEqual(prepared["package"]["externalAction"], "not-attempted")
        package_digest = prepared["package"]["packageDigest"]
        self.invoke("record-publication-attempt", "--playbook-id", "working-playbook", "--package-digest", package_digest, "--confirmation-id", "confirm-123456", "--apply")
        readback = {"schemaVersion": 1, "playbookID": "working-playbook", "packageDigest": package_digest, "destination": "approved-repository", "confirmationID": "confirm-123456", "publishedAt": datetime.now(timezone.utc).isoformat(), "readbackLocator": "publication:working-playbook"}
        verified = json.loads(self.invoke("verify-publication", "--playbook-id", "working-playbook", "--readback", str(self.write("publication-readback.json", readback)), "--apply").stdout)
        self.assertEqual(verified["status"], "verified")

    def test_playbook_approval_invalidates_after_source_correction(self) -> None:
        self.capture(self.record())
        spec = {"schemaVersion": 1, "playbookID": "stale-playbook", "title": "Stale", "purpose": "Test staleness", "audience": "Approved collaborator", "recordIDs": ["work-style"]}
        drafted = json.loads(self.invoke("prepare-playbook", "--input", str(self.write("stale.json", spec)), "--apply").stdout)
        self.invoke("review-playbook", "--playbook-id", "stale-playbook", "--decision", "approve", "--reviewer", "Chris Binion", "--reason", "Approved", "--expected-digest", drafted["draft"]["draftDigest"], "--apply")
        replacement = self.record(version=2, updated_offset=1, supersedes="work-style@1")
        self.invoke("correct", "--domain", "professional", "--record-id", "work-style", "--input", str(self.write("corrected.json", replacement)), "--expected-version", "1", "--reason", "Changed", "--apply")
        denied = self.invoke("prepare-publication", "--playbook-id", "stale-playbook", "--destination", "approved-repository", "--confirmation-id", "confirm-123456", check=False)
        self.assertNotEqual(denied.returncode, 0)
        self.assertIn("changed after", denied.stderr)

    def test_prepared_playbook_cannot_be_attempted_after_source_correction(self) -> None:
        self.capture(self.record())
        spec = {"schemaVersion": 1, "playbookID": "prepared-stale", "title": "Prepared", "purpose": "Test action-time revalidation", "audience": "Approved collaborator", "recordIDs": ["work-style"]}
        drafted = json.loads(self.invoke("prepare-playbook", "--input", str(self.write("prepared-stale.json", spec)), "--apply").stdout)
        self.invoke("review-playbook", "--playbook-id", "prepared-stale", "--decision", "approve", "--reviewer", "Chris Binion", "--reason", "Approved", "--expected-digest", drafted["draft"]["draftDigest"], "--apply")
        prepared = json.loads(self.invoke("prepare-publication", "--playbook-id", "prepared-stale", "--destination", "approved-repository", "--confirmation-id", "confirm-123456", "--apply").stdout)
        replacement = self.record(version=2, updated_offset=1, supersedes="work-style@1")
        self.invoke("correct", "--domain", "professional", "--record-id", "work-style", "--input", str(self.write("prepared-corrected.json", replacement)), "--expected-version", "1", "--reason", "Changed", "--apply")
        denied = self.invoke("record-publication-attempt", "--playbook-id", "prepared-stale", "--package-digest", prepared["package"]["packageDigest"], "--confirmation-id", "confirm-123456", "--apply", check=False)
        self.assertNotEqual(denied.returncode, 0)
        self.assertIn("changed after", denied.stderr)

    def test_prepared_playbook_cannot_be_attempted_after_source_opt_out(self) -> None:
        self.capture(self.record())
        spec = {"schemaVersion": 1, "playbookID": "prepared-optout", "title": "Prepared", "purpose": "Test action-time opt-out", "audience": "Approved collaborator", "recordIDs": ["work-style"]}
        drafted = json.loads(self.invoke("prepare-playbook", "--input", str(self.write("prepared-optout.json", spec)), "--apply").stdout)
        self.invoke("review-playbook", "--playbook-id", "prepared-optout", "--decision", "approve", "--reviewer", "Chris Binion", "--reason", "Approved", "--expected-digest", drafted["draft"]["draftDigest"], "--apply")
        prepared = json.loads(self.invoke("prepare-publication", "--playbook-id", "prepared-optout", "--destination", "approved-repository", "--confirmation-id", "confirm-123456", "--apply").stdout)
        self.invoke("opt-out", "--scope", "source", "--key", "project-knowledge", "--enabled", "yes", "--reason", "Chris opted out", "--apply")
        denied = self.invoke("record-publication-attempt", "--playbook-id", "prepared-optout", "--package-digest", prepared["package"]["packageDigest"], "--confirmation-id", "confirm-123456", "--apply", check=False)
        self.assertNotEqual(denied.returncode, 0)
        self.assertIn("opted out", denied.stderr)

    def test_projection_redacts_governance_and_playbook_metadata(self) -> None:
        self.capture(self.record())
        private = "Private statement at user@example.com in /Users/chris/private.txt"
        self.invoke("opt-out", "--scope", "record-type", "--key", "capability", "--enabled", "yes", "--reason", private, "--apply")
        spec = {"schemaVersion": 1, "playbookID": "metadata-redaction", "title": private, "purpose": "Projection privacy test", "audience": private, "recordIDs": ["work-style"]}
        self.invoke("prepare-playbook", "--input", str(self.write("metadata-redaction.json", spec)), "--apply")
        projection = json.loads(self.invoke("project", "--apply").stdout)
        rendered = json.dumps(projection)
        self.assertNotIn("user@example.com", rendered)
        self.assertNotIn("/Users/chris/private.txt", rendered)
        self.assertIn("[REDACTED EMAIL]", rendered)
        self.assertIn("[REDACTED PATH]", rendered)


if __name__ == "__main__":
    unittest.main()
