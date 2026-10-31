# Tasks

Who builds what until 1 Nov 12:00. Finish [TEAM_SETUP.md](TEAM_SETUP.md) first.

| Person | Agent | Owns |
|---|---|---|
| Atharv | Claude Code | backend core: Meko client, incident flow, agents, incident API |
| Alok | Claude Code | **swarm view** (B4) and the demo video / LinkedIn post |
| Arun | Codex | **privacy + scenario data** (B5), **student and staff screens**, feature proposal draft |

## How we work

- **Stay in your files** (table below). If you need a change in someone else's file, ask them or say so in `syzygy-build`.
- Work on `main`. Small commits. `git pull --rebase` before every push. `decisions.md`, `research.md` and `result.md` are shared: append your rows, pull first.
- **Before each task:** your agent recalls `syzygy-build` (the protocol in `CLAUDE.md` does this).
- **Decisions:** whenever you choose something the others must live with (a format, a name, a colour code, an endpoint), have your agent save it to `syzygy-build` signed `[Alok]` / `[Arun]` and **promote** it, then add the row to `decisions.md`. Target **3–5 each**. Check T fails without them.
- **Friction:** anything awkward about Meko goes in `research.md` → "Meko friction log" (one line: what, workaround). That is the evidence for our feature proposal.
- Never commit `.env`. Never put keys or real student data anywhere.

## File ownership

| Owner | Files |
|---|---|
| Atharv | `sunwai/{config,meko,calllog,llm,server,store,orchestrator}.py`, `sunwai/agents/*`, `scripts/smoke_*` |
| Alok | `sunwai/swarm_api.py`, `web/swarm.html`, `web/swarm.js`, `web/swarm.css`, `scripts/fake_calls.py` |
| Arun | `sunwai/privacy.py`, `tests/test_privacy.py`, `scenarios/*`, `web/index.html`, `web/student.*`, `web/staff.*`, `web/common.css`, `FEATURE_PROPOSAL.md` |

---

## Alok — swarm view (Claude Code)

The swarm view is required (B4) and is on screen for the whole demo. Look at page 4 of the brief for the
reference picture. **Every element must come from a real, logged Meko call**: you never invent edges.

### A1. Swarm API (`sunwai/swarm_api.py`): by 21:30
Implement the three endpoints in the stub, per the **Swarm API** contract below. Read calls only via
`CallLog.since()` / `subscribe()` / `unsubscribe()` in `sunwai/calllog.py`. The `CallLog` instance will be
on `app.state.calllog` (Atharv wires that in `server.py`); until then create one from `config.load().db_path`.

### A2. Fake call generator (`scripts/fake_calls.py`): by 21:30
Writes plausible `CallRecord`s (all `scripted=True`) into a **separate** DB so you can build the UI before
real calls exist: `SUNWAI_DB=data/fake.db uv run python scripts/fake_calls.py`. Cover every `kind`, a few
errors, and a burst (40 reads in 10 s). Never point it at `data/sunwai.db`.

### A3. Swarm view page (`web/swarm.html|js|css`): by 02:00
Plain HTML/JS/SVG, no build step, no framework. Must have:
1. **Nodes**: every person and agent from `/api/graph`; each agent has its datapack drawn as a small block beside it.
2. **One edge per Meko call**: actor → datapack, animated when it arrives. Style by `kind`: write (solid, into own datapack), read (dashed), share (solid, orange, into *another* agent's datapack), promote (to `sunwai-canon`, highlighted), approval (from a person). Fade after a few seconds.
3. **Counters**: notes (write+share), reads, promotions, directives (share), approvals, errors.
4. **Message stream**: newest first, `actor → datapack: summary`; errors in red; `SCRIPTED` badge when `scripted`.
5. **Time window + replay**: live 5 m / 30 m / all, plus a replay slider that redraws history from `/api/calls`.
6. **Click a node**: side panel with that actor's recent calls. (Later: its memories, via an endpoint Atharv adds.)
7. Fits a 1366×768 projector without scrolling.

### A4. Polish + Meko on/off badge: by 06:00
Show a big `MEKO ON` / `MEKO OFF` badge from `/api/health`. With Meko off the view should look visibly empty: that is the point.

### A5. Build in public: by 11:00
Record the ≤5-min demo (screen + voice) with the swarm view open. Draft the LinkedIn post: short demo,
what Meko does in Sunwai, mention Meko, YugabyteDB and hackCBS 9.0. Post when Atharv says go.

**Decisions you'll likely make (promote them):** SSE vs polling, edge colour/style per kind, how long edges stay, replay granularity, node layout.

---

## Arun — privacy, scenario, role screens (Codex)

### R1. Privacy (`sunwai/privacy.py` + `tests/test_privacy.py`): by 21:30
- `scrub(text) -> tuple[str, list[str]]`: replace phone numbers (Indian 10-digit, +91), emails, roll/enrolment numbers (agree a pattern, e.g. `2K23/CO/123`, `23BCS123`), and names after "my name is" / "I am" with `[phone]`, `[email]`, `[roll]`, `[name]`; return what kinds were removed.
- `pseudonym(seed: str) -> str`: stable `S-xxxx` id (hash, no reversible mapping stored in Meko).
- Unit tests: `uv run python -m pytest tests` (add `pytest` as a dev dependency with `uv add --dev pytest`).
Atharv's code calls `scrub()` before every Meko write.

### R2. Scenario data (`scenarios/`): by 23:00
JSON only, no code. This is our modelled campus; label everything scripted.
- `campus.json`: places (Hostel A, Hostel B with floors, Mess, Library, Block C), people roles (student, caretaker, warden, mess committee, IT cell, electricity staff, dean) with display names that are clearly fake.
- `history.json`: seeded past cases written as the department would remember them (e.g. last winter's geyser trip and its root cause, RO filter replacements every ~40 days, a router that failed twice). 10–15 items, each `{dept, place, date, text}`.
- `live.json`: the demo script, in order: geyser complaint in Hostel A → fix → students confirm → warden approves lesson; power cut recorded by electricity staff; 40 Wi-Fi complaints in different wording (Hinglish, typos, angry, polite); 5 mess sickness reports after Tuesday dinner; geyser complaint in Hostel B (the case that must benefit). Each step `{at: "+0m", actor_role, student_seed?, text}`.

### R3. Student + staff screens (`web/index.html`, `web/student.*`, `web/staff.*`): by 03:00
Plain HTML/JS, no build step. Build against the **Incident API** contract below; until Atharv's endpoints land,
use a local `mock` flag that loads sample JSON.
- `index.html`: role switcher (no login): Student, Caretaker/Warden, Mess committee, IT cell, Electricity, Dean, plus a link to the swarm view.
- **Student**: write a complaint in your own words → see your incidents: status, ETA, **why** (`eta_reason`), how many others reported the same thing, timeline. Buttons "Fixed, it held" / "Still broken" when `awaiting == "student"`.
- **Staff** (caretaker/warden, mess, IT): queue filtered by `dept`, each incident shows the agent's plan and **context cards** (each shows its `memory_id` and datapack: only what Meko returned). Buttons: approve plan, record fix (with note), approve / reject lesson.
- **Electricity**: form to record a power cut (place, until, note).
- **Dean**: list of verified patterns (endpoint TBD with Atharv).
- Poll every 2 s; this is not a Meko call, so it never shows in the swarm view.

### R4. Feature proposal draft (`FEATURE_PROPOSAL.md`): by 08:00
From the friction log, pick the strongest idea. Cover the six points from the brief: friction + our workaround,
the feature in Meko's terms, a new MCP tool or parameter with an example call and response, a before/after
scenario, why no context layer does it today, risks (privacy, cost, abuse) and limits. 1–3 pages.

**Decisions you'll likely make (promote them):** PII patterns and replacement tokens, pseudonym format, scenario file schema, screen polling interval, how context cards cite memories.

---

## Atharv (with Claude Code): backend core

Smoke tests and promote D-001..D-013 → incident store + state machine → Desk, Hostel, Curator agents → incident API → wire `CallLog` into `app.state` → vertical slice (geyser, by 01:00) → Mess/IT, power-cut cross-write, Dean, Meko on/off (by 07:00) → DESIGN.md, README, results (by 10:00).

**Whoever owns the RTX 4060 laptop:** do steps 1–3 of [4060.md](4060.md) now, on a hotspot (~6 GB download).

---

## Contracts

### Swarm API (Alok implements, Atharv's code feeds it)

```
GET /api/calls?since=<unix seconds>    -> [CallRecord]          oldest first, max 2000
GET /api/events                        -> text/event-stream      "event: call\ndata: <CallRecord JSON>\n\n"
GET /api/graph                         -> {people: [Node], agents: [Node], datapacks: [Node]}

CallRecord = {id, ts, actor, tool, datapack, kind, summary, ms, ok, error, scripted}
  kind ∈ write | read | promote | share | approval | admin   (admin hidden by default)
  actor ∈ agent ids (desk, hostel, mess, it, curator, dean) or person roles (student, caretaker, warden, mess_committee, it_cell, electricity)
Node = {id, label, type: "person" | "agent" | "datapack", datapack?: "sunwai-hostel"}
```

### Incident API (Atharv implements, Arun's screens use it)

```
POST /api/grievances                 {student_seed, text}                     -> Incident
GET  /api/incidents?dept=&status=                                             -> [Incident]
GET  /api/incidents/{id}                                                      -> Incident
GET  /api/students/{student_id}/incidents                                     -> [Incident]
POST /api/incidents/{id}/actions     {actor_role, action, note?}              -> Incident
       action ∈ approve_plan | record_fix | confirm_fixed | still_broken | approve_lesson | reject_lesson
POST /api/dept-events                {actor_role: "electricity", kind: "power_cut", place, until, note?} -> {notes_written: [datapack]}

Incident = {
  id: "INC-0007", dept: "hostel" | "mess" | "it", category, place, severity, safety_risk, summary,
  status: reported | assigned | in_progress | fixed | verified | lesson_pending | closed,
  reporters: 12,                       # duplicates merged into this incident
  eta: ISO-8601 | null, eta_reason: "power cut until 22:00 (electricity)",
  plan: "Check thermostat first: same fault last winter",
  context: [{memory_id, datapack, text, source: "memory" | "knowledge_base" | "conversation"}],
  timeline: [{ts, actor, text, scripted}],
  awaiting: "caretaker" | "student" | "warden" | "mess_committee" | "it_cell" | null
}
```

Change a contract only by promoting a decision to `syzygy-build` and editing this file in the same commit.
