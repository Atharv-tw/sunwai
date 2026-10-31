"""Meko round trip with the product's key: tool schemas, datapacks, memory add/search/promote, latency.

    uv run python scripts/smoke_meko.py

Writes tool schemas to data/meko_tools.json and a summary to data/smoke_meko.json.
Uses a scratch datapack `sw-smoke` so product datapacks stay clean.
"""

from __future__ import annotations

import asyncio
import json
import statistics
import sys
import time
import uuid

from sunwai import config
from sunwai.calllog import CallLog
from sunwai.meko import Meko

USED_TOOLS = (
    "datapack_list", "datapack_search", "datapack_create", "memory_add", "memory_search",
    "memory_get_all", "memory_promote", "context_search", "conversation_create", "conversation_add_message",
)
N = 5


def ids_in(obj) -> list[str]:
    """Find memory ids in whatever shape memory_add/memory_search return."""
    found = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("id", "memory_id") and isinstance(v, str):
                found.append(v)
            else:
                found += ids_in(v)
    elif isinstance(obj, list):
        for v in obj:
            found += ids_in(v)
    return found


async def timed(meko: Meko, tool: str, args: dict, **kw) -> tuple[float, object]:
    t = time.perf_counter()
    out = await meko.call(tool, args, actor="smoke", **kw)
    return (time.perf_counter() - t) * 1000, out


async def main() -> int:
    s = config.load()
    s.db_path.parent.mkdir(parents=True, exist_ok=True)
    log = CallLog(s.db_path.parent / "smoke.db")
    summary: dict = {"latency_ms": {}}
    async with Meko(s, log) as meko:
        tools = await meko.list_tools()
        schemas = {t.name: t.input_schema if hasattr(t, "input_schema") else getattr(t, "inputSchema", None) for t in tools}
        (s.db_path.parent / "meko_tools.json").write_text(json.dumps(schemas, indent=2, default=str))
        print(f"{len(tools)} tools. Params of the ones we use:")
        for name in USED_TOOLS:
            sch = schemas.get(name) or {}
            props = list((sch.get("properties") or {}).keys())
            print(f"  {name}: required={sch.get('required', [])} props={props}")

        lat, dps = await timed(meko, "datapack_list", {}, kind="admin")
        print("\ndatapack_list ->", json.dumps(dps, default=str)[:400])

        dp = await meko.datapack_id("sw-smoke", actor="smoke")
        print("sw-smoke id:", dp)

        marker = uuid.uuid4().hex[:8]
        text = f"Smoke test {marker}: Hostel B second-floor geyser trips when the thermostat is set above 60C."
        lat, added = await timed(meko, "memory_add", {"text": text, "agent_id": "smoke", "datapack_id": dp}, kind="write", datapack="sw-smoke")
        print("\nmemory_add ->", json.dumps(added, default=str)[:400])
        added_ids = ids_in(added)

        # write -> searchable lag
        t0 = time.perf_counter()
        lag = None
        hit = None
        for _ in range(30):
            _, res = await timed(meko, "memory_search", {"query": f"geyser thermostat {marker}", "datapack_id": dp, "limit": 5}, kind="read", datapack="sw-smoke")
            if marker in json.dumps(res, default=str):
                lag = time.perf_counter() - t0
                hit = res
                break
            await asyncio.sleep(1)
        summary["write_to_searchable_s"] = round(lag, 2) if lag is not None else None
        print(f"\nwrite->searchable lag: {summary['write_to_searchable_s']}s")
        print("memory_search ->", json.dumps(hit, default=str)[:400])
        mem_ids = added_ids or ids_in(hit)

        # latency per tool
        for tool, args, kind in [
            ("datapack_list", {}, "admin"),
            ("memory_search", {"query": "geyser", "datapack_id": dp, "limit": 5}, "read"),
            ("context_search", {"query": "geyser", "datapack_id": dp, "limit": 5}, "read"),
            ("memory_get_all", {"datapack_id": dp}, "read"),
        ]:
            ms = [(await timed(meko, tool, args, kind=kind, datapack="sw-smoke"))[0] for _ in range(N)]
            summary["latency_ms"][tool] = {"n": N, "p50": round(statistics.median(ms)), "max": round(max(ms))}

        _, ctx = await timed(meko, "context_search", {"query": f"geyser {marker}", "datapack_id": dp}, kind="read", datapack="sw-smoke")
        print("\ncontext_search ->", json.dumps(ctx, default=str)[:500])

        # promote
        if mem_ids:
            lat, promoted = await timed(meko, "memory_promote", {"memory_ids": mem_ids[:1], "datapack_id": dp, "agent_id": "smoke"}, kind="promote", datapack="sw-smoke")
            summary["latency_ms"]["memory_promote"] = {"n": 1, "p50": round(lat), "max": round(lat)}
            print("\nmemory_promote ->", json.dumps(promoted, default=str)[:400])
            _, shared = await timed(meko, "memory_get_all", {"datapack_id": dp, "promoted": True}, kind="read", datapack="sw-smoke")
            summary["promoted_visible_in_get_all"] = marker in json.dumps(shared, default=str)
            print("memory_get_all(promoted) ->", json.dumps(shared, default=str)[:400])
        else:
            print("\nno memory id found; skipping promote")

    (s.db_path.parent / "smoke_meko.json").write_text(json.dumps(summary, indent=2))
    print("\nSUMMARY", json.dumps(summary, indent=2))
    print(f"logged calls: {len(log.since())}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
