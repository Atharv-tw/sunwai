"""Write plausible CallRecords into a SEPARATE db so the swarm view can be built before real calls exist.

    SUNWAI_DB=data/fake.db uv run python scripts/fake_calls.py            # history, then live trickle
    SUNWAI_DB=data/fake.db uv run python scripts/fake_calls.py --no-live  # history only
    SUNWAI_DB=data/fake.db uv run python scripts/fake_calls.py --burst    # 40 reads in 10 s, then exit

Everything is written with scripted=True. Never point this at data/sunwai.db.
Run the app against the same file:  SUNWAI_DB=data/fake.db uv run sunwai
"""

from __future__ import annotations

import argparse
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sunwai import config  # noqa: E402
from sunwai.calllog import CallLog, CallRecord  # noqa: E402

PREFIX = "sunwai-"

# (actor, tool, datapack suffix, kind, summary)
SCENES = [
    ("desk", "memory_search", "desk", "read", "recall similar complaints: geyser Hostel A"),
    ("desk", "memory_add", "desk", "write", "incident INC-0007: geyser not heating, Hostel A floor 2"),
    ("desk", "memory_add", "hostel", "share", "handoff to Hostel: geyser complaint, safety_risk=low"),
    ("hostel", "memory_search", "hostel", "read", "past fixes: geyser thermostat"),
    ("hostel", "knowledgebase_search", "canon", "read", "canon lessons: geyser trips in winter"),
    ("hostel", "memory_add", "hostel", "write", "plan: check thermostat first, same fault last winter"),
    ("caretaker", "memory_add", "hostel", "approval", "caretaker approved plan for INC-0007"),
    ("electricity", "memory_add", "hostel", "share", "power cut Hostel A until 22:00; delays geyser fix"),
    ("mess", "memory_search", "mess", "read", "cluster sickness reports after Tuesday dinner"),
    ("mess", "memory_add", "mess", "write", "5 reports in 2h, same dinner: escalate to mess committee"),
    ("mess_committee", "memory_add", "mess", "approval", "mess committee acknowledged safety escalation"),
    ("it", "memory_search", "it", "read", "recall router failures Block C"),
    ("it", "memory_add", "it", "write", "merged 40 wifi reports into one incident, router B3"),
    ("curator", "memory_add", "canon", "write", "draft lesson: geyser thermostat fault, check before replacing"),
    ("warden", "memory_add", "canon", "approval", "warden approved lesson L-3"),
    ("curator", "memory_promote", "canon", "promote", "promote lesson L-3 to canon"),
    ("dean", "memory_get_all", "dean", "read", "read promoted canon: RO filters fail every ~40 days"),
    ("student", "memory_add", "desk", "approval", "student S-4f2a confirmed fix held"),
    ("desk", "conversation_add_message", "desk", "write", "update to student S-4f2a: status + ETA + why"),
]
ERRORS = [
    ("hostel", "memory_search", "hostel", "read", "recall timed out", "timeout after 10 s"),
    ("desk", "memory_add", "desk", "write", "write failed", "HTTP 429 rate limited"),
]
ADMIN = ("desk", "datapack_search", "desk", "admin", "resolve datapack id")


def make(ts: float, scene: tuple, error: str = "") -> CallRecord:
    actor, tool, dp, kind, summary = scene
    ms = random.uniform(180, 420) if kind == "read" else random.uniform(300, 900)
    return CallRecord(
        ts=ts, actor=actor, tool=tool, datapack=f"{PREFIX}{dp}", kind=kind, summary=summary,
        ms=round(ms, 1), ok=not error, error=error, scripted=True,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-live", action="store_true", help="write history only, then exit")
    ap.add_argument("--burst", action="store_true", help="40 reads in 10 s, then exit")
    ap.add_argument("--history", type=int, default=45, help="number of past calls (spread over 40 min)")
    args = ap.parse_args()

    db = config.load().db_path
    if db.name == "sunwai.db":
        sys.exit("refusing to write fake calls into data/sunwai.db; set SUNWAI_DB=data/fake.db")
    log = CallLog(db)

    if args.burst:
        for _ in range(40):
            log.record(make(time.time(), ("it", "memory_search", "it", "read", "wifi complaint: same router, new wording")))
            time.sleep(0.25)
        print("burst done")
        return

    now = time.time()
    for i in range(args.history):
        ts = now - 2400 + i * (2400 / args.history) + random.uniform(-10, 10)
        log.record(make(ts, SCENES[i % len(SCENES)]))
    log.record(make(now - 300, ADMIN))
    for e in ERRORS:
        log.record(make(now - random.uniform(60, 900), e[:5], e[5]))
    print(f"wrote {args.history + 1 + len(ERRORS)} scripted calls to {db}")
    if args.no_live:
        return

    print("live trickle, Ctrl+C to stop")
    while True:
        time.sleep(random.uniform(0.6, 2.5))
        if random.random() < 0.08:
            e = random.choice(ERRORS)
            log.record(make(time.time(), e[:5], e[5]))
        else:
            log.record(make(time.time(), random.choice(SCENES)))


if __name__ == "__main__":
    main()
