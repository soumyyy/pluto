from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Iterable, List, Sequence

from langchain_openai import OpenAIEmbeddings
from sqlalchemy import text

from ..config import get_settings
from .database import get_async_engine
from .faiss_store import EmbeddingRecord, write_faiss_index

logger = logging.getLogger(__name__)


@dataclass
class MemoryChunkRow:
    id: str
    user_id: str
    source: str
    file_path: str
    content: str


async def fetch_pending_chunks(limit: int = 50) -> List[MemoryChunkRow]:
    engine = get_async_engine()
    query = text(
        """
        SELECT mc.id, mc.user_id, mc.source, mc.file_path, mc.content
        FROM memory_chunks mc
        LEFT JOIN memory_chunk_embeddings me ON me.chunk_id = mc.id
        WHERE me.chunk_id IS NULL
        ORDER BY mc.created_at
        LIMIT :limit
        """
    )
    async with engine.connect() as conn:
        result = await conn.execute(query, {"limit": limit})
        rows = result.mappings().all()
    return [MemoryChunkRow(**row) for row in rows]


async def store_embeddings(rows: Sequence[MemoryChunkRow], vectors: Sequence[List[float]]) -> None:
    if len(rows) != len(vectors):
        raise ValueError("Rows and vectors length mismatch")
    engine = get_async_engine()
    insert_stmt = text(
        """
        INSERT INTO memory_chunk_embeddings (chunk_id, user_id, source, embedding)
        VALUES (:chunk_id, :user_id, :source, :embedding)
        ON CONFLICT (chunk_id) DO NOTHING
        """
    )
    async with engine.begin() as conn:
        for row, vector in zip(rows, vectors):
            await conn.execute(
                insert_stmt,
                {
                    "chunk_id": row.id,
                    "user_id": row.user_id,
                    "source": row.source,
                    "embedding": vector,
                },
            )


async def fetch_all_embeddings_for_user(user_id: str) -> List[EmbeddingRecord]:
    engine = get_async_engine()
    query = text(
        """
        SELECT mc.id as chunk_id,
               mc.user_id,
               mc.source,
               mc.file_path,
               mc.content,
               mce.embedding
        FROM memory_chunk_embeddings mce
        JOIN memory_chunks mc ON mc.id = mce.chunk_id
        WHERE mc.user_id = :user_id
        ORDER BY mc.created_at
        """
    )
    async with engine.connect() as conn:
        result = await conn.execute(query, {"user_id": user_id})
        rows = result.mappings().all()
    return [
        EmbeddingRecord(
            chunk_id=row["chunk_id"],
            user_id=row["user_id"],
            source=row["source"],
            file_path=row["file_path"],
            content=row["content"],
            vector=list(row["embedding"]),
        )
        for row in rows
    ]


async def rebuild_indices_for_users(user_ids: Iterable[str]) -> None:
    seen = set()
    for user_id in user_ids:
        if user_id in seen:
            continue
        seen.add(user_id)
        records = await fetch_all_embeddings_for_user(user_id)
        write_faiss_index(user_id, records)


async def process_pending_chunks(batch_size: int = 50) -> int:
    """
    Embed pending bespoke memory chunks, store vectors, and update FAISS indexes.
    Returns number of chunks processed.
    """
    settings = get_settings()
    if not settings.enable_openai or not settings.openai_api_key:
        logger.warning("OpenAI is not configured; skipping memory indexing.")
        return 0

    embeddings = OpenAIEmbeddings(
        api_key=settings.openai_api_key,
        model="text-embedding-3-small"
    )

    processed_total = 0
    while True:
        rows = await fetch_pending_chunks(limit=batch_size)
        if not rows:
            break
        texts = [row.content for row in rows]
        vectors = await _embed_documents(embeddings, texts)
        await store_embeddings(rows, vectors)
        await rebuild_indices_for_users(row.user_id for row in rows)
        processed_total += len(rows)
        logger.info("Indexed %d bespoke memory chunks (total=%d)", len(rows), processed_total)
    return processed_total


async def _embed_documents(embedding_client: OpenAIEmbeddings, texts: Sequence[str]) -> List[List[float]]:
    try:
        return await embedding_client.aembed_documents(texts)
    except AttributeError:  # pragma: no cover - fallback for sync-only implementations
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, embedding_client.embed_documents, list(texts))
