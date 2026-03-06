import logging
from typing import Any

import asyncpg

logger = logging.getLogger(__name__)


class PostgresBase:
    """Lightweight async wrapper around an asyncpg connection pool.

    Subclass this for domain-specific repositories (execution_store,
    plan_store, etc.) — they inherit the pool and the query helpers below.
    """

    def __init__(self, dsn: str, min_size: int = 2, max_size: int = 10):
        self._dsn = dsn
        self._min_size = min_size
        self._max_size = max_size
        self._pool: asyncpg.Pool | None = None

    # -- lifecycle --

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(
            dsn=self._dsn,
            min_size=self._min_size,
            max_size=self._max_size,
        )
        logger.info("Postgres pool created (min=%d, max=%d)", self._min_size, self._max_size)

    async def disconnect(self) -> None:
        if self._pool:
            await self._pool.close()
            self._pool = None
            logger.info("Postgres pool closed")

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("Database pool is not initialised — call connect() first")
        return self._pool

    # -- query helpers --

    async def fetch(self, query: str, *args: Any) -> list[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetch_row(self, query: str, *args: Any) -> asyncpg.Record | None:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetch_val(self, query: str, *args: Any) -> Any:
        async with self.pool.acquire() as conn:
            return await conn.fetchval(query, *args)

    async def execute(self, query: str, *args: Any) -> str:
        """Run a statement and return the status string (e.g. 'INSERT 0 1')."""
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def execute_many(self, query: str, args: list[tuple]) -> None:
        async with self.pool.acquire() as conn:
            await conn.executemany(query, args)

    async def transaction(self) -> asyncpg.connection.Connection:
        """Acquire a connection for manual transaction control.

        Usage:
            async with db.pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute(...)
                    await conn.execute(...)
        """
        return self.pool.acquire()