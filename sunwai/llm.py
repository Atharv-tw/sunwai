"""OpenAI-compatible chat client. Ollama by default; any provider is a .env change."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

from sunwai.config import Settings


@dataclass
class ToolCall:
    name: str
    args: dict[str, Any]


@dataclass
class Reply:
    text: str
    tool_calls: list[ToolCall]
    seconds: float
    completion_tokens: int


class LLM:
    def __init__(self, settings: Settings):
        self.model = settings.llm_model
        # No retries and a hard timeout: agents fall back to a deterministic path instead of stalling the demo.
        self.client = AsyncOpenAI(
            base_url=settings.llm_base_url, api_key=settings.llm_api_key, timeout=90.0, max_retries=0
        )

    async def chat(
        self,
        system: str,
        user: str,
        *,
        tools: list[dict] | None = None,
        tool_choice: str | dict | None = None,
        temperature: float = 0.2,
        think: bool = False,
    ) -> Reply:
        # Qwen3 soft switch: skip the thinking block for short, structured jobs.
        if not think:
            user = f"{user}\n/no_think"
        start = time.perf_counter()
        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            tools=tools,
            tool_choice=tool_choice if tools else None,
            temperature=temperature,
        )
        seconds = time.perf_counter() - start
        msg = resp.choices[0].message
        calls = []
        for tc in msg.tool_calls or []:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {"_raw": tc.function.arguments}
            calls.append(ToolCall(name=tc.function.name, args=args))
        tokens = resp.usage.completion_tokens if resp.usage else 0
        return Reply(text=(msg.content or "").strip(), tool_calls=calls, seconds=seconds, completion_tokens=tokens)
