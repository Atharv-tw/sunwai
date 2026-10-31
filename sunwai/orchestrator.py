"""Deterministic incident flow (D-008). Agents do narrow jobs; this module alone decides state.

reported -> assigned -> in_progress -> fixed -> verified -> lesson_pending -> closed
             (plan)     (staff ok)    (fix)    (student)    (lesson drafted)  (approver)

People's actions arrive through the Incident API; slow agent steps (Meko recalls, LLM drafts) run in the
background and show up as `working` on the incident until they finish.
"""

from __future__ import annotations

import asyncio
import re
import time
from collections.abc import Awaitable
from datetime import datetime, timedelta

from sunwai.agents.base import building, pseudonym
from sunwai.agents.curator import Curator
from sunwai.agents.dean import Dean
from sunwai.agents.department import Department, Mess
from sunwai.agents.desk import Desk
from sunwai.config import Settings
from sunwai.llm import LLM
from sunwai.meko import Meko
from sunwai.store import IST, OPEN, Incident, Store

# (status, action) -> next status. Anything else is a 409.
TRANSITIONS = {
    ("assigned", "approve_plan"): "in_progress",
    ("in_progress", "record_fix"): "fixed",
    ("fixed", "confirm_fixed"): "verified",
    ("fixed", "still_broken"): "in_progress",
    ("lesson_pending", "approve_lesson"): "closed",
    ("lesson_pending", "reject_lesson"): "closed",
}
# a later student can still confirm after the first one verified the fix: counted, no state change
LATE_CONFIRM = ("verified", "lesson_pending", "closed")
ACTIONS = ("approve_plan", "record_fix", "confirm_fixed", "still_broken", "approve_lesson", "reject_lesson")


class FlowError(Exception):
    status = 400


class NotFound(FlowError):
    status = 404


class Forbidden(FlowError):
    status = 403


class Conflict(FlowError):
    status = 409


def parse_until(value: str) -> datetime:
    """'22:00' (today, IST) or full ISO-8601."""
    value = value.strip()
    if m := re.fullmatch(r"(\d{1,2}):(\d{2})", value):
        t = datetime.now(IST).replace(hour=int(m.group(1)), minute=int(m.group(2)), second=0, microsecond=0)
        return t if t > datetime.now(IST) - timedelta(hours=1) else t + timedelta(days=1)
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=IST)


class Orchestrator:
    def __init__(self, store: Store, meko: Meko, llm: LLM, settings: Settings):
        self.store, self.meko, self.settings = store, meko, settings
        self.desk = Desk(meko, llm, settings, store)
        self.depts: dict[str, Department] = {
            "hostel": Department("hostel", meko, llm, settings),
            "mess": Mess(meko, llm, settings),
            "it": Department("it", meko, llm, settings),
        }
        self.curator = Curator(meko, llm, settings)
        self.dean = Dean(meko, llm, settings)
        self._tasks: set[asyncio.Task] = set()

    # --- background agent steps ---------------------------------------------

    def _bg(self, inc: Incident, label: str, job: Awaitable[None]) -> None:
        inc.working = label
        self.store.save(inc)

        async def run() -> None:
            try:
                await job
            except Exception as e:
                inc.log("system", f"{label} failed: {type(e).__name__}: {e}"[:400])
            finally:
                if inc.working == label:
                    inc.working = None
                self.store.save(inc)

        task = asyncio.create_task(run())
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def drain(self) -> None:
        """Wait for background steps (scripts and tests)."""
        while self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)

    # --- grievances -----------------------------------------------------------

    async def grievance(self, student_seed: str, text: str, scripted: bool = False) -> tuple[Incident, str]:
        student = pseudonym(student_seed)
        inc, merged = await self.desk.file(student, text, scripted)
        dept = self.depts.get(inc.dept)
        if merged:
            if dept:
                await dept.on_merge(inc, scripted)
                self.store.save(inc)
        elif dept:
            self._bg(inc, f"{inc.dept}: recalling past fixes and verified lessons", self._route(inc, dept, scripted))
        else:
            inc.log("desk", f"To {student}: {inc.plan}", scripted)
            self.store.save(inc)
        return inc, student

    async def _route(self, inc: Incident, dept: Department, scripted: bool) -> None:
        await asyncio.gather(self.desk.hand_off(inc, scripted), dept.plan(inc, scripted))
        for s in inc.students:
            inc.log("desk", f"To {s}: {self.desk.status_line(inc)}", scripted)

    # --- people's actions -----------------------------------------------------

    def _allowed(self, inc: Incident, action: str, role: str) -> bool:
        dept = self.depts.get(inc.dept)
        if dept is None:
            return False
        if action in ("confirm_fixed", "still_broken"):
            return role == "student"
        if action in ("approve_lesson", "reject_lesson"):
            return role == dept.approver
        return role in (dept.staff, dept.approver)

    async def action(
        self, inc_id: str, actor_role: str, action: str, note: str | None = None,
        student_seed: str | None = None, scripted: bool = False,
    ) -> Incident:
        inc = self.store.get(inc_id)
        if inc is None:
            raise NotFound(f"no incident {inc_id}")
        if action not in ACTIONS:
            raise FlowError(f"unknown action {action}; one of {', '.join(ACTIONS)}")
        if not self._allowed(inc, action, actor_role):
            raise Forbidden(f"{actor_role} cannot {action} on a {inc.dept} incident")
        if inc.working and action in ("approve_lesson", "reject_lesson"):
            raise Conflict(f"{inc.id} is busy: {inc.working}")
        late = action == "confirm_fixed" and inc.status in LATE_CONFIRM
        nxt = TRANSITIONS.get((inc.status, action))
        if nxt is None and not late:
            raise Conflict(f"cannot {action} while {inc.id} is {inc.status}")

        dept = self.depts[inc.dept]
        student = pseudonym(student_seed) if student_seed else "student"
        note = (note or "").strip()

        if action == "approve_plan":
            inc.status, inc.awaiting, inc.plan_approved_ts = nxt, dept.staff, time.time()
            inc.log(actor_role, f"The {actor_role} approved the plan." + (f" {note}" if note else ""), scripted)
            self._bg(inc, f"{inc.dept}: recording approval", dept.record_approval(inc, actor_role, scripted))

        elif action == "record_fix":
            took = re.search(r"(\d+)\s*min", note)
            started = inc.plan_approved_ts or inc.created
            inc.fix_note = note or "fixed (no note)"
            inc.fix_took = int(took.group(1)) if took else max(1, round((time.time() - started) / 60))
            inc.status, inc.awaiting = nxt, "student"
            inc.log(actor_role, f"The {actor_role} recorded the fix: {inc.fix_note}", scripted)
            self.curator.ask(inc, scripted)
            self._bg(inc, f"{inc.dept}: remembering the fix", dept.record_fix(inc, actor_role, scripted))

        elif action == "confirm_fixed":
            if student not in inc.held:
                inc.held.append(student)
            inc.log("student", f"{student} confirmed the fix held.", scripted)
            if late:
                self._bg(inc, "curator: recording confirmation", self.curator.record_confirmation(inc, student, True, scripted))
            else:
                inc.status, inc.awaiting = nxt, None
                self._bg(inc, "curator: drafting a lesson", self._verified(inc, dept, student, scripted))

        elif action == "still_broken":
            if student not in inc.broken:
                inc.broken.append(student)
            inc.status, inc.awaiting = nxt, dept.staff
            inc.log("student", f"{student} says it is still broken" + (f": {note}" if note else "."), scripted)
            self._bg(inc, f"{inc.dept}: remembering the failed fix", dept.fix_failed(inc, note, scripted))

        elif action == "approve_lesson":
            self._bg(inc, "curator: promoting lesson to canon", self._promote(inc, actor_role, scripted))

        elif action == "reject_lesson":
            self.curator.reject(inc, actor_role, note, scripted)

        self.store.save(inc)
        return inc

    async def _promote(self, inc: Incident, role: str, scripted: bool) -> None:
        await self.curator.approve(inc, role, scripted)
        self.dean.invalidate()

    async def _verified(self, inc: Incident, dept: Department, student: str, scripted: bool) -> None:
        await self.curator.record_confirmation(inc, student, True, scripted)
        await self.curator.draft(inc, dept.approver, scripted)

    # --- events from other departments (D-006) -------------------------------

    async def dept_event(
        self, actor_role: str, kind: str, place: str, until: str, note: str | None = None, scripted: bool = False,
    ) -> dict:
        if kind != "power_cut":
            raise FlowError(f"unknown event kind {kind}")
        try:
            end = parse_until(until)
        except ValueError:
            raise FlowError(f"until must be HH:MM or ISO-8601, got {until!r}") from None
        where = building(place) or place.strip()
        text = (
            f"POWER CUT at {where} until {end.isoformat(timespec='minutes')}"
            + (f". Note: {note.strip()}" if note and note.strip() else "")
            + f". Recorded by {actor_role} staff."
        )
        targets = ("hostel", "it")  # a power cut changes electrical and network plans
        written = []
        if self.meko.enabled:
            ids = await asyncio.gather(*(
                self.depts[d].remember(text, into=d, actor=actor_role, kind="share",
                                       summary=f"power cut at {where} until {end.strftime('%H:%M')}", scripted=scripted)
                for d in targets
            ))
            written = [self.settings.datapack(d) for d, mid in zip(targets, ids) if mid]
        for inc in self.store.list():
            if inc.dept in targets and inc.status in OPEN and building(inc.place) == building(where):
                self._bg(inc, f"{inc.dept}: checking notes from other departments",
                         self.depts[inc.dept].on_power_cut(inc, scripted))
        return {"notes_written": written}

    # --- read side --------------------------------------------------------------

    def list(self, dept: str | None = None, status: str | None = None) -> list[Incident]:
        return sorted(self.store.list(dept, status), key=lambda i: i.created, reverse=True)

    def for_student(self, student: str) -> list[Incident]:
        sid = student if re.fullmatch(r"S-[0-9a-f]{4,}", student) else pseudonym(student)
        return sorted(self.store.for_student(sid), key=lambda i: i.created, reverse=True)

