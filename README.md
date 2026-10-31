# Sunwai

**Campus grievances, heard and remembered.** Students raise a complaint in their own words; the people
responsible and Meko-powered agents resolve it together. A fix becomes campus knowledge only after the
students it affected confirm it held and a warden approves it. A live swarm view shows every person,
every agent and every Meko call.

Built at hackCBS 9.0 for the Meko challenge (Track B: Campus Grievance Swarm) by Team Syzygy
(Atharv, Alok, Arun).

> Work in progress during the hackathon. See [plan.md](plan.md).

## Setup (5 commands)

Needs [uv](https://docs.astral.sh/uv/), [Ollama](https://ollama.com) and a Meko API key from
[cloud.mekodata.ai](https://cloud.mekodata.ai) (Settings → API Keys).

```bash
git clone https://github.com/Atharv-tw/sunwai.git && cd sunwai
```

```bash
cp .env.example .env    # then paste your Meko key into MEKO_API_KEY
```

```bash
ollama pull qwen3:4b
```

```bash
uv run sunwai
```

Open http://127.0.0.1:8765.

## Docs

- [plan.md](plan.md): what we're building and how Meko is used
- [decisions.md](decisions.md): decisions made during the build, and why
- [research.md](research.md): references and what we learned
- [result.md](result.md): numbers we measured
- [TEAM_SETUP.md](TEAM_SETUP.md): Meko and repo setup for each teammate
- [4060.md](4060.md): demo laptop runbook

## License

MIT
