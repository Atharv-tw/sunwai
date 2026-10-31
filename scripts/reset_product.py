"""Give the demo a clean campus: empty the six product datapacks in place and set the local DB aside.

    uv run python scripts/reset_product.py           # show what is in them
    uv run python scripts/reset_product.py --yes     # delete it

Destructive and one-way: every memory and promoted lesson in sunwai-desk/-hostel/-mess/-it/-canon/-dean is gone.
The datapacks themselves stay: on the free tier a deleted datapack still counts against the 10-datapack limit, so
delete + recreate fails (measured 1 Nov). Stop the app first. The old data/sunwai.db is renamed, not deleted.
Never touches syzygy-build or other datapacks. Then run scripts/seed_history.py to load the scripted past cases.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time

from sunwai import config
from sunwai.calllog import CallLog
from sunwai.meko import Meko, MekoError, agent_id

# every actor that writes into a product datapack (memory_delete_all works per agent_id)
ACTORS = ("desk", "hostel", "mess", "it", "curator", "dean", "student", "caretaker", "warden", "electricity",
          "mess_committee", "it_cell", "system")


async def contents(meko: Meko, name: str, dp: str) -> tuple[list[dict], list[dict]]:
    """(regular memories, promoted memories), all pages."""
    out = []
    for promoted in (False, True):
        rows, page = [], 1
        while True:
            data = await meko.call(
                "memory_get_all", {"datapack_id": dp, "page_size": 100, "page": page, "promoted": promoted},
                actor="system", kind="admin", summary=f"list {'promoted' if promoted else 'memories'}", datapack=name,
            ) or {}
            batch = data.get("promoted_memories" if promoted else "results") or data.get("memories") or []
            rows += [r for r in batch if isinstance(r, dict)]
            if page >= int(data.get("total_pages") or 1) or not batch:
                break
            page += 1
        out.append(rows)
    return out[0], out[1]


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="really empty the product datapacks")
    args = ap.parse_args()
    s = config.load()
    if not s.datapack_prefix.startswith("sunwai"):
        sys.exit(f"refusing: prefix {s.datapack_prefix!r} doesn't look like a product prefix")
    names = [s.datapack(a) for a in config.AGENT_DATAPACKS]

    if args.yes and s.db_path.exists():
        stamp = time.strftime("%Y%m%d-%H%M%S")
        for suffix in ("", "-wal", "-shm"):
            p = s.db_path.with_name(s.db_path.name + suffix)
            if p.exists():
                p.rename(p.with_name(f"{p.name}.{stamp}.bak"))
        print(f"set aside {s.db_path.name} -> *.{stamp}.bak")

    left = 0
    async with Meko(s, CallLog(s.db_path)) as meko:
        for name in names:
            try:
                dp = await meko.datapack_id(name, actor="system", create=False)
            except MekoError:
                dp = ""
            if not dp:
                print(f"{name}: missing (run the app once to create it)")
                continue
            regular, promoted = await contents(meko, name, dp)
            print(f"{name}: {len(regular)} memories, {len(promoted)} promoted")
            if not args.yes or not (regular or promoted):
                continue
            agents = {r.get("agent_id") for r in regular + promoted if r.get("agent_id")} | {agent_id(a) for a in ACTORS}
            for aid in sorted(agents):
                await meko.call("memory_delete_all", {"datapack_id": dp, "agent_id": aid}, actor="system",
                                kind="admin", summary=f"clear {aid} memories", datapack=name)
            # promoted memories live in the knowledge base, one document per writing conversation
            for doc in sorted({r.get("conversation_id") for r in promoted if r.get("conversation_id")}):
                try:
                    await meko.call("knowledgebase_delete_document", {"datapack_id": dp, "document_id": doc},
                                    actor="system", kind="admin", summary="delete promoted lessons", datapack=name)
                except MekoError as e:
                    print(f"  could not delete knowledge-base document {doc[:8]}: {e}")
            for r in promoted:  # in case the promoted list outlives the knowledge-base document
                try:
                    await meko.call("memory_delete_by_id", {"datapack_id": dp, "memory_id": r["id"],
                                                            "agent_id": r.get("agent_id") or agent_id("curator")},
                                    actor="system", kind="admin", summary="delete promoted memory", datapack=name)
                except MekoError:
                    pass
            regular, promoted = await contents(meko, name, dp)
            left += len(regular) + len(promoted)
            print(f"  now {len(regular)} memories, {len(promoted)} promoted")
    if not args.yes:
        print("Nothing deleted. Re-run with --yes to empty them.")
        return 1
    return 1 if left else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
