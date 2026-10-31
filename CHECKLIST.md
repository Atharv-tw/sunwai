# Problem statement checklist (Meko Track B)

Every requirement from the Meko challenge brief and hackCBS 9.0, with where we meet it and what is left.
Status: ✅ done and checked · 🟡 built, still to rehearse or verify on the demo laptop · ⬜ not done.
Last updated 1 Nov 03:30 IST.

## Track B requirements

| Req | Brief says | Where we meet it | Status |
|---|---|---|---|
| B1 | A student raises a problem in their own words, the right people act on it, and the student can always see where it stands and why | Student screen → Desk → department agent → caretaker → fix → student confirms; status, ETA and `eta_reason` on the student screen (`web/student.*`, Incident API) | 🟡 works live (`result.md`, geyser slice); full `live.json` rehearsal in progress |
| B2 | Agents do real work and people make the calls; at least one hand-off each way through Meko | Person → agent: electricity records a power cut, written into `sunwai-hostel`, Hostel agent moves the ETA citing that memory. Agent → person: Hostel agent recalls the past root cause for the caretaker; warden approves the lesson before promotion | ✅ measured in the geyser slice (`result.md`) |
| B3 | Something learned in one case changes a later case; with Meko off it doesn't | Hostel A lesson → Hostel B planned with it (40 min vs 24 h ETA). 40 Wi-Fi + 5 mess reports → 2 incidents (Meko on) vs 45 (off) | ✅ numbers in `result.md` |
| B4 | Swarm view, live, every element backed by a real logged Meko call | `web/swarm.*` reads only `/api/calls` + `/api/events` from the call log in `sunwai/meko.py` | 🟡 checked with scripted calls; check with a real run in the rehearsal |
| B5 | No personal data the story doesn't need; nothing shown as context Meko didn't return; anything scripted labelled | `sunwai/privacy.py` (33 tests), pseudonymous `S-xxxx` ids, context cards show memory ids, `SCRIPTED` badges | ✅ tests pass; 🟡 check badges in the rehearsal |

## Swarm view must show

| Element | Status |
|---|---|
| Every person and agent, and their datapacks | ✅ |
| One edge per Meko call (written, recalled, shared, promoted) | ✅ (scripted check) · 🟡 real run |
| Counters (notes, reads, promotions, directives, approvals, errors) | ✅ |
| Feed of what was said (message stream) | ✅ |
| Time window or replay | ✅ 5 min / 30 min / all + replay slider |
| Scripted simulation labelled | ✅ `SCRIPTED` badge |

## What we submit

| Item | Where | Status |
|---|---|---|
| Public repo | https://github.com/Atharv-tw/sunwai (MIT) | ✅ |
| README: setup in ≤5 commands | `README.md` (4 commands) | 🟡 fresh-clone check in progress |
| One-page design note: who does what, where Meko is used and why | `DESIGN.md` | ✅ written; read it once |
| Demo ≤5 min with the swarm view open | `demo/DEMO_SCRIPT.md`; record on the 4060 laptop | ⬜ after the final prototype |
| Meko feature proposal (friction, feature, MCP tool with example call + response, scenario, why new, risks) | `FEATURE_PROPOSAL.md` ("attested promotion") | 🟡 being tightened to 1–3 pages |
| Submission form | Ask the organizers / HackCulture | ⬜ by ~11:00 |

## Scoring (Track B, out of 100)

| Criterion | Pts | Our evidence | Status |
|---|---|---|---|
| Innovation | 15 | Verified campus memory: a fix becomes canon only after students confirm it held and a warden approves; the dean reads only canon | ✅ |
| Meko in your product | 25 | 6 datapacks, cross-datapack notes, promote-after-approval, canon recall, Meko on/off | ✅ |
| Execution | 25 | End to end live, swarm view, clear 5-min demo, honest and private | 🟡 rehearsal + demo laptop |
| Open-source LLMs | 10 | Qwen3 on our own laptop via Ollama (dev `qwen3:4b-instruct`, demo `qwen3:8b` on RTX 4060) | 🟡 run `smoke_llm.py` on the 4060 |
| Built with Meko | 10 | `syzygy-build`: 33 promoted decisions (Atharv 28, Alok 5), each signed | ✅ · 🟡 Check T rehearsal |
| Meko feature proposal | 10 | `FEATURE_PROPOSAL.md`, grounded in our friction log (`research.md`) | 🟡 |
| Build in public | 5 + bonus | `demo/LINKEDIN_POST.md`; mention Meko, YugabyteDB, hackCBS 9.0 | ⬜ post with the video, early |

## Check T (judges run it live)

- [x] ≥10 promoted decisions in `syzygy-build` from ≥2 teammates, each naming who made it (Atharv 28, Alok 5)
- [ ] Ask Alok's coding agent about an Atharv decision (e.g. "what did we decide about the stack?" → D-003) and get the answer from Meko
- [ ] Ask Atharv's coding agent about an Alok decision (D-034..D-038, promoted as `[Alok] D-020..D-024`)
- [ ] Invite the judges to `syzygy-build` as **Viewers** at judging time

## Rules

- [x] Built with coding agents connected to Meko, protocol in `CLAUDE.md` / `AGENTS.md`
- [x] Build datapack and product datapacks never mixed (`syzygy-build` vs `sunwai-*`)
- [x] No keys or personal data in Meko or git (`.env` gitignored)
- [x] Built at the event (first commit 31 Oct 19:11 IST)
- [x] Team of 2–4, MLH Code of Conduct

## Before going on stage

- [ ] Final reset + Meko UI cleanup + seed, run **on the 4060 laptop** (`4060.md` §5b) so its local DB is fresh
- [ ] Canon holds exactly the 6 seeded lessons
- [ ] `ollama ps` shows the model warm; hotspot on; charger in; sleep off
- [ ] Meko on/off comparison rehearsed once
