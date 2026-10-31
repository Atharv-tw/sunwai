"""Department agents (Hostel, Mess, IT). Before planning, each recalls its own datapack (past fixes, notes
other departments wrote in) and the verified lessons in `sunwai-canon`, all in parallel (D-017).
The plan and ETA are derived from what Meko returned, never invented, and every card cites its memory id."""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta

from sunwai.agents.base import Agent, Card, building
from sunwai.config import Settings
from sunwai.llm import LLM
from sunwai.meko import Meko
from sunwai.store import IST, OPEN, Incident

ROLES = {"hostel": ("caretaker", "warden"), "mess": ("mess_committee", "mess_committee"), "it": ("it_cell", "it_cell")}
LABEL = {"hostel": "Hostel", "mess": "Mess", "it": "IT", "desk": "Desk"}
DEFAULT_MINUTES = {"high": 240, "medium": 1440, "low": 4320}  # when nothing in memory says better

TAG_RE = re.compile(r"\((\w+), ([\w_]+)\)")
TOOK_RE = re.compile(r"(?:Took|takes about) (\d+) min")
SRC_RE = re.compile(r"\b(INC-\d{4})\b|\b(?:on|history) (\d{4}-\d\d-\d\d)\b")
DATE_RE = re.compile(r"\b(\d{4}-\d\d-\d\d)\b")
CUT_RE = re.compile(r"POWER CUT at (.+?) until (\d{4}-\d\d-\d\dT[\d:]+(?:[+-]\d\d:\d\d)?)")


def hhmm(iso: str) -> str:
    return iso[11:16]


def lesson_part(text: str, key: str) -> str:
    """Lessons are 'LESSON (dept, asset) from SRC at PLACE | root cause: ... | fix: ... | takes about N min | ...'."""
    for part in text.split(" | ")[1:]:
        if part.startswith(f"{key}: "):
            return part[len(key) + 2:].strip()
    return ""


def lesson_date(text: str) -> str:
    m = DATE_RE.search(text.split(" | ")[0])
    return m.group(1) if m else ""


def source(text: str) -> str:
    """Where a memory came from: an incident id, or 'history <date>' for seeded past cases."""
    m = SRC_RE.search(text)
    if not m:
        return "a past case"
    return m.group(1) or f"the {m.group(2)} case"


def tag_matches(text: str, dept: str, asset: str) -> bool:
    m = TAG_RE.search(text)
    return bool(m and m.group(1) == dept and m.group(2) == asset)


def active_cut(cards: list[Card], place: str) -> tuple[Card, datetime] | None:
    """Latest power cut at this building that hasn't ended yet."""
    b, best = building(place), None
    for c in cards:
        m = CUT_RE.search(c.text)
        if not m or building(m.group(1)) != b:
            continue
        try:
            until = datetime.fromisoformat(m.group(2))
        except ValueError:
            continue
        if until.tzinfo is None:
            until = until.replace(tzinfo=IST)
        if until > datetime.now(IST) and (best is None or until > best[1]):
            best = (c, until)
    return best


def _unique(cards: list[Card]) -> list[Card]:
    seen, out = set(), []
    for c in cards:
        if c.memory_id not in seen:
            seen.add(c.memory_id)
            out.append(c)
    return out


class Department(Agent):
    def __init__(self, dept: str, meko: Meko, llm: LLM, settings: Settings):
        super().__init__(meko, llm, settings)
        self.name = self.home = dept
        self.staff, self.approver = ROLES[dept]

    def tag(self, inc: Incident) -> str:
        return inc.asset or inc.category

    async def plan(self, inc: Incident, scripted: bool = False) -> None:
        b = building(inc.place)
        jobs = [
            self.recall(f"{inc.asset} {inc.summary} {inc.place}", summary=f"past fixes: {self.tag(inc)} {b}".strip(), scripted=scripted),
            self.recall_canon(f"{inc.asset} {inc.summary}", scripted=scripted),
        ]
        if b:
            jobs.append(self.recall(f"power cut {b}", summary=f"events at {b}", scripted=scripted))
        results = await asyncio.gather(*jobs, return_exceptions=True)
        lists = [r if isinstance(r, list) else [] for r in results]
        errors = [r for r in results if isinstance(r, Exception)]
        own = _unique([c for c in lists[0] + (lists[2] if b else []) if inc.id not in c.text])
        canon = lists[1]

        tag = self.tag(inc)
        lessons = [c for c in canon if c.text.startswith("LESSON") and tag_matches(c.text, self.name, tag)]
        fixes = [c for c in own if c.text.startswith("FIX ") and not c.text.startswith("FIX DID NOT HOLD")
                 and tag_matches(c.text, self.name, tag)]
        failed = [c for c in own if c.text.startswith("FIX DID NOT HOLD") and tag_matches(c.text, self.name, tag)]
        cut = active_cut(own, inc.place)

        what = f"the {inc.asset.replace('_', ' ')}" if inc.asset else inc.category.replace("_", " ")
        if lessons and (fix := lesson_part(lessons[0].text, "fix")):
            src, took = source(lessons[0].text), TOOK_RE.search(lessons[0].text)
            inc.plan = f"Verified fix from {src}: {fix.rstrip('.')}. Do this first."
            minutes = int(took.group(1)) if took else DEFAULT_MINUTES[inc.severity]
            why = f"verified lesson from {src}: the fix takes ~{minutes} min" if took else f"verified lesson from {src}; no duration on record"
        elif fixes:
            src = source(fixes[0].text)
            note = fixes[0].text.split(": ", 1)[-1]
            inc.plan = f"Same fault fixed before ({src}): {note} Try that first; students never confirmed it held."
            took = TOOK_RE.search(fixes[0].text)
            minutes = int(took.group(1)) if took else DEFAULT_MINUTES[inc.severity]
            why = f"past fix {src} took {minutes} min" if took else f"default for {inc.severity} severity"
        else:
            inc.plan = f"Inspect {what} at {inc.place}. No past fix on record."
            minutes, why = DEFAULT_MINUTES[inc.severity], f"no past fix on record: default for {inc.severity} severity"
        if failed:
            inc.plan += f" Careful: the fix tried on {source(failed[0].text)} did not hold."

        inc.fix_minutes, inc.eta_why = minutes, why
        inc.context = [c.api() for c in (lessons[:1] + fixes[:2] + failed[:1] + ([cut[0]] if cut else []))]
        self.set_eta(inc, cut[1] if cut else None)

        label = LABEL[self.name]
        if not self.meko_on:
            inc.log(self.name, f"{label} agent: Meko is off, so no past fixes, lessons or notes were recalled.", scripted)
        else:
            inc.log(
                self.name,
                f"{label} agent recalled {len(own)} notes from {self.dp_name()} and {len(canon)} from "
                f"{self.dp_name('canon')}; {len(inc.context)} used as context.", scripted,
            )
        for e in errors:
            inc.log(self.name, f"Recall failed: {e}", scripted)
        inc.log(self.name, f"Proposed plan: {inc.plan} ETA {hhmm(inc.eta)} ({inc.eta_reason}). Waiting for the {self.staff}.", scripted)
        inc.status, inc.awaiting = "assigned", self.staff

    def set_eta(self, inc: Incident, cut_until: datetime | None) -> None:
        start, reasons = datetime.now(IST), []
        if cut_until and cut_until > start:
            start = cut_until
            reasons.append(f"power cut until {cut_until.strftime('%H:%M')} (electricity)")
        reasons.append(inc.eta_why)
        inc.eta = (start + timedelta(minutes=inc.fix_minutes or DEFAULT_MINUTES[inc.severity])).isoformat(timespec="seconds")
        inc.eta_reason = "; ".join(reasons)

    async def on_power_cut(self, inc: Incident, scripted: bool = False) -> None:
        """Another department wrote a power-cut note into our datapack: recall it and move the ETA."""
        b = building(inc.place)
        cards = await self.recall(f"power cut {b}", summary=f"events at {b}", scripted=scripted)
        cut = active_cut(cards, inc.place)
        if not cut or inc.status not in OPEN:
            return
        old = inc.eta
        if not any(c["memory_id"] == cut[0].memory_id for c in inc.context):
            inc.context.append(cut[0].api())
        self.set_eta(inc, cut[1])
        inc.log(
            self.name,
            f"{LABEL[self.name]} agent: ETA moved from {hhmm(old) if old else 'none'} to {hhmm(inc.eta)}: "
            f"{inc.eta_reason} (memory {cut[0].memory_id[:8]}).", scripted,
        )

    async def on_merge(self, inc: Incident, scripted: bool = False) -> None:
        """Called when Desk merges another report into one of our incidents."""

    # --- what people did, written into the department's memory -------------

    async def record_approval(self, inc: Incident, role: str, scripted: bool = False) -> None:
        await self.remember(
            f"{inc.id} plan approved by the {role}: {inc.plan}", actor=role, kind="approval",
            summary=f"{role} approved plan for {inc.id}", scripted=scripted,
        )

    async def record_fix(self, inc: Incident, role: str, scripted: bool = False) -> None:
        await self.remember(
            f"FIX {inc.id} ({self.name}, {self.tag(inc)}) at {inc.place}: {inc.fix_note.rstrip('.')}. Took {inc.fix_took} min.",
            actor=role, kind="write", summary=f"{role} recorded fix for {inc.id}", scripted=scripted,
        )

    async def fix_failed(self, inc: Incident, note: str, scripted: bool = False) -> None:
        await self.remember(
            f"FIX DID NOT HOLD {inc.id} ({self.name}, {self.tag(inc)}) at {inc.place}: {note or 'a student reports it is still broken'}",
            actor="student", kind="approval", summary=f"student: {inc.id} fix did not hold", scripted=scripted,
        )


class Mess(Department):
    """Clusters sickness reports and escalates food safety to the mess committee."""

    CLUSTER = 3

    def __init__(self, meko: Meko, llm: LLM, settings: Settings):
        super().__init__("mess", meko, llm, settings)

    async def plan(self, inc: Incident, scripted: bool = False) -> None:
        await super().plan(inc, scripted)
        self._safety_plan(inc)  # reports may have clustered while we were recalling
        await self.on_merge(inc, scripted)

    @staticmethod
    def _safety_plan(inc: Incident) -> None:
        if inc.escalated and not inc.plan.startswith("FOOD SAFETY"):
            inc.plan = (
                f"FOOD SAFETY: {inc.reporters} students report the same problem ({inc.summary}). Hold the dish, keep "
                f"samples, inspect the kitchen before the next meal. " + inc.plan
            )

    async def on_merge(self, inc: Incident, scripted: bool = False) -> None:
        if inc.escalated or inc.asset != "food" or inc.reporters < self.CLUSTER:
            return
        inc.escalated, inc.severity, inc.safety_risk = True, "high", True
        self._safety_plan(inc)
        inc.log("mess", f"Mess agent: {inc.reporters} reports clustered into {inc.id}; escalated to the mess committee as a safety risk.", scripted)
        await self.remember(
            f"ESCALATED {inc.id} (mess, food) at {inc.place}: {inc.reporters} students reported {inc.summary}",
            summary=f"escalate {inc.id} to mess committee", scripted=scripted,
        )
