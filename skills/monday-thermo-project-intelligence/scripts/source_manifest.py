#!/usr/bin/env python3
"""Stage, validate, and transactionally merge compact Project Intelligence manifests."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


SCHEMA_VERSION = 1
STATUSES = {"discovered", "reviewed", "curated", "irrelevant", "deferred", "error"}
REQUIRED_FIELDS = {
    "schema_version", "source", "scope", "source_id", "version", "source_time",
    "location", "processing_status", "first_seen", "last_seen", "run_id",
}


def parse_iso(value: str, field: str) -> None:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a time zone")


def clean_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()


def clean_string_list(value: Any, field: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError(f"{field} must be a list of strings")
    return sorted({item.strip() for item in value if item.strip()})


def normalize_record(raw: dict[str, Any]) -> dict[str, Any]:
    missing = REQUIRED_FIELDS - raw.keys()
    if missing:
        raise ValueError(f"missing required fields: {', '.join(sorted(missing))}")
    if raw["schema_version"] != SCHEMA_VERSION:
        raise ValueError("unsupported source-manifest schema")
    status = clean_text(raw["processing_status"], "processing_status")
    if status not in STATUSES:
        raise ValueError(f"unsupported processing_status: {status}")
    for field in ("source_time", "first_seen", "last_seen"):
        parse_iso(clean_text(raw[field], field), field)
    record = {
        "schema_version": SCHEMA_VERSION,
        "source": clean_text(raw["source"], "source"),
        "scope": clean_text(raw["scope"], "scope"),
        "source_id": clean_text(raw["source_id"], "source_id"),
        "version": clean_text(raw["version"], "version"),
        "source_time": clean_text(raw["source_time"], "source_time"),
        "location": clean_text(raw["location"], "location"),
        "project_ids": clean_string_list(raw.get("project_ids"), "project_ids"),
        "processing_status": status,
        "evidence_records": clean_string_list(raw.get("evidence_records"), "evidence_records"),
        "first_seen": clean_text(raw["first_seen"], "first_seen"),
        "last_seen": clean_text(raw["last_seen"], "last_seen"),
        "run_id": clean_text(raw["run_id"], "run_id"),
    }
    if raw.get("content_fingerprint"):
        record["content_fingerprint"] = clean_text(raw["content_fingerprint"], "content_fingerprint")
    return record


def identity(record: dict[str, Any]) -> tuple[str, str, str, str]:
    return (record["source"], record["scope"], record["source_id"], record["version"])


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                raw = json.loads(line)
                if not isinstance(raw, dict):
                    raise ValueError("record must be an object")
                records.append(normalize_record(raw))
            except (json.JSONDecodeError, ValueError) as error:
                raise ValueError(f"{path}:{line_number}: {error}") from error
    return records


def atomic_write_jsonl(path: Path, records: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            for record in records:
                handle.write(json.dumps(record, separators=(",", ":"), sort_keys=True))
                handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def command_init(args: argparse.Namespace) -> None:
    path = Path(args.manifest)
    if path.exists() and not args.force:
        raise ValueError(f"manifest already exists: {path}")
    atomic_write_jsonl(path, [])
    print(json.dumps({"manifest": str(path), "records": 0}, sort_keys=True))


def command_stage(args: argparse.Namespace) -> None:
    stage_path = Path(args.stage)
    record = normalize_record(json.loads(Path(args.record).read_text(encoding="utf-8")))
    if record["run_id"] != args.run_id:
        raise ValueError("record run_id does not match --run-id")
    records = load_jsonl(stage_path)
    records_by_identity = {identity(item): item for item in records}
    records_by_identity[identity(record)] = record
    atomic_write_jsonl(stage_path, sorted(records_by_identity.values(), key=identity))
    print(json.dumps({"stage": str(stage_path), "records": len(records_by_identity)}, sort_keys=True))


def command_stage_batch(args: argparse.Namespace) -> None:
    stage_path = Path(args.stage)
    records_by_identity = {identity(item): item for item in load_jsonl(stage_path)}
    added = 0
    for line_number, line in enumerate(sys.stdin, start=1):
        if not line.strip():
            continue
        try:
            record = normalize_record(json.loads(line))
        except (json.JSONDecodeError, ValueError) as error:
            raise ValueError(f"stdin:{line_number}: {error}") from error
        if record["run_id"] != args.run_id:
            raise ValueError(f"stdin:{line_number}: record run_id does not match --run-id")
        records_by_identity[identity(record)] = record
        added += 1
        if args.expected_count is not None and added == args.expected_count:
            break
    if args.expected_count is not None and added != args.expected_count:
        raise ValueError(f"expected {args.expected_count} input records, received {added}")
    atomic_write_jsonl(stage_path, sorted(records_by_identity.values(), key=identity))
    print(json.dumps({"stage": str(stage_path), "input_records": added,
                      "records": len(records_by_identity)}, sort_keys=True))


def command_validate(args: argparse.Namespace) -> None:
    records = load_jsonl(Path(args.path))
    identities = [identity(record) for record in records]
    duplicates = len(identities) - len(set(identities))
    if duplicates:
        raise ValueError(f"duplicate identities: {duplicates}")
    print(json.dumps({"path": args.path, "records": len(records), "valid": True}, sort_keys=True))


def command_commit(args: argparse.Namespace) -> None:
    manifest_path = Path(args.manifest)
    stage_path = Path(args.stage)
    staged = load_jsonl(stage_path)
    if any(record["run_id"] != args.run_id for record in staged):
        raise ValueError("stage contains records from another run")
    if not args.transaction_ok:
        raise ValueError("--transaction-ok is required before manifest commit")
    existing = load_jsonl(manifest_path)
    merged = {identity(record): record for record in existing}
    for record in staged:
        key = identity(record)
        prior = merged.get(key)
        if prior:
            record["first_seen"] = min(prior["first_seen"], record["first_seen"])
        merged[key] = record
    ordered = sorted(merged.values(), key=identity)
    atomic_write_jsonl(manifest_path, ordered)
    digest = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    print(json.dumps({"manifest": str(manifest_path), "records": len(ordered),
                      "staged_records": len(staged), "sha256": digest}, sort_keys=True))


def command_status(args: argparse.Namespace) -> None:
    records = load_jsonl(Path(args.manifest))
    filtered = [record for record in records if not args.source or record["source"] == args.source]
    by_status: dict[str, int] = {}
    for record in filtered:
        by_status[record["processing_status"]] = by_status.get(record["processing_status"], 0) + 1
    print(json.dumps({"records": len(filtered), "by_status": by_status}, indent=2, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    init = subparsers.add_parser("init")
    init.add_argument("--manifest", required=True)
    init.add_argument("--force", action="store_true")
    init.set_defaults(function=command_init)
    stage = subparsers.add_parser("stage")
    stage.add_argument("--stage", required=True)
    stage.add_argument("--record", required=True)
    stage.add_argument("--run-id", required=True)
    stage.set_defaults(function=command_stage)
    stage_batch = subparsers.add_parser("stage-batch")
    stage_batch.add_argument("--stage", required=True)
    stage_batch.add_argument("--run-id", required=True)
    stage_batch.add_argument("--expected-count", type=int)
    stage_batch.set_defaults(function=command_stage_batch)
    validate = subparsers.add_parser("validate")
    validate.add_argument("--path", required=True)
    validate.set_defaults(function=command_validate)
    commit = subparsers.add_parser("commit")
    commit.add_argument("--manifest", required=True)
    commit.add_argument("--stage", required=True)
    commit.add_argument("--run-id", required=True)
    commit.add_argument("--transaction-ok", action="store_true")
    commit.set_defaults(function=command_commit)
    status = subparsers.add_parser("status")
    status.add_argument("--manifest", required=True)
    status.add_argument("--source")
    status.set_defaults(function=command_status)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.function(args)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
