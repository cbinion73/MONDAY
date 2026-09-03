"""Read-only MCP surface for MONDAY's VITALS evidence.

This server deliberately does not accept or fetch ChatGPT Health records. ChatGPT
Health remains an OpenAI-managed source selected by the user in the conversation.
The server exposes only the relevant VITALS summaries to a separately authorized
MCP app, normally through Secure MCP Tunnel.
"""
from __future__ import annotations

import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP


DEFAULT_BASE_URL = "http://127.0.0.1:8765"
DEFAULT_MCP_PORT = 8788
SAFE_PATHS = {
    "overview": "/api/vitals/overview",
    "training": "/api/vitals/training",
    "sleep": "/api/vitals/sleep",
    "council_roster": "/api/vitals/council/roster",
    "council_latest": "/api/vitals/council/latest",
    "intelligence_usage": "/api/vitals/intelligence/usage",
}

mcp = FastMCP(
    "Monday Health",
    instructions=(
        "Use this app only alongside the user's authorized health context. "
        "It reads VITALS summaries; it cannot read ChatGPT Health records and it "
        "cannot create appointments, change medication, write HealthKit data, or "
        "convene a paid Council consultation."
    ),
    host=os.environ.get("MONDAY_HEALTH_MCP_HOST", "127.0.0.1"),
    port=int(os.environ.get("MONDAY_HEALTH_MCP_PORT", str(DEFAULT_MCP_PORT))),
)


def _base_url() -> str:
    return os.environ.get("MONDAY_VITALS_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


async def _get(resource: str) -> dict[str, Any]:
    path = SAFE_PATHS[resource]
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{_base_url()}{path}")
            response.raise_for_status()
    except httpx.HTTPError as error:
        return {
            "available": False,
            "resource": resource,
            "reason": f"VITALS is unavailable: {error}",
            "next_action": "Start or reconnect the private VITALS service; do not infer current health status.",
        }

    try:
        payload = response.json()
    except ValueError:
        return {
            "available": False,
            "resource": resource,
            "reason": "VITALS returned a non-JSON response.",
        }
    return {
        "available": bool(payload.get("ok", True)),
        "resource": resource,
        "data": payload.get("data", payload),
    }


@mcp.tool()
async def vitals_connection_status() -> dict[str, Any]:
    """Confirm whether the private VITALS service is available before using its data."""
    result = await _get("overview")
    return {
        "vitals_available": result["available"],
        "source": "VITALS private service",
        "detail": result.get("reason") or "VITALS overview is reachable.",
        "boundary": "This does not confirm ChatGPT Health availability or freshness.",
    }


@mcp.tool()
async def vitals_health_overview() -> dict[str, Any]:
    """Read the current VITALS evidence summary, readiness, and safe next actions."""
    return await _get("overview")


@mcp.tool()
async def vitals_training_status() -> dict[str, Any]:
    """Read VITALS routines, scheduled work, active session, and completed-work history."""
    return await _get("training")


@mcp.tool()
async def vitals_sleep_status() -> dict[str, Any]:
    """Read VITALS sleep evidence, trend summary, and any recorded self-report context."""
    return await _get("sleep")


@mcp.tool()
async def longevity_council_status() -> dict[str, Any]:
    """Read the Longevity Council roster, scope, and most recent saved result without convening it."""
    roster = await _get("council_roster")
    latest = await _get("council_latest")
    return {"roster": roster, "latest": latest, "boundary": "No Council consultation was initiated."}


@mcp.tool()
async def vitals_intelligence_status() -> dict[str, Any]:
    """Read VITALS Council budget and readiness metadata without exposing health content."""
    return await _get("intelligence_usage")


FRESHNESS_KEYS = ("as_of", "updated_at", "last_updated", "date", "generated_at")


def _freshness(resource: dict[str, Any]) -> dict[str, Any]:
    data = resource.get("data") if isinstance(resource.get("data"), dict) else {}
    found = {key: data[key] for key in FRESHNESS_KEYS if key in data}
    return {
        "available": resource["available"],
        "reason": resource.get("reason"),
        "freshness_fields_found": found or None,
        "note": None if found else "VITALS did not report a recognized freshness field for this resource; do not infer how current it is.",
    }


@mcp.tool()
async def vitals_evidence_watch() -> dict[str, Any]:
    """Check only whether VITALS overview, training, and sleep evidence is currently reachable and
    what freshness metadata (if any) each resource reports. This performs no clinical judgment: it
    never decides that a change is significant, never convenes the Longevity Council, and never
    alerts anyone. It exists to make the mechanical, non-diagnostic half of health surveillance
    (is the evidence present and how old is it) checkable on request or from a Chris-configured
    scheduled task, while true red-flag thresholds remain something Chris and Helen Cho define
    explicitly rather than something this tool assumes.
    """
    overview = await _get("overview")
    training = await _get("training")
    sleep = await _get("sleep")
    resources = {"overview": _freshness(overview), "training": _freshness(training), "sleep": _freshness(sleep)}
    return {
        "resources": resources,
        "all_available": all(r["available"] for r in resources.values()),
        "boundary": (
            "Evidence-presence only. A missing or stale resource is a data-quality signal, not a "
            "diagnosis. Never convene the Longevity Council or state a health conclusion from this "
            "result alone; use vitals_health_overview, vitals_training_status, and vitals_sleep_status "
            "for the actual clinical content."
        ),
    }


def main() -> None:
    """Run locally for use through Secure MCP Tunnel; never bind VITALS publicly."""
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    main()
