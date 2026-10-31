"""Play the demo script (scenarios/live.json) through the Incident API. Every request is marked scripted.

    uv run python scripts/run_scenario.py                      # against http://127.0.0.1:8765
    uv run python scripts/run_scenario.py --speed 0            # no pauses between steps
    uv run python scripts/run_scenario.py --only geyser        # steps whose ref/incident/tag contains "geyser"

Step fields (TASKS.md R2 plus what staff steps need to name their incident):
  {at: "+0m", actor_role: "student", student_seed, text, ref?}         -> a grievance; `ref` names the incident
  {at, actor_role, action, incident: "<ref or INC-id>", note?, student_seed?}
        action ∈ approve_plan | record_fix | confirm_fixed | still_broken | approve_lesson | reject_lesson
  {at, actor_role: "electricity", kind: "power_cut", place, until, note?}   -> a note into other departments
        until: "HH:MM", ISO, or "+50m" (minutes from when the step runs, D-031)
Steps with the same `at` are sent together (e.g. 40 Wi-Fi reports). Before an action the runner waits until
the incident allows it, so slow Meko recalls never make a step fail.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from itertools import groupby
from pathlib import Path

import httpx

from sunwai import config
from sunwai.store import IST

BASE = os.getenv("SUNWAI_URL", "http://127.0.0.1:8765")
READY = {  # statuses an incident must be in (with no agent step in flight) before each action
    "approve_plan": ("assigned",), "record_fix": ("in_progress",),
    "confirm_fixed": ("fixed", "verified", "lesson_pending", "closed"),  # later students still confirm (counted)
    "still_broken": ("fixed",), "approve_lesson": ("lesson_pending",), "reject_lesson": ("lesson_pending",),
}
T0 = time.perf_counter()


def say(msg: str) -> None:
    print(f"[{time.perf_counter() - T0:6.1f}s] {msg}", flush=True)


def minutes(at: str) -> float:
    m = re.fullmatch(r"\+?(\d+(?:\.\d+)?)m", str(at or "+0m").strip())
    return float(m.group(1)) if m else 0.0


class Runner:
    def __init__(self, client: httpx.AsyncClient, timeout: float):
        self.c = client
        self.timeout = timeout
        self.refs: dict[str, str] = {}

    def incident_id(self, step: dict) -> str:
        ref = step.get("incident") or step.get("ref") or ""
        return self.refs.get(ref, ref)

    async def wait(self, inc_id: str, statuses: tuple[str, ...]) -> dict:
        end = time.time() + self.timeout
        while True:
            inc = (await self.c.get(f"/api/incidents/{inc_id}")).raise_for_status().json()
            if inc["status"] in statuses and not inc["working"]:
                return inc
            if time.time() > end:
                raise RuntimeError(f"{inc_id} still {inc['status']} (working={inc['working']}), wanted {'/'.join(statuses)}")
            await asyncio.sleep(1)

    async def step(self, s: dict) -> None:
        role = s.get("actor_role", "student")
        if s.get("action"):
            inc_id = self.incident_id(s)
            if not inc_id:
                raise RuntimeError(f"action step needs `incident`: {s}")
            await self.wait(inc_id, READY[s["action"]])
            body = {"actor_role": role, "action": s["action"], "note": s.get("note") or s.get("text"),
                    "student_seed": s.get("student_seed"), "scripted": True}
            r = await self.c.post(f"/api/incidents/{inc_id}/actions", json=body)
            if r.status_code != 200:
                raise RuntimeError(f"{s['action']} on {inc_id}: {r.status_code} {r.text}")
            say(f"{role} {s['action']} {inc_id}")
        elif s.get("kind") == "power_cut" or role == "electricity":
            until = str(s["until"])
            if m := re.fullmatch(r"\+(\d+)m", until.strip()):
                until = (datetime.now(IST) + timedelta(minutes=int(m.group(1)))).strftime("%H:%M")
            body = {"actor_role": role, "kind": s.get("kind", "power_cut"), "place": s["place"],
                    "until": until, "note": s.get("note") or s.get("text"), "scripted": True}
            out = (await self.c.post("/api/dept-events", json=body)).raise_for_status().json()
            say(f"{role}: power cut at {s['place']} until {until} -> notes in {out['notes_written']}")
        else:
            body = {"student_seed": s.get("student_seed") or f"scenario-{id(s)}", "text": s["text"], "scripted": True}
            inc = (await self.c.post("/api/grievances", json=body)).raise_for_status().json()
            if s.get("ref"):
                self.refs.setdefault(s["ref"], inc["id"])
            say(f"{inc['student_id']} reported -> {inc['id']} ({inc['dept']}, reporters={inc['reporters']}): {s['text'][:60]}")


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?", default=str(config.ROOT / "scenarios" / "live.json"))
    ap.add_argument("--speed", type=float, default=0.0, help="seconds of real time per scripted minute (0 = no pauses)")
    ap.add_argument("--only", default="", help="run only steps whose ref/incident/tag contains this")
    ap.add_argument("--timeout", type=float, default=240, help="seconds to wait for an incident before an action")
    args = ap.parse_args()
    data = json.loads(Path(args.path).read_text())
    steps = data.get("steps", data) if isinstance(data, dict) else data
    if args.only:
        steps = [s for s in steps if args.only in " ".join(str(s.get(k, "")) for k in ("ref", "incident", "tag"))]
    async with httpx.AsyncClient(base_url=BASE, timeout=600) as c:
        health = (await c.get("/api/health")).raise_for_status().json()
        say(f"{len(steps)} steps against {BASE}, meko_enabled={health['meko_enabled']}")
        run = Runner(c, args.timeout)
        last = 0.0
        for at, group in groupby(steps, key=lambda s: minutes(s.get("at"))):
            if args.speed and at > last:
                await asyncio.sleep((at - last) * args.speed)
            last = at
            group = list(group)
            # reports sent at the same minute go together; actions in a group run in order
            reports = [s for s in group if not s.get("action")]
            actions = [s for s in group if s.get("action")]
            await asyncio.gather(*(run.step(s) for s in reports))
            for s in actions:
                await run.step(s)
        say(f"done; incidents: {run.refs}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
