"""The only place the product talks to Meko. Every call is timed and written to the call log."""

from __future__ import annotations

import asyncio
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


def agent_id(actor: str) -> str:
    """Stable Meko agent id for a product actor (Meko asks non-coding clients for a stable client name)."""
    return f"sunwai:{actor}"


def _first_key(obj: Any, keys: tuple[str, ...]) -> str:
    """Find the first of `keys` in a (possibly nested) Meko payload."""
    if isinstance(obj, dict):
        for k in keys:
            if isinstance(obj.get(k), str) and obj[k]:
                return obj[k]
        for v in obj.values():
            if found := _first_key(v, keys):
                return found
    elif isinstance(obj, list):
        for v in obj:
            if found := _first_key(v, keys):
                return found
    return ""


def _loads(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _parse(result: Any) -> Any:
    """Turn a CallToolResult into plain data. Meko wraps payloads as {"result": "<json string>"}."""
    data = getattr(result, "structured_content", None)
    if data is None:
        texts = [c.text for c in getattr(result, "content", []) if getattr(c, "type", "") == "text"]
        data = _loads(texts[0]) if len(texts) == 1 else texts
    if isinstance(data, dict) and set(data) == {"result"}:
        data = _loads(data["result"])
    return data


def _error_of(data: Any) -> str:
    """Meko reports tool failures in the payload ({"error": ..., "detail": ...}), not via is_error."""
    if isinstance(data, dict) and data.get("error"):
        return f"{data['error']}: {data.get('detail', '')}".strip(": ")
    return ""


class Meko:
    """Async Meko MCP client. Use as `async with Meko(settings, log) as meko:`."""

    def __init__(self, settings: Settings, log: CallLog | None = None):
        self.settings = settings
        self.log = log
        self.enabled = settings.meko_enabled
        self._stack: AsyncExitStack | None = None
        self._client: Client | None = None
        self._datapack_ids: dict[str, str] = {}
        self._conversations: dict[tuple[str, str], str] = {}
        self._locks: dict[object, asyncio.Lock] = {}  # parallel recalls must not open the same thing twice
        self._params: dict[str, set[str]] = {}  # tool -> accepted argument names

    async def __aenter__(self) -> Meko:
        if not self.enabled:
            return self
        await self._connect()
        return self

    async def _connect(self) -> None:
        if not self.settings.meko_api_key.startswith("mko_tkn_"):
            raise MekoError("MEKO_API_KEY is missing or malformed; copy .env.example to .env and set it")
        self._stack = AsyncExitStack()
        http = create_mcp_http_client(
            headers={"Authorization": f"Bearer {self.settings.meko_api_key}", "User-Agent": USER_AGENT}
        )
        await self._stack.enter_async_context(http)
        transport = streamable_http_client(self.settings.meko_mcp_url, http_client=http)
        self._client = await self._stack.enter_async_context(Client(transport))
        for t in await self.list_tools():
            schema = getattr(t, "input_schema", None) or {}
            self._params[t.name] = set(schema.get("properties") or {})

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
        args = {k: v for k, v in args.items() if v is not None}
        accepts = self._params.get(tool, set())
        if "agent_id" in accepts:
            args.setdefault("agent_id", agent_id(actor))
        if "conversation_id" in accepts and "conversation_id" not in args:
            args["conversation_id"] = await self.conversation(actor, args.get("datapack_id", ""), scripted=scripted)
        start = time.perf_counter()
        ok, err, data = True, "", None
        try:
            result = await self._client.call_tool(tool, args)
            data = _parse(result)
            err = _error_of(data) or (str(data)[:500] if getattr(result, "is_error", False) else "")
            ok = not err
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

    # --- conversations -----------------------------------------------------

    def _lock(self, key: object) -> asyncio.Lock:
        return self._locks.setdefault(key, asyncio.Lock())

    async def conversation(self, actor: str, datapack_id: str = "", *, scripted: bool = False) -> str:
        """One working conversation per (actor, datapack). Meko needs a conversation_id on nearly every call.

        session_id is stable, so a restart reconnects the same conversation instead of making a new one.
        """
        key = (actor, datapack_id)
        async with self._lock(key):
            if key not in self._conversations:
                made = await self.call(
                    "conversation_create",
                    {"agent_id": agent_id(actor), "title": f"{actor} work log", "datapack_id": datapack_id or None,
                     "session_id": f"sunwai:{actor}:{datapack_id or 'default'}"},
                    actor=actor, kind="admin", summary=f"open {actor} conversation", scripted=scripted,
                )
                conv = _first_key(made, ("conversation_id", "id"))
                if not conv:
                    raise MekoError(f"conversation_create returned no id: {made!r}")
                self._conversations[key] = conv
        return self._conversations[key]

    # --- datapacks -------------------------------------------------------

    async def datapack_id(self, name: str, *, actor: str = "system", create: bool = True) -> str:
        """Resolve a datapack name to its id, creating it if missing. Returns "" when Meko is off."""
        if not self.enabled:
            return ""
        async with self._lock(name):
            return await self._resolve(name, actor, create)

    async def _resolve(self, name: str, actor: str, create: bool) -> str:
        if name in self._datapack_ids:
            return self._datapack_ids[name]
        found = await self.call(
            "datapack_search", {"name": name}, actor=actor, kind="admin",
            summary=f"find datapack {name}", datapack=name,
        )
        for dp in (found or {}).get("datapacks", []) if isinstance(found, dict) else []:
            if (dp.get("datapack_name") or dp.get("name")) == name:
                self._datapack_ids[name] = _first_key(dp, ("datapack_id", "id"))
                return self._datapack_ids[name]
        if not create:
            raise MekoError(f"datapack {name} not found")
        made = await self.call(
            "datapack_create", {"name": name}, actor=actor, kind="admin",
            summary=f"create datapack {name}", datapack=name,
        )
        dp_id = _first_key(made, ("datapack_id", "id"))
        if not dp_id:
            raise MekoError(f"datapack_create returned no id: {made!r}")
        self._datapack_ids[name] = dp_id
        return dp_id
