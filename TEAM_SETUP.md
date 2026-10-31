# Team setup (Atharv, Alok, Arun)

Do this once at the start. Takes ~10 minutes each. Portal: https://cloud.mekodata.ai

Two rules before anything else:

- **Your API key is yours.** Never paste it into chat, Slack, a commit, or a Meko memory. It is shown once; keep it in your own password manager or notes.
- **`syzygy-build` is for coding agents only.** The app uses its own datapacks (`sw-*`). Never mix them.

## Atharv (owner of `syzygy-build`)

1. **Create the build datapack.** Sidebar → **Datapacks** → **Add Datapack** → name it `syzygy-build`.
2. **Invite the team.** Open `syzygy-build` → **Share** → **Invite people** → Alok's and Arun's Meko sign-in emails → role **Maintainer** (not Contributor: only Maintainers can promote) → **Send invite**.
3. **Make two API keys.** **Settings → Security** (or the **Generate API key** button on the Connect page):
   - `atharv-claude-code`: for your coding agent
   - `sunwai-app`: for the app (goes in `.env`, see step 5)
4. **Connect Claude Code** with the first key, in a terminal:

   ```bash
   claude mcp add --scope user --transport http meko https://mcp.mekodata.ai/mcp --header "Authorization: Bearer PASTE_atharv-claude-code_KEY" --header "User-Agent: meko-mcp-installer/1.0"
   ```

   Then start a new Claude Code session so the Meko tools load.
5. **App key.** `cp .env.example .env`, then paste the `sunwai-app` key into `MEKO_API_KEY`.
6. **GitHub.** Add Alok and Arun as collaborators on `Atharv-tw/sunwai` (repo **Settings → Collaborators → Add people**) so they can push.

## Alok and Arun (each on your own laptop)

1. **Sign in** at https://cloud.mekodata.ai with the email you registered for hackCBS.
2. **Accept the invite** to `syzygy-build` (bell icon in the portal, or the invite email). Open it and check your role says **Maintainer**.
3. **Make your own API key.** **Settings → Security → Generate API key**, name it `alok-<tool>` or `arun-<tool>` (e.g. `alok-cursor`). Copy it now; it is shown once.
4. **Connect your coding agent** with that key:
   - **Claude Code:**

     ```bash
     claude mcp add --scope user --transport http meko https://mcp.mekodata.ai/mcp --header "Authorization: Bearer PASTE_YOUR_KEY" --header "User-Agent: meko-mcp-installer/1.0"
     ```

     Restart Claude Code afterwards.
   - **Cursor, Codex, Claude Desktop:** portal **Connect → Client Installer** → pick your tool → run the command it shows, with your key in place of `<paste-your-api-key>`.
5. **Get the repo** and open it in your agent:

   ```bash
   git clone https://github.com/Atharv-tw/sunwai.git
   ```

   Claude Code reads `CLAUDE.md` automatically; Cursor and Codex read `AGENTS.md`, which points to it.
6. **Check it works.** Ask your agent:
   - `List my datapacks in Meko`: you should see `syzygy-build` (shared with you).
   - `Search syzygy-build in Meko: what did we decide about the stack?`: it should answer from Atharv's promoted decision D-003.
7. **Promote your own decisions as you build** (Check T needs ≥10 promoted decisions from ≥2 of us). When you decide something the others must follow, tell your agent, e.g.:

   > Save to syzygy-build and promote it: `[Alok] DECISION D-014: swarm view polls nothing, it only listens to /api/events over SSE because every edge must come from a logged Meko call`

   Then add the same row to `decisions.md` and commit. Aim for 3–5 each.

## Running the app on your laptop (optional)

The app's memory lives in whichever Meko account its key belongs to. With your own key, the app makes its own `sw-*` datapacks in **your** account, which is fine for development. The demo uses Atharv's `sunwai-app` key so it has the seeded history.

```bash
cp .env.example .env    # paste your key into MEKO_API_KEY
```

```bash
uv run sunwai
```

## Check T (judges will do this live)

They ask one of our coding agents about something **another** teammate decided, and it must answer from Meko. Before judging, Atharv invites the judges to `syzygy-build` as **Viewers**.
