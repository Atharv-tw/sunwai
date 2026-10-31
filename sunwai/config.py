"""Settings read from the environment (.env). One place, no defaults hidden elsewhere."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

# One datapack per agent. Coding agents never touch these; the product never reads the build datapack.
AGENT_DATAPACKS = ("desk", "hostel", "mess", "it", "canon", "dean")


@dataclass(frozen=True)
class Settings:
    meko_api_key: str
    meko_mcp_url: str
    meko_enabled: bool
    datapack_prefix: str
    llm_base_url: str
    llm_model: str
    llm_api_key: str
    host: str
    port: int
    db_path: Path

    def datapack(self, agent: str) -> str:
        return f"{self.datapack_prefix}{agent}"


def load() -> Settings:
    return Settings(
        meko_api_key=os.getenv("MEKO_API_KEY", ""),
        meko_mcp_url=os.getenv("MEKO_MCP_URL", "https://mcp.mekodata.ai/mcp"),
        meko_enabled=os.getenv("MEKO_ENABLED", "on").lower() in ("on", "1", "true", "yes"),
        datapack_prefix=os.getenv("MEKO_DATAPACK_PREFIX", "sunwai-"),
        llm_base_url=os.getenv("LLM_BASE_URL", "http://localhost:11434/v1"),
        llm_model=os.getenv("LLM_MODEL", "qwen3:4b-instruct"),
        llm_api_key=os.getenv("LLM_API_KEY", "ollama"),
        host=os.getenv("SUNWAI_HOST", "127.0.0.1"),
        port=int(os.getenv("SUNWAI_PORT", "8765")),
        db_path=ROOT / os.getenv("SUNWAI_DB", "data/sunwai.db"),
    )
