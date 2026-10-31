"""Swarm view API. Owner: Alok. Contract in TASKS.md ("Swarm API"); keep it in sync.

Endpoints to implement:
  GET /api/calls?since=<unix ts>   -> list of CallRecord dicts (history, for window + replay)
  GET /api/events                  -> SSE stream, one `event: call` per new CallRecord
  GET /api/graph                   -> people, agents and datapacks to draw as nodes

Read calls only through sunwai.calllog.CallLog (since / subscribe / unsubscribe).
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api")
