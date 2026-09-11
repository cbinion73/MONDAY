#!/usr/bin/env python3
"""Validate and atomically save MONDAY's current daily planner payload."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import date, datetime
from pathlib import Path
from typing import Any


TARGET = Path.home() / ".codex" / "monday-planner" / "daily-plan.json"
MAX_TEXT = 600
MAX_ITEMS = 14
MAX_SCHEDULE_ITEMS = 48
TIMEZONE = "America/New_York"


def text(value: Any, label: str, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{label} must be text")
    value = value.strip()
    if (not allow_empty and not value) or len(value) > MAX_TEXT:
        raise ValueError(f"{label} has an invalid length")
    return value


def text_list(value: Any, label: str, maximum: int = MAX_ITEMS) -> list[str]:
    if not isinstance(value, list) or len(value) > maximum:
        raise ValueError(f"{label} must be a list with at most {maximum} items")
    return [text(item, f"{label} item") for item in value]


def local_time(value: Any, label: str) -> str:
    value = text(value, label)
    try:
        datetime.strptime(value, "%H:%M")
    except ValueError as error:
        raise ValueError(f"{label} must use local 24-hour HH:MM time") from error
    return value


def source(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError("sources must contain objects")
    status = text(value.get("status"), "source status")
    if status not in {"available", "unavailable", "partial"}:
        raise ValueError("source status must be available, unavailable, or partial")
    return {
        "kind": text(value.get("kind"), "source kind"),
        "name": text(value.get("name"), "source name"),
        "status": status,
        "fetchedAt": text(value.get("fetchedAt"), "source fetchedAt"),
    }


def normalize(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("planner payload must be an object")
    plan_date = text(payload.get("date"), "date")
    date.fromisoformat(plan_date)
    generated_at = text(payload.get("generatedAt"), "generatedAt")
    datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    timezone = text(payload.get("timezone"), "timezone")
    if timezone != TIMEZONE:
        raise ValueError(f"timezone must be {TIMEZONE}")
    sources = payload.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("sources must be a non-empty list")
    priorities = payload.get("priorities")
    if not isinstance(priorities, dict):
        raise ValueError("priorities must be an object")
    schedule = payload.get("schedule")
    if not isinstance(schedule, list) or len(schedule) > MAX_SCHEDULE_ITEMS:
        raise ValueError(f"schedule must be a list with at most {MAX_SCHEDULE_ITEMS} items")
    if not all(isinstance(item, dict) for item in schedule):
        raise ValueError("schedule items must be objects")
    compass = payload.get("compass")
    if not isinstance(compass, list) or len(compass) > 4:
        raise ValueError("compass must be a list with at most 4 items")
    if not all(isinstance(item, dict) for item in compass):
        raise ValueError("compass items must be objects")
    return {
        "date": plan_date,
        "generatedAt": generated_at,
        "timezone": timezone,
        "sources": [source(item) for item in sources],
        "primaryFocus": text(payload.get("primaryFocus"), "primaryFocus"),
        "schedule": [
            {
                "time": local_time(item.get("time"), "schedule time"),
                "end": local_time(item.get("end"), "schedule end"),
                "title": text(item.get("title"), "schedule title"),
            }
            for item in schedule
            if isinstance(item, dict)
        ],
        "priorities": {key: text_list(priorities.get(key), f"priorities.{key}") for key in ("a", "b", "c")},
        "notes": text_list(payload.get("notes"), "notes", 7),
        "compass": [
            {"role": text(item.get("role"), "compass role"), "goal": text(item.get("goal"), "compass goal")}
            for item in compass
            if isinstance(item, dict)
        ],
    }


def main() -> None:
    try:
        plan = normalize(json.load(sys.stdin))
    except (ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Planner payload was not saved: {error}")
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=TARGET.parent, delete=False) as handle:
        json.dump(plan, handle, separators=(",", ":"))
        handle.write("\n")
        temp_name = handle.name
    os.chmod(temp_name, 0o600)
    os.replace(temp_name, TARGET)
    print(f"Saved planner payload for {plan['date']}.")


if __name__ == "__main__":
    main()
