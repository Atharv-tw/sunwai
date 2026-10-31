"""FastAPI app: serves the web UI and the API the role screens and swarm view use."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from sunwai import __version__, config, incident_api, swarm_api
from sunwai.calllog import CallLog
from sunwai.llm import LLM
from sunwai.meko import Meko
from sunwai.orchestrator import Orchestrator
from sunwai.store import Store

settings = config.load()
log = logging.getLogger("sunwai")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # One long-lived Meko client and one call log for the whole app; the swarm API reads app.state.calllog.
    calllog = CallLog(settings.db_path)
    store = Store(settings.db_path)
    meko = Meko(settings, calllog)
    app.state.calllog, app.state.store, app.state.meko, app.state.meko_error = calllog, store, meko, ""
    if meko.enabled:
        await _connect(app, meko)
    app.state.orchestrator = Orchestrator(store, meko, LLM(settings), settings)
    try:
        yield
    finally:
        await meko.__aexit__(None, None, None)


async def _connect(app: FastAPI, meko: Meko) -> bool:
    try:
        await meko.connect()
        # resolve (or create) every product datapack up front so the first report isn't slowed down
        await asyncio.gather(*(meko.datapack_id(settings.datapack(a), actor="system") for a in config.AGENT_DATAPACKS))
        app.state.meko_error = ""
        return True
    except Exception as e:  # keep serving with Meko off; /api/health shows why
        app.state.meko_error = f"{type(e).__name__}: {e}"[:300]
        meko.enabled = False
        log.error("Meko unavailable, running with Meko off: %s", app.state.meko_error)
        return False


app = FastAPI(title="Sunwai", version=__version__, lifespan=lifespan)
app.include_router(swarm_api.router)
app.include_router(incident_api.router)


@app.get("/api/health")
def health(request: Request) -> dict:
    meko = getattr(request.app.state, "meko", None)
    return {
        "ok": True,
        "version": __version__,
        "meko_enabled": bool(meko and meko.enabled),
        "meko_error": getattr(request.app.state, "meko_error", ""),
        "meko_key_set": settings.meko_api_key.startswith("mko_tkn_") and "replace_me" not in settings.meko_api_key,
        "datapack_prefix": settings.datapack_prefix,
        "llm_model": settings.llm_model,
    }


class MekoSwitch(BaseModel):
    enabled: bool


@app.post("/api/meko")
async def switch_meko(body: MekoSwitch, request: Request) -> dict:
    """Turn Meko on or off at runtime for the side-by-side demo (D-012). Off = no recalls, no writes."""
    meko: Meko = request.app.state.meko
    meko.enabled = body.enabled
    if body.enabled and not meko.connected and not await _connect(request.app, meko):
        raise HTTPException(503, request.app.state.meko_error)
    return health(request)


app.mount("/", StaticFiles(directory=config.ROOT / "web", html=True), name="web")


def main() -> None:
    uvicorn.run("sunwai.server:app", host=settings.host, port=settings.port)
