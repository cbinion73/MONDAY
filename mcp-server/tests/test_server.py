from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from monday_health_mcp import server


@pytest.mark.asyncio
async def test_returns_vitals_payload() -> None:
    response = MagicMock()
    response.json.return_value = {"ok": True, "data": {"freshness": "fresh"}}
    response.raise_for_status.return_value = None
    client = MagicMock()
    client.get = AsyncMock(return_value=response)
    client.get.return_value = response
    client.__aenter__.return_value = client

    with patch.object(server.httpx, "AsyncClient", return_value=client):
        result = await server.vitals_health_overview()

    assert result == {
        "available": True,
        "resource": "overview",
        "data": {"freshness": "fresh"},
    }


@pytest.mark.asyncio
async def test_reports_unavailable_vitals_without_fabricating_status() -> None:
    client = MagicMock()
    client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
    client.__aenter__.return_value = client

    with patch.object(server.httpx, "AsyncClient", return_value=client):
        result = await server.vitals_health_overview()

    assert result["available"] is False
    assert result["resource"] == "overview"
    assert "do not infer" in result["next_action"]
