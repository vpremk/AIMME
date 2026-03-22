#!/usr/bin/env python3
"""
CLI: subscribe to Redis PUB/SUB channel ``alerts`` and print each message.

  REDIS_URL=redis://localhost:6380/0 python scripts/alert_subscriber.py

Requires: pip install 'redis[hiredis]>=5'
"""

from __future__ import annotations

import os
import sys

import redis


def main() -> None:
    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    channel = os.environ.get("ALERTS_REDIS_CHANNEL", "alerts")
    print(f"Subscribing REDIS_URL={url} channel={channel}", file=sys.stderr)
    r = redis.Redis.from_url(url, decode_responses=True)
    pubsub = r.pubsub()
    pubsub.subscribe(channel)
    for raw in pubsub.listen():
        if raw["type"] != "message":
            continue
        data = raw["data"]
        print(data)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.", file=sys.stderr)
