"""Dean: reads only promoted canon (`memory_get_all(promoted=true)` on `sunwai-canon`, D-017) and reports
verified patterns, e.g. "RO filter needed a verified fix 3 times, about every 40 days". Never anecdotes."""

from __future__ import annotations

import time
from collections import defaultdict
from datetime import date, timedelta
from statistics import mean

from sunwai.agents.base import Agent
from sunwai.agents.department import LABEL, TAG_RE, lesson_date


class Dean(Agent):
    name = "dean"
    home = "dean"
    TTL = 60  # the dean screen polls; canon changes only on promotion, which calls invalidate()

    def __init__(self, *args, **kw):
        super().__init__(*args, **kw)
        self._cache: dict | None = None
        self._at = 0.0
        self._reported: tuple[str, ...] = ()

    def invalidate(self) -> None:
        self._at = 0.0

    async def patterns(self) -> dict:
        if self._cache is not None and time.time() - self._at < self.TTL:
            return self._cache
        lessons = []
        if self.meko_on:
            name = self.dp_name("canon")
            dp = await self.meko.datapack_id(name, actor=self.name)
            data = await self.meko.call(
                "memory_get_all", {"datapack_id": dp, "promoted": True, "page_size": 100}, actor=self.name,
                kind="read", summary="read verified canon", datapack=name,
            )
            for r in (data or {}).get("promoted_memories", []):
                text = r.get("data", "")
                m = TAG_RE.search(text)
                if not text.startswith("LESSON") or not m:
                    continue
                # keep only what the screen needs: rows also carry the promoter's name and email
                lessons.append({
                    "memory_id": r.get("id", ""), "dept": m.group(1), "asset": m.group(2), "text": text,
                    "promoted_at": r.get("promoted_to_kb_at") or r.get("created_at"),
                    "date": lesson_date(text) or (r.get("promoted_to_kb_at") or r.get("created_at") or "")[:10],
                })
        groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for les in lessons:
            groups[(les["dept"], les["asset"])].append(les)
        patterns = []
        for (dept, asset), group in sorted(groups.items()):
            if len(group) < 2:
                continue
            days = sorted({date.fromisoformat(g["date"]) for g in group if g["date"]})
            gaps = [(b - a).days for a, b in zip(days, days[1:]) if (b - a).days > 0]
            text = f"{LABEL.get(dept, dept)}: {asset.replace('_', ' ')} needed a verified fix {len(group)} times"
            if gaps:
                every = round(mean(gaps))
                text += f", about every {every} days (last {days[-1]}); next one expected around {days[-1] + timedelta(days=every)}"
            patterns.append({"text": text, "memory_ids": [g["memory_id"] for g in group]})
        texts = tuple(p["text"] for p in patterns)
        if self.meko_on and texts and texts != self._reported:
            self._reported = texts
            await self.remember("PATTERN REPORT from verified canon: " + " / ".join(texts), summary="dean pattern report")
        lessons.sort(key=lambda les: les["date"], reverse=True)
        self._cache, self._at = {"lessons": [{k: v for k, v in les.items() if k != "date"} for les in lessons], "patterns": patterns}, time.time()
        return self._cache
