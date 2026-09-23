#!/usr/bin/env python3
"""Manage transactional, source-scoped Project Intelligence crawl watermarks."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include a time zone")
    return parsed.astimezone(timezone.utc)


def scope_key(source: str, scope: str) -> str:
    return f"{source.strip()}::{scope.strip()}"


def blank_state() -> dict[str, Any]:
    return {"schema_version": SCHEMA_VERSION, "updated_at": now_iso(), "scopes": {}}


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return blank_state()
    with path.open("r", encoding="utf-8") as handle:
        state = json.load(handle)
    if state.get("schema_version") != SCHEMA_VERSION or not isinstance(state.get("scopes"), dict):
        raise ValueError("unsupported or invalid crawl-state schema")
    return state


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = now_iso()
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def get_scope(state: dict[str, Any], source: str, scope: str) -> tuple[str, dict[str, Any]]:
    key = scope_key(source, scope)
    record = state["scopes"].setdefault(
        key,
        {
            "source": source,
            "scope": scope,
            "last_successful_cutoff": None,
            "last_successful_run": None,
            "pending_run": None,
            "failed_runs": [],
        },
    )
    return key, record


def command_init(args: argparse.Namespace) -> None:
    path = Path(args.state)
    if path.exists() and not args.force:
        raise ValueError(f"state already exists: {path}")
    state = blank_state()
    save_state(path, state)
    print(json.dumps(state, indent=2, sort_keys=True))


def command_status(args: argparse.Namespace) -> None:
    state = load_state(Path(args.state))
    if args.source and args.scope:
        key = scope_key(args.source, args.scope)
        print(json.dumps(state["scopes"].get(key), indent=2, sort_keys=True))
    else:
        print(json.dumps(state, indent=2, sort_keys=True))


def command_begin(args: argparse.Namespace) -> None:
    parse_iso(args.window_start)
    parse_iso(args.requested_cutoff)
    if parse_iso(args.requested_cutoff) < parse_iso(args.window_start):
        raise ValueError("requested cutoff cannot precede window start")
    path = Path(args.state)
    state = load_state(path)
    _, record = get_scope(state, args.source, args.scope)
    if record["pending_run"]:
        raise ValueError(f"pending run already exists: {record['pending_run']['run_id']}")
    prior = record["last_successful_cutoff"]
    if prior and parse_iso(args.requested_cutoff) < parse_iso(prior):
        raise ValueError("requested cutoff cannot move behind the successful watermark")
    record["pending_run"] = {
        "run_id": args.run_id,
        "started_at": now_iso(),
        "window_start": args.window_start,
        "requested_cutoff": args.requested_cutoff,
        "query": args.query,
        "plugin_version": args.plugin_version,
    }
    save_state(path, state)
    print(json.dumps(record, indent=2, sort_keys=True))


def command_commit(args: argparse.Namespace) -> None:
    path = Path(args.state)
    state = load_state(path)
    _, record = get_scope(state, args.source, args.scope)
    pending = record.get("pending_run")
    if not pending or pending.get("run_id") != args.run_id:
        raise ValueError("matching pending run not found")
    if not all((args.collection_ok, args.reconciliation_ok, args.writes_ok,
                args.manifest_ok, args.validation_ok)):
        raise ValueError(
            "all collection, reconciliation, write, manifest, and validation gates must pass"
        )
    completed = {
        **pending,
        "completed_at": now_iso(),
        "item_count": args.item_count,
        "write_count": args.write_count,
        "high_water_item": args.high_water_item,
        "gates": {
            "collection": True,
            "reconciliation": True,
            "writes": True,
            "manifest": True,
            "validation": True,
        },
    }
    record["last_successful_cutoff"] = pending["requested_cutoff"]
    record["last_successful_run"] = completed
    record["pending_run"] = None
    save_state(path, state)
    print(json.dumps(record, indent=2, sort_keys=True))


def command_fail(args: argparse.Namespace) -> None:
    path = Path(args.state)
    state = load_state(path)
    _, record = get_scope(state, args.source, args.scope)
    pending = record.get("pending_run")
    if not pending or pending.get("run_id") != args.run_id:
        raise ValueError("matching pending run not found")
    record["failed_runs"].append({**pending, "failed_at": now_iso(), "reason": args.reason})
    record["failed_runs"] = record["failed_runs"][-25:]
    record["pending_run"] = None
    save_state(path, state)
    print(json.dumps(record, indent=2, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    init = subparsers.add_parser("init")
    init.add_argument("--state", required=True)
    init.add_argument("--force", action="store_true")
    init.set_defaults(function=command_init)

    status = subparsers.add_parser("status")
    status.add_argument("--state", required=True)
    status.add_argument("--source")
    status.add_argument("--scope")
    status.set_defaults(function=command_status)

    begin = subparsers.add_parser("begin")
    begin.add_argument("--state", required=True)
    begin.add_argument("--source", required=True)
    begin.add_argument("--scope", required=True)
    begin.add_argument("--run-id", required=True)
    begin.add_argument("--window-start", required=True)
    begin.add_argument("--requested-cutoff", required=True)
    begin.add_argument("--query", default="")
    begin.add_argument("--plugin-version", default="unknown")
    begin.set_defaults(function=command_begin)

    commit = subparsers.add_parser("commit")
    commit.add_argument("--state", required=True)
    commit.add_argument("--source", required=True)
    commit.add_argument("--scope", required=True)
    commit.add_argument("--run-id", required=True)
    commit.add_argument("--item-count", type=int, required=True)
    commit.add_argument("--write-count", type=int, required=True)
    commit.add_argument("--high-water-item", default="")
    commit.add_argument("--collection-ok", action="store_true")
    commit.add_argument("--reconciliation-ok", action="store_true")
    commit.add_argument("--writes-ok", action="store_true")
    commit.add_argument("--manifest-ok", action="store_true")
    commit.add_argument("--validation-ok", action="store_true")
    commit.set_defaults(function=command_commit)

    fail = subparsers.add_parser("fail")
    fail.add_argument("--state", required=True)
    fail.add_argument("--source", required=True)
    fail.add_argument("--scope", required=True)
    fail.add_argument("--run-id", required=True)
    fail.add_argument("--reason", required=True)
    fail.set_defaults(function=command_fail)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if bool(getattr(args, "source", None)) != bool(getattr(args, "scope", None)):
        parser.error("--source and --scope must be provided together")
    try:
        args.function(args)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
