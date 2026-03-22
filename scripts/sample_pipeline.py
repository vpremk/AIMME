#!/usr/bin/env python3
"""
Push a single XADD to Redis stream `market_data` (same shape as ingestion).

  REDIS_URL=redis://localhost:6380/0 python3 scripts/sample_pipeline.py

Requires: pip install 'redis[hiredis]>=5'  (see scripts/requirements.txt)
"""

from __future__ import annotations

import argparse
import json
import os
import time

import redis


def main() -> None:
    p = argparse.ArgumentParser(description="XADD one market_data event")
    p.add_argument(
        "--redis-url",
        default=os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
    )
    p.add_argument("--stream", default="market_data")
    args = p.parse_args()

    now = int(time.time())
    wallet = "0x" + "ab" * 20
    payload = json.dumps(
        {
            "asset": "MANUALx",
            "price": 250.25,
            "volume": 1_000_000.0,
            "wallet": wallet,
            "timestamp": now,
        },
        separators=(",", ":"),
    )
    fields = {
        "asset": "MANUALx",
        "price": "250.25",
        "volume": "1000000",
        "wallet": wallet,
        "timestamp": str(now),
        "payload": payload,
    }
    r = redis.Redis.from_url(args.redis_url, decode_responses=True)
    r.ping()
    eid = r.xadd(args.stream, fields)
    print("XADD", eid)
    print(fields)


if __name__ == "__main__":
    main()
