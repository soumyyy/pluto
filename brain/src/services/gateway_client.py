import logging
import httpx
from ..config import get_settings

logger = logging.getLogger(__name__)


async def fetch_gmail_threads(limit: int = 5, importance_only: bool = True) -> dict:
    settings = get_settings()
    url = f"{settings.gateway_url}/api/gmail/threads?limit={limit}&importance_only={'true' if importance_only else 'false'}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as exc:
        logger.warning("Gateway Gmail fetch failed: %s", exc)
        return { "threads": [], "meta": {} }
