#!/usr/bin/env python3
"""Create a non-destructive, recipient-owned MONDAY Project Knowledge vault skeleton."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


DIRECTORIES = (
    "01 Research",
    "02 Evidence",
    "03 Projects",
    "04 Assets",
    "04 Portfolio",
    "05 Decisions",
    ".staging",
    ".crawl-staging",
)

FILES = {
    "README.md": "# Project Knowledge\n\nRecipient-owned, evidence-linked professional work record.\n",
    "Project Queue.md": "# Project Queue\n\nAdd only approved or evidence-backed project records.\n",
    ".source-manifest.jsonl": "",
    ".crawl-state.json": "{\n  \"version\": 1,\n  \"scopes\": {}\n}\n",
}

MEETING_NOTES_README = """# Meeting Notes

Recipient-owned governed meeting-note evidence, kept separate from Project Knowledge.
Do not store raw transcripts, recordings, meeting links, passcodes, or unnecessary attendee data here.
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vault", required=True, type=Path, help="Recipient-owned vault path")
    parser.add_argument(
        "--meeting-notes-vault",
        type=Path,
        default=Path(
            os.environ.get(
                "MONDAY_MEETING_NOTES_VAULT",
                Path.home() / "Knowledge Vault" / "Meeting Notes",
            )
        ),
        help="Recipient-owned governed Meeting Notes path, separate from Project Knowledge",
    )
    parser.add_argument("--apply", action="store_true", help="Create missing folders and files without overwriting")
    args = parser.parse_args()

    vault = args.vault.expanduser().resolve()
    meeting_notes_vault = args.meeting_notes_vault.expanduser().resolve()
    planned_items: list[tuple[Path, str | None]] = [
        *((vault / directory, None) for directory in DIRECTORIES),
        *((vault / filename, content) for filename, content in FILES.items()),
        (meeting_notes_vault, None),
        (meeting_notes_vault / "README.md", MEETING_NOTES_README),
    ]
    result = {
        "vault": str(vault),
        "meeting_notes_vault": str(meeting_notes_vault),
        "apply": args.apply,
        "planned": [str(path) for path, _ in planned_items],
        "created": [],
        "existing": [],
    }

    for candidate, content in planned_items:
        if candidate.exists():
            result["existing"].append(str(candidate))
            continue
        if args.apply:
            if content is not None:
                candidate.parent.mkdir(parents=True, exist_ok=True)
                candidate.write_text(content, encoding="utf-8")
            else:
                candidate.mkdir(parents=True, exist_ok=False)
            result["created"].append(str(candidate))

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
