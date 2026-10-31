"""The only place the product talks to Meko. Every call is timed and written to the call log."""

from __future__ import annotations

import json
import time
from contextlib import AsyncExitStack
from typing import Any

from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.shared._httpx_utils import create_mcp_http_client

from sunwai import __version__
from sunwai.calllog import CallLog, CallRecord
from sunwai.config import Settings

USER_AGENT = f"sunwai/{__version__} (+https://github.com/Atharv-tw/sunwai)"


class MekoError(RuntimeError):
    pass


def _parse(result: Any) -> Any:
    """Turn a CallToolResult into plain JSON-ish data."""
    if getattr(result, "structured_content", None) is not None:
        return result.structured_content
    texts = [c.text for c in getattr(result, "content", []) if getattr(c, "type", "") == "text"]
    if len(texts) == 1:
        try:
            return json.loads(texts[0])
        except json.JSONDecodeError:
            return texts[0]
    return texts


class Meko:
    """Async Meko MCP client. Use as `async with Meko(settings, log) as meko:`."""

    def __init__(self, settings: Settings, log: CallLog | None = None):
        self.settings = settings
        self.log = log
        self.enabled = settings.meko_enabled
        self._stack: AsyncExitStack | None = None
        self._client: Client | None = None
        self._datapack_ids: dict[str, str] = {}

    async def __aenter__(self) -> Meko:
        if not self.enabled:
            return self
        if not self.settings.meko_api_key.startswith("mko_tkn_"):
            raise MekoError("MEKO_API_KEY is missing or malformed; copy .env.example to .env and set it")
        self._stack = AsyncExitStack()
        http = create_mcp_http_client(
            headers={"Authorization": f"Bearer {self.settings.meko_api_key}", "User-Agent": USER_AGENT}
        )
        await self._stack.enter_async_context(http)
        transport = streamable_http_client(self.settings.meko_mcp_url, http_client=http)
        self._client = await self._stack.enter_async_context(Client(transport))
        return self

    async def __aexit__(self, *exc: Any) -> None:
        if self._stack is not None:
            await self._stack.aclose()

    async def list_tools(self) -> list[Any]:
        assert self._client is not None
        return (await self._client.list_tools()).tools

    async def call(
        self,
        tool: str,
        args: dict[str, Any],
        *,
        actor: str,
        kind: str,
        summary: str = "",
        datapack: str = "",
        scripted: bool = False,
    ) -> Any:
        """Call a Meko tool and log it. Returns parsed result; raises MekoError on tool error."""
        if not self.enabled or self._client is None:
            return None
        start = time.perf_counter()
        ok, err, data = True, "", None
        try:
            result = await self._client.call_tool(tool, {k: v for k, v in args.items() if v is not None})
            data = _parse(result)
            if getattr(result, "is_error", False):
                ok, err = False, str(data)[:500]
        except Exception as e:  # network, protocol
            ok, err = False, f"{type(e).__name__}: {e}"[:500]
        ms = (time.perf_counter() - start) * 1000
        if self.log is not None:
            self.log.record(
                CallRecord(
                    ts=time.time(), actor=actor, tool=tool, datapack=datapack, kind=kind,
                    summary=summary or tool, ms=round(ms, 1), ok=ok, error=err, scripted=scripted,
                )
            )
        if not ok:
            raise MekoError(f"{tool} failed: {err}")
        return data

    # --- datapacks -------------------------------------------------------

    async def datapack_id(self, name: str, *, actor: str = "system", create: bool = True) -> str:
        """Resolve a datapack name to its id, creating it if missing."""
        if name in self._datapack_ids:
            return self._datapack_ids[name]
        found = await self.call(
            "datapack_search", {"name": name, "grant": "owner"}, actor=actor, kind="admin",
            summary=f"find datapack {name}", datapack=name,
        )
        for dp in (found or {}).get("datapacks", []) if isinstance(found, dict) else []:
            if dp.get("name") == name:
                self._datapack_ids[name] = dp.get("id") or dp.get("datapack_id")
                return self._datapack_ids[name]
        if not create:
            raise MekoError(f"datapack {name} not found")
        made = await self.call(
            "datapack_create", {"name": name}, actor=actor, kind="admin",
            summary=f"create datapack {name}", datapack=name,
        )
        dp_id = (made or {}).get("id") or (made or {}).get("datapack_id") if isinstance(made, dict) else None
        if not dp_id:
            raise MekoError(f"datapack_create returned no id: {made!r}")
        self._datapack_ids[name] = dp_id
        return dp_id
