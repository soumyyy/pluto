import asyncio
import logging

from ..services.memory_indexer import process_pending_chunks

logging.basicConfig(level=logging.INFO)


async def main():
    processed = await process_pending_chunks()
    logging.info("Memory indexing complete. Total chunks processed: %d", processed)


if __name__ == "__main__":
    asyncio.run(main())
