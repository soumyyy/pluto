from __future__ import annotations

from functools import lru_cache
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from ..config import get_settings


def _make_async_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if "+asyncpg" not in url:
        return url.replace("postgresql+", "postgresql+asyncpg+", 1) if "postgresql+" in url else url
    return url


@lru_cache
def get_async_engine() -> AsyncEngine:
    settings = get_settings()
    async_url = _make_async_url(settings.database_url)
    return create_async_engine(async_url, future=True)
