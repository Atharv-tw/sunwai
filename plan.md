# Sunwai — build plan

**Sunwai** (सुनवाई, "a hearing") is our answer to Meko Track B, *Campus Grievance Swarm*, at hackCBS 9.0.
Team Syzygy: Atharv, Alok, Arun. Deadline: **1 Nov 2026, 12:00 IST**.

## The problem we model

Campus complaints get lost, counted twice, answered with silence, fixed and then forgotten. Departments
don't share, knowledge leaves when staff rotate, and leadership hears the loudest complaint instead of
the verified pattern. Campuses have forms; what they lack is **context that reaches the right person at
the right time and gets better with every fix.**

## Our angle: verified campus memory

A fix only becomes campus knowledge after the **students it affected confirm it held** and **a
responsible person approves it**. Only then is it promoted into campus canon. Leadership reads only canon,
so what the dean sees is verified, not anecdote.

What the campus remembers, who is told what and when, and which calls stay human:

| Question | Our answer |
|---|---|
| What is remembered? | Incidents (merged duplicates), fixes, what was tried, root causes, events from other departments (power cuts, delayed parts), verified lessons |
| Who decides? | Caretaker/warden/IT cell/mess committee approve actions and lessons. Agents never close a ticket or promote a lesson alone |
| Who is told? | Student: status + ETA + why. Department: notes from other departments that change its plan. Dean: verified patterns only |
| When does one case change another? | A verified lesson in Hostel A dispatches the next Hostel B case at once, with the right fix and an honest ETA |

## Actors

**Agents** (one Meko datapack each):

| Agent | Datapack | Job |
|---|---|---|
| Desk | `sunwai-desk` | Front door. Classifies a complaint in the student's own words, merges duplicates into one incident, replies with status, ETA and why |
| Hostel | `sunwai-hostel` | Electrical/plumbing/geyser work. Recalls past fixes and canon lessons, proposes a plan and ETA to the caretaker |
| Mess | `sunwai-mess` | Food and hygiene. Clusters sickness reports, escalates safety to the mess committee |
| IT | `sunwai-it` | Wi-Fi/network. Merges "40 reports, one router" |
| Curator | `sunwai-canon` | After a fix, asks affected students whether it held; drafts a lesson; asks the warden to approve; promotes it |
| Dean | `sunwai-dean` | Reads only promoted canon; reports verified patterns ("RO filters fail every ~40 days") |

**People** (role switcher, no login): student, caretaker/warden, mess committee, IT cell, electricity staff, dean.

## Where Meko is load-bearing

| Meko use | Where | Why it matters |
|---|---|---|
| `memory_search` / `context_search` before acting | every agent | Duplicate detection, recalling past fixes, honest ETAs from history |
| `memory_add` into *another* agent's datapack | electricity staff → `sunwai-hostel`; Desk → department | Departments share what changes each other's plans (learnings never cross datapacks, so we write notes across) |
| `memory_promote` after human approval | Curator → `sunwai-canon` | Fix → verified lesson → campus canon |
| `memory_get_all(promoted=true)` | Dean | Leadership sees only verified knowledge |
| conversations per incident | Desk | Student can always see where it stands and why |
| `MEKO_ENABLED=off` | whole app | Same flow without Meko: duplicates pile up, the later case starts from zero |

## Architecture

```
web/ (role screens + swarm view, plain JS/SVG)
   │  REST + SSE
sunwai/server.py (FastAPI)
   ├── orchestrator: state machine per incident (reported → triaged → assigned → fixed → verified → lesson)
   ├── agents/*: narrow LLM jobs (classify, extract, draft) via JSON schema / tool calls
   ├── llm.py → Ollama (OpenAI-compatible) qwen3:4b dev / qwen3:8b demo
   ├── meko.py → Meko MCP (streamable HTTP); every call logged {ts, actor, tool, datapack, kind, summary, ms, ok}
   └── store (SQLite): incidents, tickets, Meko call log  ← swarm view reads this
```

## Requirement map

| Req | How we meet it | Where shown in demo |
|---|---|---|
| B1 grievance end to end | geyser case: report → triage → caretaker → fix → student confirms → status visible throughout | student screen |
| B2 people + agents in sync | power cut recorded by a person → Hostel agent moves the ETA; agent recalls past root cause → caretaker checks it; warden approves lesson | caretaker + swarm view |
| B3 context changes a later case | verified Hostel A lesson dispatches Hostel B at once; Wi-Fi reports merge. Toggle Meko off and repeat | side-by-side run |
| B4 swarm view | live graph of people/agents/datapacks, one edge per logged Meko call, counters, message stream, window + replay | always open |
| B5 honest and private | pseudonymous IDs, PII scrub, every context card cites a Meko memory id, `SCRIPTED` badges | context cards |

## Milestones (IST)

| By | Milestone | Status |
|---|---|---|
| 31 Oct 21:00 | Setup: repo public, docs, Meko connected, local model running, smoke numbers, decisions promoted | done (model: `qwen3:4b-instruct`, D-025) |
| 1 Nov 01:00 | Vertical slice: geyser case end to end through Meko, call wrapper + log | done 31 Oct 20:31 (`scripts/slice_geyser.py`) |
| 1 Nov 04:00 | Swarm view live (graph, counters, stream, window/replay) | |
| 1 Nov 07:00 | Breadth: Wi-Fi dedup, mess sickness escalation, power-cut ETA, Dean patterns, semester rollover, Meko on/off toggle | backend done except Dean on real data (needs `history.json` + reset) and semester rollover |
| 1 Nov 10:00 | DESIGN.md, FEATURE_PROPOSAL.md, README ≤5 commands, result.md numbers, 4060 dry run, demo script, LinkedIn post | |
| 1 Nov 12:00 | Buffer, submit | |

## Submission checklist

- [ ] Public repo, README setup in ≤5 commands
- [ ] `DESIGN.md`: one page, who does what, where Meko is used and why
- [ ] Demo ≤5 min with swarm view open
- [ ] `FEATURE_PROPOSAL.md`: friction, feature, MCP interface with example call + response, scenario before/after, why new, risks
- [ ] Check T: `syzygy-build` has ≥10 promoted decisions from ≥2 teammates, each signed; judges invited as Viewers
- [ ] Open model running locally on the demo laptop
- [ ] LinkedIn post: short demo, what Meko does in it, mention Meko, YugabyteDB and hackCBS 9.0
