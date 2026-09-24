#!/usr/bin/env python3
"""Durable, idempotent, privacy-reduced MONDAY workflow runtime."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import secrets
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


UTC = timezone.utc
DATABASE_VERSION = 2
PROJECTION_VERSION = 2
READBACK_VERSION = 1
CAPABILITY_VERSION = "2.0.0"
PRODUCER = "monday-runtime"
AUDIENCE = "Chris-private-local"
PROJECTION_TTL_MINUTES = 15
STALE_ACTION_MINUTES = 15
ALLOWED_RUNTIME_VIEW_IDS = {
    "operations-overview", "operations-workflows-dead-letters", "operations-external-actions",
    "operations-commitments-decisions", "operations-source-health", "operations-connections",
    "operations-compatibility-migrations", "operations-alerts-recovery",
}
MIN_APP_VERSION = "0.4.1"
MAX_APP_VERSION = "0.5.0"
ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
HASH_PATTERN = re.compile(r"^[0-9a-f]{64}$")
FORBIDDEN_KEYS = {
    "body", "content", "message", "messages", "recipient", "recipients", "attendee", "attendees",
    "email", "address", "url", "locator", "secret", "credential", "password", "accessToken",
    "refreshToken", "fileBody", "chatText", "transcript", "raw",
}

PLUGIN_ROOT = Path(__file__).resolve().parents[1]
ROOT = Path(os.environ.get("MONDAY_RUNTIME_ROOT", "~/.codex/monday-runtime")).expanduser()
DATABASE_PATH = ROOT / "runtime.sqlite3"
PROJECTION_PATH = ROOT / "operations.json"
READBACK_PATH = ROOT / "readback.json"
COMPATIBILITY_PATH = PLUGIN_ROOT / "skills/monday-runtime/references/compatibility-matrix.json"
PLUGIN_MANIFEST_PATH = PLUGIN_ROOT / ".codex-plugin/plugin.json"


class RuntimeErrorState(ValueError):
    pass


def now() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime | None = None) -> str:
    return (value or now()).astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_time(value: Any, name: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise RuntimeErrorState(f"{name} must be an ISO-8601 timestamp with timezone")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RuntimeErrorState(f"{name} must be an ISO-8601 timestamp with timezone") from exc
    if parsed.tzinfo is None:
        raise RuntimeErrorState(f"{name} must include a timezone")
    return parsed.astimezone(UTC)


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def identifier(value: Any, name: str) -> str:
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        raise RuntimeErrorState(f"{name} must be a bounded stable identifier")
    return value


def bounded_text(value: Any, name: str, maximum: int = 200) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum or "\n" in value or "\r" in value:
        raise RuntimeErrorState(f"{name} must be a non-empty single-line string no longer than {maximum} characters")
    if re.search(r"https?://|mailto:|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", value):
        raise RuntimeErrorState(f"{name} must not contain an address or locator")
    return value.strip()


def reject_private_fields(value: Any, path: str = "input") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in FORBIDDEN_KEYS:
                raise RuntimeErrorState(f"{path}.{key} is not permitted in the runtime envelope")
            reject_private_fields(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            reject_private_fields(child, f"{path}[{index}]")


def load_json(path: str | Path) -> dict[str, Any]:
    try:
        value = json.loads(Path(path).read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeErrorState(f"Unable to read valid JSON from {path}") from exc
    if not isinstance(value, dict):
        raise RuntimeErrorState("Input must be a JSON object")
    reject_private_fields(value)
    return value


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(handle, "w") as stream:
            json.dump(value, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def plugin_version() -> str:
    try:
        value = json.loads(PLUGIN_MANIFEST_PATH.read_text())
        return str(value.get("version", "unknown"))
    except (OSError, json.JSONDecodeError):
        return "unknown"


SCHEMA = """
CREATE TABLE IF NOT EXISTS workflows (
  workflow_id TEXT PRIMARY KEY,
  workflow_type TEXT NOT NULL,
  state TEXT NOT NULL,
  version INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  replay_safe INTEGER NOT NULL,
  consequential INTEGER NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retry_after TEXT,
  last_error_code TEXT,
  last_error_summary TEXT,
  retry_classification TEXT,
  replay_of TEXT
);
CREATE TABLE IF NOT EXISTS dead_letters (
  workflow_id TEXT PRIMARY KEY REFERENCES workflows(workflow_id),
  dead_letter_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  error_code TEXT NOT NULL,
  retry_classification TEXT NOT NULL,
  replayed_by TEXT
);
CREATE TABLE IF NOT EXISTS external_actions (
  action_id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  destination_system TEXT NOT NULL,
  destination_class TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  payload_class TEXT NOT NULL,
  scheduled_for TEXT,
  authorization_mode TEXT NOT NULL,
  standing_policy_id TEXT,
  summary TEXT NOT NULL,
  action_digest TEXT NOT NULL,
  state TEXT NOT NULL,
  version INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  confirmation_id TEXT,
  confirmation_actor TEXT,
  confirmation_digest TEXT,
  confirmed_at TEXT,
  confirmation_expires_at TEXT,
  attempt_id TEXT,
  attempted_at TEXT,
  native_request_hash TEXT,
  native_receipt_hash TEXT,
  verified_at TEXT,
  last_error_code TEXT,
  last_error_summary TEXT,
  failure_classification TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS confirmations (
  confirmation_id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES external_actions(action_id),
  confirmation_digest TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS standing_authorizations (
  policy_id TEXT PRIMARY KEY,
  action_kind TEXT NOT NULL,
  destination_system TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  payload_class TEXT NOT NULL,
  timezone TEXT NOT NULL,
  allowed_weekdays_json TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  authority_evidence_digest TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS diagnostics (
  category TEXT NOT NULL,
  item_id TEXT NOT NULL,
  state TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(category, item_id)
);
CREATE TABLE IF NOT EXISTS runtime_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_at TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  event_digest TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS runtime_events_no_update
BEFORE UPDATE ON runtime_events BEGIN SELECT RAISE(ABORT, 'runtime events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS runtime_events_no_delete
BEFORE DELETE ON runtime_events BEGIN SELECT RAISE(ABORT, 'runtime events are append-only'); END;
CREATE TABLE IF NOT EXISTS idempotency (
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(operation, idempotency_key)
);
CREATE TABLE IF NOT EXISTS migration_receipts (
  migration_id TEXT PRIMARY KEY,
  migration_kind TEXT NOT NULL,
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,
  artifact_digest TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime_meta (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  alert_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  safe_summary TEXT NOT NULL,
  status TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL,
  cooldown_until TEXT NOT NULL,
  acknowledged_at TEXT,
  resolved_at TEXT,
  resolution_evidence_digest TEXT,
  reopened_count INTEGER NOT NULL,
  version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alert_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id TEXT NOT NULL REFERENCES alerts(alert_id),
  event_type TEXT NOT NULL,
  event_at TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  event_digest TEXT NOT NULL UNIQUE
);
CREATE TRIGGER IF NOT EXISTS alert_events_no_update
BEFORE UPDATE ON alert_events BEGIN SELECT RAISE(ABORT, 'alert events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS alert_events_no_delete
BEFORE DELETE ON alert_events BEGIN SELECT RAISE(ABORT, 'alert events are append-only'); END;
"""


def open_database(write: bool) -> sqlite3.Connection:
    if write:
        ROOT.mkdir(parents=True, exist_ok=True)
        os.chmod(ROOT, 0o700)
        connection = sqlite3.connect(DATABASE_PATH)
        os.chmod(DATABASE_PATH, 0o600)
    else:
        if not DATABASE_PATH.exists():
            raise RuntimeErrorState("Runtime database is not initialized")
        connection = sqlite3.connect(f"file:{DATABASE_PATH}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    if write:
        migrate_database(connection)
    else:
        version = int(connection.execute("PRAGMA user_version").fetchone()[0])
        if version != DATABASE_VERSION:
            raise RuntimeErrorState(f"Runtime database version {version} is unsupported; expected {DATABASE_VERSION}")
    return connection


def migrate_database(connection: sqlite3.Connection) -> None:
    version = int(connection.execute("PRAGMA user_version").fetchone()[0])
    if version > DATABASE_VERSION:
        raise RuntimeErrorState(f"Runtime database version {version} is newer than supported version {DATABASE_VERSION}")
    if version == 0:
        connection.executescript(SCHEMA)
        applied = iso()
        schema_digest = hashlib.sha256(SCHEMA.encode()).hexdigest()
        connection.execute(
            "INSERT OR IGNORE INTO migration_receipts VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("runtime-database-0-to-1", "database", 0, 1, schema_digest, applied, "applied"),
        )
        connection.execute("PRAGMA user_version=1")
        connection.commit()
    version = int(connection.execute("PRAGMA user_version").fetchone()[0])
    if version == 1:
        backup_dir = ROOT / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        os.chmod(backup_dir, 0o700)
        backup_path = backup_dir / f"runtime-db-v1-{now().strftime('%Y%m%dT%H%M%SZ')}.sqlite3"
        backup = sqlite3.connect(backup_path)
        connection.backup(backup)
        backup.close()
        os.chmod(backup_path, 0o600)
        backup_digest = hashlib.sha256(backup_path.read_bytes()).hexdigest()
        verification = sqlite3.connect(f"file:{backup_path}?mode=ro", uri=True)
        try:
            if verification.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeErrorState("Pre-migration database backup failed integrity verification")
        finally:
            verification.close()
        try:
            connection.executescript("""
        CREATE TABLE IF NOT EXISTS alerts (
          alert_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, category TEXT NOT NULL,
          severity TEXT NOT NULL, title TEXT NOT NULL, safe_summary TEXT NOT NULL, status TEXT NOT NULL,
          source_kind TEXT NOT NULL, source_entity_id TEXT NOT NULL, evidence_digest TEXT NOT NULL,
          first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, occurrence_count INTEGER NOT NULL,
          cooldown_until TEXT NOT NULL, acknowledged_at TEXT, resolved_at TEXT,
          resolution_evidence_digest TEXT, reopened_count INTEGER NOT NULL, version INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS alert_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT, alert_id TEXT NOT NULL REFERENCES alerts(alert_id),
          event_type TEXT NOT NULL, event_at TEXT NOT NULL, status TEXT NOT NULL,
          evidence_digest TEXT NOT NULL, event_digest TEXT NOT NULL UNIQUE
        );
        CREATE TRIGGER IF NOT EXISTS alert_events_no_update
        BEFORE UPDATE ON alert_events BEGIN SELECT RAISE(ABORT, 'alert events are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS alert_events_no_delete
        BEFORE DELETE ON alert_events BEGIN SELECT RAISE(ABORT, 'alert events are append-only'); END;
            """)
            applied = iso()
            migration_digest = digest({"from": 1, "to": 2, "tables": ["alerts", "alert_events"], "backupDigest": backup_digest})
            connection.execute(
                "INSERT OR IGNORE INTO migration_receipts VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("runtime-database-1-to-2", "database", 1, 2, migration_digest, applied, f"applied-backup-{backup_digest[:12]}"),
            )
            connection.execute("INSERT OR REPLACE INTO runtime_meta VALUES (?,?)", ("databaseMigrationBackup", canonical({"path": str(backup_path), "digest": backup_digest, "verifiedAt": applied})))
            connection.execute("PRAGMA user_version=2")
            connection.commit()
        except Exception:
            connection.rollback()
            verified_backup = sqlite3.connect(f"file:{backup_path}?mode=ro", uri=True)
            try:
                verified_backup.backup(connection)
                connection.commit()
            finally:
                verified_backup.close()
            raise
        version = 2
    if version != DATABASE_VERSION:
        raise RuntimeErrorState(f"No registered migration to runtime database version {DATABASE_VERSION}")


def row_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def add_event(connection: sqlite3.Connection, kind: str, entity_id: str, event_type: str, version: int, snapshot: dict[str, Any], key: str, at: str) -> None:
    event = {
        "entityKind": kind,
        "entityID": entity_id,
        "eventType": event_type,
        "eventAt": at,
        "version": version,
        "snapshot": snapshot,
        "idempotencyKey": key,
    }
    connection.execute(
        "INSERT INTO runtime_events(entity_kind,entity_id,event_type,event_at,version,snapshot_json,event_digest,idempotency_key) VALUES (?,?,?,?,?,?,?,?)",
        (kind, entity_id, event_type, at, version, canonical(snapshot), digest(event), key),
    )


def idempotent_mutation(operation: str, request: dict[str, Any], callback: Callable[[sqlite3.Connection], dict[str, Any]], apply: bool) -> dict[str, Any]:
    key = identifier(request.get("idempotencyKey"), "idempotencyKey")
    request_digest = digest(request)
    if not apply:
        source = open_database(False)
        preview = sqlite3.connect(":memory:")
        preview.row_factory = sqlite3.Row
        preview.execute("PRAGMA foreign_keys=ON")
        try:
            source.backup(preview)
            existing = preview.execute("SELECT request_digest,response_json FROM idempotency WHERE operation=? AND idempotency_key=?", (operation, key)).fetchone()
            if existing:
                if existing["request_digest"] != request_digest:
                    raise RuntimeErrorState("Idempotency key was already used with different request content")
                response = json.loads(existing["response_json"])
            else:
                preview.execute("BEGIN")
                response = callback(preview)
                preview.rollback()
            return {**response, "applied": False, "dryRun": True}
        finally:
            source.close()
            preview.close()
    connection = open_database(True)
    try:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute(
            "SELECT request_digest,response_json FROM idempotency WHERE operation=? AND idempotency_key=?",
            (operation, key),
        ).fetchone()
        if existing:
            if existing["request_digest"] != request_digest:
                raise RuntimeErrorState("Idempotency key was already used with different request content")
            connection.rollback()
            cached = json.loads(existing["response_json"])
            return {**cached, "applied": True, "idempotentReplay": True}
        response = callback(connection)
        stored = {**response, "applied": True, "idempotentReplay": False}
        connection.execute(
            "INSERT INTO idempotency VALUES (?,?,?,?,?)",
            (operation, key, request_digest, canonical(stored), iso()),
        )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    publish_projection()
    return stored


def workflow_snapshot(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "workflowID": row["workflow_id"], "workflowType": row["workflow_type"], "state": row["state"],
        "version": row["version"], "attempts": row["attempts"], "maxAttempts": row["max_attempts"],
        "replaySafe": bool(row["replay_safe"]), "consequential": bool(row["consequential"]), "summary": row["summary"], "createdAt": row["created_at"],
        "updatedAt": row["updated_at"], "retryAfter": row.get("retry_after"), "lastErrorCode": row.get("last_error_code"),
        "lastErrorSummary": row.get("last_error_summary"), "retryClassification": row.get("retry_classification"),
        "replayOf": row.get("replay_of"),
    }


def action_snapshot(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "actionID": row["action_id"], "actionType": row["action_type"], "destinationSystem": row["destination_system"],
        "destinationClass": row["destination_class"], "targetHash": row["target_hash"], "payloadDigest": row["payload_digest"], "payloadClass": row["payload_class"],
        "scheduledFor": row.get("scheduled_for"), "authorizationMode": row["authorization_mode"], "standingPolicyID": row.get("standing_policy_id"), "summary": row["summary"],
        "actionDigest": row["action_digest"], "state": row["state"], "version": row["version"],
        "attemptCount": row["attempt_count"], "maxAttempts": row["max_attempts"], "confirmationID": row.get("confirmation_id"),
        "confirmationActor": row.get("confirmation_actor"), "confirmationDigest": row.get("confirmation_digest"),
        "confirmedAt": row.get("confirmed_at"), "confirmationExpiresAt": row.get("confirmation_expires_at"),
        "attemptID": row.get("attempt_id"), "attemptedAt": row.get("attempted_at"),
        "nativeRequestHash": row.get("native_request_hash"), "nativeReceiptHash": row.get("native_receipt_hash"),
        "verifiedAt": row.get("verified_at"), "lastErrorCode": row.get("last_error_code"),
        "lastErrorSummary": row.get("last_error_summary"), "failureClassification": row.get("failure_classification"),
        "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    }


def standing_policy_snapshot(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "policyID": row["policy_id"], "actionKind": row["action_kind"], "destinationSystem": row["destination_system"],
        "targetHash": row["target_hash"], "payloadClass": row["payload_class"], "timezone": row["timezone"],
        "allowedWeekdays": json.loads(row["allowed_weekdays_json"]), "windowStart": row["window_start"], "windowEnd": row["window_end"],
        "expiresAt": row["expires_at"], "revokedAt": row["revoked_at"], "authorityEvidenceDigest": row["authority_evidence_digest"],
        "version": row["version"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    }


def standing_authorization(request: dict[str, Any], apply: bool) -> dict[str, Any]:
    policy_id = identifier(request.get("policyID"), "policyID")
    event = request.get("event")
    if event not in {"register", "revoke"}:
        raise RuntimeErrorState("Standing authorization event must be register or revoke")

    def mutate(connection: sqlite3.Connection) -> dict[str, Any]:
        existing = connection.execute("SELECT * FROM standing_authorizations WHERE policy_id=?", (policy_id,)).fetchone()
        occurred = iso(parse_time(request["occurredAt"], "occurredAt")) if request.get("occurredAt") else iso()
        if event == "register":
            if existing:
                raise RuntimeErrorState("Standing authorization policyID already exists")
            kind = identifier(request.get("actionKind"), "actionKind")
            system = identifier(request.get("destinationSystem"), "destinationSystem")
            target = request.get("boundedTarget")
            if not isinstance(target, str) or not target or len(target) > 512:
                raise RuntimeErrorState("boundedTarget is required and limited to 512 characters")
            payload_class = identifier(request.get("payloadClass"), "payloadClass")
            timezone_name = request.get("timezone")
            if not isinstance(timezone_name, str):
                raise RuntimeErrorState("timezone is required")
            try:
                ZoneInfo(timezone_name)
            except ZoneInfoNotFoundError as exc:
                raise RuntimeErrorState("timezone is invalid") from exc
            weekdays = request.get("allowedWeekdays")
            if not isinstance(weekdays, list) or not weekdays or any(not isinstance(day, int) or day < 1 or day > 7 for day in weekdays) or len(set(weekdays)) != len(weekdays):
                raise RuntimeErrorState("allowedWeekdays must contain unique ISO weekday integers")
            window_start, window_end = request.get("windowStart"), request.get("windowEnd")
            if not isinstance(window_start, str) or not isinstance(window_end, str) or not re.fullmatch(r"[0-2]\d:[0-5]\d", window_start) or not re.fullmatch(r"[0-2]\d:[0-5]\d", window_end) or window_start > "23:59" or window_end > "23:59" or window_start > window_end:
                raise RuntimeErrorState("Standing authorization requires a same-day HH:MM window")
            expires = parse_time(request.get("expiresAt"), "expiresAt")
            if expires <= parse_time(occurred, "occurredAt"):
                raise RuntimeErrorState("Standing authorization expiry must be in the future")
            evidence_digest = request.get("authorityEvidenceDigest")
            if not isinstance(evidence_digest, str) or not HASH_PATTERN.fullmatch(evidence_digest):
                raise RuntimeErrorState("authorityEvidenceDigest must be a SHA-256 digest")
            connection.execute(
                "INSERT INTO standing_authorizations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (policy_id, kind, system, hashlib.sha256(target.encode()).hexdigest(), payload_class, timezone_name, canonical(sorted(weekdays)), window_start, window_end, iso(expires), None, evidence_digest, 1, occurred, occurred),
            )
            version = 1
            status_value = "registered"
        else:
            if not existing:
                raise RuntimeErrorState("Unknown standing authorization policyID")
            require_version(existing, request)
            if existing["revoked_at"]:
                raise RuntimeErrorState("Standing authorization is already revoked")
            version = existing["version"] + 1
            connection.execute("UPDATE standing_authorizations SET revoked_at=?,version=?,updated_at=? WHERE policy_id=?", (occurred, version, occurred, policy_id))
            status_value = "revoked"
        row = row_dict(connection.execute("SELECT * FROM standing_authorizations WHERE policy_id=?", (policy_id,)).fetchone())
        add_event(connection, "standing-authorization", policy_id, event, version, standing_policy_snapshot(row), request["idempotencyKey"], occurred)
        return {"status": status_value, "policyID": policy_id, "version": version}

    return idempotent_mutation("standing-authorization", request, mutate, apply)


def workflow_start(request: dict[str, Any], apply: bool) -> dict[str, Any]:
    workflow_id = identifier(request.get("workflowID"), "workflowID")
    workflow_type = identifier(request.get("workflowType"), "workflowType")
    summary = bounded_text(request.get("summary"), "summary", 160)
    max_attempts = request.get("maxAttempts", 3)
    if not isinstance(max_attempts, int) or not 1 <= max_attempts <= 10:
        raise RuntimeErrorState("maxAttempts must be an integer from 1 through 10")
    if not isinstance(request.get("replaySafe"), bool):
        raise RuntimeErrorState("replaySafe must be explicitly true or false")
    if not isinstance(request.get("consequential", False), bool):
        raise RuntimeErrorState("consequential must be true or false")

    def mutate(connection: sqlite3.Connection) -> dict[str, Any]:
        if connection.execute("SELECT 1 FROM workflows WHERE workflow_id=?", (workflow_id,)).fetchone():
            raise RuntimeErrorState("workflowID already exists")
        created = iso(parse_time(request["createdAt"], "createdAt")) if request.get("createdAt") else iso()
        values = (workflow_id, workflow_type, "queued", 1, 0, max_attempts, int(request["replaySafe"]), int(request.get("consequential", False)), summary, created, created, None, None, None, None, None)
        connection.execute("INSERT INTO workflows VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", values)
        row = row_dict(connection.execute("SELECT * FROM workflows WHERE workflow_id=?", (workflow_id,)).fetchone())
        snapshot = workflow_snapshot(row)
        add_event(connection, "workflow", workflow_id, "created", 1, snapshot, request["idempotencyKey"], created)
        return {"status": "queued", "workflowID": workflow_id, "version": 1}

    return idempotent_mutation("workflow-start", request, mutate, apply)


def require_version(row: sqlite3.Row, request: dict[str, Any]) -> int:
    expected = request.get("expectedVersion")
    if not isinstance(expected, int):
        raise RuntimeErrorState("expectedVersion is required")
    if row["version"] != expected:
        raise RuntimeErrorState(f"Version conflict: expected {expected}, found {row['version']}")
    return expected


def workflow_transition(request: dict[str, Any], apply: bool) -> dict[str, Any]:
    workflow_id = identifier(request.get("workflowID"), "workflowID")
    event = request.get("event")
    if event not in {"start", "complete", "fail", "retry", "cancel"}:
        raise RuntimeErrorState("Unsupported workflow event")
    if not isinstance(request.get("expectedVersion"), int):
        raise RuntimeErrorState("expectedVersion is required")

    def mutate(connection: sqlite3.Connection) -> dict[str, Any]:
        selected = connection.execute("SELECT * FROM workflows WHERE workflow_id=?", (workflow_id,)).fetchone()
        if not selected:
            raise RuntimeErrorState("Unknown workflowID")
        require_version(selected, request)
        row = row_dict(selected)
        current = parse_time(request["occurredAt"], "occurredAt") if request.get("occurredAt") else now()
        old_state = row["state"]
        if event == "start":
            if old_state != "queued":
                raise RuntimeErrorState("Only a queued workflow can start")
            row["state"] = "running"
            row["attempts"] += 1
        elif event == "complete":
            if old_state != "running":
                raise RuntimeErrorState("Only a running workflow can complete")
            row["state"] = "completed"
        elif event == "cancel":
            if old_state not in {"queued", "retry-wait"}:
                raise RuntimeErrorState("Only a queued or retry-wait workflow can cancel")
            row["state"] = "cancelled"
        elif event == "retry":
            if old_state != "retry-wait":
                raise RuntimeErrorState("Only a retry-wait workflow can retry")
            if row["retry_after"] and current < parse_time(row["retry_after"], "retryAfter"):
                raise RuntimeErrorState("Retry is not due yet")
            if row["attempts"] >= row["max_attempts"]:
                raise RuntimeErrorState("Retry budget is exhausted")
            row["state"] = "running"
            row["attempts"] += 1
            row["retry_after"] = None
        else:
            if old_state != "running":
                raise RuntimeErrorState("Only a running workflow can fail")
            error = request.get("error")
            if not isinstance(error, dict):
                raise RuntimeErrorState("A bounded error object is required")
            code = identifier(error.get("code"), "error.code")
            summary = bounded_text(error.get("summary"), "error.summary", 160)
            classification = error.get("classification")
            if classification not in {"transient", "permanent", "uncertain"}:
                raise RuntimeErrorState("error.classification must be transient, permanent, or uncertain")
            row["last_error_code"] = code
            row["last_error_summary"] = summary
            row["retry_classification"] = classification
            exhausted = row["attempts"] >= row["max_attempts"]
            if classification == "transient" and not exhausted:
                retry_after = parse_time(request.get("retryAfter"), "retryAfter")
                if retry_after <= current:
                    raise RuntimeErrorState("retryAfter must be after the failure time")
                row["state"] = "retry-wait"
                row["retry_after"] = iso(retry_after)
            else:
                row["state"] = "dead-letter"
                row["retry_after"] = None
        row["version"] += 1
        row["updated_at"] = iso(current)
        connection.execute(
            "UPDATE workflows SET state=?,version=?,attempts=?,updated_at=?,retry_after=?,last_error_code=?,last_error_summary=?,retry_classification=? WHERE workflow_id=?",
            (row["state"], row["version"], row["attempts"], row["updated_at"], row["retry_after"], row["last_error_code"], row["last_error_summary"], row["retry_classification"], workflow_id),
        )
        snapshot = workflow_snapshot(row)
        add_event(connection, "workflow", workflow_id, event, row["version"], snapshot, request["idempotencyKey"], row["updated_at"])
        response: dict[str, Any] = {"status": row["state"], "workflowID": workflow_id, "version": row["version"], "attempts": row["attempts"]}
        if row["state"] == "dead-letter":
            letter = {"workflowID": workflow_id, "workflowVersion": row["version"], "snapshotDigest": digest(snapshot), "errorCode": row["last_error_code"], "classification": row["retry_classification"], "createdAt": row["updated_at"]}
            letter_digest = digest(letter)
            connection.execute(
                "INSERT INTO dead_letters VALUES (?,?,?,?,?,NULL)",
                (workflow_id, letter_digest, row["updated_at"], row["last_error_code"], row["retry_classification"]),
            )
            response["deadLetterDigest"] = letter_digest
        return response

    return idempotent_mutation("workflow-transition", request, mutate, apply)


def workflow_replay(request: dict[str, Any], apply: bool) -> dict[str, Any]:
    source_id = identifier(request.get("workflowID"), "workflowID")
    new_id = identifier(request.get("newWorkflowID"), "newWorkflowID")
    supplied_digest = request.get("deadLetterDigest")
    if not isinstance(supplied_digest, str) or not HASH_PATTERN.fullmatch(supplied_digest):
        raise RuntimeErrorState("deadLetterDigest must be a SHA-256 digest")
    bounded_text(request.get("reason"), "reason", 160)
    if not isinstance(request.get("expectedVersion"), int):
        raise RuntimeErrorState("expectedVersion is required")

    def mutate(connection: sqlite3.Connection) -> dict[str, Any]:
        selected = connection.execute("SELECT * FROM workflows WHERE workflow_id=?", (source_id,)).fetchone()
        letter = connection.execute("SELECT * FROM dead_letters WHERE workflow_id=?", (source_id,)).fetchone()
        if not selected or not letter:
            raise RuntimeErrorState("Replay requires an existing dead letter")
        require_version(selected, request)
        if selected["state"] != "dead-letter" or not selected["replay_safe"]:
            raise RuntimeErrorState("Workflow is not replay eligible")
        if selected["workflow_type"] == "external-action" or selected["workflow_type"].startswith("external-action:"):
            raise RuntimeErrorState("External actions cannot use workflow replay")
        if letter["dead_letter_digest"] != supplied_digest:
            raise RuntimeErrorState("Dead-letter digest mismatch")
        if letter["replayed_by"]:
            raise RuntimeErrorState("Dead letter has already been replayed")
        if connection.execute("SELECT 1 FROM workflows WHERE workflow_id=?", (new_id,)).fetchone():
            raise RuntimeErrorState("newWorkflowID already exists")
        created = iso()
        connection.execute(
            "INSERT INTO workflows VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (new_id, selected["workflow_type"], "queued", 1, 0, selected["max_attempts"], selected["replay_safe"], selected["consequential"], selected["summary"], created, created, None, None, None, None, source_id),
        )
        connection.execute("UPDATE dead_letters SET replayed_by=? WHERE workflow_id=?", (new_id, source_id))
        original_version = selected["version"] + 1
        connection.execute("UPDATE workflows SET version=?,updated_at=? WHERE workflow_id=?", (original_version, created, source_id))
        new_row = row_dict(connection.execute("SELECT * FROM workflows WHERE workflow_id=?", (new_id,)).fetchone())
        source_row = row_dict(connection.execute("SELECT * FROM workflows WHERE workflow_id=?", (source_id,)).fetchone())
        add_event(connection, "workflow", source_id, "replayed", original_version, workflow_snapshot(source_row), request["idempotencyKey"], created)
        add_event(connection, "workflow", new_id, "created-from-replay", 1, workflow_snapshot(new_row), request["idempotencyKey"], created)
        return {"status": "queued", "workflowID": new_id, "version": 1, "replayOf": source_id, "sourceVersion": original_version}

    return idempotent_mutation("workflow-replay", request, mutate, apply)


def action_propose(request: dict[str, Any], apply: bool) -> dict[str, Any]:
    action_id = identifier(request.get("actionID"), "actionID")
    action_type = identifier(request.get("actionType"), "actionType")
    system = identifier(request.get("destinationSystem"), "destinationSystem")
    destination_class = identifier(request.get("destinationClass"), "destinationClass")
    target = request.get("boundedTarget")
    if not isinstance(target, str) or not target or len(target) > 512:
        raise RuntimeErrorState("boundedTarget is required and limited to 512 characters")
    summary = bounded_text(request.get("summary"), "summary", 160)
    payload_digest = request.get("payloadDigest")
    if not isinstance(payload_digest, str) or not HASH_PATTERN.fullmatch(payload_digest):
        raise RuntimeErrorState("payloadDigest must be a SHA-256 digest of the exact outbound payload")
    payload_class = identifier(request.get("payloadClass"), "payloadClass")
    authorization_mode = request.get("authorizationMode", "user-confirmation")
    if authorization_mode not in {"user-confirmation", "standing-authorization"}:
        raise RuntimeErrorState("authorizationMode must be user-confirmation or standing-authorization")
    standing_policy_id = request.get("standingAuthorizationID")
    scheduled_for = request.get("scheduledFor")
    if authorization_mode == "standing-authorization":
        standing_policy_id = identifier(standing_policy_id, "standingAuthorizationID")
        scheduled_for = iso(parse_time(scheduled_for, "scheduledFor"))
    elif standing_policy_id is not None or scheduled_for is not None:
        raise RuntimeErrorState("Standing authorization fields cannot be used with user confirmation")
    max_attempts = request.get("maxAttempts", 1)
    if not isinstance(max_attempts, int) or not 1 <= max_attempts <= 3:
        raise RuntimeErrorState("External action maxAttempts must be from 1 through 3")
    spec = {"actionID": action_id, "actionType": action_type, "destinationSystem": system, "destinationClass": destination_class, "targetHash": hashlib.sha256(target.encode()).hexdigest(), "payloadDigest": payload_digest, "payloadClass": payload_class, "scheduledFor": scheduled_for, "authorizationMode": authorization_mode, "standingPolicyID": standing_policy_id, "summary": summary, "maxAttempts": max_attempts}
    action_digest = digest(spec)

    def mutate(connection: sqlite3.Connection) -> dict[str, Any]:
        if connection.execute("SELECT 1 FROM external_actions WHERE action_id=?", (action_id,)).fetchone():
            raise RuntimeErrorState("actionID already exists")
        created = iso()
        initial_state = "confirmation-required"
        confirmation_id = confirmation_actor = confirmation_digest = confirmed_at = confirmation_expires_at = None
        if authorization_mode == "standing-authorization":
            policy = connection.execute("SELECT * FROM standing_authorizations WHERE policy_id=?", (standing_policy_id,)).fetchone()
            if not policy or policy["revoked_at"]:
                raise RuntimeErrorState("Standing authorization is unavailable or revoked")
            scheduled = parse_time(scheduled_for, "scheduledFor")
            if scheduled > parse_time(policy["expires_at"], "policy.expiresAt"):
                raise RuntimeErrorState("Action falls after standing authorization expiry")
            if policy["action_kind"] != action_type or policy["destination_system"] != system or policy["target_hash"] != spec["targetHash"] or policy["payload_class"] != payload_class:
                raise RuntimeErrorState("Action is outside the exact standing authorization scope")
            try:
                local = scheduled.astimezone(ZoneInfo(policy["timezone"]))
            except ZoneInfoNotFoundError as exc:
                raise RuntimeErrorState("Standing authorization timezone is invalid") from exc
            if local.isoweekday() not in json.loads(policy["allowed_weekdays_json"]):
                raise RuntimeErrorState("Action day is outside standing authorization scope")
            local_time = local.strftime("%H:%M")
            if not policy["window_start"] <= local_time <= policy["window_end"]:
                raise RuntimeErrorState("Action time is outside standing authorization scope")
            confirmation_id = f"standing-{standing_policy_id}-{action_id}"
            confirmation_actor = f"standing-policy:{standing_policy_id}"
            confirmed_at = created
            confirmation_expires_at = iso(min(parse_time(policy["expires_at"], "policy.expiresAt"), scheduled + timedelta(minutes=15)))
            binding = {"actionID": action_id, "kind": action_type, "targetHash": spec["targetHash"], "payloadDigest": payload_digest, "actor": confirmation_actor, "issuedAt": confirmed_at, "expiresAt": confirmation_expires_at, "confirmationID": confirmation_id}
            confirmation_digest = digest(binding)
            initial_state = "confirmed"
        connection.execute(
            """INSERT INTO external_actions(action_id,action_type,destination_system,destination_class,target_hash,payload_digest,payload_class,scheduled_for,authorization_mode,standing_policy_id,summary,action_digest,state,version,attempt_count,max_attempts,confirmation_id,confirmation_actor,confirmation_digest,confirmed_at,confirmation_expires_at,attempt_id,attempted_at,native_request_hash,native_receipt_hash,verified_at,last_error_code,last_error_summary,failure_classification,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (action_id, action_type, system, destination_class, spec["targetHash"], payload_digest, payload_class, scheduled_for, authorization_mode, standing_policy_id, summary, action_digest, initial_state, 1, 0, max_attempts, confirmation_id, confirmation_actor, confirmation_digest, confirmed_at, confirmation_expires_at, None, None, None, None, None, None, None, None, created, created),
        )
        if authorization_mode == "standing-authorization":
            connection.execute("INSERT INTO confirmations VALUES (?,?,?,?,?,NULL)", (confirmation_id, action_id, confirmation_digest, confirmed_at, confirmation_expires_at))
        row = row_dict(connection.execute("SELECT * FROM external_actions WHERE action_id=?", (action_id,)).fetchone())
        add_event(connection, "external-action", action_id, "proposed", 1, action_snapshot(row), request["idempotencyKey"], created)
        return {"status": initial_state, "actionID": action_id, "actionDigest": action_digest, "version": 1, "authorizationMode": authorization_mode}

    return idempotent_mutation("action-propose", request, mutate, apply)


def action_transition(request: dict[str, Any], apply: bool) -> dict[str, Any]:
    action_id = identifier(request.get("actionID"), "actionID")
    event = request.get("event")
    if event not in {"confirm", "begin", "record-attempt", "verify", "fail", "resolve-no-effect", "cancel"}:
        raise RuntimeErrorState("Unsupported action event")
    supplied_digest = request.get("actionDigest")
    if not isinstance(supplied_digest, str) or not HASH_PATTERN.fullmatch(supplied_digest):
        raise RuntimeErrorState("actionDigest must be a SHA-256 digest")
    if not isinstance(request.get("expectedVersion"), int):
        raise RuntimeErrorState("expectedVersion is required")

    def mutate(connection: sqlite3.Connection) -> dict[str, Any]:
        selected = connection.execute("SELECT * FROM external_actions WHERE action_id=?", (action_id,)).fetchone()
        if not selected:
            raise RuntimeErrorState("Unknown actionID")
        require_version(selected, request)
        if selected["action_digest"] != supplied_digest:
            raise RuntimeErrorState("Action digest mismatch")
        row = row_dict(selected)
        old_state = row["state"]
        current = parse_time(request["occurredAt"], "occurredAt") if request.get("occurredAt") else now()
        if event == "confirm":
            if row["authorization_mode"] != "user-confirmation":
                raise RuntimeErrorState("Standing-authorized actions cannot use the user-confirmation path")
            if old_state not in {"confirmation-required", "failed-before-dispatch"}:
                raise RuntimeErrorState("Action is not eligible for confirmation")
            if old_state == "failed-before-dispatch" and row["attempt_count"] >= row["max_attempts"]:
                raise RuntimeErrorState("External action attempt budget is exhausted")
            confirmation_id = identifier(request.get("confirmationID"), "confirmationID")
            actor = identifier(request.get("actor"), "actor")
            confirmed = parse_time(request.get("issuedAt"), "issuedAt")
            expires = parse_time(request.get("confirmationExpiresAt"), "confirmationExpiresAt")
            if confirmed > current + timedelta(minutes=5) or expires <= confirmed or expires <= current or expires - confirmed > timedelta(hours=24):
                raise RuntimeErrorState("Confirmation must be current and have a future expiry")
            binding = {"actionID": row["action_id"], "kind": row["action_type"], "targetHash": row["target_hash"], "payloadDigest": row["payload_digest"], "actor": actor, "issuedAt": iso(confirmed), "expiresAt": iso(expires), "confirmationID": confirmation_id}
            confirmation_digest = digest(binding)
            connection.execute("INSERT INTO confirmations VALUES (?,?,?,?,?,NULL)", (confirmation_id, action_id, confirmation_digest, iso(confirmed), iso(expires)))
            row.update({"state": "confirmed", "confirmation_id": confirmation_id, "confirmation_actor": actor, "confirmation_digest": confirmation_digest, "confirmed_at": iso(confirmed), "confirmation_expires_at": iso(expires), "attempt_id": None, "attempted_at": None, "native_request_hash": None, "native_receipt_hash": None, "verified_at": None, "last_error_code": None, "last_error_summary": None, "failure_classification": None})
        elif event == "begin":
            if old_state != "confirmed":
                raise RuntimeErrorState("Only a confirmed action can begin")
            if current >= parse_time(row["confirmation_expires_at"], "confirmationExpiresAt"):
                raise RuntimeErrorState("Confirmation has expired")
            if row["authorization_mode"] == "standing-authorization":
                policy = connection.execute("SELECT * FROM standing_authorizations WHERE policy_id=?", (row["standing_policy_id"],)).fetchone()
                if not policy or policy["revoked_at"] or current > parse_time(policy["expires_at"], "policy.expiresAt"):
                    raise RuntimeErrorState("Standing authorization was revoked, expired, or removed")
                if current < parse_time(row["scheduled_for"], "scheduledFor"):
                    raise RuntimeErrorState("Standing-authorized action cannot begin before its exact scheduled time")
            if row["attempt_count"] >= row["max_attempts"]:
                raise RuntimeErrorState("External action attempt budget is exhausted")
            row["state"] = "attempting"
            row["attempt_count"] += 1
            row["attempt_id"] = f"attempt-{secrets.token_hex(12)}"
            consumed = connection.execute("UPDATE confirmations SET used_at=? WHERE confirmation_id=? AND used_at IS NULL", (iso(current), row["confirmation_id"]))
            if consumed.rowcount != 1:
                raise RuntimeErrorState("Confirmation was already consumed")
        elif event == "record-attempt":
            if old_state != "attempting" or request.get("attemptID") != row["attempt_id"]:
                raise RuntimeErrorState("Attempt receipt does not match the active attempt")
            attempted = parse_time(request.get("attemptedAt"), "attemptedAt")
            native_hash = request.get("nativeRequestHash")
            if native_hash is not None and (not isinstance(native_hash, str) or not HASH_PATTERN.fullmatch(native_hash)):
                raise RuntimeErrorState("nativeRequestHash must be a SHA-256 digest")
            row.update({"state": "attempted", "attempted_at": iso(attempted), "native_request_hash": native_hash})
        elif event == "verify":
            if old_state not in {"attempted", "indeterminate"} or request.get("attemptID") != row["attempt_id"]:
                raise RuntimeErrorState("Only the matching attempted or indeterminate action can be verified")
            readback = request.get("readback")
            if not isinstance(readback, dict) or set(readback) != {"system", "observedAt", "outcome", "receiptHash", "actionDigest", "attemptID", "confirmationID"}:
                raise RuntimeErrorState("Destination-native readback fields are incomplete")
            if readback["system"] != row["destination_system"] or readback["actionDigest"] != row["action_digest"] or readback["attemptID"] != row["attempt_id"] or readback["confirmationID"] != row["confirmation_id"] or readback["outcome"] != "verified":
                raise RuntimeErrorState("Destination-native readback does not match this action")
            receipt_hash = readback["receiptHash"]
            if not isinstance(receipt_hash, str) or not HASH_PATTERN.fullmatch(receipt_hash):
                raise RuntimeErrorState("receiptHash must be a SHA-256 digest")
            observed = parse_time(readback["observedAt"], "readback.observedAt")
            if row["attempted_at"] and observed < parse_time(row["attempted_at"], "attemptedAt"):
                raise RuntimeErrorState("Readback predates the attempt")
            if observed > now() + timedelta(minutes=5):
                raise RuntimeErrorState("Readback is implausibly in the future")
            row.update({"state": "verified", "native_receipt_hash": receipt_hash, "verified_at": iso(observed)})
        elif event == "fail":
            if old_state not in {"attempting", "attempted"} or request.get("attemptID") != row["attempt_id"]:
                raise RuntimeErrorState("Failure does not match the active attempt")
            error = request.get("error")
            if not isinstance(error, dict):
                raise RuntimeErrorState("A bounded error object is required")
            code = identifier(error.get("code"), "error.code")
            summary = bounded_text(error.get("summary"), "error.summary", 160)
            classification = error.get("classification")
            if classification not in {"transient", "permanent", "uncertain"}:
                raise RuntimeErrorState("error.classification must be transient, permanent, or uncertain")
            dispatch_state = error.get("dispatchState")
            if old_state == "attempting" and dispatch_state == "not-dispatched" and classification != "uncertain":
                next_state = "failed-before-dispatch"
            else:
                next_state = "indeterminate"
            row.update({"state": next_state, "last_error_code": code, "last_error_summary": summary, "failure_classification": classification})
        elif event == "resolve-no-effect":
            if old_state != "indeterminate" or request.get("attemptID") != row["attempt_id"]:
                raise RuntimeErrorState("Only the matching indeterminate action can be resolved as no-effect")
            readback = request.get("readback")
            if not isinstance(readback, dict) or set(readback) != {"system", "observedAt", "outcome", "receiptHash", "actionDigest", "attemptID", "confirmationID"}:
                raise RuntimeErrorState("Destination-native absence readback fields are incomplete")
            if readback["system"] != row["destination_system"] or readback["actionDigest"] != row["action_digest"] or readback["attemptID"] != row["attempt_id"] or readback["confirmationID"] != row["confirmation_id"] or readback["outcome"] != "verified-no-effect":
                raise RuntimeErrorState("Destination-native absence readback does not match this action")
            receipt_hash = readback["receiptHash"]
            if not isinstance(receipt_hash, str) or not HASH_PATTERN.fullmatch(receipt_hash):
                raise RuntimeErrorState("receiptHash must be a SHA-256 digest")
            observed = parse_time(readback["observedAt"], "readback.observedAt")
            row.update({"state": "failed-before-dispatch", "native_receipt_hash": receipt_hash, "failure_classification": "verified-no-effect", "last_error_code": "verified-no-effect", "last_error_summary": "Destination-native readback verified that no effect occurred."})
        else:
            if old_state not in {"confirmation-required", "confirmed", "failed-before-dispatch"}:
                raise RuntimeErrorState("Action cannot be cancelled from its current state")
            row["state"] = "cancelled"
        row["version"] += 1
        row["updated_at"] = iso(current)
        connection.execute(
            """UPDATE external_actions SET state=?,version=?,attempt_count=?,confirmation_id=?,confirmation_actor=?,confirmation_digest=?,confirmed_at=?,confirmation_expires_at=?,attempt_id=?,attempted_at=?,native_request_hash=?,native_receipt_hash=?,verified_at=?,last_error_code=?,last_error_summary=?,failure_classification=?,updated_at=? WHERE action_id=?""",
            (row["state"], row["version"], row["attempt_count"], row["confirmation_id"], row["confirmation_actor"], row["confirmation_digest"], row["confirmed_at"], row["confirmation_expires_at"], row["attempt_id"], row["attempted_at"], row["native_request_hash"], row["native_receipt_hash"], row["verified_at"], row["last_error_code"], row["last_error_summary"], row["failure_classification"], row["updated_at"], action_id),
        )
        snapshot = action_snapshot(row)
        add_event(connection, "external-action", action_id, event, row["version"], snapshot, request["idempotencyKey"], row["updated_at"])
        response = {"status": row["state"], "actionID": action_id, "actionDigest": row["action_digest"], "version": row["version"], "attemptCount": row["attempt_count"]}
        if event == "begin":
            response["attemptID"] = row["attempt_id"]
        return response

    return idempotent_mutation("action-transition", request, mutate, apply)


DIAGNOSTIC_FIELDS = {
    "commitments": {"title", "ownerLabel", "dueAt", "consequence", "evidenceStatus", "decisionIDs"},
    "decisions": {"title", "ownerLabel", "decidedAt", "evidenceStatus", "commitmentIDs"},
    "sources": {"scopeLabel", "attemptedAt", "succeededAt", "itemCount", "processedCount", "unresolvedCount", "freshness", "errorCode"},
    "connections": {"sourceID", "authenticationState", "coverageState", "lastCheckedAt", "diagnosticCodes", "signalClass", "failureCount60m", "deadlineAt", "appKnownRunning", "readbackAgeMinutes", "blockedMinutes", "consequential", "leaseAgeMinutes", "verifiedResolvedAt"},
}

DIAGNOSTIC_REQUIRED = {
    "commitments": {"title", "ownerLabel", "consequence", "evidenceStatus", "decisionIDs"},
    "decisions": {"title", "ownerLabel", "evidenceStatus", "commitmentIDs"},
    "sources": {"scopeLabel", "itemCount", "processedCount", "unresolvedCount", "freshness"},
    "connections": {"sourceID", "authenticationState", "coverageState", "lastCheckedAt", "diagnosticCodes"},
}


def stage_diagnostic(request: dict[str, Any], apply: bool) -> dict[str, Any]:
    category = request.get("category")
    if category not in DIAGNOSTIC_FIELDS:
        raise RuntimeErrorState("Unsupported diagnostic category")
    item_id = identifier(request.get("itemID"), "itemID")
    state = identifier(request.get("state"), "state")
    detail = request.get("detail", {})
    if not isinstance(detail, dict) or not set(detail).issubset(DIAGNOSTIC_FIELDS[category]) or not DIAGNOSTIC_REQUIRED[category].issubset(detail):
        raise RuntimeErrorState("Diagnostic detail contains unsupported fields")
    reject_private_fields(detail)
    for key, value in detail.items():
        if key.endswith("At") and value is not None:
            parse_time(value, f"detail.{key}")
        elif key.endswith("Count") and (not isinstance(value, int) or value < 0):
            raise RuntimeErrorState(f"detail.{key} must be a non-negative integer")
        elif isinstance(value, list):
            if any(not isinstance(item, str) or not ID_PATTERN.fullmatch(item) for item in value):
                raise RuntimeErrorState(f"detail.{key} must contain bounded identifiers")
        elif value is not None and not isinstance(value, (str, int, bool)):
            raise RuntimeErrorState(f"detail.{key} has an invalid type")
        elif isinstance(value, str):
            bounded_text(value, f"detail.{key}", 120)
    if category == "sources":
        if detail["processedCount"] + detail["unresolvedCount"] > detail["itemCount"]:
            raise RuntimeErrorState("Source diagnostic denominators are inconsistent")
    if category == "connections" and detail["authenticationState"] != "authenticated" and detail["coverageState"] == "complete":
        raise RuntimeErrorState("Unauthenticated connection cannot claim complete coverage")

    def mutate(connection: sqlite3.Connection) -> dict[str, Any]:
        existing = connection.execute("SELECT * FROM diagnostics WHERE category=? AND item_id=?", (category, item_id)).fetchone()
        expected = request.get("expectedVersion")
        if existing:
            if not isinstance(expected, int) or expected != existing["version"]:
                raise RuntimeErrorState("Diagnostic update requires its current expectedVersion")
            version = existing["version"] + 1
        else:
            if expected not in {None, 0}:
                raise RuntimeErrorState("A new diagnostic expects version 0 or no version")
            version = 1
        updated = iso(parse_time(request["updatedAt"], "updatedAt")) if request.get("updatedAt") else iso()
        connection.execute(
            "INSERT INTO diagnostics VALUES (?,?,?,?,?,?) ON CONFLICT(category,item_id) DO UPDATE SET state=excluded.state,detail_json=excluded.detail_json,version=excluded.version,updated_at=excluded.updated_at",
            (category, item_id, state, canonical(detail), version, updated),
        )
        snapshot = {"category": category, "itemID": item_id, "state": state, "detail": detail, "version": version, "updatedAt": updated}
        add_event(connection, "diagnostic", f"{category}:{item_id}", "staged", version, snapshot, request["idempotencyKey"], updated)
        return {"status": "staged", "category": category, "itemID": item_id, "version": version}

    return idempotent_mutation("stage-diagnostic", request, mutate, apply)


def semver(value: str) -> tuple[int, int, int]:
    match = re.match(r"^(\d+)\.(\d+)\.(\d+)", value)
    if not match:
        raise RuntimeErrorState(f"Invalid application version: {value}")
    return tuple(int(part) for part in match.groups())


def app_compatible(value: str) -> bool:
    parsed = semver(value)
    return semver(MIN_APP_VERSION) <= parsed < semver(MAX_APP_VERSION)


def compatibility_check(app_version: str, projection_schema: int, plugin: str | None = None, capability: str | None = None, database_schema: int | None = None, readback_schema: int | None = None) -> dict[str, Any]:
    issues = []
    if projection_schema != PROJECTION_VERSION:
        issues.append("unsupported-projection-schema")
    if plugin is not None and plugin != plugin_version():
        issues.append("plugin-version-mismatch")
    if capability is not None and capability != CAPABILITY_VERSION:
        issues.append("capability-version-mismatch")
    if database_schema is not None and database_schema != DATABASE_VERSION:
        issues.append("database-schema-mismatch")
    if readback_schema is not None and readback_schema != READBACK_VERSION:
        issues.append("readback-schema-mismatch")
    if issues:
        return {"status": "incompatible", "issueCodes": issues, "projectionSchemaVersion": projection_schema, "supportedProjectionSchemaVersion": PROJECTION_VERSION, "rollbackPolicy": "restore-verified-pre-migration-backup-only"}
    parsed = semver(app_version)
    status_value = "compatible" if app_compatible(app_version) else ("upgrade-required" if parsed < semver(MIN_APP_VERSION) else "incompatible")
    return {"status": status_value, "appVersion": app_version, "pluginVersion": plugin_version(), "capabilityVersion": CAPABILITY_VERSION, "databaseSchemaVersion": DATABASE_VERSION, "projectionSchemaVersion": projection_schema, "readbackSchemaVersion": READBACK_VERSION, "minimumInclusive": MIN_APP_VERSION, "maximumExclusive": MAX_APP_VERSION, "upgradePolicy": "registered-migration-required", "downgradePolicy": "automatic-downgrade-forbidden", "rollbackPolicy": "restore-verified-pre-migration-backup-only"}


def public_workflow(row: sqlite3.Row) -> dict[str, Any]:
    state = {"retry-wait": "waiting", "completed": "succeeded", "dead-letter": "dead-lettered"}.get(row["state"], row["state"])
    value: dict[str, Any] = {"workflowID": row["workflow_id"], "kind": row["workflow_type"], "state": state, "attemptCount": row["attempts"], "maxAttempts": row["max_attempts"], "idempotencyKey": f"idem-{hashlib.sha256(row['workflow_id'].encode()).hexdigest()[:20]}", "updatedAt": row["updated_at"]}
    if row["attempts"]:
        value["startedAt"] = row["created_at"]
    if row["retry_after"]:
        value["nextAttemptAt"] = row["retry_after"]
    if row["last_error_code"]:
        value["errorCode"] = row["last_error_code"]
    return value


def public_action(row: sqlite3.Row) -> dict[str, Any]:
    readback_status = "matched" if row["state"] == "verified" or (row["state"] == "failed-before-dispatch" and row["native_receipt_hash"]) else ("indeterminate" if row["state"] == "indeterminate" else "missing")
    value: dict[str, Any] = {"actionID": row["action_id"], "kind": row["action_type"], "targetLabel": f"{row['destination_system']}:{row['destination_class']}", "state": row["state"], "confirmationRequired": row["state"] in {"confirmation-required", "failed-before-dispatch"}, "readbackStatus": readback_status, "retrySafe": row["state"] == "failed-before-dispatch"}
    if row["confirmed_at"]:
        value["confirmedAt"] = row["confirmed_at"]
    if row["attempted_at"] or row["state"] in {"attempting", "indeterminate", "failed-before-dispatch"}:
        value["attemptedAt"] = row["attempted_at"] or row["updated_at"]
    if row["verified_at"]:
        value["verifiedAt"] = row["verified_at"]
    return value


def diagnostic_projection(connection: sqlite3.Connection, category: str) -> list[dict[str, Any]]:
    rows = connection.execute("SELECT * FROM diagnostics WHERE category=? ORDER BY item_id", (category,)).fetchall()
    projected = []
    for row in rows:
        detail = json.loads(row["detail_json"])
        if category == "commitments":
            item = {"commitmentID": row["item_id"], "title": detail["title"], "state": row["state"], "ownerLabel": detail["ownerLabel"], "consequence": detail["consequence"], "evidenceStatus": detail["evidenceStatus"], "decisionIDs": detail["decisionIDs"]}
            if detail.get("dueAt"): item["dueAt"] = detail["dueAt"]
        elif category == "decisions":
            item = {"decisionID": row["item_id"], "title": detail["title"], "state": row["state"], "ownerLabel": detail["ownerLabel"], "evidenceStatus": detail["evidenceStatus"], "commitmentIDs": detail["commitmentIDs"]}
            if detail.get("decidedAt"): item["decidedAt"] = detail["decidedAt"]
        elif category == "sources":
            item = {"sourceID": row["item_id"], "status": row["state"], "scopeLabel": detail["scopeLabel"], "itemCount": detail["itemCount"], "processedCount": detail["processedCount"], "unresolvedCount": detail["unresolvedCount"], "freshness": detail["freshness"]}
            for field in ["attemptedAt", "succeededAt", "errorCode"]:
                if detail.get(field) is not None: item[field] = detail[field]
        else:
            item = {"connectionID": row["item_id"], "sourceID": detail["sourceID"], "status": row["state"] if row["state"] in {"connected", "disconnected", "blocked", "unknown"} else "blocked", "authenticationState": detail["authenticationState"], "coverageState": detail["coverageState"], "lastCheckedAt": detail["lastCheckedAt"], "diagnosticCodes": detail.get("diagnosticCodes", [])}
        projected.append(item)
    return projected


def diagnostic_runtime_records(connection: sqlite3.Connection, category: str) -> list[dict[str, Any]]:
    return [{"itemID": row["item_id"], "state": row["state"], "detail": json.loads(row["detail_json"]), "version": row["version"], "updatedAt": row["updated_at"]} for row in connection.execute("SELECT * FROM diagnostics WHERE category=? ORDER BY item_id", (category,))]


def alert(alert_code: str, severity: str, entity_id: str, observed_at: str, threshold: str, count: int = 1, source_kind: str = "runtime-derived") -> dict[str, Any]:
    dedup = f"{alert_code}:{entity_id}"
    evidence = digest({"code": alert_code, "entityID": entity_id, "observedAt": observed_at, "count": max(1, count), "sourceKind": source_kind})
    return {"alertID": f"alert-{hashlib.sha256(dedup.encode()).hexdigest()[:16]}", "dedupKey": dedup, "code": alert_code, "severity": severity, "entityID": entity_id, "observedAt": observed_at, "threshold": threshold, "count": max(1, count), "cooldownMinutes": 15, "resolution": "verified-state-change-required", "sourceKind": source_kind, "evidenceDigest": evidence}


ALERT_TITLES = {
    "dead-letter-open": "Review guarded workflow replay", "workflow-retry-wait": "Wait for bounded retry",
    "external-action-failed-before-dispatch": "Reconfirm before another attempt", "external-action-indeterminate": "Investigate destination-native state",
    "external-action-readback-overdue": "Collect destination-native readback", "source-coverage-gap": "Repair bounded source coverage",
    "runtime-integrity-failure": "Stop and inspect runtime integrity", "repeated-runtime-failure": "Review repeated runtime failures",
    "morning-pipeline-missing": "Recover the morning pipeline", "app-readback-overdue": "Repair Command Center readback",
    "runtime-blocked": "Resolve the blocked workflow", "runtime-lease-stalled": "Inspect the stalled lease",
}


def add_alert_event(connection: sqlite3.Connection, alert_id: str, event_type: str, at: str, status: str, evidence_digest: str) -> None:
    value = {"alertID": alert_id, "eventType": event_type, "eventAt": at, "status": status, "evidenceDigest": evidence_digest}
    connection.execute("INSERT INTO alert_events(alert_id,event_type,event_at,status,evidence_digest,event_digest) VALUES (?,?,?,?,?,?)", (alert_id, event_type, at, status, evidence_digest, digest(value)))


def reconcile_alert_candidates(connection: sqlite3.Connection, candidates: list[dict[str, Any]], observed_at: str) -> None:
    for item in candidates:
        row = connection.execute("SELECT * FROM alerts WHERE fingerprint=?", (item["dedupKey"],)).fetchone()
        title = ALERT_TITLES[item["code"]]
        summary = f"{item['code']} met its {item['threshold']} threshold; occurrence count {item['count']}."
        cooldown_until = iso(parse_time(observed_at, "observedAt") + timedelta(minutes=item["cooldownMinutes"]))
        if row is None:
            connection.execute("INSERT INTO alerts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (item["alertID"], item["dedupKey"], item["code"], item["severity"], title, summary, "open", item["sourceKind"], item["entityID"], item["evidenceDigest"], observed_at, observed_at, item["count"], cooldown_until, None, None, None, 0, 1))
            add_alert_event(connection, item["alertID"], "raised", observed_at, "open", item["evidenceDigest"])
        elif row["evidence_digest"] != item["evidenceDigest"]:
            reopened = row["status"] == "resolved"
            status = "open" if reopened else row["status"]
            event_type = "reopened" if reopened else ("observed" if parse_time(observed_at, "observedAt") >= parse_time(row["cooldown_until"], "cooldownUntil") else "deduplicated")
            connection.execute("UPDATE alerts SET severity=?,safe_summary=?,status=?,source_kind=?,evidence_digest=?,last_seen=?,occurrence_count=?,cooldown_until=?,resolved_at=NULL,resolution_evidence_digest=NULL,reopened_count=reopened_count+?,version=version+1 WHERE alert_id=?", (item["severity"], summary, status, item["sourceKind"], item["evidenceDigest"], observed_at, row["occurrence_count"] + 1, cooldown_until, 1 if reopened else 0, row["alert_id"]))
            add_alert_event(connection, row["alert_id"], event_type, observed_at, status, item["evidenceDigest"])


def alert_trigger_active(connection: sqlite3.Connection, row: sqlite3.Row) -> bool:
    category, entity_id = row["category"], row["source_entity_id"]
    if row["source_kind"] == "external-monitor":
        diagnostic = connection.execute("SELECT state,detail_json FROM diagnostics WHERE item_id=? AND category IN ('connections','sources') ORDER BY category LIMIT 1", (entity_id,)).fetchone()
        if diagnostic is None:
            return False
        detail = json.loads(diagnostic["detail_json"])
        return not (diagnostic["state"] == "resolved" and detail.get("verifiedResolvedAt")) and diagnostic["state"] not in {"available", "connected", "complete", "healthy"}
    if category == "dead-letter-open":
        return connection.execute("SELECT 1 FROM dead_letters WHERE workflow_id=? AND replayed_by IS NULL", (entity_id,)).fetchone() is not None
    if category == "workflow-retry-wait":
        return connection.execute("SELECT 1 FROM workflows WHERE workflow_id=? AND state='retry-wait'", (entity_id,)).fetchone() is not None
    if category.startswith("external-action-"):
        action = connection.execute("SELECT state,updated_at FROM external_actions WHERE action_id=?", (entity_id,)).fetchone()
        if action is None:
            return False
        if category == "external-action-indeterminate": return action["state"] == "indeterminate"
        if category == "external-action-failed-before-dispatch": return action["state"] == "failed-before-dispatch"
        return action["state"] in {"attempting", "attempted"} and now() - parse_time(action["updated_at"], "updatedAt") >= timedelta(minutes=STALE_ACTION_MINUTES)
    if category == "repeated-runtime-failure":
        cutoff = iso(now() - timedelta(minutes=60))
        return connection.execute("SELECT COUNT(*) FROM runtime_events WHERE entity_kind='workflow' AND entity_id=? AND event_type='fail' AND event_at>=?", (entity_id, cutoff)).fetchone()[0] >= 3
    return False


def alert_transition(request: dict[str, Any], apply: bool) -> dict[str, Any]:
    alert_id = identifier(request.get("alertID"), "alertID")
    event = request.get("event")
    if event not in {"acknowledge", "resolve"}:
        raise RuntimeErrorState("Alert event must be acknowledge or resolve")
    evidence_digest = request.get("verificationEvidenceDigest")
    if event == "resolve" and (not isinstance(evidence_digest, str) or not HASH_PATTERN.fullmatch(evidence_digest)):
        raise RuntimeErrorState("Verified alert resolution requires verificationEvidenceDigest")

    def mutate(connection: sqlite3.Connection) -> dict[str, Any]:
        row = connection.execute("SELECT * FROM alerts WHERE alert_id=?", (alert_id,)).fetchone()
        if row is None: raise RuntimeErrorState("Alert does not exist")
        if request.get("expectedVersion") != row["version"]: raise RuntimeErrorState("Alert transition requires its current expectedVersion")
        at = iso(parse_time(request["occurredAt"], "occurredAt")) if request.get("occurredAt") else iso()
        if event == "acknowledge":
            if row["status"] == "resolved": raise RuntimeErrorState("Resolved alert cannot be acknowledged")
            status_value = "acknowledged"
            connection.execute("UPDATE alerts SET status=?,acknowledged_at=?,version=version+1 WHERE alert_id=?", (status_value, at, alert_id))
            event_evidence = row["evidence_digest"]
        else:
            if alert_trigger_active(connection, row): raise RuntimeErrorState("Alert trigger remains active; verified resolution is not permitted")
            status_value = "resolved"
            connection.execute("UPDATE alerts SET status=?,resolved_at=?,resolution_evidence_digest=?,version=version+1 WHERE alert_id=?", (status_value, at, evidence_digest, alert_id))
            event_evidence = evidence_digest
        add_alert_event(connection, alert_id, event + "d", at, status_value, event_evidence)
        return {"status": status_value, "alertID": alert_id, "version": row["version"] + 1}
    return idempotent_mutation("alert-transition", request, mutate, apply)


def projection_from_database(connection: sqlite3.Connection, generated: datetime | None = None) -> dict[str, Any]:
    generated = generated or now()
    workflow_rows = connection.execute("SELECT * FROM workflows ORDER BY updated_at DESC LIMIT 100").fetchall()
    action_rows = connection.execute("SELECT * FROM external_actions ORDER BY updated_at DESC LIMIT 100").fetchall()
    letter_rows = connection.execute("SELECT d.*,w.replay_safe,w.consequential,w.version FROM dead_letters d JOIN workflows w USING(workflow_id) ORDER BY d.created_at DESC LIMIT 100").fetchall()
    migration_rows = connection.execute("SELECT * FROM migration_receipts ORDER BY applied_at").fetchall()
    retries = [{"retryID": f"retry-{row['workflow_id']}-{row['attempts']}", "workflowID": row["workflow_id"], "attemptNumber": row["attempts"], "state": "scheduled", "reasonCode": row["last_error_code"] or "transient-failure", "scheduledAt": row["retry_after"], "backoffSeconds": max(0, int((parse_time(row["retry_after"], "retryAfter") - parse_time(row["updated_at"], "updatedAt")).total_seconds()))} for row in workflow_rows if row["state"] == "retry-wait"]
    letters = [{"deadLetterID": f"dlq-{row['workflow_id']}", "workflowID": row["workflow_id"], "createdAt": row["created_at"], "reasonCode": row["error_code"], "attemptCount": connection.execute("SELECT attempts FROM workflows WHERE workflow_id=?", (row["workflow_id"],)).fetchone()[0], "replayEligibility": "eligible" if bool(row["replay_safe"]) and not bool(row["replayed_by"]) else "blocked", "recoveryInstructionID": "recovery-dead-letter-open", "consequential": bool(row["consequential"]), "replayedBy": row["replayed_by"]} for row in letter_rows]
    alerts: list[dict[str, Any]] = []
    for item in letters:
        if not item["replayedBy"]:
            severity = "high" if item["consequential"] else "warning"
            alerts.append(alert("dead-letter-open", severity, item["workflowID"], item["createdAt"], "immediate"))
    for item in retries:
            alerts.append(alert("workflow-retry-wait", "warning", item["workflowID"], item["scheduledAt"], "until-retry-after"))
    for row in action_rows:
        if row["state"] in {"failed-before-dispatch", "indeterminate"}:
            alerts.append(alert("external-action-indeterminate" if row["state"] == "indeterminate" else "external-action-failed-before-dispatch", "critical", row["action_id"], row["updated_at"], "immediate"))
        elif row["state"] in {"attempting", "attempted"} and generated - parse_time(row["updated_at"], "updatedAt") >= timedelta(minutes=STALE_ACTION_MINUTES):
            alerts.append(alert("external-action-readback-overdue", "warning", row["action_id"], row["updated_at"], f"{STALE_ACTION_MINUTES}m"))
    for source in diagnostic_runtime_records(connection, "sources"):
        if source["state"] in {"partial", "stale", "unavailable", "blocked", "unknown"}:
            alerts.append(alert("source-coverage-gap", "warning", source["itemID"], source["updatedAt"], "immediate", source["version"], "external-monitor"))
    for record in diagnostic_runtime_records(connection, "connections"):
        signal = {"itemID": record["itemID"], "state": record["state"], "updatedAt": record["updatedAt"], **record["detail"]}
        if signal["state"] == "resolved" and signal.get("verifiedResolvedAt"):
            continue
        signal_class = signal.get("signalClass")
        count = int(signal.get("failureCount60m", 1))
        if signal["state"] in {"unauthorized", "digest-mismatch", "corruption", "privacy-failure"}:
            alerts.append(alert("runtime-integrity-failure", "critical", signal["itemID"], signal["updatedAt"], "immediate", count, "external-monitor"))
        elif count >= 3:
            alerts.append(alert("repeated-runtime-failure", "high", signal["itemID"], signal["updatedAt"], "3-failures-per-60m", count, "external-monitor"))
        elif signal_class == "morning-pipeline" and signal["state"] == "missing" and signal.get("deadlineAt") and generated >= parse_time(signal["deadlineAt"], "deadlineAt"):
            alerts.append(alert("morning-pipeline-missing", "high", signal["itemID"], signal["updatedAt"], "06:16-local", count, "external-monitor"))
        elif signal_class == "app-readback" and signal["state"] == "missing" and signal.get("appKnownRunning") is True and int(signal.get("readbackAgeMinutes", 0)) > 5:
            alerts.append(alert("app-readback-overdue", "high", signal["itemID"], signal["updatedAt"], "5m", count, "external-monitor"))
        elif signal["state"] == "blocked" and int(signal.get("blockedMinutes", 0)) >= 30:
            alerts.append(alert("runtime-blocked", "warning", signal["itemID"], signal["updatedAt"], "30m", count, "external-monitor"))
        elif signal["state"] == "stalled-lease" and int(signal.get("leaseAgeMinutes", 0)) >= 15:
            alerts.append(alert("runtime-lease-stalled", "warning", signal["itemID"], signal["updatedAt"], "15m", count, "external-monitor"))
    failure_cutoff = iso(generated - timedelta(minutes=60))
    for row in connection.execute("SELECT entity_id,COUNT(*) AS failure_count,MAX(event_at) AS last_failure FROM runtime_events WHERE entity_kind='workflow' AND event_type='fail' AND event_at>=? GROUP BY entity_id HAVING COUNT(*)>=3", (failure_cutoff,)):
        alerts.append(alert("repeated-runtime-failure", "high", row["entity_id"], row["last_failure"], "3-failures-per-60m", row["failure_count"], "runtime-derived"))
    reconcile_alert_candidates(connection, alerts, iso(generated))
    persisted_alerts = connection.execute("SELECT * FROM alerts ORDER BY first_seen,alert_id").fetchall()
    instructions: list[dict[str, Any]] = []
    active_alerts = [row for row in persisted_alerts if row["status"] != "resolved"]
    codes = {row["category"] for row in active_alerts}
    recovery = {
        "dead-letter-open": ("Review guarded workflow replay", "Inspect the dead-letter digest, cause, replay safety, and dry-run a new replay identifier."),
        "workflow-retry-wait": ("Wait for bounded retry", "Confirm the retry time and remaining budget before issuing the version-bound retry event."),
        "external-action-failed-before-dispatch": ("Reconfirm before another attempt", "Review the verified no-dispatch result and obtain a fresh digest-bound confirmation; never retry blindly."),
        "external-action-indeterminate": ("Investigate destination-native state", "Read the destination system before any further action; reconcile verified or failed state first."),
        "external-action-readback-overdue": ("Collect destination-native readback", "Inspect the destination and reconcile the exact action and attempt identifiers."),
        "source-coverage-gap": ("Repair bounded source coverage", "Use the owning connector and source-health contract; do not substitute another source lane."),
        "runtime-integrity-failure": ("Stop and inspect runtime integrity", "Do not continue the affected operation until the submitted integrity or privacy failure is independently resolved."),
        "repeated-runtime-failure": ("Review repeated runtime failures", "Inspect the bounded failure series and correct the shared cause before another attempt."),
        "morning-pipeline-missing": ("Recover the morning pipeline", "Inspect the 6:01 workflow and source health; rebuild only from authoritative runtime state."),
        "app-readback-overdue": ("Repair Command Center readback", "Confirm the known-running app consumed the exact projection digest and compatible schema."),
        "runtime-blocked": ("Resolve the blocked workflow", "Inspect the bounded blocker and follow the owning recovery contract."),
        "runtime-lease-stalled": ("Inspect the stalled lease", "Verify the worker state before expiry or reassignment; do not run the work twice."),
    }
    if letters:
        codes.add("dead-letter-open")
    for code in sorted(codes):
        title, instruction = recovery[code]
        related = sorted({row["source_entity_id"] for row in active_alerts if row["category"] == code})
        evidence_ids = sorted({row["evidence_digest"] for row in active_alerts if row["category"] == code})
        instructions.append({"instructionID": f"recovery-{code}", "title": title, "steps": [f"1. {instruction}", "2. Verify the authoritative state and record its evidence digest.", "3. If verification fails, stop and restore the last verified local state."], "verificationSteps": ["Verify the source state changed and bind the evidence digest to the resolution event."], "rollbackSteps": ["Restore only the verified pre-change backup or leave the operation stopped."], "evidenceIDs": evidence_ids, "actionBoundary": "local-read-only" if code.startswith("external-action") else "local-governed", "relatedIDs": related})
    alert_projection = []
    for row in persisted_alerts:
        severity = "error" if row["severity"] == "high" else row["severity"]
        item = {"alertID": row["alert_id"], "severity": severity, "category": row["category"], "state": row["status"], "status": row["status"], "title": row["title"], "safeSummary": row["safe_summary"], "raisedAt": row["first_seen"], "firstSeen": row["first_seen"], "lastSeen": row["last_seen"], "count": row["occurrence_count"], "suppressedUntil": row["cooldown_until"], "sourceKind": row["source_kind"], "evidenceIDs": [row["evidence_digest"]], "recoveryInstructionIDs": [f"recovery-{row['category']}"]}
        if row["acknowledged_at"]: item["acknowledgedAt"] = row["acknowledged_at"]
        if row["resolved_at"]: item["resolvedAt"] = row["resolved_at"]
        alert_projection.append(item)
    migrations = [{"migrationID": row["migration_id"], "fromVersion": f"{row['from_version']}.0.0", "toVersion": f"{row['to_version']}.0.0", "state": "applied", "reversible": False, "appliedAt": row["applied_at"], "safeSummary": "Applied a registered local runtime migration."} for row in migration_rows]
    all_workflow_count = connection.execute("SELECT COUNT(*) FROM workflows").fetchone()[0]
    all_action_count = connection.execute("SELECT COUNT(*) FROM external_actions").fetchone()[0]
    event_count = connection.execute("SELECT COUNT(*) FROM runtime_events").fetchone()[0]
    core = {
        "schemaVersion": PROJECTION_VERSION,
        "generatedAt": iso(generated),
        "validUntil": iso(generated + timedelta(minutes=PROJECTION_TTL_MINUTES)),
        "producer": PRODUCER,
        "audience": AUDIENCE,
        "runtimeVersion": plugin_version(),
        "workflows": [public_workflow(row) for row in workflow_rows],
        "retries": retries,
        "deadLetters": letters,
        "externalActions": [public_action(row) for row in action_rows],
        "commitments": diagnostic_projection(connection, "commitments"),
        "decisions": diagnostic_projection(connection, "decisions"),
        "sources": diagnostic_projection(connection, "sources"),
        "connections": diagnostic_projection(connection, "connections"),
        "compatibility": {"projectionSchemaVersion": PROJECTION_VERSION, "readbackSchemaVersion": READBACK_VERSION, "databaseSchemaVersion": DATABASE_VERSION, "pluginVersion": plugin_version(), "capabilityVersion": CAPABILITY_VERSION, "minimumAppVersion": MIN_APP_VERSION, "maximumAppVersion": MAX_APP_VERSION, "status": "compatible", "issueCodes": [], "upgradePolicy": "registered-migration-required", "downgradePolicy": "automatic-downgrade-forbidden", "rollbackPolicy": "restore-verified-pre-migration-backup-only"},
        "migrations": migrations,
        "alerts": alert_projection,
        "recoveryInstructions": instructions,
        "coverage": {"workflowCount": len(workflow_rows), "retryCount": len(retries), "deadLetterCount": len(letters), "externalActionCount": len(action_rows), "commitmentCount": connection.execute("SELECT COUNT(*) FROM diagnostics WHERE category='commitments'").fetchone()[0], "decisionCount": connection.execute("SELECT COUNT(*) FROM diagnostics WHERE category='decisions'").fetchone()[0], "sourceCount": connection.execute("SELECT COUNT(*) FROM diagnostics WHERE category='sources'").fetchone()[0], "connectionCount": connection.execute("SELECT COUNT(*) FROM diagnostics WHERE category='connections'").fetchone()[0], "migrationCount": len(migrations), "alertCount": len(alert_projection), "recoveryInstructionCount": len(instructions), "unresolvedCount": len(retries) + sum(1 for item in letters if item["replayEligibility"] != "blocked") + len(active_alerts)},
    }
    for item in letters:
        item.pop("consequential", None)
        item.pop("replayedBy", None)
    content_digest = digest(core)
    return {**core, "projectionID": f"runtime-{generated.date().isoformat()}-{content_digest[:12]}", "contentDigest": content_digest}


def validate_projection(payload: dict[str, Any]) -> None:
    expected = {"schemaVersion", "projectionID", "contentDigest", "generatedAt", "validUntil", "producer", "audience", "runtimeVersion", "workflows", "retries", "deadLetters", "externalActions", "commitments", "decisions", "sources", "connections", "compatibility", "migrations", "alerts", "recoveryInstructions", "coverage"}
    if set(payload) != expected:
        raise RuntimeErrorState(f"Operations projection top-level mismatch: {sorted(set(payload) ^ expected)}")
    if payload["schemaVersion"] != PROJECTION_VERSION or payload["producer"] != PRODUCER or payload["audience"] != AUDIENCE:
        raise RuntimeErrorState("Operations projection identity or schema is unsupported")
    generated = parse_time(payload["generatedAt"], "generatedAt")
    valid_until = parse_time(payload["validUntil"], "validUntil")
    if valid_until <= generated:
        raise RuntimeErrorState("Operations projection freshness window is invalid")
    core = dict(payload)
    core.pop("projectionID")
    supplied = core.pop("contentDigest")
    if not isinstance(supplied, str) or not HASH_PATTERN.fullmatch(supplied) or supplied != digest(core):
        raise RuntimeErrorState("Operations projection content digest mismatch")
    if not isinstance(payload["projectionID"], str) or not payload["projectionID"].endswith(supplied[:12]):
        raise RuntimeErrorState("Operations projection identifier does not bind the content digest")
    action_states = {"confirmation-required", "confirmed", "attempting", "attempted", "verified", "failed-before-dispatch", "indeterminate", "cancelled"}
    for action in payload["externalActions"]:
        if action.get("state") not in action_states:
            raise RuntimeErrorState("Operations projection contains an unsupported external-action state")
        if action.get("confirmationRequired") != (action["state"] in {"confirmation-required", "failed-before-dispatch"}):
            raise RuntimeErrorState("External-action confirmation requirement does not match its state")
    for item in payload["alerts"]:
        if item.get("status") not in {"open", "acknowledged", "resolved"} or item.get("state") != item.get("status"):
            raise RuntimeErrorState("Operations projection contains an invalid alert lifecycle state")
        if item.get("sourceKind") not in {"runtime-derived", "external-monitor"}:
            raise RuntimeErrorState("Operations alert source provenance is invalid")
    forbidden_keys = {"boundedTarget", "targetHash", "lastErrorSummary", "confirmationID", "attemptID", "nativeRequestHash", "nativeReceiptHash", "payloadDigest"}
    def inspect_keys(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key in forbidden_keys:
                    raise RuntimeErrorState(f"Operations projection leaked private runtime field: {key}")
                inspect_keys(child)
        elif isinstance(value, list):
            for child in value:
                inspect_keys(child)
    inspect_keys(payload)


def publish_projection() -> dict[str, Any]:
    connection = open_database(True)
    try:
        connection.execute("BEGIN IMMEDIATE")
        projection = projection_from_database(connection)
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    validate_projection(projection)
    atomic_json(PROJECTION_PATH, projection)
    return projection


def rebuild_from_events(connection: sqlite3.Connection) -> dict[str, Any]:
    rebuilt: dict[str, dict[str, dict[str, Any]]] = {"workflow": {}, "external-action": {}, "diagnostic": {}, "standing-authorization": {}}
    previous_sequence = 0
    for row in connection.execute("SELECT * FROM runtime_events ORDER BY sequence"):
        if row["sequence"] != previous_sequence + 1:
            raise RuntimeErrorState("Runtime event sequence contains a gap")
        snapshot = json.loads(row["snapshot_json"])
        event = {"entityKind": row["entity_kind"], "entityID": row["entity_id"], "eventType": row["event_type"], "eventAt": row["event_at"], "version": row["version"], "snapshot": snapshot, "idempotencyKey": row["idempotency_key"]}
        if row["event_digest"] != digest(event):
            raise RuntimeErrorState("Runtime event digest mismatch")
        current = rebuilt[row["entity_kind"]].get(row["entity_id"])
        if current and row["version"] < current["version"]:
            raise RuntimeErrorState("Runtime event version regressed")
        rebuilt[row["entity_kind"]][row["entity_id"]] = snapshot
        previous_sequence = row["sequence"]
    for row in connection.execute("SELECT * FROM workflows"):
        if rebuilt["workflow"].get(row["workflow_id"]) != workflow_snapshot(row_dict(row)):
            raise RuntimeErrorState(f"Workflow rebuild mismatch: {row['workflow_id']}")
    for row in connection.execute("SELECT * FROM external_actions"):
        if rebuilt["external-action"].get(row["action_id"]) != action_snapshot(row_dict(row)):
            raise RuntimeErrorState(f"External action rebuild mismatch: {row['action_id']}")
    for row in connection.execute("SELECT * FROM diagnostics"):
        expected = {"category": row["category"], "itemID": row["item_id"], "state": row["state"], "detail": json.loads(row["detail_json"]), "version": row["version"], "updatedAt": row["updated_at"]}
        if rebuilt["diagnostic"].get(f"{row['category']}:{row['item_id']}") != expected:
            raise RuntimeErrorState(f"Diagnostic rebuild mismatch: {row['category']}:{row['item_id']}")
    for row in connection.execute("SELECT * FROM standing_authorizations"):
        if rebuilt["standing-authorization"].get(row["policy_id"]) != standing_policy_snapshot(row_dict(row)):
            raise RuntimeErrorState(f"Standing authorization rebuild mismatch: {row['policy_id']}")
    return {"schemaVersion": 1, "rebuiltAt": iso(), "lastSequence": previous_sequence, "entities": rebuilt, "status": "verified"}


def migrate_legacy_projection(path: str, apply: bool) -> dict[str, Any]:
    legacy = load_json(path)
    if legacy.get("schemaVersion") != 1:
        raise RuntimeErrorState("Only registered projection migration 1 to 2 is supported")
    legacy_digest = digest(legacy)
    if not apply:
        return {"status": "ready", "migrationID": "operations-projection-1-to-2", "fromVersion": 1, "toVersion": 2, "legacyDigest": legacy_digest, "dataPreserving": True, "applied": False}
    source_path = Path(path)
    source_bytes = source_path.read_bytes()
    backup_dir = ROOT / "backups"
    backup_path = backup_dir / f"operations-v1-{now().strftime('%Y%m%dT%H%M%SZ')}-{hashlib.sha256(source_bytes).hexdigest()[:12]}.json"
    atomic_bytes(backup_path, source_bytes)
    backup_digest = hashlib.sha256(backup_path.read_bytes()).hexdigest()
    if backup_digest != hashlib.sha256(source_bytes).hexdigest():
        raise RuntimeErrorState("Pre-migration projection backup digest verification failed")
    migrated = dict(legacy)
    migrated["schemaVersion"] = 2
    migrated["runtimeVersion"] = plugin_version()
    for action in migrated.get("externalActions", []):
        state = action.get("state")
        if state == "proposed": action["state"] = "confirmation-required"
        elif state == "failed": action["state"] = "failed-before-dispatch"
        elif state == "attempted" and action.get("readbackStatus") == "indeterminate": action["state"] = "indeterminate"
        elif state not in {"confirmed", "attempted", "verified", "cancelled", "confirmation-required", "attempting", "failed-before-dispatch", "indeterminate"}:
            raise RuntimeErrorState(f"Schema-1 external action state cannot be migrated safely: {state}")
        action["confirmationRequired"] = action["state"] in {"confirmation-required", "failed-before-dispatch"}
    for item in migrated.get("alerts", []):
        item.setdefault("status", "resolved" if item.get("resolvedAt") else "open")
        item["state"] = item["status"]
        item.setdefault("firstSeen", item.get("raisedAt"))
        item.setdefault("lastSeen", item.get("resolvedAt", item.get("raisedAt")))
        item.setdefault("count", 1)
        item.setdefault("suppressedUntil", item.get("raisedAt"))
        item.setdefault("sourceKind", "external-monitor")
        item.setdefault("evidenceIDs", [digest({"legacyAlertID": item.get("alertID"), "legacyDigest": legacy_digest})])
    for item in migrated.get("recoveryInstructions", []):
        item.setdefault("verificationSteps", ["Verify authoritative state and record evidence before resolution."])
        item.setdefault("rollbackSteps", ["Restore the verified pre-migration backup if validation fails."])
        item.setdefault("evidenceIDs", [backup_digest])
    migrated["compatibility"] = {"projectionSchemaVersion": 2, "readbackSchemaVersion": READBACK_VERSION, "databaseSchemaVersion": DATABASE_VERSION, "pluginVersion": plugin_version(), "capabilityVersion": CAPABILITY_VERSION, "minimumAppVersion": MIN_APP_VERSION, "maximumAppVersion": MAX_APP_VERSION, "status": "compatible", "issueCodes": [], "upgradePolicy": "registered-migration-required", "downgradePolicy": "automatic-downgrade-forbidden", "rollbackPolicy": "restore-verified-pre-migration-backup-only"}
    migrated.pop("projectionID", None)
    migrated.pop("contentDigest", None)
    migrated_digest = digest(migrated)
    migrated = {**migrated, "projectionID": f"runtime-{parse_time(migrated['generatedAt'], 'generatedAt').date().isoformat()}-{migrated_digest[:12]}", "contentDigest": migrated_digest}
    validate_projection(migrated)
    connection = open_database(True)
    try:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute("SELECT artifact_digest FROM migration_receipts WHERE migration_id=?", ("operations-projection-1-to-2",)).fetchone()
        if existing and existing["artifact_digest"] != legacy_digest:
            raise RuntimeErrorState("Projection migration ID already applied to different content")
        receipt = {"backupPath": str(backup_path), "backupDigest": backup_digest, "migratedDigest": migrated["contentDigest"]}
        connection.execute("INSERT OR IGNORE INTO migration_receipts VALUES (?,?,?,?,?,?,?)", ("operations-projection-1-to-2", "projection", 1, 2, legacy_digest, iso(), "applied-data-preserving"))
        connection.execute("INSERT OR REPLACE INTO runtime_meta VALUES (?,?)", ("projectionMigrationBackup", canonical(receipt)))
        atomic_json(source_path, migrated)
        if os.environ.get("MONDAY_RUNTIME_FAIL_MIGRATION_WRITE") == "1":
            raise RuntimeErrorState("Injected projection migration validation failure")
        written = load_json(source_path)
        validate_projection(written)
        connection.commit()
    except Exception as exc:
        connection.rollback()
        atomic_bytes(source_path, source_bytes)
        if hashlib.sha256(source_path.read_bytes()).hexdigest() != backup_digest:
            raise RuntimeErrorState("Projection migration failed and backup restore verification failed") from exc
        raise RuntimeErrorState("Projection migration failed; database receipt rolled back and verified schema-1 backup was atomically restored") from exc
    finally:
        connection.close()
    return {"status": "migrated", "migrationID": "operations-projection-1-to-2", "legacyDigest": legacy_digest, "backupPath": str(backup_path), "backupDigest": backup_digest, "projectionID": migrated["projectionID"], "applied": True}


def restore_projection(backup_path: str, expected_digest: str, apply: bool) -> dict[str, Any]:
    if not HASH_PATTERN.fullmatch(expected_digest): raise RuntimeErrorState("expectedDigest must be lowercase SHA-256")
    path = Path(backup_path)
    value = path.read_bytes()
    actual = hashlib.sha256(value).hexdigest()
    if actual != expected_digest: raise RuntimeErrorState("Projection backup digest mismatch; restore refused")
    payload = json.loads(value)
    if payload.get("schemaVersion") != 1: raise RuntimeErrorState("Only a verified schema-1 pre-migration backup can be restored")
    if not apply: return {"status": "restore-ready", "backupDigest": actual, "applied": False}
    atomic_bytes(PROJECTION_PATH, value)
    if hashlib.sha256(PROJECTION_PATH.read_bytes()).hexdigest() != actual:
        raise RuntimeErrorState("Restored projection failed digest verification")
    connection = open_database(True)
    try:
        receipt_id = f"operations-projection-restore-{actual[:12]}"
        connection.execute("INSERT OR IGNORE INTO migration_receipts VALUES (?,?,?,?,?,?,?)", (receipt_id, "projection-rollback", 2, 1, actual, iso(), "restored-verified-backup"))
        connection.commit()
    finally:
        connection.close()
    return {"status": "restored", "backupDigest": actual, "target": str(PROJECTION_PATH), "applied": True}


def reconcile_readback(apply: bool) -> dict[str, Any]:
    projection = load_json(PROJECTION_PATH)
    validate_projection(projection)
    receipt = load_json(READBACK_PATH)
    required = {"schemaVersion", "projectionID", "projectionSchemaVersion", "contentDigest", "consumer", "appVersion", "displayedAt", "state", "viewIDs"}
    if set(receipt) != required or receipt["schemaVersion"] != READBACK_VERSION:
        raise RuntimeErrorState("Runtime readback schema is invalid")
    if receipt["projectionID"] != projection["projectionID"] or receipt["projectionSchemaVersion"] != projection["schemaVersion"] or receipt["contentDigest"] != projection["contentDigest"]:
        raise RuntimeErrorState("Runtime readback does not match the current projection")
    if receipt["state"] != "displayed" or not isinstance(receipt["viewIDs"], list) or len(receipt["viewIDs"]) != 1 or receipt["viewIDs"][0] not in ALLOWED_RUNTIME_VIEW_IDS:
        raise RuntimeErrorState("Runtime readback must prove exactly one recognized Operations view was displayed")
    if not isinstance(receipt["consumer"], str) or not receipt["consumer"] or not app_compatible(str(receipt["appVersion"])):
        raise RuntimeErrorState("Runtime readback consumer or app version is incompatible")
    displayed = parse_time(receipt["displayedAt"], "displayedAt")
    if displayed < parse_time(projection["generatedAt"], "generatedAt") or displayed > parse_time(projection["validUntil"], "validUntil") or displayed > now() + timedelta(minutes=5):
        raise RuntimeErrorState("Runtime readback is outside the projection freshness window")
    result = {"status": "displayed", "projectionID": projection["projectionID"], "contentDigest": projection["contentDigest"], "appVersion": receipt["appVersion"], "viewID": receipt["viewIDs"][0], "applied": apply}
    if apply:
        connection = open_database(True)
        try:
            connection.execute("BEGIN IMMEDIATE")
            value = {**result, "reconciledAt": iso(), "receiptDigest": digest(receipt)}
            connection.execute("INSERT INTO runtime_meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json", ("lastReadback", canonical(value)))
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
    return result


def status() -> dict[str, Any]:
    connection = open_database(False)
    try:
        counts = {"workflows": connection.execute("SELECT COUNT(*) FROM workflows").fetchone()[0], "deadLetters": connection.execute("SELECT COUNT(*) FROM dead_letters WHERE replayed_by IS NULL").fetchone()[0], "externalActions": connection.execute("SELECT COUNT(*) FROM external_actions").fetchone()[0], "events": connection.execute("SELECT COUNT(*) FROM runtime_events").fetchone()[0]}
        readback = connection.execute("SELECT value_json FROM runtime_meta WHERE key='lastReadback'").fetchone()
    finally:
        connection.close()
    projection_state = "missing"
    projection_id = None
    if PROJECTION_PATH.exists():
        projection = load_json(PROJECTION_PATH)
        validate_projection(projection)
        projection_id = projection["projectionID"]
        projection_state = "current" if now() <= parse_time(projection["validUntil"], "validUntil") else "stale"
    return {"status": "ok", "databaseVersion": DATABASE_VERSION, "runtimeVersion": plugin_version(), "counts": counts, "projection": {"state": projection_state, "projectionID": projection_id, "path": str(PROJECTION_PATH)}, "lastReadback": json.loads(readback["value_json"]) if readback else None}


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    initialize = commands.add_parser("init", help="initialize or migrate the durable runtime")
    initialize.add_argument("--apply", action="store_true")
    for name in ["workflow-start", "workflow-transition", "workflow-replay", "action-propose", "action-transition", "standing-authorization", "stage-diagnostic", "alert-transition"]:
        command = commands.add_parser(name)
        command.add_argument("--input", required=True)
        command.add_argument("--apply", action="store_true")
    project = commands.add_parser("project", help="build the privacy-reduced Operations projection")
    project.add_argument("--apply", action="store_true")
    rebuild = commands.add_parser("rebuild", help="rebuild and verify materialized runtime state from append-only events")
    rebuild.add_argument("--output")
    rebuild.add_argument("--apply", action="store_true")
    compatibility = commands.add_parser("compatibility-check")
    compatibility.add_argument("--app-version", required=True)
    compatibility.add_argument("--projection-schema", type=int, required=True)
    compatibility.add_argument("--plugin-version")
    compatibility.add_argument("--capability-version")
    compatibility.add_argument("--database-schema", type=int)
    compatibility.add_argument("--readback-schema", type=int)
    migration = commands.add_parser("migrate-projection")
    migration.add_argument("--input", required=True)
    migration.add_argument("--apply", action="store_true")
    restore = commands.add_parser("restore-projection")
    restore.add_argument("--backup", required=True)
    restore.add_argument("--expected-digest", required=True)
    restore.add_argument("--apply", action="store_true")
    readback = commands.add_parser("reconcile-readback")
    readback.add_argument("--apply", action="store_true")
    commands.add_parser("status")
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "init":
            if args.apply:
                connection = open_database(True)
                connection.close()
                projection = publish_projection()
                result = {"status": "initialized", "databaseVersion": DATABASE_VERSION, "projectionID": projection["projectionID"], "applied": True}
            else:
                result = {"status": "validated", "databaseVersion": DATABASE_VERSION, "applied": False}
        elif args.command in {"workflow-start", "workflow-transition", "workflow-replay", "action-propose", "action-transition", "standing-authorization", "stage-diagnostic", "alert-transition"}:
            request = load_json(args.input)
            handler = {"workflow-start": workflow_start, "workflow-transition": workflow_transition, "workflow-replay": workflow_replay, "action-propose": action_propose, "action-transition": action_transition, "standing-authorization": standing_authorization, "stage-diagnostic": stage_diagnostic, "alert-transition": alert_transition}[args.command]
            result = handler(request, args.apply)
        elif args.command == "project":
            if args.apply:
                result = publish_projection()
            else:
                source = open_database(False)
                connection = sqlite3.connect(":memory:")
                connection.row_factory = sqlite3.Row
                source.backup(connection)
                source.close()
                try:
                    connection.execute("BEGIN")
                    result = projection_from_database(connection)
                    validate_projection(result)
                    connection.rollback()
                finally:
                    connection.close()
        elif args.command == "rebuild":
            connection = open_database(False)
            try:
                result = rebuild_from_events(connection)
            finally:
                connection.close()
            if args.apply:
                if not args.output:
                    raise RuntimeErrorState("--output is required with --apply")
                atomic_json(Path(args.output), result)
                result = {**result, "output": str(Path(args.output)), "applied": True}
            else:
                result = {**result, "applied": False}
        elif args.command == "compatibility-check":
            result = compatibility_check(args.app_version, args.projection_schema, args.plugin_version, args.capability_version, args.database_schema, args.readback_schema)
        elif args.command == "migrate-projection":
            result = migrate_legacy_projection(args.input, args.apply)
        elif args.command == "restore-projection":
            result = restore_projection(args.backup, args.expected_digest, args.apply)
        elif args.command == "reconcile-readback":
            result = reconcile_readback(args.apply)
        else:
            result = status()
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except RuntimeErrorState as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, indent=2), file=sys.stderr)
        return 2
    except sqlite3.Error as exc:
        print(json.dumps({"status": "error", "error": f"Runtime database rejected the operation: {exc}"}, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
