# Results

Only numbers we measured. Each table says the machine, the date and the command that produced it.

## Machines

| Name | CPU / RAM | GPU | Role |
|---|---|---|---|
| dev (Atharv) | 12 threads / 6.6 GB | GTX 1650, 4 GB | building, `qwen3:4b` |
| demo (Alok) | i7-14650HX, 24 threads / 15.7 GB | RTX 4060 Laptop, 8 GB | demo, `qwen3:8b` |

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

Demo laptop, one smoke run (`data/smoke_meko.json`), 1 Nov 2026, home Wi-Fi (slow that night: PyPI downloads stalled):

| Tool | n | p50 ms | max ms |
|---|---|---|---|
| datapack_list | 5 | 1878 | 2501 |
| memory_search | 5 | 9932 | 10432 |
| context_search (all sources) | 5 | 10767 | 11157 |
| memory_get_all | 5 | 1351 | 1644 |
| memory_promote | 1 | 1311 | 1311 |

Write → searchable lag 10.8 s (one search's latency); promoted memory visible in `memory_get_all`. Same shape as dev.

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
| qwen3:4b-instruct (Q4_K_M) | dev | 10 | 9 | 3.09 (max 5.80); rerun with `think: false`: 3.14 (max 3.52) | 23.7 |
| qwen3:4b (Q4_K_M, thinking build) | dev | not completed | not completed | 87.4 for one call | ~13 |
| qwen3:8b (hybrid, 40960 ctx) | demo | 10 | 9 | 6.70 (max 11.67) | 45.8 |

1 Nov, Ollama 0.40.13, RTX 4060 Laptop: 100% GPU, 5.5 GB of 8 GB VRAM at 4096 context; first load 86 s (cold).
Same one miss as dev: "corridor light … someone fell" → `hostel_electrical`. p50 is under the 4060.md 10 s bar, so
the demo stays on `qwen3:8b`; `qwen3:4b-instruct` is pulled as the fallback.

31 Oct ~21:00 IST, Ollama 0.40.13, GTX 1650 (model split 23% CPU / 77% GPU at 4096 context). The one miss:
"corridor light … someone fell" came back `hostel_electrical`, we expected `safety`.
`qwen3:4b` on Ollama is now the Qwen3-4B-Thinking-2507 build (256K context, thinking on by default): one triage
call generated 1165 tokens and took 87.4 s; with `think: false` it still reasoned, in `content` (2288 tokens,
181.6 s), and the smoke run hit the 90 s client timeout. Hence D-025: `qwen3:4b-instruct`.

## Demo script rehearsal (`scenarios/live.json`)

`scripts/run_scenario.py --speed 0`, 1 Nov 2026, GTX 1650 dev laptop, qwen3:4b-instruct (`LLM_PARALLEL=2`), scratch DB
per side. The product datapacks still held earlier test data and were **not** seeded with `history.json`, so Hostel A
and Wi-Fi had no past fix to recall; the rehearsal checks the script and the flow, not the seeded plans.

| Measure | Meko on (00:22–00:27 IST) | Meko off (run just before) |
|---|---|---|
| Incidents from 57 steps (49 student reports, 7 staff/student actions, 1 power cut) | 4: geyser Hostel A 3→1, Wi-Fi 40→1, mess 5→1 (escalated as food safety), geyser Hostel B | 49 (one per report) |
| Runner wall time | 245.0 s | 162.5 s |
| Meko calls (admin excluded) | 47, 0 errors: 27 read, 7 write, 6 share, 6 approval, 1 promote | 0 |
| Power cut at Hostel A | written into `sunwai-hostel` and `sunwai-it`; INC-0001's ETA moved behind it, citing the note's memory id | nothing written, ETA unchanged |
| Hostel B geyser plan | "Verified fix from INC-0001: Reset the breaker and set thermostat to 55C", ETA 40 min, cites the canon lesson promoted 1 min earlier in the same run | "Inspect the geyser at Hostel B, floor 3. No past fix on record.", default for high severity |

## Seeded demo state (`sunwai-*`, before the demo)

Atharv ran `scripts/reset_product.py --yes` (01:22–01:26 IST, 1 Nov) and `scripts/seed_history.py` (01:28) on his
laptop; checked read-only afterwards with `memory_get_all`, `knowledgebase_search` and the Dean's pattern code (its
pattern-report write skipped).

| Datapack | After reset + seed |
|---|---|
| `sunwai-desk`, `sunwai-dean` | 0 memories |
| `sunwai-hostel` / `-mess` / `-it` | 4 / 5 / 3 memories: the 12 seeded past-fix notes |
| `sunwai-canon` | 0 memories, 8 promoted after the seed: the 6 seeded lessons + 2 test lessons the reset could not remove (Hostel A geyser, promoted 31 Oct 20:30 and 1 Nov 00:23 IST). Atharv deleted those 2 in the Meko Cloud UI (~01:45): **6 promoted**, all seeded |

- Reset: `memory_delete_all` succeeded on all six datapacks (13 agent ids each). Promoted lessons could not be
  deleted: `knowledgebase_delete_document` returned `NOT_FOUND` for the very `document_id` that `knowledgebase_search`
  returns for them, and `memory_delete_by_id` on a promoted id failed with a server error (`Object of type UUID is not
  JSON serializable`).
- `knowledgebase_search` on canon finds all 6 seeded lessons: "RO water filter cartridge clogged" → the 4 RO lessons,
  "Wi-Fi down router overheating Block C" → the 2 router lessons, each with its memory id.
- Dean patterns after the UI deletion: Mess RO water 4 verified fixes, about every 40 days, next expected around
  2026-11-17; IT router 2, about every 49 days, next around 2026-11-10. (Before it, a spurious "Hostel: geyser needed
  a verified fix 2 times" came from the 2 leftover test lessons.) No geyser lesson is left in canon, so the demo's
  Hostel A case plans from the seeded, unverified past fixes.

## Full rehearsal on the seeded datapacks, swarm view open

1 Nov 2026, GTX 1650 dev laptop, qwen3:4b-instruct (`LLM_PARALLEL=2`). `scripts/run_scenario.py --speed 0` against
`uv run sunwai` with a scratch DB per side (`data/rehearsal-on.db`, `data/rehearsal-off.db`). The product datapacks
were in the seeded state above. `swarm.html` was open in a browser at 1366×768 the whole time. This run leaves the
datapacks no longer seeded: they hold the run's memories and one promoted geyser lesson, so reset, delete that
lesson in the Meko UI and seed again before the demo (4060.md §5b).

| Measure | Meko on (03:24–03:29 IST) | Meko off (03:31–03:34 IST) |
|---|---|---|
| Incidents from 57 steps | 4: geyser Hostel A 3→1, Wi-Fi 40→1, mess 5→1 (escalated as food safety), geyser Hostel B | 49 |
| Runner wall time | 248.1 s | 149.7 s |
| Meko calls during the run (admin excluded) | 46, 0 errors: 26 read, 7 write, 6 share, 6 approval, 1 promote | 0 |
| Hostel A plan | Seeded fix the students never confirmed ("the 2026-01-09 case … Reset the breaker"); ETA moved from 03:45 to 04:35, behind the power cut until 04:15, citing the note's memory id | "No past fix on record", default ETA; power cut wrote no notes |
| Wi-Fi plan | Seeded verified router lesson from canon (see the fix below) | "No past fix on record" × 40 |
| Hostel B plan | "Verified fix from INC-0001: Reset the breaker and set thermostat to 55C", 40 min, citing canon memory `2a9bf23c`, which was promoted at 03:26:29, about 3 min earlier | "No past fix on record", default ETA; the approved lesson was not saved |

Latency per call in the Meko-on run (including 3 Dean calls made after it):

| Tool | n | p50 ms | max ms |
|---|---|---|---|
| `memory_search` | 22 | 13474 | 15563 |
| `knowledgebase_search` | 4 | 2872 | 3162 |
| `memory_add` | 20 | 2489 | 6334 |
| `memory_promote` | 1 | 3476 | 3476 |
| `memory_get_all` | 2 | 1678 | 1721 |

**Swarm view against the log.** At the end of the run, in the "All" window, every counter equalled the count from
`/api/calls`:
- notes 13, reads 26, promotions 1, directives 6, approvals 6, errors 0;
- the stream held 46 rows;
- each datapack block's call count matched (desk 17, hostel 10, mess 5, IT 5, canon 9).

On the replay slider:
- at the power cut, two share edges ran from Electricity to Hostel and IT;
- at the promotion, an approval edge and the promote edge ran into Canon.

With Meko off, the view showed MEKO OFF over a dark graph and zero counters. `POST /api/meko` off and back on, on the
running server, switched the badge and the overlay, and reconnected without error.

**Dean screen after the run.**
- Patterns: router about every 49 days and RO about every 40 days.
- Lessons: 7 listed (6 seeded, badged SCRIPTED, plus the new geyser lesson).
- With one geyser lesson there is no geyser pattern.

**Fixed after the run.** The Wi-Fi plan had cited the older of the two verified router lessons (2026-08-04, 90 min)
because it took the first search hit. Departments now take the newest matching lesson, and a live incident's lesson
counts as newest. One Block C report on the real app afterwards got "Verified fix from the 2026-09-22 case … moved
the router out of the cabinet", 75 min.

**Found, not fixed.**
- The promoted lesson says "held for 1 student". The Curator drafts it at the first confirmation. The second
  student's confirmation came 12 s later, before the warden approved. It is logged as an approval, but it is not in
  the lesson text.
- Swarm view: on a paused replay position, edges still fade on real-time timers, so the frame loses its edges after
  up to 6 s (`web/swarm.js`, `drawEdge`).

**Setup from a fresh clone (README).** 1 Nov ~03:20:
- `git clone` and `cp .env.example .env` took 5.1 s.
- `ollama pull qwen3:4b-instruct` took 3.4 s (the model was already local).
- `uv run sunwai` answered `/api/health` at once. The uv cache on this laptop was warm, so this is not a cold
  install.
- Every page and API route returned 200.
- One complaint was classified by the local model and planned in 18.3 s.
- Run with `MEKO_ENABLED=off` and the product key, so the product datapacks were not touched.

## Meko on vs off (product)

Same scripted scenario, same model. Burst row: `scripts/slice_burst.py`, 31 Oct 21:10–21:16 IST, qwen3:4b-instruct (`LLM_PARALLEL=2`), fresh local DB each side; times are LLM-bound (45 classifications on the GTX 1650). Hostel B rows: `scripts/slice_geyser.py`, 31 Oct, keyword fallback (no LLM), Meko on (port 8765) vs `MEKO_ENABLED=off` (port 8766).

| Measure | Meko on | Meko off |
|---|---|---|
| Incidents from the burst: 40 Wi-Fi reports in different wording + 5 mess sickness reports, sent at once | 2 (Wi-Fi 40→1; mess 5→1, escalated to the mess committee as a safety risk); 32 Meko calls, 0 errors, 147.7 s | 45 (one per report); 0 Meko calls, 188.6 s |
| Repeat geyser case (Hostel B): plan given | "Verified fix from INC-0001: reset the breaker, set thermostat to 55C" (cites canon memory id) | "Inspect the geyser. No past fix on record." |
| Repeat geyser case: ETA given | 40 min (from the verified lesson) | 24 h (default for medium severity) |
| Repeat geyser case: ETA vs actual | not measured yet | not measured yet |
