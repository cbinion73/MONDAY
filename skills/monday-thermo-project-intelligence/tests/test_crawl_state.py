from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "crawl_state.py"


class CrawlStateManifestGateTests(unittest.TestCase):
    def test_commit_requires_manifest_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "state.json"
            base = ["python3", str(SCRIPT)]
            subprocess.run(base + ["init", "--state", str(state)], check=True, capture_output=True)
            subprocess.run(base + [
                "begin", "--state", str(state), "--source", "Outlook", "--scope", "test",
                "--run-id", "run-001", "--window-start", "2026-08-01T00:00:00Z",
                "--requested-cutoff", "2026-08-12T00:00:00Z",
            ], check=True, capture_output=True)
            command = base + [
                "commit", "--state", str(state), "--source", "Outlook", "--scope", "test",
                "--run-id", "run-001", "--item-count", "1", "--write-count", "0",
                "--collection-ok", "--reconciliation-ok", "--writes-ok", "--validation-ok",
            ]
            blocked = subprocess.run(command, text=True, capture_output=True, check=False)
            self.assertNotEqual(blocked.returncode, 0)
            self.assertIn("manifest", blocked.stderr)
            committed = subprocess.run(command + ["--manifest-ok"], check=False)
            self.assertEqual(committed.returncode, 0)


if __name__ == "__main__":
    unittest.main()
