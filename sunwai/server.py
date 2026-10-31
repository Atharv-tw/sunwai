"""FastAPI app: serves the web UI and the API the role screens and swarm view use."""

from __future__ import annotations

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from sunwai import __version__, config, swarm_api

settings = config.load()
app = FastAPI(title="Sunwai", version=__version__)
app.include_router(swarm_api.router)


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "version": __version__,
        "meko_enabled": settings.meko_enabled,
        "meko_key_set": settings.meko_api_key.startswith("mko_tkn_") and "replace_me" not in settings.meko_api_key,
        "llm_model": settings.llm_model,
    }


app.mount("/", StaticFiles(directory=config.ROOT / "web", html=True), name="web")


def main() -> None:
    uvicorn.run("sunwai.server:app", host=settings.host, port=settings.port)
