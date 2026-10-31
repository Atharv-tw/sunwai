# Sunwai: design note

**Verified campus memory.** A student complains in their own words. Agents recall what the campus already knows
and propose a plan, and people decide. A fix becomes campus knowledge only after the students it affected confirm it
held and the responsible person approves it (D-004). Hackathon brief: Meko Track B (Campus Grievance Swarm).

## Who does what

| Actor | Kind | Meko datapack | Does |
|---|---|---|---|
| Desk | agent | `sunwai-desk` | Classifies the complaint, merges duplicates into one incident, hands it to a department, tells the student the status, ETA and why |
| Hostel / Mess / IT | agents | `sunwai-hostel` / `-mess` / `-it` | Recall past and failed fixes, other departments' notes and canon lessons; propose a plan and ETA that cite them. Mess escalates 3+ sickness reports as food safety |
| Curator | agent | `sunwai-canon` | Asks the reporters whether the fix held, drafts a lesson (root cause, fix, time taken), promotes it once approved |
| Dean | agent | `sunwai-dean` | Reads only promoted canon and reports patterns, e.g. "RO water needed a verified fix 4 times, about every 40 days" |
| Student | person | — | Reports the fault, confirms the fix held or says it is still broken. Shown only as `S-xxxx` |
| Caretaker, warden, mess committee, IT cell | people | — | Staff approve the plan and record the fix; the department's approver (warden, mess committee, IT cell) approves or rejects a lesson for canon |
| Electricity staff | person | — | Record a power cut, which is written as a note into the Hostel and IT datapacks |

Coding agents use a separate datapack, `syzygy-build`. The product never reads it.

## Where Meko is used, and why

| Meko call | Who, where | Why | Brief |
|---|---|---|---|
| `memory_search` on `sunwai-desk` before filing | Desk | Recognise "router dead" and "no internet since 9" as the same open incident: 40 reports become 1 | B1, B3 |
| `memory_add` of the incident, plus a hand-off note into the department's datapack | Desk | Departments share by writing into the receiver's datapack, because Meko learnings never cross datapacks (D-006) | B1, B2 |
| `memory_add` of a power cut into `sunwai-hostel` and `sunwai-it` | Electricity staff | **Agent acts on what a person recorded:** the Hostel agent recalls the note and moves the student's ETA, citing it | B2 |
| `memory_search` on the department datapack and `knowledgebase_search` on `sunwai-canon`, in parallel | Hostel / Mess / IT | **Person acts on what an agent recalled:** the caretaker sees the plan with context cards and approves it | B2, B3 |
| `memory_add` of the fix, a failed fix, approvals and confirmations | People, via agents | The next case recalls what was tried; each human decision is a logged event | B2, B3, B4 |
| `memory_promote` into `sunwai-canon` | Curator, only after a student confirms and the approver approves | A verified Hostel A lesson sends the next Hostel B case straight to the right fix, with an honest ETA | B3 |
| `memory_get_all(promoted=true)` on `sunwai-canon` | Dean | Leadership sees verified patterns, not the loudest complaint | B3 |
| Every call above, logged by `sunwai/meko.py` | Swarm view | Nodes, edges, counters, the stream and replay are all drawn from that log, never invented (D-009, D-037) | B4 |

**Honest and private (B5).**
- Phones, emails, roll numbers and self-introduced names are scrubbed before every Meko write and query (D-030).
- Students appear only as salted pseudonyms (`S-xxxx`).
- Every context card shows the datapack and Meko memory id it came from.
- Seeded history and simulated students are labelled `SCRIPTED`, but still call Meko live (D-013).

## What stays human

Agents propose; they never approve, close or promote. The state machine in `sunwai/orchestrator.py` takes those
steps only from a person's action, and checks the role:
- staff approve the plan, then record the fix;
- only students confirm it held, or say it is still broken;
- only the department's approver turns a draft lesson into canon.

Agents classify, recall, merge, draft and remind, using `qwen3:4b-instruct` running locally on Ollama.

## Meko on vs off

The same flows run with `MEKO_ENABLED=off` (D-012). Measured on 31 Oct–1 Nov (details in [result.md](result.md)):

| | Meko on | Meko off |
|---|---|---|
| 40 Wi-Fi and 5 mess-sickness reports, sent at once | 2 incidents; mess escalated as food safety | 45 incidents |
| Full demo script, `scenarios/live.json` (49 reports) | 4 incidents, 47 Meko calls, 0 errors | 49 incidents |
| Power cut at Hostel A | ETA moved behind it, citing the note's memory id | ETA unchanged |
| Repeat geyser case, Hostel B | "Verified fix from INC-0001: reset the breaker, set thermostat to 55C", 40 min, cites the canon memory id | "No past fix on record", default ETA |
