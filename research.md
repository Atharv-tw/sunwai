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

31 Oct 2026, `scripts/smoke_meko.py` with the product key. Latency numbers are in `result.md`.

- The live server exposes **42 tools**, not the 28 in the docs (extra: `amp_*` cluster/branch/compute tools, `track_token_usage`, artifacts, KB status).
- **Almost every tool needs a `conversation_id`**, including `datapack_list` and `datapack_create`, even where the schema doesn't mark it required. The error is `conversation_id_required`. So each actor opens a conversation first (`conversation_create`, which needs none); a stable `session_id` reconnects the same one after a restart.
- **Tools reject unknown arguments** (pydantic `unexpected_keyword_argument`), e.g. `agent_id` on `datapack_list`. Our client reads each tool's schema at connect and only adds what the tool accepts.
- **Payload shape:** text content holding `{"result": "<JSON string>"}`. Tool failures come back *inside* that payload as `{"error": ..., "detail": ...}`, not as an MCP error.
- **Datapack names are unique across the whole platform** (`CONFLICT … a datapack with this name already exists`). Hence the `sunwai-` prefix and per-teammate dev prefixes.
- `datapack_search` returns `datapacks[].datapack_id` and `datapack_name` (not `id` / `name`), plus owner name and email: don't log raw responses.
- `memory_add` returns the stored memory; `memory_search` returns `results[]` with `id`, `memory`, `score`, `raw_similarity_score`. Search is cross-agent within datapack + user; `agent_id` is attribution only.
- `context_search` returns `results.{knowledge_base, memory, conversation}` plus `match_quality` and `agent_hint`.
- `memory_promote` returns `inserted_ids`; the memory is **evicted from private memory** and appears in `memory_get_all(promoted=true)` → `promoted_memories[]` (`id`, `agent_id`, `data`). It never showed in `context_search`'s `knowledge_base` bucket (checked again ~35 min later), but **`knowledgebase_search` does return it** as a chunk with `metadata_filters.source = "memory"` and the original `memory_id`.
- Meko's suggested `agent_id` for coding agents is `<client>:<repo>`, e.g. `claude_code:sunwai`.
- 31 Oct ~20:15, `syzygy-build` via the `meko` MCP in Claude Code: `memory_add` stored each decision verbatim
  (`event: ADD`, no rewriting); one `memory_promote` call took all 17 ids. `knowledgebase_search` found D-003
  for "what did we decide about the stack" about a minute after promotion (so the KB copy is not slow to
  appear), returning one chunk even with `limit: 5`; the chunk's `id` is new, the original id is in
  `metadata_filters.memory_id`, and `document_id` is the conversation id. `context_search` (all sources) for
  the same query returned all buckets empty with `agent_hint` "do not guess; tell the user this datapack does
  not cover it". `memory_get_all(promoted=true)` lists promoter name and email per row.

## Meko friction log

One line each: what was awkward, and our workaround. Evidence for `FEATURE_PROPOSAL.md`.

| When | Who | Friction | Workaround |
|---|---|---|---|
| 31 Oct | Atharv | Learnings never cross datapacks, so one department can't hand a fact to another without writing into its datapack directly | Cross-write a note into the receiving agent's datapack (D-006) |
| 31 Oct | Atharv | Product and coding agents can only be kept apart by convention; a key reaches every datapack in the account | Separate keys per client and a `sunwai-` prefix for product datapacks (D-005, D-010) |
| 31 Oct | Atharv | Memory search takes ~9 s per call (other calls ~2 s), so an agent that recalls before every step feels slow live | Run all of a step's recalls in parallel; read promoted canon with `memory_get_all(promoted=true)` (~1.8 s) (D-017) |
| 31 Oct | Atharv | Every call needs a `conversation_id`, even listing datapacks; tools reject extra args; errors hide inside a JSON string | Client opens one conversation per actor, filters args by schema, unwraps `result` and checks `error` |
| 31 Oct | Atharv | A promoted memory disappears from `memory_search`/`context_search` memory and isn't in the KB bucket right away, so there is a gap where nobody can recall it | Recall canon with `knowledgebase_search` (finds promoted memories by meaning) and list it with `memory_get_all(promoted=true)` |
| 31 Oct | Atharv | Datapack names are global across all Meko users, so two teams can't both have `desk` | Team-specific prefix |
| 31 Oct | Atharv | `context_search` (the docs' "default first call") returns nothing for promoted memories and tells the agent the datapack doesn't cover it: an agent following the docs would miss every team decision | Recall with `knowledgebase_search` + `memory_search` in parallel (D-018) |
| 31 Oct | Atharv | `knowledgebase_search` trims to the top match (1 result with `limit: 5`), so "list everything about X" needs `memory_get_all(promoted=true)` and client-side filtering | Use `memory_get_all(promoted=true)` for lists, KB search for "the most relevant one" |
| 31 Oct | Atharv | `memory_get_all(promoted=true)` and `datapack_search` return the owner's name and email in every row | Never log or display raw responses; the client keeps only ids and text |
| 31 Oct | Atharv | Two agents promoted the same decision ids (D-020, D-021) half an hour apart: decision numbering lives in a git file that lags, and Meko memories have no sequence or unique key to catch it | Number from the highest id in `memory_get_all(promoted=true)` too, push `decisions.md` right after promoting; clashing ids re-promoted under new numbers (D-025..D-027), since promoted memories can't be edited |
| 31 Oct | Atharv | `memory_get_all(promoted=true)` pages aren't stable: with `page_size=5`, D-022 and D-024 came back on both page 1 and page 2 | Read with one `page_size=100` call (26 rows) |
| 1 Nov | Atharv | On the free tier a deleted datapack still counts against the 10-datapack limit: create → delete → create the same name failed with `FREE_TIER_DATAPACK_LIMIT`, so "reset by recreating" would have deleted all six product datapacks and recreated none | Probe with a throwaway datapack first; reset empties datapacks in place (`memory_delete_all` per agent id, delete promoted knowledge-base documents) (D-032) |
| 1 Nov | Atharv | Promoted memories can't be deleted through MCP, even by the owner: `knowledgebase_delete_document` returns `NOT_FOUND` for the `document_id` that `knowledgebase_search` returns for them, and `memory_delete_by_id` on a promoted id fails with a server error (`Object of type UUID is not JSON serializable`). All lessons promoted from one conversation also share one `document_id`, so a working document delete would remove them together | None yet: two test lessons stay in `sunwai-canon`; don't promote test data into a product datapack |
