#!/usr/bin/env python3
"""Report consolidated MONDAY package, vault, planner, and bridge readiness."""

from __future__ import annotations

import json
import os
from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
PLUGIN_ROOT = Path(os.environ.get("MONDAY_PLUGIN_ROOT", PACKAGE_ROOT))
MARKETPLACE = Path(
    os.environ.get("MONDAY_MARKETPLACE_PATH", Path.home() / ".agents/plugins/marketplace.json")
)
CODEX_CACHE_ROOT = Path.home() / ".codex/plugins/cache"
VAULT = Path(
    os.environ.get("MONDAY_PROJECT_KNOWLEDGE_VAULT", Path.home() / "Knowledge Vault/Project Knowledge")
)
MEETING_NOTES = Path(
    os.environ.get("MONDAY_MEETING_NOTES_VAULT", Path.home() / "Knowledge Vault/Meeting Notes")
)
PERSONAL_PROJECTS = Path(
    os.environ.get("MONDAY_PERSONAL_PROJECTS_VAULT", Path.home() / "Knowledge Vault/Personal Project Knowledge")
)
MONDAY_KNOWLEDGE = Path(
    os.environ.get("MONDAY_KNOWLEDGE_ROOT", Path.home() / "Knowledge Vault/Monday Knowledge")
)
SOURCE_ROOT = Path(os.environ.get("MONDAY_SOURCE_ROOT", Path.home() / ".codex/monday-sources"))
PLAN = Path.home() / ".codex/monday-planner/daily-plan.json"
READBACK = Path.home() / ".codex/monday-planner/readback.json"


def manifest_version(path: Path) -> str | None:
    manifest = path / ".codex-plugin" / "plugin.json"
    if not manifest.exists():
        return None
    with manifest.open("r", encoding="utf-8") as handle:
        return json.load(handle).get("version")


def cached_versions() -> list[str]:
    if not CODEX_CACHE_ROOT.exists():
        return []
    return sorted(
        version.name
        for version in CODEX_CACHE_ROOT.glob("*/monday/*")
        if version.is_dir() and manifest_version(version)
    )


def main() -> int:
    source_version = manifest_version(PLUGIN_ROOT)
    versions = cached_versions()
    latest_cache = versions[-1] if versions else None
    status = {
        "plugin_source": str(PLUGIN_ROOT),
        "source_exists": PLUGIN_ROOT.exists(),
        "source_version": source_version,
        "skill_count": len(list((PLUGIN_ROOT / "skills").glob("*/SKILL.md"))),
        "personal_marketplace": str(MARKETPLACE),
        "marketplace_exists": MARKETPLACE.exists(),
        "codex_cached_versions": versions,
        "version_match": bool(source_version and latest_cache == source_version),
        "project_knowledge_vault": str(VAULT),
        "vault_accessible": VAULT.exists(),
        "meeting_notes_vault": str(MEETING_NOTES),
        "meeting_notes_accessible": MEETING_NOTES.exists(),
        "personal_project_vault": str(PERSONAL_PROJECTS),
        "personal_project_vault_accessible": PERSONAL_PROJECTS.exists(),
        "monday_knowledge": str(MONDAY_KNOWLEDGE),
        "monday_knowledge_accessible": MONDAY_KNOWLEDGE.exists(),
        "source_manifest_root": str(SOURCE_ROOT),
        "source_manifest_root_accessible": SOURCE_ROOT.exists(),
        "planner_projection": str(PLAN),
        "planner_projection_exists": PLAN.exists(),
        "native_readback": str(READBACK),
        "native_readback_exists": READBACK.exists(),
        "note": "ChatGPT installation and connector authentication are surface-specific and must be verified in ChatGPT.",
    }
    print(json.dumps(status, indent=2, sort_keys=True))
    return 0 if status["source_exists"] and status["marketplace_exists"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
