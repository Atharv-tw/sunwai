"""Swarm view API. Owner: Alok. Contract in TASKS.md ("Swarm API"); keep it in sync.

Endpoints:
  GET /api/calls?since=<unix ts>   -> list of CallRecord dicts (history, for window + replay)
  GET /api/events                  -> SSE stream, one `event: call` per new CallRecord
  GET /api/graph                   -> people, agents and datapacks to draw as nodes

Read calls only through sunwai.calllog.CallLog (since / subscribe / unsubscribe).
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from sunwai import config
from sunwai.calllog import CallLog

router = APIRouter(prefix="/api")

# (agent id, label, datapack suffix). The Curator writes to the shared canon datapack.
AGENTS = (
    ("desk", "Desk", "desk"),
    ("hostel", "Hostel", "hostel"),
    ("mess", "Mess", "mess"),
    ("it", "IT", "it"),
    ("curator", "Curator", "canon"),
    ("dean", "Dean", "dean"),
)
PEOPLE = (
    ("student", "Student"),
    ("caretaker", "Caretaker"),
    ("warden", "Warden"),
    ("mess_committee", "Mess committee"),
    ("it_cell", "IT cell"),
    ("electricity", "Electricity"),
)
DATAPACK_LABELS = {"canon": "Canon"}

_fallback_log: CallLog | None = None


def _calllog(request: Request) -> CallLog:
    """Atharv wires app.state.calllog; until then open the configured DB ourselves."""
    global _fallback_log
    log = getattr(request.app.state, "calllog", None)
    if log is not None:
        return log
    if _fallback_log is None:
        _fallback_log = CallLog(config.load().db_path)
    return _fallback_log


@router.get("/calls")
def calls(request: Request, since: float = 0.0) -> list[dict]:
    rows = _calllog(request).since(since, 2000)
    for r in rows:
        r["ok"] = bool(r["ok"])
        r["scripted"] = bool(r["scripted"])
    return rows


@router.get("/graph")
def graph() -> dict:
    s = config.load()
    return {
        "people": [{"id": i, "label": label, "type": "person"} for i, label in PEOPLE],
        "agents": [
            {"id": i, "label": label, "type": "agent", "datapack": s.datapack(dp)} for i, label, dp in AGENTS
        ],
        "datapacks": [
            {"id": s.datapack(dp), "label": DATAPACK_LABELS.get(dp, label), "type": "datapack"}
            for _, label, dp in AGENTS
        ],
    }


def _sse(row: dict) -> str:
    row = {**row, "ok": bool(row["ok"]), "scripted": bool(row["scripted"])}
    return f"event: call\ndata: {json.dumps(row)}\n\n"


@router.get("/events")
async def events(request: Request) -> StreamingResponse:
    log = _calllog(request)

    async def stream():
        q = log.subscribe()
        last_id = max((r["id"] for r in log.since(0.0)), default=0)
        last_ts = log.since(0.0)[-1]["ts"] if last_id else 0.0
        try:
            yield ": connected\n\n"
            while True:
                if await request.is_disconnected():
                    return
                try:
                    rec = await asyncio.wait_for(q.get(), timeout=1.0)
                    if rec.id is not None and rec.id > last_id:
                        row = next((r for r in log.since(rec.ts) if r["id"] == rec.id), None)
                        if row:
                            last_id, last_ts = row["id"], row["ts"]
                            yield _sse(row)
                    continue
                except asyncio.TimeoutError:
                    pass
                # The queue only sees calls made in this process (the fake generator is another one),
                # so also read new rows straight from the log. Same source, just polled.
                new = [r for r in log.since(last_ts) if r["id"] > last_id]
                for row in new:
                    last_id, last_ts = row["id"], row["ts"]
                    yield _sse(row)
                if not new:
                    yield ": keepalive\n\n"
        finally:
            log.unsubscribe(q)

    return StreamingResponse(
        stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
