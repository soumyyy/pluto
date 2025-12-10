from typing import List
from ..models import schemas
from ..models import db
from ..services.memory_search import search_bespoke_memory


async def search_memories_tool(user_id: str, query: str) -> List[schemas.Memory]:
    snippets = await search_bespoke_memory(user_id=user_id, query=query, k=5)
    memories = [
        schemas.Memory(id=str(index), content=snippet.content, source=snippet.source)
        for index, snippet in enumerate(snippets)
    ]
    if memories:
        return memories
    rows = await db.search_memories(query=query, user_id=user_id)
    return [
        schemas.Memory(id=row.get("id", ""), content=row.get("content", ""), source=row.get("source", "chat"))
        for row in rows
    ]


async def create_memory_tool(user_id: str, content: str, source: str = "chat") -> schemas.Memory:
    """Persist a simple memory snippet."""
    memory_id = await db.save_memory(user_id=user_id, content=content, source=source)
    # TODO: assign importance score + embeddings.
    return schemas.Memory(id=memory_id, content=content, source=source)
