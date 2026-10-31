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

## Local model

`uv run python scripts/smoke_llm.py` — 10 sample grievances, triage tool call.

| Model | Machine | Valid tool calls / 10 | Correct category / 10 | p50 latency s | tok/s |
|---|---|---|---|---|---|
| qwen3:4b | dev | | | | |
| qwen3:8b | demo | | | | |

## Meko on vs off (product)

Same scripted scenario, same model.

| Measure | Meko on | Meko off |
|---|---|---|
| Incidents created from the Wi-Fi report burst | | |
| Repeat geyser case (Hostel B): steps to dispatch | | |
| Repeat geyser case: ETA given vs actual | | |
