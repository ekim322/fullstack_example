import logging
import asyncio
from typing import Any

from redis.asyncio import Redis, ConnectionPool

logger = logging.getLogger(__name__)


class RedisClient:
    def __init__(self, redis_url: str, max_connections: int = 20):
        self._pool = ConnectionPool.from_url(
            redis_url,
            max_connections=max_connections,
            decode_responses=True,
        )
        self._redis = Redis(connection_pool=self._pool)

    async def ping(self) -> bool:
        return await self._redis.ping()

    async def close(self) -> None:
        await self._redis.aclose()
        await self._pool.aclose()
        logger.info("Redis connection pool closed")

    async def get(self, key: str) -> str | None:
        return await self._redis.get(key)

    async def set(self, key: str, value: str, ttl: int | None = None) -> None:
        await self._redis.set(key, value, ex=ttl)

    async def delete(self, key: str) -> None:
        await self._redis.delete(key)

    async def stream_add(self, stream: str, data: dict[str, str], max_len: int | None = 1000) -> str:
        """Append an entry to a stream. Returns the entry ID."""
        return await self._redis.xadd(stream, data, maxlen=max_len, approximate=True)

    async def stream_read(
        self,
        stream: str,
        last_id: str = "0-0",
        count: int = 50,
        block_ms: int | None = None,
    ) -> list[tuple[str, dict[str, str]]]:
        """Read entries from a stream after `last_id`.

        Returns a list of (entry_id, fields) tuples.
        When `block_ms` is set, the call blocks until new data arrives or the
        timeout elapses — useful for the streaming resume path.
        """
        results = await self._redis.xread(
            streams={stream: last_id},
            count=count,
            block=block_ms,
        )
        if not results:
            return []
        # xread returns [(stream_name, [(id, data), ...])]
        return results[0][1]

    async def stream_trim(self, stream: str, max_len: int) -> None:
        await self._redis.xtrim(stream, maxlen=max_len, approximate=True)

    async def stream_delete(self, stream: str) -> None:
        await self._redis.delete(stream)

    @property
    def raw(self) -> Redis:
        return self._redis

    async def acquire_lock(
        self,
        key: str,
        ttl: int = 5,
        retry_interval: float = 0.1,
        max_retries: int = 30,
    ) -> bool:
        """Try to acquire a simple Redis lock using SET NX."""
        for _ in range(max_retries):
            acquired = await self._redis.set(key, "1", nx=True, ex=ttl)
            if acquired:
                return True
            await asyncio.sleep(retry_interval)
        return False

    async def release_lock(self, key: str) -> None:
        await self._redis.delete(key)

    async def flush_all(self) -> None:
        """Delete all keys in the current Redis database. Use with caution."""
        await self._redis.flushdb()
        logger.info("Redis database flushed")