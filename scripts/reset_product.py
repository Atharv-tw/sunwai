"""Give the demo a clean campus: delete and recreate the six product datapacks, set the local DB aside.

    uv run python scripts/reset_product.py --yes

Destructive and one-way: every memory and promoted lesson in sunwai-desk/-hostel/-mess/-it/-canon/-dean is gone.
Stop the app first. The old data/sunwai.db is renamed, not deleted. Never touches syzygy-build or other datapacks.
Then run scripts/seed_history.py to load the scripted past cases.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time

from sunwai import config
from sunwai.calllog import CallLog
from sunwai.meko import Meko, MekoError


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="really delete the product datapacks")
    args = ap.parse_args()
    s = config.load()
    names = [s.datapack(a) for a in config.AGENT_DATAPACKS]
    if not args.yes:
        print("Would delete and recreate:", ", ".join(names), f"and set aside {s.db_path}. Re-run with --yes.")
        return 1
    if not s.datapack_prefix.startswith("sunwai"):
        sys.exit(f"refusing: prefix {s.datapack_prefix!r} doesn't look like a product prefix")

    if s.db_path.exists():
        stamp = time.strftime("%Y%m%d-%H%M%S")
        for suffix in ("", "-wal", "-shm"):
            p = s.db_path.with_name(s.db_path.name + suffix)
            if p.exists():
                p.rename(p.with_name(f"{p.name}.{stamp}.bak"))
        print(f"set aside {s.db_path.name} -> *.{stamp}.bak")

    async with Meko(s, CallLog(s.db_path)) as meko:
        for name in names:
            try:
                dp = await meko.datapack_id(name, actor="system", create=False)
            except MekoError:
                dp = ""
            if dp:
                await meko.call("datapack_delete", {"datapack_id": dp}, actor="system", kind="admin",
                                summary=f"delete datapack {name}", datapack=name)
                meko._datapack_ids.pop(name, None)
                print(f"deleted {name}")
            await meko.datapack_id(name, actor="system")
            print(f"created {name}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
