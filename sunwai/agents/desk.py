"""Desk: the front door. Classifies a complaint in the student's own words, merges duplicates into one
incident by recalling open incidents from `sunwai-desk`, and hands new ones to a department."""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field

from sunwai.agents.base import Agent, Card, building, clean
from sunwai.config import Settings
from sunwai.llm import LLM
from sunwai.meko import Meko
from sunwai.store import OPEN, Incident, Store

CATEGORIES = ["hostel_electrical", "hostel_plumbing", "mess_food", "wifi_network", "admin_documents", "safety", "other"]

DEPT_OF = {
    "hostel_electrical": "hostel", "hostel_plumbing": "hostel", "safety": "hostel",
    "mess_food": "mess", "wifi_network": "it",
    "admin_documents": "desk", "other": "desk",  # no department in our campus model handles these
}

TRIAGE_TOOL = {
    "type": "function",
    "function": {
        "name": "file_incident",
        "description": "File a campus grievance as a structured incident.",
        "parameters": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string", "enum": CATEGORIES,
                    "description": (
                        "hostel_electrical: geyser/water heater, fan, light, socket, power. "
                        "hostel_plumbing: tap, leak, pipe, flush, shower pressure. "
                        "mess_food: mess food, drinking/RO water. wifi_network: Wi-Fi, LAN, router. "
                        "admin_documents: certificates, fees, forms. "
                        "safety: someone hurt or could be hurt (fall, exposed wire, harassment). other: anything else."
                    ),
                },
                "place": {"type": "string", "description": "Where, e.g. 'Hostel B, floor 2'"},
                "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                "safety_risk": {"type": "boolean"},
                "summary": {"type": "string", "description": "One neutral sentence, no names"},
                "asset": {"type": "string", "description": "The broken thing in one or two words, e.g. 'geyser', 'router'"},
            },
            "required": ["category", "place", "severity", "safety_risk", "summary"],
        },
    },
}

SYSTEM = (
    "You are the front desk of a college grievance system. Read the student's complaint and call "
    "file_incident exactly once. Never include names, phone numbers or roll numbers in the summary."
)

# Canonical asset names, so "water heater" and "geyser" count as the same thing when matching
ASSETS = [
    ("geyser", ("geyser", "water heater", "hot water")),
    ("router", ("router", "wifi", "wi-fi", "wi fi", "internet", "network", "ip address", " lan ", " net ")),
    ("ro_water", ("ro water", "ro filter", "water cooler", "purifier", " ro ")),
    ("food", ("food", "dinner", "lunch", "breakfast", "paneer", "dal", "threw up", "vomit", "sick", "stomach")),
    ("fan", ("fan",)),
    ("light", ("light", "bulb", "tube")),
    ("tap", ("tap", "leak", "pipe", "flush", "drain")),
    ("shower", ("shower", "water pressure")),
    ("document", ("certificate", "bonafide", "document", "transcript")),
]

KEYWORDS = [  # fallback classifier when the LLM is unreachable; order matters
    ("wifi_network", ("wifi", "wi-fi", "wi fi", "router", "internet", "network", "ip address", " net ")),
    ("mess_food", ("mess", "food", "dinner", "lunch", "breakfast", "paneer", "threw up", "vomit", "ro water", "water cooler")),
    ("safety", ("fell", "pitch dark", "unsafe", "harass", "injur")),
    ("hostel_plumbing", ("tap", "leak", "water pressure", "flush", "pipe", "shower", "drain")),
    ("hostel_electrical", ("geyser", "fan", "light", "switch", "socket", "spark", "bulb", "power", "hot water")),
    ("admin_documents", ("certificate", "bonafide", "document", "fee receipt")),
]

INC_RE = re.compile(r"\bINC-\d{4}\b")


def asset_of(*texts: str) -> str:
    blob = f" {' '.join(texts).lower()} "
    for name, words in ASSETS:
        if any(w in blob for w in words):
            return name
    return ""


def place_of(text: str) -> str:
    parts = [building(text)]
    if m := re.search(r"\b(\d)(?:st|nd|rd|th)?\s*floor\b|\bfloor\s*(\d)\b", text, re.I):
        parts.append(f"floor {m.group(1) or m.group(2)}")
    if m := re.search(r"\broom\s*(\d{2,4})\b", text, re.I):
        parts.append(f"room {m.group(1)}")
    return ", ".join(p for p in parts if p)


@dataclass
class Triage:
    category: str
    place: str
    severity: str
    safety_risk: bool
    summary: str
    asset: str
    by: str  # "llm" | "keywords"


@dataclass
class _Pending:
    student: str
    text: str
    triage: Triage
    scripted: bool
    fut: asyncio.Future = field(default_factory=lambda: asyncio.get_running_loop().create_future())


class Desk(Agent):
    name = "desk"
    home = "desk"

    def __init__(self, meko: Meko, llm: LLM, settings: Settings, store: Store):
        super().__init__(meko, llm, settings)
        self.store = store
        self._queues: dict[str, list[_Pending]] = {}
        self._workers: dict[str, asyncio.Task] = {}

    # --- classify ------------------------------------------------------------

    async def classify(self, text: str) -> Triage:
        try:
            r = await self.llm.chat(SYSTEM, text, tools=[TRIAGE_TOOL], tool_choice="required")
            a = r.tool_calls[0].args if r.tool_calls else {}
            if a.get("category") in CATEGORIES and a.get("summary"):
                place = str(a.get("place") or "")
                if place.lower() in ("", "unknown", "not specified", "n/a"):
                    place = place_of(text)
                elif building(place) and building(place) != building(text):
                    place = place_of(text)  # the model named a building the student never mentioned
                return Triage(
                    category=a["category"], place=place, severity=a.get("severity") if a.get("severity") in ("low", "medium", "high") else "medium",
                    safety_risk=bool(a.get("safety_risk")), summary=clean(str(a["summary"]))[:200],
                    asset=asset_of(str(a.get("asset") or ""), a["summary"], text), by="llm",
                )
        except Exception:
            pass
        return self._keywords(text)

    def _keywords(self, text: str) -> Triage:
        low = f" {text.lower()} "
        category = next((c for c, words in KEYWORDS if any(w in low for w in words)), "other")
        risky = any(w in low for w in ("spark", "fell", "threw up", "vomit", "shock", "fire", "unsafe"))
        return Triage(
            category=category, place=place_of(text), severity="high" if risky else "medium", safety_risk=risky,
            summary=clean(text.strip())[:200], asset=asset_of(text), by="keywords",
        )

    # --- file a report -------------------------------------------------------

    async def file(self, student: str, text: str, scripted: bool = False) -> tuple[Incident, bool]:
        """Returns (incident, merged). With Meko off there is nothing to recall, so every report is new."""
        text = clean(text)
        triage = await self.classify(text)
        if not self.meko_on:
            return await self._create(student, triage, scripted), False
        p = _Pending(student, text, triage, scripted)
        self._queues.setdefault(triage.category, []).append(p)
        worker = self._workers.get(triage.category)
        if worker is None or worker.done():
            self._workers[triage.category] = asyncio.create_task(self._drain(triage.category))
        return await p.fut

    async def _drain(self, category: str) -> None:
        """One recall per round answers every queued report of this category. Only the first unmatched
        report creates an incident; the rest wait for the next recall, which can see it in Meko."""
        q = self._queues[category]
        try:
            while q:
                head = q[0]
                t = head.triage
                try:
                    cards = await self.recall(
                        f"{t.asset} {t.summary} {t.place}", summary=f"open incidents like: {t.summary[:60]}",
                        scripted=head.scripted,
                    )
                except Exception:
                    cards = []
                created = False
                for p in list(q):
                    if found := self._match(p.triage, cards):
                        card, inc = found
                        q.remove(p)
                        self._merge(inc, p, card)
                        p.fut.set_result((inc, True))
                    elif not created:
                        q.remove(p)
                        created = True
                        p.fut.set_result((await self._create(p.student, p.triage, p.scripted), False))
        except Exception as e:
            for p in q:
                if not p.fut.done():
                    p.fut.set_exception(e)
            q.clear()

    def _match(self, t: Triage, cards: list[Card]) -> tuple[Card, Incident] | None:
        for card in cards:
            for inc_id in INC_RE.findall(card.text):
                inc = self.store.get(inc_id)
                if inc is None or inc.status not in OPEN or inc.category != t.category:
                    continue
                if inc.desk_memory and card.memory_id != inc.desk_memory:
                    continue  # a memory from an older local DB that reused this id
                a, b = building(inc.place), building(t.place)
                if a and b and a != b:
                    continue
                if inc.asset and t.asset and inc.asset != t.asset:
                    continue
                return card, inc
        return None

    def _merge(self, inc: Incident, p: _Pending, card: Card) -> None:
        inc.reporters += 1
        inc.merges += 1
        if p.student not in inc.students:
            inc.students.append(p.student)
        inc.log("desk", f"Merged a report from {p.student}: Desk recalled {inc.id} (memory {card.memory_id[:8]}).", p.scripted)
        inc.log("desk", f"To {p.student}: {self.status_line(inc)}", p.scripted)
        self.store.save(inc)

    async def _create(self, student: str, t: Triage, scripted: bool) -> Incident:
        dept = DEPT_OF.get(t.category, "desk")
        place = t.place or ("Mess" if dept == "mess" else "unknown")
        inc = Incident(
            id=self.store.next_id(), dept=dept, category=t.category, place=place,
            severity=t.severity, safety_risk=t.safety_risk, summary=t.summary, asset=t.asset, students=[student],
        )
        how = "the local model" if t.by == "llm" else "keyword rules (local model unavailable or timed out)"
        inc.log("desk", f"Filed from {student}'s report; classified by {how} as {t.category}.", scripted)
        if dept == "desk":
            inc.plan = "No department in this campus model handles this; Desk logged it for the admin office."
        self.store.add(inc)
        inc.desk_memory = await self.remember(
            f"{inc.id} ({dept}, {t.asset or t.category}) at {inc.place}: {t.summary}",
            summary=f"file {inc.id}: {t.summary[:60]}", scripted=scripted,
        )
        self.store.save(inc)
        return inc

    async def hand_off(self, inc: Incident, scripted: bool = False) -> None:
        """A note into the department's datapack: one visible share edge (D-006)."""
        await self.remember(
            f"New from Desk: {inc.id} ({inc.dept}, {inc.asset or inc.category}) at {inc.place}: {inc.summary}. "
            f"Severity {inc.severity}.",
            into=inc.dept, summary=f"hand {inc.id} to {inc.dept}", scripted=scripted,
        )

    @staticmethod
    def status_line(inc: Incident) -> str:
        words = {
            "reported": "received, being routed", "assigned": "plan waiting for staff approval",
            "in_progress": "being fixed", "fixed": "marked fixed, please confirm it held",
            "verified": "fix confirmed", "lesson_pending": "fix confirmed", "closed": "closed",
        }[inc.status]
        others = inc.reporters - 1
        line = f"{inc.id}: {words}."
        if others:
            line += f" {others} other student{'s' if others != 1 else ''} reported the same thing."
        if inc.eta:
            line += f" ETA {inc.eta[11:16]} because {inc.eta_reason}."
        return line
