from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "source_manifest.py"


class SourceManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.manifest = self.root / "manifest.jsonl"
        self.stage = self.root / "stage.jsonl"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_script(self, *args: str, success: bool = True) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            ["python3", str(SCRIPT), *args], text=True, capture_output=True, check=False
        )
        if success and result.returncode != 0:
            self.fail(result.stderr)
        if not success and result.returncode == 0:
            self.fail("command unexpectedly succeeded")
        return result

    def write_record(self, **overrides: object) -> Path:
        record = {
            "schema_version": 1,
            "source": "Outlook",
            "scope": "primary-mailbox/project-folders",
            "source_id": "message-123",
            "version": "2026-08-12T10:00:00-04:00",
            "source_time": "2026-08-12T10:00:00-04:00",
            "location": "outlook://message-123",
            "project_ids": ["monday-project-001"],
            "processing_status": "curated",
            "evidence_records": ["monday-evidence-001"],
            "first_seen": "2026-08-12T12:00:00-04:00",
            "last_seen": "2026-08-12T12:00:00-04:00",
            "run_id": "run-001",
        }
        record.update(overrides)
        path = self.root / "record.json"
        path.write_text(json.dumps(record), encoding="utf-8")
        return path

    def test_stage_validate_and_commit(self) -> None:
        self.run_script("init", "--manifest", str(self.manifest))
        record = self.write_record()
        self.run_script("stage", "--stage", str(self.stage), "--record", str(record),
                        "--run-id", "run-001")
        self.run_script("validate", "--path", str(self.stage))
        blocked = self.run_script("commit", "--manifest", str(self.manifest),
                                  "--stage", str(self.stage), "--run-id", "run-001",
                                  success=False)
        self.assertIn("--transaction-ok is required", blocked.stderr)
        committed = self.run_script("commit", "--manifest", str(self.manifest),
                                    "--stage", str(self.stage), "--run-id", "run-001",
                                    "--transaction-ok")
        self.assertEqual(json.loads(committed.stdout)["records"], 1)
        self.run_script("validate", "--path", str(self.manifest))

    def test_stage_upserts_same_identity(self) -> None:
        record = self.write_record(last_seen="2026-08-12T12:00:00-04:00")
        self.run_script("stage", "--stage", str(self.stage), "--record", str(record),
                        "--run-id", "run-001")
        record = self.write_record(last_seen="2026-08-12T12:05:00-04:00")
        result = self.run_script("stage", "--stage", str(self.stage), "--record", str(record),
                                 "--run-id", "run-001")
        self.assertEqual(json.loads(result.stdout)["records"], 1)

    def test_stage_batch_reads_jsonl_from_stdin(self) -> None:
        record = json.loads(self.write_record().read_text(encoding="utf-8"))
        result = subprocess.run(
            ["python3", str(SCRIPT), "stage-batch", "--stage", str(self.stage),
             "--run-id", "run-001"],
            input=json.dumps(record) + "\n", text=True, capture_output=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["records"], 1)

    def test_rejects_missing_timezone_and_mixed_run(self) -> None:
        record = self.write_record(source_time="2026-08-12T10:00:00")
        result = self.run_script("stage", "--stage", str(self.stage), "--record", str(record),
                                 "--run-id", "run-001", success=False)
        self.assertIn("source_time must include a time zone", result.stderr)
        record = self.write_record(run_id="another-run")
        result = self.run_script("stage", "--stage", str(self.stage), "--record", str(record),
                                 "--run-id", "run-001", success=False)
        self.assertIn("record run_id does not match", result.stderr)


if __name__ == "__main__":
    unittest.main()
