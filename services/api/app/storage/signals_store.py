"""In-memory and SQLite implementations for trading signals."""

from __future__ import annotations

import asyncio
import os
import sqlite3
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import aiosqlite

from app.storage.models import SignalCreate, SignalFilters, SignalRow


@dataclass
class PageResult:
    items: list[SignalRow]
    total: int


class SignalStore(ABC):
    @abstractmethod
    async def insert(self, record: SignalCreate) -> int:
        """Persist a signal; returns row id."""

    @abstractmethod
    async def count(self, filters: SignalFilters) -> int:
        """Count rows matching filters."""

    @abstractmethod
    async def query(self, filters: SignalFilters, *, limit: int, offset: int) -> PageResult:
        """List signals ordered by timestamp descending."""

    async def close(self) -> None:
        """Release resources (SQLite connections)."""
        return


class MemorySignalStore(SignalStore):
    def __init__(self) -> None:
        self._rows: list[dict[str, Any]] = []
        self._next_id = 1
        self._lock = asyncio.Lock()

    async def insert(self, record: SignalCreate) -> int:
        async with self._lock:
            rid = self._next_id
            self._next_id += 1
            self._rows.append(
                {
                    "id": rid,
                    "asset": record.asset,
                    "timestamp": record.timestamp,
                    "signal": record.signal,
                    "confidence": record.confidence,
                    "anomaly": record.anomaly,
                    "price": record.price,
                    "volume": record.volume,
                }
            )
            return rid

    def _match(self, row: dict[str, Any], f: SignalFilters) -> bool:
        if f.asset is not None and row["asset"] != f.asset:
            return False
        if f.signal is not None and row["signal"] != f.signal:
            return False
        if f.anomaly is not None and bool(row["anomaly"]) != f.anomaly:
            return False
        if f.from_ts is not None and row["timestamp"] < f.from_ts:
            return False
        if f.to_ts is not None and row["timestamp"] > f.to_ts:
            return False
        return True

    async def count(self, filters: SignalFilters) -> int:
        async with self._lock:
            return sum(1 for r in self._rows if self._match(r, filters))

    async def query(self, filters: SignalFilters, *, limit: int, offset: int) -> PageResult:
        async with self._lock:
            matched = [r for r in self._rows if self._match(r, filters)]
            matched.sort(key=lambda r: r["timestamp"], reverse=True)
            total = len(matched)
            slice_ = matched[offset : offset + limit]
            items = [SignalRow.model_validate(r) for r in slice_]
            return PageResult(items=items, total=total)


class SQLiteSignalStore(SignalStore):
    def __init__(self, path: str) -> None:
        self._path = path
        self._lock = asyncio.Lock()

    async def _connect(self) -> aiosqlite.Connection:
        Path(self._path).parent.mkdir(parents=True, exist_ok=True)
        db = await aiosqlite.connect(self._path)
        db.row_factory = sqlite3.Row
        return db

    async def _init_schema(self, db: aiosqlite.Connection) -> None:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                signal TEXT NOT NULL,
                confidence REAL NOT NULL,
                anomaly INTEGER NOT NULL,
                price REAL,
                volume INTEGER
            )
            """
        )
        # Backward-compatible migration for existing local DBs.
        cur = await db.execute("PRAGMA table_info(signals)")
        cols = {row[1] for row in await cur.fetchall()}
        if "price" not in cols:
            await db.execute("ALTER TABLE signals ADD COLUMN price REAL")
        if "volume" not in cols:
            await db.execute("ALTER TABLE signals ADD COLUMN volume INTEGER")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_signals_asset ON signals(asset)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals(timestamp)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_signals_anomaly ON signals(anomaly)")
        await db.commit()

    async def insert(self, record: SignalCreate) -> int:
        async with self._lock:
            db = await self._connect()
            try:
                await self._init_schema(db)
                cur = await db.execute(
                    """
                    INSERT INTO signals (asset, timestamp, signal, confidence, anomaly, price, volume)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record.asset,
                        record.timestamp,
                        record.signal,
                        record.confidence,
                        1 if record.anomaly else 0,
                        record.price,
                        record.volume,
                    ),
                )
                await db.commit()
                return int(cur.lastrowid)
            finally:
                await db.close()

    def _where(self, f: SignalFilters) -> tuple[str, list[Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if f.asset is not None:
            clauses.append("asset = ?")
            params.append(f.asset)
        if f.signal is not None:
            clauses.append("signal = ?")
            params.append(f.signal)
        if f.anomaly is not None:
            clauses.append("anomaly = ?")
            params.append(1 if f.anomaly else 0)
        if f.from_ts is not None:
            clauses.append("timestamp >= ?")
            params.append(f.from_ts)
        if f.to_ts is not None:
            clauses.append("timestamp <= ?")
            params.append(f.to_ts)
        where = " AND ".join(clauses) if clauses else "1=1"
        return where, params

    async def count(self, filters: SignalFilters) -> int:
        where, params = self._where(filters)
        async with self._lock:
            db = await self._connect()
            try:
                await self._init_schema(db)
                cur = await db.execute(f"SELECT COUNT(*) AS c FROM signals WHERE {where}", params)
                row = await cur.fetchone()
                return int(row[0]) if row else 0
            finally:
                await db.close()

    async def query(self, filters: SignalFilters, *, limit: int, offset: int) -> PageResult:
        where, params = self._where(filters)
        count_sql = f"SELECT COUNT(*) AS c FROM signals WHERE {where}"
        list_sql = """
            SELECT id, asset, timestamp, signal, confidence, anomaly, price, volume
            FROM signals WHERE {where}
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        """.format(where=where)
        async with self._lock:
            db = await self._connect()
            try:
                await self._init_schema(db)
                cur = await db.execute(count_sql, params)
                crow = await cur.fetchone()
                total = int(crow[0]) if crow else 0
                cur = await db.execute(list_sql, [*params, limit, offset])
                rows = await cur.fetchall()
                items = [
                    SignalRow(
                        id=r["id"],
                        asset=r["asset"],
                        timestamp=r["timestamp"],
                        signal=r["signal"],
                        confidence=r["confidence"],
                        anomaly=bool(r["anomaly"]),
                        price=r["price"],
                        volume=r["volume"],
                    )
                    for r in rows
                ]
                return PageResult(items=items, total=total)
            finally:
                await db.close()


async def _seed_demo(store: SignalStore) -> None:
    import time

    if await store.count(SignalFilters()) > 0:
        return

    now = int(time.time())
    demo = [
        SignalCreate(
            asset="AAPLx",
            timestamp=now - 120,
            signal="BUY",
            confidence=0.82,
            anomaly=True,
        ),
        SignalCreate(
            asset="GOOGLx",
            timestamp=now - 60,
            signal="HOLD",
            confidence=0.55,
            anomaly=False,
        ),
        SignalCreate(
            asset="MSFTx",
            timestamp=now - 30,
            signal="SELL",
            confidence=0.78,
            anomaly=True,
        ),
    ]
    for row in demo:
        await store.insert(row)


async def create_signal_store() -> SignalStore:
    backend = os.environ.get("SIGNAL_STORAGE", "sqlite").lower().strip()
    if backend == "memory":
        store: SignalStore = MemorySignalStore()
    else:
        path = os.environ.get("SQLITE_PATH", "/tmp/aimme_signals.db")
        store = SQLiteSignalStore(path)

    if os.environ.get("SEED_DEMO_SIGNALS", "").lower() in ("1", "true", "yes"):
        await _seed_demo(store)

    return store
