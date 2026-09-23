from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "meeting_continuity.py"


class MeetingContinuityTests(unittest.TestCase):
    def test_bootstrap_is_fail_closed_and_reconcile_exposes_backlog(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            vault = Path(temporary) / "Project Knowledge"
            notes = Path(temporary) / "Meeting Notes"
            notes.mkdir(parents=True)
            (vault / "03 Projects").mkdir(parents=True)
            (notes / "sample.md").write_text("""---\ntype: meeting-note\nmeeting_title: Sample\nstable_meeting_key: sample-20260901\nmeeting_date: 2026-09-01\nmeeting_chat_status: accessible\ntranscript_status: inaccessible\nevidence_status: supported\n---\n# Sample\n""", encoding="utf-8")
            ledger = vault / "ledger.json"
            base = ["python3", str(SCRIPT), "--vault", str(vault), "--ledger", str(ledger), "--meeting-notes-root", str(notes)]
            subprocess.run(base + ["bootstrap", "--write"], check=True, capture_output=True)
            result = subprocess.run(base + ["reconcile", "--run-id", "test", "--output", str(vault / "summary.json")], check=True, text=True, capture_output=True)
            summary = json.loads(result.stdout)
            self.assertEqual(summary["coverage"]["meetings_in_scope"], 1)
            self.assertFalse(summary["coverage"]["complete"])
            self.assertEqual(summary["backlog"][0]["disposition"], "routing_pending")

    def test_project_update_requires_approval(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            vault = Path(temporary) / "Project Knowledge"
            notes = Path(temporary) / "Meeting Notes"; notes.mkdir(parents=True)
            projects = vault / "03 Projects"; projects.mkdir(parents=True)
            (projects / "Example.md").write_text("# Example\n", encoding="utf-8")
            (notes / "sample.md").write_text("""---\nstable_meeting_key: sample\nmeeting_date: 2026-09-01\n---\n""", encoding="utf-8")
            ledger = vault / "ledger.json"; base = ["python3", str(SCRIPT), "--vault", str(vault), "--ledger", str(ledger), "--meeting-notes-root", str(notes)]
            subprocess.run(base + ["bootstrap", "--write"], check=True, capture_output=True)
            blocked = subprocess.run(base + ["record-project-update", "--meeting-key", "sample", "--project", "Example.md", "--summary", "Supported change", "--confidence", "high", "--run-id", "test", "--write"], text=True, capture_output=True)
            self.assertNotEqual(blocked.returncode, 0)
            self.assertIn("--approved", blocked.stderr)

            completed = subprocess.run(base + ["record-project-update", "--meeting-key", "sample", "--project", "Example.md", "--summary", "Supported change", "--confidence", "high", "--run-id", "test", "--approved", "--write"], check=True, text=True, capture_output=True)
            self.assertIn("project_record_written", completed.stdout)
            text = (projects / "Example.md").read_text(encoding="utf-8")
            self.assertIn("Supported change", text)
            self.assertIn("meeting-continuity:sample:test", text)

    def test_import_does_not_advance_watermark_and_emits_revisit_queue(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            vault = Path(temporary) / "Project Knowledge"; vault.mkdir()
            imported = Path(temporary) / "occurrences.json"
            imported.write_text(json.dumps({"occurrences": [{"stable_meeting_key": "external-1", "meeting_date": "2026-09-01", "meeting_title": "External collector result", "source_system": "Outlook"}]}), encoding="utf-8")
            ledger = vault / "ledger.json"; base = ["python3", str(SCRIPT), "--vault", str(vault), "--ledger", str(ledger)]
            result = subprocess.run(base + ["ingest-occurrences", "--input", str(imported), "--run-id", "run", "--write"], check=True, text=True, capture_output=True)
            self.assertIn('"watermark_advanced": false', result.stdout)
            revisit = subprocess.run(base + ["revisit-plan", "--output", str(vault / "revisit.json")], check=True, text=True, capture_output=True)
            self.assertIn('"due_count": 1', revisit.stdout)


if __name__ == "__main__":
    unittest.main()
