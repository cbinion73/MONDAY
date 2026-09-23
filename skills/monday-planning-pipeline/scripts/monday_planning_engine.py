#!/usr/bin/env python3
"""Compatibility launcher for the consolidated MONDAY planning runtime."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--activity-summary", default="")
    parser.add_argument("--analysis")
    parser.add_argument("--date")
    args = parser.parse_args()

    plugin_root = Path(__file__).resolve().parents[3]
    runtime = plugin_root / "scripts" / "monday_system.py"
    command = [sys.executable, str(runtime), "publish"]
    if not args.dry_run:
        command.append("--apply")
    if args.activity_summary:
        command.extend(["--activity-summary", args.activity_summary])
    if args.analysis:
        command.extend(["--analysis", args.analysis])
    if args.date:
        command.extend(["--date", args.date])
    return subprocess.run(command, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
