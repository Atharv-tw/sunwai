# Results

Only numbers we measured. Each table says the machine, the date and the command that produced it.

## Machines

| Name | CPU / RAM | GPU | Role |
|---|---|---|---|
| dev (Atharv) | 12 threads / 6.6 GB | GTX 1650, 4 GB | building, `qwen3:4b` |
| demo | ? / 16 GB | RTX 4060 Laptop, 8 GB | demo, `qwen3:8b` |

## Meko call latency

`uv run python scripts/smoke_meko.py` — n calls per tool, from the venue network.

| Tool | n | p50 ms | p95 ms | Machine / date |
|---|---|---|---|---|
| datapack_list | | | | |
| memory_add | | | | |
| memory_search | | | | |
| context_search | | | | |
| memory_promote | | | | |
| memory_get_all | | | | |

## Meko behaviour

| Check | Result | Date |
|---|---|---|
| Write → searchable lag (memory_add then memory_search finds it) | | |
| `memory_get_all(promoted=true)` returns the promoted memory | | |
| Promoted memory visible in `context_search` | | |

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
