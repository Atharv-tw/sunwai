# Submission: Sunwai (Team Syzygy, hackCBS 9.0, Meko Track B)

| Item | Link |
|---|---|
| Public repo (MIT) | https://github.com/Atharv-tw/sunwai |
| Live app | https://sunwai-lpf8.onrender.com (free instance: first load can take ~50 s) |
| Swarm view | https://sunwai-lpf8.onrender.com/swarm.html |
| Demo video (≤5 min, swarm view open) | _add link_ |
| One-page design note | [DESIGN.md](DESIGN.md) |
| Meko feature proposal: attested promotion | [FEATURE_PROPOSAL.md](FEATURE_PROPOSAL.md) |
| Measured results (Meko on vs off, latency, model) | [result.md](result.md) |
| Problem-statement checklist | [CHECKLIST.md](CHECKLIST.md) |
| LinkedIn post | _add link_ |

## Setup in 4 commands

See [README.md](README.md#run-it-4-commands): clone, copy `.env.example` and add a Meko key, `ollama pull qwen3:4b-instruct`, `uv run sunwai`.

## Open model

Qwen3 via Ollama on our own laptop GPU (`qwen3:8b` on an RTX 4060, `qwen3:4b-instruct` on a GTX 1650). The hosted
app reaches the laptop's model through a Cloudflare tunnel ([4060.md](4060.md#hosted-link)); without it, the Desk
uses keyword triage.

## Built with Meko (Check T)

- Build datapack: **`syzygy-build`** (coding agents: Claude Code)
- Promoted, signed decisions from Atharv and Alok, mirrored in [decisions.md](decisions.md)
- The four YugabyteDB judges from the submission form are invited to `syzygy-build` as Maintainers
- Try it: ask a teammate's coding agent "Search syzygy-build in Meko: what did we decide about the stack?" → D-003

## Demo video

_Add the link here once uploaded._ Script: [demo/DEMO_SCRIPT.md](demo/DEMO_SCRIPT.md).
