"""What every agent shares: Meko recall/write helpers that return context cards, scrubbing, place parsing."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from sunwai.config import Settings
from sunwai.llm import LLM
from sunwai.meko import Meko

try:  # Arun's module (TASKS.md R1); the fallback below only covers the basics until it lands
    from sunwai.privacy import pseudonym, scrub
except ImportError:
    _PII = [
        ("email", re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")),
        ("phone", re.compile(r"(?:\+91[\s-]?)?\b[6-9]\d{9}\b")),
        ("roll", re.compile(r"\b(?:\d{2}[A-Z]{2,4}\d{2,4}|2K\d{2}/[A-Z]{2,4}/\d{2,4})\b", re.I)),
        ("name", re.compile(r"(?<=\bmy name is )[A-Z][a-z]+(?: [A-Z][a-z]+)?", re.I)),
    ]

    def scrub(text: str) -> tuple[str, list[str]]:
        removed = []
        for kind, rx in _PII:
            text, n = rx.subn(f"[{kind}]", text)
            if n:
                removed.append(kind)
        return text, removed

    def pseudonym(seed: str) -> str:
        return "S-" + hashlib.sha256(seed.encode()).hexdigest()[:4]


def clean(text: str) -> str:
    return scrub(text)[0]


_BUILDINGS = [
    (re.compile(r"\bhostel\s*-?\s*([a-e])\b", re.I), lambda m: f"Hostel {m.group(1).upper()}"),
    (re.compile(r"\bblock\s*-?\s*([a-h])\b", re.I), lambda m: f"Block {m.group(1).upper()}"),
    (re.compile(r"\blibrary\b", re.I), lambda m: "Library"),
    (re.compile(r"\bmess\b", re.I), lambda m: "Mess"),
]


def building(place: str) -> str:
    """'Hostel B, floor 2' -> 'Hostel B'. Two reports are about the same place only if their buildings match."""
    for rx, name in _BUILDINGS:
        if m := rx.search(place or ""):
            return name(m)
    return ""


@dataclass
class Card:
    """One piece of context, exactly as Meko returned it, with its memory id (D-011)."""

    memory_id: str
    datapack: str
    text: str
    source: str  # memory | knowledge_base | conversation

    def api(self) -> dict:
        return {"memory_id": self.memory_id, "datapack": self.datapack, "text": self.text, "source": self.source}


def _memories(data: object) -> list[dict]:
    if isinstance(data, dict):
        rows = data.get("results") or data.get("memories") or data.get("promoted_memories") or []
        return [r for r in rows if isinstance(r, dict)]
    return []


class Agent:
    """Base for the product's agents. `name` is the actor in the call log; `home` is its own datapack."""

    name = "agent"
    home = ""

    def __init__(self, meko: Meko, llm: LLM, settings: Settings):
        self.meko = meko
        self.llm = llm
        self.settings = settings

    @property
    def meko_on(self) -> bool:
        return self.meko.enabled

    def dp_name(self, short: str | None = None) -> str:
        return self.settings.datapack(short or self.home)

    async def remember(
        self, text: str, *, into: str | None = None, actor: str | None = None, kind: str | None = None,
        summary: str = "", scripted: bool = False,
    ) -> str:
        """memory_add (scrubbed). Writing into another agent's datapack is a `share` (D-006, D-016).
        Returns the new memory id, or "" with Meko off."""
        if not self.meko_on:
            return ""
        short = into or self.home
        actor = actor or self.name
        kind = kind or ("write" if short == self.home else "share")
        name = self.dp_name(short)
        dp = await self.meko.datapack_id(name, actor=actor)
        data = await self.meko.call(
            "memory_add", {"text": clean(text), "datapack_id": dp}, actor=actor, kind=kind,
            summary=summary or clean(text)[:90], datapack=name, scripted=scripted,
        )
        rows = _memories(data)
        return rows[0].get("id", "") if rows else ""

    async def recall(
        self, query: str, *, short: str | None = None, limit: int = 8, summary: str = "", scripted: bool = False,
    ) -> list[Card]:
        """memory_search in a datapack (own by default). Empty with Meko off."""
        if not self.meko_on:
            return []
        name = self.dp_name(short)
        dp = await self.meko.datapack_id(name, actor=self.name)
        data = await self.meko.call(
            "memory_search", {"query": clean(query), "datapack_id": dp, "limit": limit}, actor=self.name,
            kind="read", summary=summary or f"recall: {clean(query)[:70]}", datapack=name, scripted=scripted,
        )
        return [Card(r.get("id", ""), name, r.get("memory", ""), "memory") for r in _memories(data)]

    async def recall_canon(self, query: str, *, limit: int = 5, scripted: bool = False) -> list[Card]:
        """Verified lessons: promoted memories are only reachable through knowledgebase_search (D-017)."""
        if not self.meko_on:
            return []
        name = self.dp_name("canon")
        dp = await self.meko.datapack_id(name, actor=self.name)
        data = await self.meko.call(
            "knowledgebase_search", {"query": clean(query), "datapack_id": dp, "limit": limit}, actor=self.name,
            kind="read", summary=f"canon lessons: {clean(query)[:60]}", datapack=name, scripted=scripted,
        )
        rows = data.get("results", []) if isinstance(data, dict) else []
        cards = []
        for r in rows:
            meta = r.get("metadata_filters") or {}
            cards.append(Card(meta.get("memory_id") or r.get("id", ""), name, r.get("chunk_text", ""), "knowledge_base"))
        return cards
