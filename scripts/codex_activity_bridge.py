#!/usr/bin/env python3
"""Read-only, local-network view of the Codex session index.

This deliberately exposes only task titles, identifiers, and activity timestamps.
It does not expose conversation content and offers no mutation endpoints.
"""

from __future__ import annotations

import argparse
import hmac
import json
import re
import time
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


CODEX_ROOT = Path.home() / ".codex"
SESSION_INDEX = CODEX_ROOT / "session_index.jsonl"
SESSION_ROOT = CODEX_ROOT / "sessions"
THREAD_ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)
ACTIVE_WINDOW_SECONDS = 5 * 60
MAX_THREADS = 12
LIBRARIES = {
    "captains-log": Path.home() / "Knowledge Vault/Chris Knowledge/500 Personal Journal",
    "bible-studies": Path.home() / "Knowledge Vault/Monday Vault/Bible Studies",
    "books": Path.home() / "Knowledge Vault/Chris Knowledge/Books",
    "research-journal": Path.home() / "Knowledge Vault/Monday Knowledge/500 Research Journal",
}
CAPTURE_INBOX = CODEX_ROOT / "captains-log-captures"
PLANNER_PATH = CODEX_ROOT / "monday-planner" / "daily-plan.json"


def iso8601(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def load_index() -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    if not SESSION_INDEX.exists():
        return indexed
    for line in SESSION_INDEX.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        thread_id = entry.get("id")
        title = entry.get("thread_name")
        if isinstance(thread_id, str) and isinstance(title, str) and title.strip():
            indexed[thread_id.lower()] = {"title": title.strip()}
    return indexed


def latest_session_activity() -> dict[str, float]:
    activity: dict[str, float] = {}
    if not SESSION_ROOT.exists():
        return activity
    for session_file in SESSION_ROOT.rglob("*.jsonl"):
        try:
            modified = session_file.stat().st_mtime
        except OSError:
            continue
        for thread_id in THREAD_ID.findall(session_file.name):
            key = thread_id.lower()
            activity[key] = max(activity.get(key, 0.0), modified)
    return activity


def activity_snapshot() -> dict[str, Any]:
    indexed = load_index()
    activity = latest_session_activity()
    now = time.time()
    rows: list[dict[str, Any]] = []
    for thread_id, modified in activity.items():
        record = indexed.get(thread_id)
        if record is None:
            continue
        age = max(0.0, now - modified)
        rows.append(
            {
                "id": thread_id,
                "title": record["title"],
                "status": "active" if age <= ACTIVE_WINDOW_SECONDS else "recent",
                "updatedAt": iso8601(modified),
            }
        )
    rows.sort(key=lambda item: item["updatedAt"], reverse=True)
    return {
        "source": "Codex local session index on this Mac",
        "generatedAt": iso8601(now),
        "activeCount": sum(item["status"] == "active" for item in rows),
        "threads": rows[:MAX_THREADS],
    }


def remove_front_matter(text: str) -> str:
    if not text.startswith("---"):
        return text
    end = text.find("\n---", 3)
    return text[end + 4 :] if end >= 0 else text


def library_entries(collection: str) -> list[dict[str, Any]]:
    root = LIBRARIES.get(collection)
    if root is None or not root.exists():
        return []
    paths = root.rglob("*.md")
    entries: list[dict[str, Any]] = []
    for path in paths:
        if path.name == "README.md":
            continue
        try:
            body = remove_front_matter(path.read_text(encoding="utf-8")).strip()
            modified = path.stat().st_mtime
        except OSError:
            continue
        first_heading = next((line.lstrip("#").strip() for line in body.splitlines() if line.startswith("#")), "")
        title = first_heading or path.stem.replace("-", " ")
        entry_id = uuid.uuid5(uuid.NAMESPACE_URL, str(path)).hex
        entries.append({"id": entry_id, "title": title, "updatedAt": iso8601(modified), "preview": body[:260]})
    return sorted(entries, key=lambda entry: entry["updatedAt"], reverse=True)


def library_entry(collection: str, entry_id: str) -> dict[str, Any] | None:
    root = LIBRARIES.get(collection)
    if root is None:
        return None
    paths = root.rglob("*.md")
    for path in paths:
        if path.name == "README.md" or uuid.uuid5(uuid.NAMESPACE_URL, str(path)).hex != entry_id:
            continue
        try:
            body = remove_front_matter(path.read_text(encoding="utf-8")).strip()
            modified = path.stat().st_mtime
        except OSError:
            return None
        first_heading = next((line.lstrip("#").strip() for line in body.splitlines() if line.startswith("#")), "")
        return {"id": entry_id, "title": first_heading or path.stem.replace("-", " "), "updatedAt": iso8601(modified), "body": body}
    return None


def save_capture(content: str) -> dict[str, str]:
    CAPTURE_INBOX.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().astimezone().strftime("%Y-%m-%d-%H%M%S")
    target = CAPTURE_INBOX / f"{timestamp}-captains-log-draft.md"
    target.write_text(f"# Captain's Log Draft\n\n{content.strip()}\n", encoding="utf-8")
    return {"status": "captured", "id": target.stem}


def daily_plan() -> dict[str, Any] | None:
    """Return only a validated daily planner payload written by MONDAY."""
    if not PLANNER_PATH.exists():
        return None
    try:
        plan = json.loads(PLANNER_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(plan, dict):
        return None
    required_strings = ("date", "generatedAt", "primaryFocus", "timezone")
    if any(not isinstance(plan.get(key), str) for key in required_strings):
        return None
    if plan.get("timezone") != "America/New_York":
        return None
    if not all(isinstance(plan.get(key), list) for key in ("schedule", "notes", "compass", "sources")):
        return None
    if not all(isinstance(item, dict) and all(isinstance(item.get(key), str) for key in ("time", "end", "title")) for item in plan["schedule"]):
        return None
    if not plan["sources"] or not all(isinstance(item, dict) and all(isinstance(item.get(key), str) for key in ("kind", "name", "status", "fetchedAt")) for item in plan["sources"]):
        return None
    priorities = plan.get("priorities")
    if not isinstance(priorities, dict) or not all(isinstance(priorities.get(key), list) for key in ("a", "b", "c")):
        return None
    return plan


class ActivityHandler(BaseHTTPRequestHandler):
    token = ""

    def _authorized(self) -> bool:
        header = self.headers.get("Authorization", "")
        return hmac.compare_digest(header, f"Bearer {self.token}")

    def _write_json(self, status: HTTPStatus, body: dict[str, Any]) -> None:
        encoded = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            self._write_json(HTTPStatus.OK, {"status": "ok"})
            return
        if not self._authorized():
            self._write_json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
            return
        if path == "/v1/activity":
            self._write_json(HTTPStatus.OK, activity_snapshot())
            return
        if path == "/v1/planner/today":
            plan = daily_plan()
            if plan is None:
                self._write_json(HTTPStatus.OK, {"status": "not-prepared", "plan": None})
            else:
                self._write_json(HTTPStatus.OK, {"status": "prepared", "plan": plan})
            return
        parts = [unquote(part) for part in path.split("/") if part]
        if len(parts) == 3 and parts[:2] == ["v1", "library"]:
            collection = parts[2]
            if collection not in LIBRARIES:
                self._write_json(HTTPStatus.NOT_FOUND, {"error": "library not found"})
                return
            self._write_json(HTTPStatus.OK, {"collection": collection, "entries": library_entries(collection)})
            return
        if len(parts) == 4 and parts[:2] == ["v1", "library"]:
            entry = library_entry(parts[2], parts[3])
            if entry is None:
                self._write_json(HTTPStatus.NOT_FOUND, {"error": "entry not found"})
                return
            self._write_json(HTTPStatus.OK, entry)
            return
        self._write_json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path != "/v1/captains-log-capture":
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        if not self._authorized():
            self._write_json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            content = payload.get("content", "")
        except (ValueError, json.JSONDecodeError):
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": "invalid capture"})
            return
        if not isinstance(content, str) or not (1 <= len(content.strip()) <= 12000):
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": "capture must be between 1 and 12000 characters"})
            return
        self._write_json(HTTPStatus.CREATED, save_capture(content))

    def log_message(self, format: str, *args: object) -> None:
        # Do not log request paths or headers; this service is intentionally quiet.
        return


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=39431)
    parser.add_argument("--token", required=True)
    args = parser.parse_args()
    if len(args.token) < 24:
        raise SystemExit("Bridge token is missing or too short.")
    ActivityHandler.token = args.token
    server = ThreadingHTTPServer((args.host, args.port), ActivityHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
