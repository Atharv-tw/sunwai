# Research

References we used, and what each one told us. Meko behaviour we measured ourselves is in the
"Observed" section with the date; numbers go in `result.md`.

## Hackathon

| Source | What we took from it |
|---|---|
| Meko challenge brief (PDF handed out at hackCBS 9.0) | Track B requirements B1–B5, required swarm view, submission (repo with ≤5-command setup, one-page design note, ≤5-min demo, feature proposal), Track B scoring, Check T, "never mix build and product datapacks" |
| [hackcbs.tech](https://hackcbs.tech/#about) | 24-hour sprint from 31 Oct 12:00; teams of 2–4; no pre-existing projects; MLH Code of Conduct; bring a hotspot (one connection per team) |
| [HackCulture: hackCBS 9.0](https://hackculture.io/hackathons/hackcbs-9-0) | Event window ends 1 Nov 12:00; YugabyteDB exclusive problem statement prize "Outstanding AI Agent Innovation powered by Meko" ₹50,000; MLH Code of Conduct enforced |

## Meko docs

| Page | What we took from it |
|---|---|
| [Docs home](https://docs.mekodata.ai) | Meko = shared context layer on YugabyteDB: datapacks hold memory, knowledge, conversations, traces |
| [Connect an AI agent](https://docs.mekodata.ai/integrations/connect-to-ai-agent/) | `claude mcp add --scope user --transport http meko https://mcp.mekodata.ai/mcp --header "Authorization: Bearer …" --header "User-Agent: meko-mcp-installer/1.0"`; CLI OAuth callback is rejected, use an API key; Claude only calls Meko when told to, so the protocol lives in `CLAUDE.md` |
| [Connect programmatically](https://docs.mekodata.ai/integrations/connect-programmatically/) | Apps use the same MCP endpoint with an API key through any MCP client |
| [MCP server reference](https://docs.mekodata.ai/reference/mcp-server/) | 28 tools. Ones we use: `context_search`, `memory_add`, `memory_search`, `memory_get_all` (`promoted` filter, ~20 recent, no pagination), `memory_promote` (owner/maintainer, one-way), `conversation_create`, `conversation_add_message`, `datapack_create`, `datapack_list`, `datapack_search`. Tool-level `scope` args were retired in v2.1.0: don't send them |
| [API keys](https://docs.mekodata.ai/reference/api-keys/) | Keys start `mko_tkn_`, shown once, account-wide (reach all your datapacks), up to 10 active, 1-year expiry. Must send `Authorization: Bearer` **and** a `User-Agent` header or requests are rejected. Every call counts against free-tier quota |
| [Datapacks](https://docs.mekodata.ai/architecture/core-concepts/datapacks/) | Free accounts: up to 10 datapacks |
| [Memory](https://docs.mekodata.ai/architecture/core-concepts/memory/) | `memory_add` stores text as given; turns saved via `conversation_add_message` are mined asynchronously and best-effort, so critical facts must be written explicitly. Search is hybrid (semantic + keyword + entity boost), spans the user's agent namespaces in that datapack; `agent_id` is attribution, not a filter |
| [Learnings](https://docs.mekodata.ai/architecture/core-concepts/learnings/) | Zones: private → review (learnings) → institutional (collective memory + shared knowledge). Promotion is a reviewer decision captured in the trace. A learning is never shared across datapacks |
| [Share a datapack](https://docs.mekodata.ai/architecture/core-concepts/sharing/) | Roles Owner, Maintainer, Contributor, Viewer; invite as Maintainer so teammates can promote; share links can't grant Maintainer |
| [Manage access](https://docs.mekodata.ai/architecture/core-concepts/manage-access/) | Contributors add memories but can't promote; Viewers read (incl. collective memory) but can't write |
| [Memory retrieval](https://docs.mekodata.ai/architecture/core-concepts/memory-retrieval/) | `context_search` for open-ended recall across memory, knowledge and conversations; `memory_search` for personal memory with ids and scores |
| [Enhanced teaming example](https://docs.mekodata.ai/examples/meko-enhances-teaming/) | Patterns: knowledge hand-off, collective learning after a run, team policies in a shared datapack |

## Models and tooling

| Source | What we took from it |
|---|---|
| Brief, "Pick your LLM" | Open models score higher, most of all on your own laptop; need reliable tool calling; Qwen3 8B fits a 16 GB laptop; Ollama/vLLM/llama.cpp all speak the OpenAI API |
| [Ollama OpenAI compatibility](https://github.com/ollama/ollama/blob/main/docs/openai.md) | `/v1/chat/completions` with `tools` works, so one OpenAI client covers local and hosted models |
| [Qwen3 on Ollama](https://ollama.com/library/qwen3) | `qwen3:4b` (~2.5 GB) for the 4 GB dev GPU, `qwen3:8b` (~5.2 GB) for the 8 GB demo GPU; thinking can be turned off for faster replies |
| [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) | `streamablehttp_client(url, headers=…)` + `ClientSession` to call Meko tools from the app |

## Observed (our own tests)

_Filled in by `scripts/smoke_meko.py` runs: real tool argument names, write→searchable lag, what `memory_promote` and `memory_get_all(promoted=true)` actually return._
