# Sunwai — agent instructions

Team **Syzygy** (Atharv, Alok, Arun) at hackCBS 9.0, Meko Track B (Campus Grievance Swarm).
Read `plan.md` for what we are building, `decisions.md` for what is already decided, and `TASKS.md` for
who owns which files and the API contracts.

## Team protocol: the build datapack (required by the Meko challenge)

Our coding agents share one Meko datapack: **`syzygy-build`**. It holds team decisions, API contracts,
schemas, datapack names and gotchas. Only **promoted** memories reach the rest of the team.

1. **Before every task, recall.** Resolve the `syzygy-build` datapack id once per session
   (`datapack_search` with `name: "syzygy-build"`), then search it with the task's keywords using
   **`knowledgebase_search`** (promoted decisions live there) and `memory_search` (unpromoted summaries),
   in parallel. Don't rely on `context_search`: it misses promoted memories (D-018).
   Follow any promoted decision you find; if the task conflicts with one, stop and ask.
2. **When a task ends, save a short summary.** `memory_add` to `syzygy-build`, text starting with your
   teammate name, e.g. `[Alok] summary: swarm view now streams calls over SSE from /api/events`.
   Use Meko's coding-agent convention `agent_id` = `<client>:sunwai` (`claude_code:sunwai`, `codex:sunwai`);
   the `[Name]` at the start of the text says who.
3. **Promote every decision the others must follow.** `memory_add` the decision as
   `[Name] DECISION D-0xx: <what> because <why>`, then `memory_promote` it, then add the same entry to
   `decisions.md` with the memory id. Number decisions in order: the next free id is one above the highest
   D-number in `syzygy-build` (`memory_get_all`, `promoted=true`, `page_size=100`) or in `decisions.md`, whichever
   is higher, and push the `decisions.md` row straight after promoting (D-027).
4. **Never put keys or personal data in `syzygy-build`.** No `mko_tkn_…`, no `.env` values, no phone
   numbers, emails or real student names.
5. **Never mix datapacks.** Coding agents only touch `syzygy-build`. The product's datapacks are
   `sunwai-desk`, `sunwai-hostel`, `sunwai-mess`, `sunwai-it`, `sunwai-canon`, `sunwai-dean`; coding agents never read or write
   them, and the product never reads `syzygy-build`.

Who signs what: `[Atharv]`, `[Alok]`, `[Arun]`. Check T needs ≥10 promoted decisions from ≥2 of us.

## Repo files we keep current

| File | What goes in it |
|---|---|
| `plan.md` | concept, architecture, milestones, submission checklist |
| `decisions.md` | every build decision: id, author, what, why, Meko memory id |
| `research.md` | references we used and what we learned from each (Meko behaviour we measured too) |
| `result.md` | numbers we actually measured (latency, accuracy, Meko on vs off), with date and machine |
| `4060.md` | runbook for the demo laptop (RTX 4060) |

Never write a number into `result.md` that was not measured; say how it was measured.

## Code layout

- `sunwai/config.py` — all settings from `.env`
- `sunwai/meko.py` — the only place that calls Meko; every call is logged for the swarm view
- `sunwai/llm.py` — OpenAI-compatible client (Ollama by default)
- `sunwai/agents/` — one module per agent (desk, department, curator, dean)
- `sunwai/server.py` — FastAPI app, SSE stream, serves the built frontend from `web/`
- `frontend/` — React + TypeScript role application, Vite config and labeled browser-local demo scenarios
- `web/` — committed Vite output plus the data-driven Meko swarm view at `/swarm.html`
- `scripts/` — smoke tests and benchmarks

## Commands

```bash
uv sync                                  # install deps
uv run python scripts/smoke_meko.py      # Meko round trip + latency
uv run python scripts/smoke_llm.py       # local model tool-calling check
uv run sunwai                            # start the app on http://127.0.0.1:8765
npm install && npm run build             # rebuild frontend sources into web/
```

## Conventions

- Python 3.11+, type hints, small modules. Frontend changes use React + TypeScript and Vite; commit the generated `web/` build because Render serves the prebuilt assets with the Python app.
- Every Meko call goes through `sunwai/meko.py` so it shows up in the swarm view. No direct MCP calls elsewhere.
- Nothing shown to a user as "context" unless Meko returned it; show the memory id next to it.
- Anything scripted (seeded history, fast-forward clock, simulated students) is labelled `SCRIPTED` in the UI.
- Student identities are pseudonymous (`S-xxxx`); scrub phone numbers, emails and roll numbers before any Meko write.
- Commit small and often. Commit messages: short, imperative, about the change. No co-author trailers or tool attribution lines.
- Secrets live only in `.env` (gitignored). Each person and machine uses its own Meko key.
