"""Curator: turns a fix into campus canon (D-004). Asks the students it affected whether the fix held,
drafts a lesson into `sunwai-canon`, and promotes it only after the warden (or committee) approves."""

from __future__ import annotations

import re

from sunwai.agents.base import Agent, clean
from sunwai.agents.department import LABEL
from sunwai.store import Incident

LESSON_TOOL = {
    "type": "function",
    "function": {
        "name": "write_lesson",
        "description": "Record what a campus fix taught us, for staff who meet the same fault later.",
        "parameters": {
            "type": "object",
            "properties": {
                "root_cause": {"type": "string", "description": "Why it broke, in one short clause"},
                "fix": {"type": "string", "description": "What fixed it, as short imperative steps"},
            },
            "required": ["root_cause", "fix"],
        },
    },
}

SYSTEM = (
    "You write lessons for campus maintenance staff. Use only facts in the incident and the fix note. "
    "Call write_lesson exactly once. No names, no dates."
)


class Curator(Agent):
    name = "curator"
    home = "canon"

    def ask(self, inc: Incident, scripted: bool = False) -> None:
        n = len(inc.students)
        inc.log("curator", f"Curator asked the {n} student{'s' if n != 1 else ''} who reported it: did the fix hold?", scripted)

    async def record_confirmation(self, inc: Incident, student: str, held: bool, scripted: bool = False) -> None:
        if held:
            await self.remember(
                f"{inc.id}: student {student} confirmed the fix held.", actor="student", kind="approval",
                summary=f"student confirmed {inc.id} fix held", scripted=scripted,
            )

    async def draft(self, inc: Incident, approver: str, scripted: bool = False) -> None:
        root, fix, how = "", "", "the local model"
        try:
            r = await self.llm.chat(
                SYSTEM,
                f"Incident: {inc.summary} at {inc.place}.\nPlan: {inc.plan}\nFix note from staff: {inc.fix_note}",
                tools=[LESSON_TOOL], tool_choice="required",
            )
            a = r.tool_calls[0].args if r.tool_calls else {}
            root, fix = clean(str(a.get("root_cause", "")))[:200], clean(str(a.get("fix", "")))[:300]
        except Exception:
            pass
        if not fix:
            note = re.sub(r"\s*\(?\b\d+\s*min(?:ute)?s?\b\)?", "", inc.fix_note)
            root, fix, how = "", clean(note)[:300], "the staff fix note (local model unavailable)"
        fix = fix.rstrip(".;") + "."
        held = len(inc.held)
        text = (
            f"LESSON ({inc.dept}, {inc.asset or inc.category}) from {inc.id} at {inc.place}: "
            + (f"root cause: {root.rstrip('.;')}; " if root else "")
            + f"fix: {fix}; takes about {inc.fix_took or inc.fix_minutes or 60} min. "
            f"Held for {held} student{'s' if held != 1 else ''}; approved by the {approver}."
        )
        mid = await self.remember(text, summary=f"draft lesson from {inc.id}", scripted=scripted)
        inc.lesson = {"text": text, "memory_id": mid or None, "status": "draft"}
        inc.status, inc.awaiting = "lesson_pending", approver
        inc.log("curator", f"Curator drafted a lesson from {how}" + (f" (memory {mid[:8]})" if mid else "") + f". Waiting for the {approver}.", scripted)

    async def approve(self, inc: Incident, role: str, scripted: bool = False) -> None:
        lesson = inc.lesson or {}
        mid = lesson.get("memory_id")
        if mid:
            await self.remember(
                f"{inc.id}: the {role} approved the lesson for campus canon.", actor=role, kind="approval",
                summary=f"{role} approved lesson from {inc.id}", scripted=scripted,
            )
            dp = await self.meko.datapack_id(self.dp_name(), actor=self.name)
            await self.meko.call(
                "memory_promote", {"memory_ids": [mid], "datapack_id": dp}, actor=self.name, kind="promote",
                summary=f"promote lesson from {inc.id} (approved by {role})", datapack=self.dp_name(), scripted=scripted,
            )
            lesson["status"] = "promoted"
            inc.log("curator", f"Lesson promoted to {self.dp_name()} (memory {mid[:8]}): later {LABEL.get(inc.dept, inc.dept)} cases will recall it.", scripted)
        else:
            lesson["status"] = "unsaved"
            inc.log("curator", "Lesson approved, but Meko is off: nothing was saved, so later cases start from zero.", scripted)
        inc.lesson = lesson
        inc.status, inc.awaiting = "closed", None

    def reject(self, inc: Incident, role: str, note: str = "", scripted: bool = False) -> None:
        if inc.lesson:
            inc.lesson["status"] = "rejected"
        inc.status, inc.awaiting = "closed", None
        inc.log(role, f"The {role} rejected the lesson" + (f": {note}" if note else "") + ". Not promoted.", scripted)
