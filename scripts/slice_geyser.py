"""Geyser vertical slice through the Incident API, end to end. Start the app first (`uv run sunwai`).

    uv run python scripts/slice_geyser.py            # against http://127.0.0.1:8765
    SUNWAI_URL=http://127.0.0.1:8766 uv run python scripts/slice_geyser.py

Hostel A report -> Desk -> Hostel plan -> power cut moves the ETA -> caretaker approves -> fix recorded ->
student confirms -> Curator lesson -> warden approves -> promoted to canon -> a Hostel B geyser report
gets that lesson as context, with its memory id. Every request is marked scripted (simulated people).
"""

from __future__ import annotations

import os
import sqlite3
import sys
import time
from collections import Counter
from datetime import datetime, timedelta

import httpx

from sunwai import config
from sunwai.store import IST

BASE = os.getenv("SUNWAI_URL", "http://127.0.0.1:8765")
T0 = time.perf_counter()


def say(msg: str) -> None:
    print(f"[{time.perf_counter() - T0:6.1f}s] {msg}", flush=True)


def wait(c: httpx.Client, inc_id: str, status: str, timeout: float = 240) -> dict:
    """Poll until the incident reaches `status` and no agent step is in flight."""
    end = time.time() + timeout
    while time.time() < end:
        inc = c.get(f"/api/incidents/{inc_id}").raise_for_status().json()
        if inc["status"] == status and not inc["working"]:
            return inc
        time.sleep(1)
    sys.exit(f"timed out waiting for {inc_id} to be {status}; last: {inc['status']} working={inc['working']}")


def act(c: httpx.Client, inc_id: str, role: str, action: str, **kw) -> dict:
    r = c.post(f"/api/incidents/{inc_id}/actions", json={"actor_role": role, "action": action, "scripted": True, **kw})
    if r.status_code != 200:
        sys.exit(f"{action} failed: {r.status_code} {r.text}")
    return r.json()


def show(inc: dict) -> None:
    say(f"  {inc['id']} {inc['status']} awaiting={inc['awaiting']} ETA={inc['eta']} ({inc['eta_reason']})")
    say(f"  plan: {inc['plan']}")
    for card in inc["context"]:
        say(f"  context [{card['datapack']} {card['memory_id']}] {card['text'][:110]}")


def main() -> int:
    started = time.time()
    with httpx.Client(base_url=BASE, timeout=300) as c:
        health = c.get("/api/health").raise_for_status().json()
        say(f"app {BASE}: meko_enabled={health['meko_enabled']} {health.get('meko_error') or ''}")

        say("Student in Hostel A reports a cold geyser")
        a = c.post("/api/grievances", json={
            "student_seed": "slice-hostel-a-204", "scripted": True,
            "text": "The geyser on the 2nd floor of Hostel A is not heating since morning, no hot water at all",
        }).raise_for_status().json()
        say(f"  Desk filed {a['id']} as {a['category']} / {a['asset']} at {a['place']} (student {a['student_id']})")
        a = wait(c, a["id"], "assigned")
        show(a)

        until = (datetime.now(IST) + timedelta(minutes=50)).strftime("%H:%M")
        say(f"Electricity staff record a power cut in Hostel A until {until}")
        ev = c.post("/api/dept-events", json={
            "actor_role": "electricity", "kind": "power_cut", "place": "Hostel A", "until": until,
            "note": "transformer maintenance", "scripted": True,
        }).raise_for_status().json()
        say(f"  notes written: {ev['notes_written']}")
        a = wait(c, a["id"], "assigned")
        show(a)

        say("Caretaker approves the plan, then records the fix")
        act(c, a["id"], "caretaker", "approve_plan")
        a = wait(c, a["id"], "in_progress")
        act(c, a["id"], "caretaker", "record_fix",
            note="Thermostat was set to 75C and kept tripping the breaker; reset the breaker and set the thermostat to 55C (40 min)")
        a = wait(c, a["id"], "fixed")

        say("Student confirms the fix held")
        act(c, a["id"], "student", "confirm_fixed", student_seed="slice-hostel-a-204")
        a = wait(c, a["id"], "lesson_pending")
        say(f"  lesson draft: {a['lesson']['text']}")

        say("Warden approves the lesson")
        act(c, a["id"], "warden", "approve_lesson")
        a = wait(c, a["id"], "closed")
        lesson_id = a["lesson"]["memory_id"]
        say(f"  lesson {a['lesson']['status']} memory_id={lesson_id}")

        say("Later: a student in Hostel B reports a geyser problem")
        b = c.post("/api/grievances", json={
            "student_seed": "slice-hostel-b-311", "scripted": True,
            "text": "hostel B 3rd floor geyser not giving hot water, tried for an hour",
        }).raise_for_status().json()
        b = wait(c, b["id"], "assigned")
        show(b)
        got = any(card["memory_id"] == lesson_id for card in b["context"]) if lesson_id else False
        say(f"Hostel B got the Hostel A lesson as context: {got}")

    db = sqlite3.connect(config.load().db_path)
    rows = db.execute("select kind, ok from meko_calls where ts >= ?", (started,)).fetchall()
    kinds = Counter(k for k, _ in rows)
    say(f"Meko calls logged in {config.load().db_path.name} during this run: {len(rows)} {dict(kinds)}, errors={sum(1 for _, ok in rows if not ok)}")
    return 0 if got or not health["meko_enabled"] else 1


if __name__ == "__main__":
    sys.exit(main())
