#!/usr/bin/env python3
"""Emit a compact, read-only DM context from an AetherTable CampaignState JSON file."""

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def raw(value: Any) -> Any:
    """Unwrap Codable RawRepresentable values while preserving ordinary JSON."""
    if isinstance(value, dict) and set(value) == {"rawValue"}:
        return value["rawValue"]
    return value


def require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a JSON object")
    return value


def event_summary(event: Any) -> dict[str, Any]:
    item = require_object(event, "event")
    return {
        "id": raw(item.get("id")),
        "created_at": item.get("createdAt"),
        "kind": item.get("kind"),
        "payload": item.get("payload", {}),
    }


def extract(state: dict[str, Any], event_limit: int) -> dict[str, Any]:
    world = require_object(state.get("world"), "world")
    events = state.get("events", [])
    if not isinstance(events, list):
        raise ValueError("events must be a JSON array")

    return {
        "campaign": {
            "id": raw(state.get("id")),
            "title": state.get("title"),
            "rules_pack_id": raw(state.get("rulesPackID")),
            "recap": state.get("recap"),
        },
        "scene": {
            "location_id": world.get("locationID"),
            "quest": world.get("quest"),
            "facts": world.get("facts", {}),
            "relationships": world.get("relationships", {}),
            "scene_progress": world.get("sceneProgress", {}),
            "threat_clock": world.get("threatClock"),
            "encounter": world.get("encounter"),
        },
        "player_character": world.get("player"),
        "dm_private_pack_state": world.get("packState", {}),
        "recent_events": [event_summary(event) for event in events[-event_limit:]],
        "integration_status": "read_only_snapshot; validate_and_commit_through_aethertable",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("campaign", type=Path, help="Path to an AetherTable CampaignState JSON snapshot")
    parser.add_argument("--event-limit", type=int, default=12, help="Number of most recent events to include")
    args = parser.parse_args()
    if args.event_limit < 0:
        parser.error("--event-limit must be non-negative")

    try:
        state = require_object(json.loads(args.campaign.read_text(encoding="utf-8")), "campaign")
        print(json.dumps(extract(state, args.event_limit), indent=2, sort_keys=True))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"aethertable campaign context error: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
