"""Seed the campus's past cases (scenarios/history.json) into the product datapacks, labelled SCRIPTED.

    uv run python scripts/seed_history.py --dry-run      # print what would be written
    uv run python scripts/seed_history.py                # write through sunwai/meko.py (logged, scripted)
    uv run python scripts/seed_history.py --notes-only   # past-fix notes only, when canon still holds the 6 lessons

Each item {dept, place, date, text, asset?, verified?} becomes a past-fix note in that department's datapack.
Items with "verified": true are also written to sunwai-canon as lessons and promoted, as if a warden had
approved them before Sunwai existed; the Dean's patterns come from those.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

from sunwai import config
from sunwai.agents.base import Agent, clean
from sunwai.agents.desk import asset_of
from sunwai.calllog import CallLog
from sunwai.llm import LLM
from sunwai.meko import Meko

DEPTS = ("hostel", "mess", "it")


def notes(item: dict) -> tuple[str, str | None]:
    dept, place, day, text = item["dept"], item["place"], item["date"], clean(item["text"]).rstrip(".")
    asset = item.get("asset") or asset_of(text) or "other"
    took = re.search(r"(\d+)\s*min", text)
    text = re.sub(r"\s*\(\d+\s*min(?:utes?)?\)", "", text)
    fix = f"FIX ({dept}, {asset}) at {place} on {day}: {text}." + (f" Took {took.group(1)} min." if took else "")
    lesson = None
    if item.get("verified"):
        # history text reads "symptom; root cause. What fixed it" (D-031)
        problem, _, fix_part = text.partition(". ")
        parts = [f"LESSON ({dept}, {asset}) from history {day} at {place}"]
        if fix_part:
            parts.append(f"root cause: {problem.split('; ', 1)[-1]}")
        parts.append(f"fix: {fix_part or text}")
        if took:
            parts.append(f"takes about {took.group(1)} min")
        parts.append("verified before Sunwai (seeded history, SCRIPTED)")
        lesson = " | ".join(parts)
    return fix, lesson


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?", default=str(config.ROOT / "scenarios" / "history.json"))
    ap.add_argument("--dry-run", action="store_true")
    # the reset can't delete promoted lessons, so a re-seed would promote the same lessons a second time
    ap.add_argument("--notes-only", action="store_true", help="skip the canon lessons")
    args = ap.parse_args()
    items = json.loads(Path(args.path).read_text())
    items = items.get("items", items) if isinstance(items, dict) else items
    bad = [i for i in items if i.get("dept") not in DEPTS or not all(i.get(k) for k in ("place", "date", "text"))]
    if bad:
        sys.exit(f"{len(bad)} items need dept in {DEPTS} and place, date, text: {bad[:2]}")
    planned = [notes(i) + (i["dept"],) for i in items]
    if args.dry_run:
        for fix, lesson, _ in planned:
            print(fix)
            if lesson:
                print("  ->", lesson)
        return 0

    s = config.load()
    async with Meko(s, CallLog(s.db_path)) as meko:
        llm = LLM(s)
        agents = {d: Agent(meko, llm, s) for d in DEPTS + ("canon",)}
        for d, a in agents.items():
            a.name = "curator" if d == "canon" else d
            a.home = d
        gate = asyncio.Semaphore(4)

        async def write(dept: str, text: str, summary: str) -> str:
            async with gate:
                return await agents[dept].remember(text, summary=summary, scripted=True)

        jobs = [write(d, fix, f"seed past case ({d})") for fix, _, d in planned]
        if not args.notes_only:
            jobs += [write("canon", lesson, f"seed verified lesson ({d})") for _, lesson, d in planned if lesson]
        ids = await asyncio.gather(*jobs)
        lesson_ids = [i for i in ids[len(planned):] if i]
        if lesson_ids:
            name = s.datapack("canon")
            dp = await meko.datapack_id(name, actor="curator")
            await meko.call(
                "memory_promote", {"memory_ids": lesson_ids, "datapack_id": dp}, actor="curator", kind="promote",
                summary=f"promote {len(lesson_ids)} seeded lessons", datapack=name, scripted=True,
            )
    print(f"seeded {len(planned)} past cases and promoted {len(lesson_ids)} lessons")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
