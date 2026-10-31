"""Incident store (SQLite). Write-through cache: every caller shares one Incident object per id, so
background agent steps and API actions never overwrite each other's changes."""

from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

STATUSES = ("reported", "assigned", "in_progress", "fixed", "verified", "lesson_pending", "closed")
OPEN = ("reported", "assigned", "in_progress")  # a new report about the same thing merges into these

# fields kept for the flow but not part of the Incident API shape
_INTERNAL = (
    "students", "held", "broken", "fix_note", "fix_minutes", "fix_took", "eta_why", "escalated",
    "plan_approved_ts", "created", "updated", "merges",
)


def now_iso() -> str:
    return datetime.now(IST).isoformat(timespec="seconds")


@dataclass
class Incident:
    id: str
    dept: str
    category: str
    place: str
    severity: str
    safety_risk: bool
    summary: str
    asset: str = ""
    status: str = "reported"
    reporters: int = 1
    eta: str | None = None
    eta_reason: str = ""
    plan: str = ""
    context: list[dict] = field(default_factory=list)
    timeline: list[dict] = field(default_factory=list)
    awaiting: str | None = None
    lesson: dict | None = None  # {text, memory_id, status: draft | promoted | rejected | unsaved}
    working: str | None = None  # agent step in flight, e.g. "hostel: recalling past fixes"
    # internal
    students: list[str] = field(default_factory=list)
    held: list[str] = field(default_factory=list)
    broken: list[str] = field(default_factory=list)
    fix_note: str = ""
    fix_minutes: int | None = None  # planned
    fix_took: int | None = None  # actual, from the caretaker's note or the clock
    eta_why: str = ""  # ETA reason before any outside event (power cut) moved it
    escalated: bool = False
    plan_approved_ts: float | None = None
    merges: int = 0
    created: float = field(default_factory=time.time)
    updated: float = field(default_factory=time.time)

    def log(self, actor: str, text: str, scripted: bool = False) -> None:
        self.timeline.append({"ts": now_iso(), "actor": actor, "text": text, "scripted": scripted})

    def to_api(self) -> dict:
        d = {k: v for k, v in asdict(self).items() if k not in _INTERNAL}
        d["confirmations"] = {"held": len(self.held), "broken": len(self.broken)}
        return d


class Store:
    def __init__(self, db_path: Path):
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.execute("pragma journal_mode=wal")
        self._db.execute(
            "create table if not exists incidents (id text primary key, dept text, status text,"
            " data text, created real, updated real)"
        )
        self._db.execute("create table if not exists incident_students (incident_id text, student_id text)")
        self._db.commit()
        self._cache: dict[str, Incident] = {}
        for (data,) in self._db.execute("select data from incidents order by created"):
            inc = Incident(**json.loads(data))
            self._cache[inc.id] = inc

    def next_id(self) -> str:
        n = max((int(i.split("-")[1]) for i in self._cache), default=0) + 1
        return f"INC-{n:04d}"

    def add(self, inc: Incident) -> Incident:
        self._cache[inc.id] = inc
        self.save(inc)
        return inc

    def save(self, inc: Incident) -> None:
        inc.updated = time.time()
        self._db.execute(
            "insert or replace into incidents (id, dept, status, data, created, updated) values (?,?,?,?,?,?)",
            (inc.id, inc.dept, inc.status, json.dumps(asdict(inc)), inc.created, inc.updated),
        )
        known = {r[0] for r in self._db.execute("select student_id from incident_students where incident_id=?", (inc.id,))}
        self._db.executemany(
            "insert into incident_students (incident_id, student_id) values (?,?)",
            [(inc.id, s) for s in inc.students if s not in known],
        )
        self._db.commit()

    def get(self, inc_id: str) -> Incident | None:
        return self._cache.get(inc_id)

    def list(self, dept: str | None = None, status: str | None = None) -> list[Incident]:
        return [
            i for i in self._cache.values()
            if (not dept or i.dept == dept) and (not status or i.status == status)
        ]

    def for_student(self, student_id: str) -> list[Incident]:
        ids = [r[0] for r in self._db.execute("select incident_id from incident_students where student_id=?", (student_id,))]
        return [self._cache[i] for i in dict.fromkeys(ids) if i in self._cache]
