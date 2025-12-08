from typing import List, Optional, TYPE_CHECKING, Any
import logging

from ..config import get_settings
from ..models.schemas import ChatResponse, SearchSource
from ..tools import search_memories_tool, web_search_tool

if TYPE_CHECKING:  # pragma: no cover - type hints only
    from langchain.schema import BaseMessage
    from langchain_openai import ChatOpenAI
else:
    BaseMessage = Any
    ChatOpenAI = Any

SYSTEM_PROMPT = """You are Pluto, a personal agent for a single user. You know about the user from past conversations and, soon, from their email. Your job is to help summarize information, extract tasks, and keep track of what matters to them. Use memories when helpful, incorporate verified web intelligence when responding about current events, and be concise and clear."""
logger = logging.getLogger(__name__)


async def _build_context(user_id: str, message: str) -> tuple[str, List[str]]:
    used_tools: List[str] = []
    memories = await search_memories_tool(user_id=user_id, query=message)
    memory_text = "".join(f"- {m.content}\n" for m in memories)
    if memory_text:
        used_tools.append("search_memories")
    return memory_text, used_tools


async def _load_llm(settings) -> Optional["ChatOpenAI"]:
    if not (settings.enable_openai and settings.openai_api_key):
        return None
    try:
        from langchain_openai import ChatOpenAI  # type: ignore
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.warning("Failed to import langchain_openai; falling back to stubbed replies: %s", exc)
        return None

    return ChatOpenAI(
        api_key=settings.openai_api_key,
        temperature=0.3,
        model_name="gpt-4o-mini",
        max_tokens=700
    )


def _fallback_reply(user_message: str, memory_context: str, web_context: str) -> str:
    base = "Pluto stubbed reply: "
    memory_note = f"I noted these memories -> {memory_context.strip()} | " if memory_context else ""
    web_note = f"Web intel -> {web_context.strip()} | " if web_context else ""
    return f"{base}{memory_note}{web_note}You said: {user_message}"


def _should_search_web(message: str) -> bool:
    lowered = message.lower()
    trigger_tokens = (
        "news", "latest", "current", "today", "who is", "what is", "research", "search",
        "find", "report", "update", "movie", "film", "show", "episode", "release",
        "box office", "actor", "actress", "music", "song", "stock", "price", "review"
    )
    if "?" in message or len(message.split()) > 15:
        return True
    return any(token in lowered for token in trigger_tokens)


async def _maybe_run_web_search(message: str) -> tuple[str, List[SearchSource], bool]:
    if not _should_search_web(message):
        return "", [], False
    web_context, sources = await web_search_tool(message)
    used = bool(web_context or sources)
    return web_context, sources, used


async def run_chat_agent(user_id: str, conversation_id: str, message: str) -> ChatResponse:
    _ = conversation_id  # TODO: fetch conversation history for better context.
    settings = get_settings()
    context, used_tools = await _build_context(user_id=user_id, message=message)
    thoughts: List[str] = []
    if context:
        thoughts.append("Referenced stored memories for background context.")

    web_context, sources, searched = await _maybe_run_web_search(message)
    if searched:
        used_tools.append("web_search")
        if sources:
            thoughts.append(f"Consulted Tavily search ({len(sources)} sources).")
        elif web_context:
            thoughts.append("Attempted web search, but no sources were returned.")

    llm = await _load_llm(settings)
    if llm:
        reply_text = await _generate_with_llm(llm, context, web_context, message)
    else:
        reply_text = _fallback_reply(message, context, web_context)

    return ChatResponse(
        reply=reply_text,
        used_tools=used_tools,
        sources=sources,
        thoughts=thoughts,
        web_search_used=searched
    )


async def _generate_with_llm(llm: "ChatOpenAI", memory_context: str, web_context: str, message: str) -> str:
    try:
        from langchain.prompts import ChatPromptTemplate  # type: ignore
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.warning("LangChain prompt import failed, using fallback: %s", exc)
        return _fallback_reply(message, memory_context, web_context)

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        (
            "human",
            "Context from memories:\n{memory_context}\n\nWeb intelligence:\n{web_context}\n\nUser message:\n{user_message}"
        )
    ])

    formatted_messages: List[BaseMessage] = prompt.format_messages(
        memory_context=memory_context or "(no memories yet)",
        web_context=web_context or "(no web data fetched)",
        user_message=message
    )

    response = await llm.ainvoke(formatted_messages)
    return response.content
