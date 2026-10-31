"""Incident API. Contract in TASKS.md ("Incident API"); Arun's student and staff screens use it."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from sunwai.orchestrator import FlowError, Orchestrator

router = APIRouter(prefix="/api")


class GrievanceIn(BaseModel):
    student_seed: str
    text: str
    scripted: bool = False


class ActionIn(BaseModel):
    actor_role: str
    action: str
    note: str | None = None
    student_seed: str | None = None  # which student confirms; optional
    scripted: bool = False


class DeptEventIn(BaseModel):
    actor_role: str = "electricity"
    kind: str = "power_cut"
    place: str
    until: str  # "22:00" or ISO-8601
    note: str | None = None
    scripted: bool = False


def _orch(request: Request) -> Orchestrator:
    return request.app.state.orchestrator


def _fail(e: FlowError) -> HTTPException:
    return HTTPException(status_code=e.status, detail=str(e))


@router.post("/grievances")
async def file_grievance(body: GrievanceIn, request: Request) -> dict:
    if not body.text.strip():
        raise HTTPException(422, "text is empty")
    inc, student = await _orch(request).grievance(body.student_seed, body.text, body.scripted)
    return {**inc.to_api(), "student_id": student}


@router.get("/incidents")
def list_incidents(request: Request, dept: str | None = None, status: str | None = None) -> list[dict]:
    return [i.to_api() for i in _orch(request).list(dept or None, status or None)]


@router.get("/incidents/{inc_id}")
def get_incident(inc_id: str, request: Request) -> dict:
    inc = _orch(request).store.get(inc_id)
    if inc is None:
        raise HTTPException(404, f"no incident {inc_id}")
    return inc.to_api()


@router.get("/students/{student_id}/incidents")
def student_incidents(student_id: str, request: Request) -> list[dict]:
    return [i.to_api() for i in _orch(request).for_student(student_id)]


@router.post("/incidents/{inc_id}/actions")
async def act(inc_id: str, body: ActionIn, request: Request) -> dict:
    try:
        inc = await _orch(request).action(inc_id, body.actor_role, body.action, body.note, body.student_seed, body.scripted)
    except FlowError as e:
        raise _fail(e) from None
    return inc.to_api()


@router.post("/dept-events")
async def dept_event(body: DeptEventIn, request: Request) -> dict:
    try:
        return await _orch(request).dept_event(body.actor_role, body.kind, body.place, body.until, body.note, body.scripted)
    except FlowError as e:
        raise _fail(e) from None
