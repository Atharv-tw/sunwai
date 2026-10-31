# Results

Only numbers we measured. Each table says the machine, the date and the command that produced it.

## Machines

| Name | CPU / RAM | GPU | Role |
|---|---|---|---|
| dev (Atharv) | 12 threads / 6.6 GB | GTX 1650, 4 GB | building, `qwen3:4b` |
| demo | ? / 16 GB | RTX 4060 Laptop, 8 GB | demo, `qwen3:8b` |

## Meko call latency

`uv run python scripts/smoke_meko.py`, network not controlled (whatever the dev laptop was on).

Logged by `sunwai/meko.py` across two smoke runs, dev laptop, 31 Oct 2026 ~20:00 IST. "max" not p95: n is small.

| Tool | n | p50 ms | max ms |
|---|---|---|---|
| datapack_list | 8 | 1700 | 2038 |
| datapack_search | 2 | 1620 | 1683 |
| datapack_create | 2 | 2286 | 2425 |
| conversation_create | 3 | 1848 | 1922 |
| memory_add | 1 | 2050 | 2050 |
| memory_search | 6 | 8680 | 9388 |
| context_search (all sources) | 6 | 9027 | 9256 |
| context_search (knowledge_base only) | 1 | 1800 | 1800 |
| memory_get_all | 6 | 1832 | 2037 |
| memory_promote | 1 | 1850 | 1850 |
| 3 × memory_search in parallel (wall clock) | 1 | 9400 | 9400 |

Takeaway: every call costs ~2 s; anything that searches memory costs ~9 s, and parallel searches cost the same as one.

## Meko behaviour

| Check | Result | Date |
|---|---|---|
| Write → searchable lag (memory_add then memory_search finds it) | Found by the first search, 9.4 s after the write, i.e. one search's latency: no extra indexing lag observed | 31 Oct |
| `memory_get_all(promoted=true)` returns the promoted memory | Yes, under `promoted_memories`, text in `data` | 31 Oct |
| Promoted memory visible in `context_search` | No: it left the `memory` bucket and was still absent from the `knowledge_base` bucket ~35 min later | 31 Oct |
| Promoted memory visible in `knowledgebase_search` | Yes (~35 min after promotion; not checked earlier): a KB chunk with `metadata_filters.source = "memory"` and the original `memory_id` | 31 Oct |

## Geyser vertical slice (product, live Meko)

`uv run python scripts/slice_geyser.py` against `uv run sunwai`, dev laptop, 31 Oct 2026 20:29–20:31 IST, fresh
`data/sunwai.db`, product datapacks just created (empty). The LLM was not installed yet, so Desk used its keyword
fallback and the Curator built the lesson from the caretaker's note; the Meko side is the real flow.

| Step | Wall clock from start |
|---|---|
| Hostel A report filed by Desk (classify + recall `sunwai-desk` + write) | 13.4 s |
| Hostel plan ready (3 parallel recalls + Desk hand-off) | 26.5 s |
| Power cut recorded → notes in `sunwai-hostel` and `sunwai-it` | 29.0 s |
| Hostel A ETA moved to the end of the power cut, citing the note's memory id | 40.0 s |
| Lesson promoted to `sunwai-canon` after student confirm + warden approval | 55.1 s |
| Hostel B report planned with the Hostel A lesson as context (by its memory id) | 79.4 s |

The promoted lesson was found by `knowledgebase_search` on the first try, ~5–20 s after `memory_promote`.

Meko calls logged in `data/sunwai.db` for the run (44 total incl. startup, 0 errors):

| Tool | kind | n | mean ms | max ms |
|---|---|---|---|---|
| memory_search | read | 7 | 10735 | 13386 |
| knowledgebase_search | read | 2 | 1446 | 1458 |
| memory_add | write / share / approval | 4 / 4 / 3 | ~1340 | 1413 |
| memory_promote | promote | 1 | 1448 | 1448 |
| conversation_create | admin | 11 | 1241 | 1669 |
| datapack_search / datapack_create | admin | 6 / 6 | 1185 / 1733 | 1384 / 2050 |

Takeaway: `knowledgebase_search` (canon) answers in ~1.4 s; `memory_search` costs ~11 s and dominates every step.

## Local model

`uv run python scripts/smoke_llm.py` — 10 sample grievances, triage tool call.

| Model | Machine | Valid tool calls / 10 | Correct category / 10 | p50 latency s | tok/s |
|---|---|---|---|---|---|
| qwen3:4b | dev | | | | |
| qwen3:8b | demo | | | | |

## Meko on vs off (product)

Same scripted scenario, same model. Hostel B rows: `scripts/slice_geyser.py`, 31 Oct, keyword fallback (no LLM), Meko on (port 8765) vs `MEKO_ENABLED=off` (port 8766).

| Measure | Meko on | Meko off |
|---|---|---|
| Incidents created from the Wi-Fi report burst | | |
| Repeat geyser case (Hostel B): plan given | "Verified fix from INC-0001: reset the breaker, set thermostat to 55C" (cites canon memory id) | "Inspect the geyser. No past fix on record." |
| Repeat geyser case: ETA given | 40 min (from the verified lesson) | 24 h (default for medium severity) |
| Repeat geyser case: ETA vs actual | not measured yet | not measured yet |
