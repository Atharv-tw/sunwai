"""Can the local model triage grievances with a tool call? Prints numbers for result.md.

    uv run python scripts/smoke_llm.py
"""

from __future__ import annotations

import asyncio
import json
import statistics
import sys

from sunwai import config
from sunwai.llm import LLM

CATEGORIES = ["hostel_electrical", "hostel_plumbing", "mess_food", "wifi_network", "admin_documents", "safety", "other"]

TRIAGE_TOOL = {
    "type": "function",
    "function": {
        "name": "file_incident",
        "description": "File a campus grievance as a structured incident.",
        "parameters": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "enum": CATEGORIES},
                "place": {"type": "string", "description": "Where, e.g. 'Hostel B, floor 2'"},
                "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                "safety_risk": {"type": "boolean"},
                "summary": {"type": "string", "description": "One neutral sentence, no names"},
            },
            "required": ["category", "place", "severity", "safety_risk", "summary"],
        },
    },
}

SYSTEM = (
    "You are the front desk of a college grievance system. Read the student's complaint and call "
    "file_incident exactly once. Never include names, phone numbers or roll numbers in the summary."
)

# (complaint in a student's own words, expected category)
SAMPLES = [
    ("2nd floor geyser in hostel B tripped again, no hot water since morning", "hostel_electrical"),
    ("wifi in block C dies every night around 9pm, cant submit assignment", "wifi_network"),
    ("tuesday dinner paneer smelled off, 3 of us threw up at night", "mess_food"),
    ("bathroom tap on floor 3 girls hostel leaking for a week, floor is flooded", "hostel_plumbing"),
    ("applied for bonafide certificate 3 weeks ago still not issued, need it for internship", "admin_documents"),
    ("the corridor light near stairs in hostel A is broken, its pitch dark and someone fell", "safety"),
    ("router in library 1st floor not giving ip address", "wifi_network"),
    ("RO water cooler in mess tastes weird again", "mess_food"),
    ("ceiling fan in room 214 hostel B sparks when switched on", "hostel_electrical"),
    ("no water pressure in showers hostel A ground floor", "hostel_plumbing"),
]


async def main() -> int:
    s = config.load()
    llm = LLM(s)
    print(f"model={s.llm_model} base={s.llm_base_url}")
    await llm.chat("Reply with OK.", "ping")  # warm up / load weights
    valid = correct = 0
    secs, tps = [], []
    for text, expected in SAMPLES:
        r = await llm.chat(SYSTEM, text, tools=[TRIAGE_TOOL], tool_choice="required")
        call = r.tool_calls[0] if r.tool_calls else None
        ok = call is not None and call.name == "file_incident" and call.args.get("category") in CATEGORIES
        valid += ok
        correct += bool(ok and call.args.get("category") == expected)
        secs.append(r.seconds)
        if r.completion_tokens:
            tps.append(r.completion_tokens / r.seconds)
        print(f"{r.seconds:5.1f}s  {'OK ' if ok else 'BAD'}  want={expected:18} got={json.dumps(call.args) if call else r.text[:80]}")
    print()
    print(f"valid tool calls: {valid}/{len(SAMPLES)}")
    print(f"correct category: {correct}/{len(SAMPLES)}")
    print(f"p50 latency: {statistics.median(secs):.2f}s   max: {max(secs):.2f}s")
    if tps:
        print(f"median tok/s: {statistics.median(tps):.1f}")
    return 0 if valid == len(SAMPLES) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
