"""Log of every Meko call the product makes. The swarm view is drawn only from this log."""

from __future__ import annotations

import asyncio
import json
import sqlite3
import time
from dataclasses import asdict, dataclass
from pathlib import Path

# kind tells the swarm view how to draw the edge
KINDS = ("write", "read", "promote", "share", "admin")


@dataclass
class CallRecord:
    ts: float
    actor: str  # agent or person who caused the call, e.g. "desk", "caretaker"
    tool: str
    datapack: str
    kind: str
    summary: str
    ms: float
    ok: bool
    error: str = ""
    scripted: bool = False
    id: int | None = None


class CallLog:
    def __init__(self, db_path: Path):
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.execute(
            """create table if not exists meko_calls (
                id integer primary key autoincrement,
                ts real, actor text, tool text, datapack text, kind text,
                summary text, ms real, ok integer, error text, scripted integer)"""
        )
        self._db.commit()
        self._subscribers: set[asyncio.Queue[CallRecord]] = set()

    def record(self, rec: CallRecord) -> CallRecord:
        cur = self._db.execute(
            "insert into meko_calls (ts, actor, tool, datapack, kind, summary, ms, ok, error, scripted)"
            " values (?,?,?,?,?,?,?,?,?,?)",
            (rec.ts, rec.actor, rec.tool, rec.datapack, rec.kind, rec.summary, rec.ms, int(rec.ok), rec.error, int(rec.scripted)),
        )
        self._db.commit()
        rec.id = cur.lastrowid
        for q in list(self._subscribers):
            q.put_nowait(rec)
        return rec

    def since(self, ts: float = 0.0, limit: int = 2000) -> list[dict]:
        rows = self._db.execute(
            "select id, ts, actor, tool, datapack, kind, summary, ms, ok, error, scripted"
            " from meko_calls where ts >= ? order by id limit ?",
            (ts, limit),
        ).fetchall()
        keys = ("id", "ts", "actor", "tool", "datapack", "kind", "summary", "ms", "ok", "error", "scripted")
        return [dict(zip(keys, r)) for r in rows]

    def subscribe(self) -> asyncio.Queue[CallRecord]:
        q: asyncio.Queue[CallRecord] = asyncio.Queue()
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[CallRecord]) -> None:
        self._subscribers.discard(q)


def to_json(rec: CallRecord) -> str:
    return json.dumps(asdict(rec))


def now() -> float:
    return time.time()
