"""Burst test through the Incident API: 40 Wi-Fi complaints in different wording and 5 mess sickness reports,
all sent at once. With Meko on, Desk should merge them into a few incidents and the mess cluster should be
escalated; with Meko off every report stays its own incident. Start the app first (`uv run sunwai`).

    uv run python scripts/slice_burst.py
    SUNWAI_URL=http://127.0.0.1:8766 SUNWAI_DB=data/test-off.db uv run python scripts/slice_burst.py
"""

from __future__ import annotations

import asyncio
import os
import sqlite3
import sys
import time
from collections import Counter

import httpx

from sunwai import config

BASE = os.getenv("SUNWAI_URL", "http://127.0.0.1:8765")

WIFI = [
    "wifi in block C dies every night around 9pm, cant submit assignment",
    "Block C wifi gone AGAIN. this is the 3rd night in a row",
    "bhai block c ka wifi phir se band hai, kuch karo please",
    "internet not working in Block C since 9 pm",
    "Respected sir, the Wi-Fi on Block C 2nd floor has been unavailable every evening this week.",
    "block c wi fi disconnects every few minutes after dinner",
    "wifii nt wrking in blck c pls fix",
    "Block C router seems dead, no internet on 3rd floor",
    "cannot connect to campus wifi in block C, says no internet",
    "wifi block C ka kabhi chalta hi nahi raat ko",
    "Is anyone fixing the Block C wifi? exams next week and no internet",
    "network down in Block C, laptop shows connected no internet",
    "Block C first floor: wifi drops at night, mobile data is the only option",
    "the wifi in block c is useless after 9, please check the router",
    "no internet in Block C hostel rooms tonight",
    "Block-C WiFi outage again, online test tomorrow",
    "wifi chal nahi raha block C mein, router ki light blink kar rahi hai",
    "Dear IT cell, Block C WiFi has not worked since yesterday evening.",
    "block c net slow then completely gone",
    "wi-fi in block C keeps failing at night, please send someone",
]
WIFI = WIFI + [f"{t} (still happening)" for t in WIFI]  # 40 reports

MESS = [
    "tuesday dinner paneer smelled off, 3 of us threw up at night",
    "after mess dinner on tuesday I had stomach ache and vomiting",
    "mess food last night made me sick, food poisoning?",
    "threw up twice after tuesday dinner in the mess, the paneer was bad",
    "my roommate and I both got sick after eating mess dinner yesterday",
]


async def post(c: httpx.AsyncClient, seed: str, text: str) -> dict:
    r = await c.post("/api/grievances", json={"student_seed": seed, "text": text, "scripted": True})
    r.raise_for_status()
    return r.json()


async def main() -> int:
    started = time.time()
    async with httpx.AsyncClient(base_url=BASE, timeout=600) as c:
        health = (await c.get("/api/health")).json()
        print(f"app {BASE}: meko_enabled={health['meko_enabled']}")
        jobs = [post(c, f"burst-wifi-{i:02d}", t) for i, t in enumerate(WIFI)]
        jobs += [post(c, f"burst-mess-{i:02d}", t) for i, t in enumerate(MESS)]
        t0 = time.perf_counter()
        replies = await asyncio.gather(*jobs)
        took = time.perf_counter() - t0
        while any(i["working"] for i in (await c.get("/api/incidents")).json()):
            await asyncio.sleep(1)
        incidents = {i["id"]: i for i in (await c.get("/api/incidents")).json()}
    ids = Counter(r["id"] for r in replies)
    print(f"{len(replies)} reports filed in {took:.1f}s -> {len(ids)} incidents")
    for inc_id, n in ids.most_common():
        inc = incidents[inc_id]
        print(f"  {inc_id} {inc['dept']:6} {inc['category']:18} {inc['place'][:22]:22} reporters={inc['reporters']:2} "
              f"severity={inc['severity']} awaiting={inc['awaiting']}")
    db = sqlite3.connect(config.load().db_path)
    rows = db.execute("select kind, ok from meko_calls where ts >= ?", (started,)).fetchall()
    print(f"Meko calls: {len(rows)} {dict(Counter(k for k, _ in rows))}, errors={sum(1 for _, ok in rows if not ok)}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
